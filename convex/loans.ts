import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireAdmin, requireLoanParty, requireUser } from "./lib/auth";
import { daysBetween, isIsoDate, rangesOverlap, todayUtc } from "./lib/dates";
import { fail } from "./lib/errors";
import { LIMITS, type LoanEventType, type LoanStatus } from "./lib/validators";
import { enqueueLoanEvent } from "./notifications";

// Status machine. Every transition is checked here, in one place:
//
//   pending ──approve──▶ approved ──markReturned──▶ returned
//      │                    │
//      ├──decline──▶ declined
//      └──cancel───▶ cancelled ◀──cancel (before the start date)
//
// Who may act: the lender approves, declines and confirms the return (they're
// the one who gets the tool back). The borrower cancels. Admins can view all
// loans but can't act on them: least privilege.

async function transition(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  actorId: Id<"users">,
  to: LoanStatus,
  event: LoanEventType,
  extra: Partial<Doc<"loans">> = {},
) {
  await ctx.db.patch(loan._id, { status: to, ...extra });
  await audit(ctx, actorId, event, { table: "loans", id: loan._id });
  await enqueueLoanEvent(ctx, loan._id, event);
}

async function approvedLoansFor(ctx: QueryCtx, toolId: Id<"tools">) {
  return ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND", "That listing no longer exists.");
    if (tool.ownerId === user._id) fail("FORBIDDEN", "You can't borrow your own tool.");

    const today = todayUtc();
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) fail("INVALID_INPUT", "Pick valid dates.");
    if (startDate < today) fail("INVALID_INPUT", "The start date can't be in the past.");
    if (endDate < startDate) fail("INVALID_INPUT", "The end date must be on or after the start date.");
    if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
      fail("INVALID_INPUT", `Loans can be at most ${LIMITS.maxLoanDays} days.`);
    }
    if (daysBetween(today, startDate) > LIMITS.maxBookingAheadDays) {
      fail("INVALID_INPUT", `You can book up to ${LIMITS.maxBookingAheadDays} days ahead.`);
    }

    const myPending = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    if (myPending.some((l) => l.toolId === toolId)) {
      fail("CONFLICT", "You already have a pending request for this tool.");
    }
    if (myPending.length >= LIMITS.maxPendingRequestsPerBorrower) {
      fail("CONFLICT", "You have too many pending requests. Wait for some answers first.");
    }

    const range = { startDate, endDate };
    if ((await approvedLoansFor(ctx, toolId)).some((l) => rangesOverlap(l, range))) {
      fail("CONFLICT", "The tool is already booked for some of those dates.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      lenderId: tool.ownerId,
      borrowerId: user._id,
      startDate,
      endDate,
      status: "pending",
    });
    await audit(ctx, user._id, "loan.requested", { table: "loans", id: loanId });
    await enqueueLoanEvent(ctx, loanId, "loan.requested");
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { user, loan } = await requireLoanParty(ctx, loanId, "lender");
    if (loan.status !== "pending") fail("CONFLICT", "Only pending requests can be approved.");
    const tool = await ctx.db.get(loan.toolId);
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND", "That listing no longer exists.");
    if ((await approvedLoansFor(ctx, loan.toolId)).some((l) => rangesOverlap(l, loan))) {
      fail("CONFLICT", "Those dates clash with a loan you already approved.");
    }

    const now = Date.now();
    await transition(ctx, loan, user._id, "approved", "loan.approved", { decidedAt: now });

    // The tool can't be in two places: decline other requests for the same dates.
    const clashing = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", loan.toolId).eq("status", "pending"))
      .collect();
    for (const other of clashing) {
      if (rangesOverlap(other, loan)) {
        await transition(ctx, other, user._id, "declined", "loan.declined", { decidedAt: now });
      }
    }
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { user, loan } = await requireLoanParty(ctx, loanId, "lender");
    if (loan.status !== "pending") fail("CONFLICT", "Only pending requests can be declined.");
    await transition(ctx, loan, user._id, "declined", "loan.declined", { decidedAt: Date.now() });
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { user, loan } = await requireLoanParty(ctx, loanId, "borrower");
    const notStarted = loan.status === "approved" && loan.startDate > todayUtc();
    if (loan.status !== "pending" && !notStarted) {
      fail("CONFLICT", "You can cancel a request while it's pending, or before the loan starts.");
    }
    await transition(ctx, loan, user._id, "cancelled", "loan.cancelled", { decidedAt: Date.now() });
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { user, loan } = await requireLoanParty(ctx, loanId, "lender");
    if (loan.status !== "approved") fail("CONFLICT", "Only approved loans can be marked returned.");
    await transition(ctx, loan, user._id, "returned", "loan.returned", { returnedAt: Date.now() });
  },
});

// ---------- Views ----------

async function toView(ctx: QueryCtx, loan: Doc<"loans">, today: string) {
  const [tool, lender, borrower, events] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.lenderId),
    ctx.db.get(loan.borrowerId),
    ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .order("desc")
      .take(5),
  ]);
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
    overdue: loan.status === "approved" && loan.endDate < today,
    returnedAt: loan.returnedAt ?? null,
    tool: { name: tool?.name ?? "Removed tool", removed: !tool || tool.removedAt !== undefined },
    lender: { name: lender?.name ?? "Unknown", trustedLender: lender?.trustedLender ?? false },
    borrower: { name: borrower?.name ?? "Unknown" },
    activity: events.map((e) => ({
      kind: e.kind,
      status: e.status,
      channel: e.channel,
      detail: e.detail ?? null,
      occurredAt: e.occurredAt,
    })),
  };
}

export type LoanView = Awaited<ReturnType<typeof toView>>;

async function viewAll(ctx: QueryCtx, loans: Doc<"loans">[]) {
  const today = todayUtc();
  return Promise.all(loans.map((l) => toView(ctx, l, today)));
}

/** Requests I made as a borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(100);
    return viewAll(ctx, loans);
  },
});

/** Requests for my tools, as a lender. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .order("desc")
      .take(100);
    return viewAll(ctx, loans);
  },
});

/** Admin: every loan, newest first. */
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return viewAll(ctx, loans);
  },
});

