import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, sign } from "./lib/hmac";
import type { LoanEventType } from "./lib/validators";

// Convex → n8n "loan event" webhooks, built as a transactional outbox:
//
//   1. A loan mutation calls `enqueueLoanEvent`, which writes an outbox row and
//      schedules `deliver` inside the same transaction.
//   2. `deliver` signs the stored body with HMAC-SHA256 and POSTs it to n8n.
//   3. On a network error, timeout, 5xx, 408 or 429 it schedules itself again
//      with backoff. Other 4xx responses mean the request itself is wrong
//      (bad signature, bad URL), so retrying would not help: it fails at once.
//   4. After the last attempt the row is marked `failed`, and admins see it in
//      the app with a retry button. Nothing fails silently.
//
// Each event has a stable `eventId` (`<loanId>.<type>`; every transition
// happens at most once per loan). n8n de-duplicates on it, so a retry after a
// lost response never sends a second notification.

export const RETRY_DELAYS_MS = [10_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const REQUEST_TIMEOUT_MS = 10_000;

/** Who gets told about each event. */
const RECIPIENT: Record<LoanEventType, "lender" | "borrower"> = {
  "loan.requested": "lender",
  "loan.cancelled": "lender",
  "loan.approved": "borrower",
  "loan.declined": "borrower",
  "loan.returned": "borrower",
};

/**
 * The body n8n receives. Only what a notification needs: the recipient's name
 * and email, the other person's display name, the tool name and the dates.
 * No user ids, roles, descriptions or the other person's email.
 */
export type LoanEventPayload = {
  eventId: string;
  type: LoanEventType;
  occurredAt: string;
  loanId: string;
  recipient: { name: string; email: string };
  counterpartyName: string;
  toolName: string;
  startDate: string;
  endDate: string;
};

export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  type: LoanEventType,
): Promise<void> {
  const eventId = `${loanId}.${type}`;
  const existing = await ctx.db
    .query("outbox")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
  if (existing) return;

  const loan = await ctx.db.get(loanId);
  if (!loan) return;
  const [tool, lender, borrower] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.lenderId),
    ctx.db.get(loan.borrowerId),
  ]);
  if (!tool || !lender || !borrower) return;

  const [recipient, counterparty] =
    RECIPIENT[type] === "lender" ? [lender, borrower] : [borrower, lender];

  const base = { eventId, type, loanId, attempts: 0 };
  if (!recipient.email) {
    await ctx.db.insert("outbox", {
      ...base,
      payload: "",
      status: "skipped",
      lastError: "Recipient has no email address on file.",
    });
    return;
  }

  const payload: LoanEventPayload = {
    eventId,
    type,
    occurredAt: new Date().toISOString(),
    loanId,
    recipient: { name: recipient.name, email: recipient.email },
    counterpartyName: counterparty.name,
    toolName: tool.name,
    startDate: loan.startDate,
    endDate: loan.endDate,
  };
  const outboxId = await ctx.db.insert("outbox", {
    ...base,
    payload: JSON.stringify(payload),
    status: "pending",
  });
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { outboxId });
}

export const getForDelivery = internalQuery({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status !== "pending") return null;
    return { payload: row.payload, attempts: row.attempts };
  },
});

export const deliver = internalAction({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.runQuery(internal.notifications.getForDelivery, { outboxId });
    if (!row) return;

    const url = process.env.N8N_LOAN_EVENTS_WEBHOOK_URL;
    const secret = process.env.CONVEX_TO_N8N_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.notifications.recordResult, {
        outboxId,
        outcome: "skipped",
        error: "n8n is not configured (N8N_LOAN_EVENTS_WEBHOOK_URL / CONVEX_TO_N8N_SECRET).",
      });
      return;
    }

    let outcome: "delivered" | "retry" | "failed";
    let error: string | undefined;
    try {
      // Sign at send time, so a retry hours later still passes the freshness check.
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: await sign(secret, timestamp, row.payload),
        },
        body: row.payload,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        outcome = "delivered";
      } else {
        const retryable = response.status >= 500 || [408, 429].includes(response.status);
        outcome = retryable ? "retry" : "failed";
        error = `n8n responded ${response.status}`;
      }
    } catch (e) {
      outcome = "retry";
      error = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : "network error";
    }
    await ctx.runMutation(internal.notifications.recordResult, { outboxId, outcome, error });
  },
});

export const recordResult = internalMutation({
  args: {
    outboxId: v.id("outbox"),
    outcome: v.union(
      v.literal("delivered"),
      v.literal("retry"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { outboxId, outcome, error }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status !== "pending") return;
    const attempts = row.attempts + (outcome === "skipped" ? 0 : 1);

    if (outcome === "delivered") {
      await ctx.db.patch(outboxId, { status: "delivered", attempts, deliveredAt: Date.now(), lastError: undefined });
      return;
    }
    if (outcome === "retry" && attempts <= RETRY_DELAYS_MS.length) {
      await ctx.db.patch(outboxId, { attempts, lastError: error });
      await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempts - 1], internal.notifications.deliver, {
        outboxId,
      });
      return;
    }
    const status = outcome === "skipped" ? "skipped" : "failed";
    console.error(`[outbox] ${row.eventId} ${status} after ${attempts} attempt(s): ${error}`);
    await ctx.db.patch(outboxId, { status, attempts, lastError: error });
  },
});

/** Admin: put a failed or skipped delivery back in the queue. */
export const retry = mutation({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const admin = await requireAdmin(ctx);
    const row = await ctx.db.get(outboxId);
    if (!row) fail("NOT_FOUND", "That delivery no longer exists.");
    if (row.status !== "failed" && row.status !== "skipped") {
      fail("CONFLICT", "Only failed or skipped deliveries can be retried.");
    }
    if (!row.payload) fail("CONFLICT", "This event has no recipient email, so it can't be sent.");
    await ctx.db.patch(outboxId, { status: "pending", attempts: 0, lastError: undefined });
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, { outboxId });
    await audit(ctx, admin._id, "outbox.retried", { table: "loans", id: row.loanId });
  },
});
