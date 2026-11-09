import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { daysBetween, isIsoDate, todayUtc } from "./lib/dates";
import { automationKind, automationStatus } from "./lib/validators";

// Internal functions behind the signed HTTP routes in http.ts. They are
// `internal*`, so the only way to reach them from outside is through those
// routes, after the HMAC check.

/** Reminder key: one reminder per loan per day. */
export function reminderKey(loanId: string, date: string): string {
  return `reminder:${loanId}:${date}`;
}

/**
 * Approved loans whose end date has passed, minus any that already got a
 * reminder today. Returns only what a reminder needs.
 */
export const overdueLoans = internalQuery({
  args: { today: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const today = args.today ?? todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(500);

    const items = [];
    for (const loan of loans) {
      const key = reminderKey(loan._id, today);
      const already = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", key))
        .unique();
      if (already?.status === "sent") continue;

      const [borrower, tool] = await Promise.all([
        ctx.db.get(loan.borrowerId),
        ctx.db.get(loan.toolId),
      ]);
      if (!borrower?.email || !tool) continue;
      items.push({
        loanId: loan._id,
        reminderKey: key,
        borrower: { name: borrower.name, email: borrower.email },
        toolName: tool.name,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
      });
    }
    return { asOf: today, count: items.length, loans: items };
  },
});

/**
 * n8n's write-back. Idempotent on `idempotencyKey`:
 *   - a new key inserts one row;
 *   - the same key again updates that row (a retry never adds a duplicate);
 *   - a "sent" row is never downgraded to "failed" by a late, stale retry.
 */
export const recordAutomationEvent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.string(),
    kind: automationKind,
    status: automationStatus,
    channel: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    if (!loanId || !(await ctx.db.get(loanId))) return { result: "unknown_loan" as const };
    if (!keyMatches(args.kind, args.idempotencyKey, loanId)) {
      return { result: "bad_key" as const };
    }

    const fields = {
      status: args.status,
      channel: args.channel.slice(0, 40),
      detail: args.detail?.slice(0, 200),
      occurredAt: Date.now(),
    };
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();

    if (!existing) {
      await ctx.db.insert("automationEvents", {
        idempotencyKey: args.idempotencyKey,
        loanId,
        kind: args.kind,
        ...fields,
      });
      return { result: "created" as const };
    }
    if (existing.status === "sent" || existing.status === args.status) {
      return { result: "duplicate" as const };
    }
    await ctx.db.patch(existing._id, fields); // failed → sent after a successful retry
    return { result: "updated" as const };
  },
});

function keyMatches(kind: "notification" | "reminder", key: string, loanId: string): boolean {
  if (kind === "reminder") {
    const prefix = `reminder:${loanId}:`;
    return key.startsWith(prefix) && isIsoDate(key.slice(prefix.length));
  }
  return /^notification:[a-z0-9]+\.loan\.(requested|approved|declined|cancelled|returned)$/.test(key)
    && key.startsWith(`notification:${loanId}.`);
}

/** Called by the n8n error workflow. Idempotent on the n8n execution id. */
export const recordWorkflowFailure = internalMutation({
  args: {
    executionId: v.string(),
    workflowName: v.string(),
    nodeName: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflowFailures")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .unique();
    if (existing) return { result: "duplicate" as const };
    await ctx.db.insert("workflowFailures", {
      executionId: args.executionId.slice(0, 64),
      workflowName: args.workflowName.slice(0, 120),
      nodeName: args.nodeName?.slice(0, 120),
      message: args.message.slice(0, 500),
      occurredAt: Date.now(),
    });
    return { result: "created" as const };
  },
});

/** Admin: anything that went wrong in either direction, newest first. */
export const healthForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [failed, skipped, pending, workflowFailures] = await Promise.all([
      ctx.db.query("outbox").withIndex("by_status", (q) => q.eq("status", "failed")).order("desc").take(50),
      ctx.db.query("outbox").withIndex("by_status", (q) => q.eq("status", "skipped")).order("desc").take(50),
      ctx.db.query("outbox").withIndex("by_status", (q) => q.eq("status", "pending")).take(100),
      ctx.db.query("workflowFailures").order("desc").take(50),
    ]);
    return {
      pendingDeliveries: pending.length,
      deliveryProblems: [...failed, ...skipped]
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((row) => ({
          _id: row._id,
          eventId: row.eventId,
          type: row.type,
          status: row.status,
          attempts: row.attempts,
          lastError: row.lastError ?? null,
          createdAt: row._creationTime,
          canRetry: row.payload !== "",
        })),
      workflowFailures: workflowFailures.map((f) => ({
        _id: f._id,
        workflowName: f.workflowName,
        nodeName: f.nodeName ?? null,
        message: f.message,
        executionId: f.executionId,
        occurredAt: f.occurredAt,
      })),
    };
  },
});
