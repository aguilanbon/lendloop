import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

// Every public query and mutation that touches private data starts with one of
// these helpers. Authorisation lives here, in the backend, so the UI hiding a
// button is a convenience and never the thing that protects data.

type Ctx = QueryCtx | MutationCtx;

/** The signed-in user's row, or null when signed out or not provisioned yet. */
export async function getViewer(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail("UNAUTHENTICATED", "Please sign in to continue.");
  const user = await getViewer(ctx);
  if (!user) fail("UNAUTHENTICATED", "Your account is still being set up. Try again in a moment.");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") fail("FORBIDDEN", "Only admins can do that.");
  return user;
}

/**
 * Loads a live listing and checks the caller owns it.
 * `allowAdmin` lets admins through for moderation (removing any listing).
 */
export async function requireToolOwner(
  ctx: Ctx,
  toolId: Id<"tools">,
  opts: { allowAdmin?: boolean } = {},
): Promise<{ user: Doc<"users">; tool: Doc<"tools"> }> {
  const user = await requireUser(ctx);
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND", "That listing no longer exists.");
  const isOwner = tool.ownerId === user._id;
  const isAdminOverride = opts.allowAdmin === true && user.role === "admin";
  if (!isOwner && !isAdminOverride) fail("FORBIDDEN", "You can only change your own listings.");
  return { user, tool };
}

/**
 * Loads a loan and checks the caller is the lender, the borrower, or either.
 * A non-party gets NOT_FOUND rather than FORBIDDEN, so the response does not
 * confirm that someone else's loan exists.
 */
export async function requireLoanParty(
  ctx: Ctx,
  loanId: Id<"loans">,
  party: "lender" | "borrower" | "either",
): Promise<{ user: Doc<"users">; loan: Doc<"loans"> }> {
  const user = await requireUser(ctx);
  const loan = await ctx.db.get(loanId);
  if (!loan) fail("NOT_FOUND", "That request no longer exists.");
  const isLender = loan.lenderId === user._id;
  const isBorrower = loan.borrowerId === user._id;
  const allowed =
    party === "lender" ? isLender : party === "borrower" ? isBorrower : isLender || isBorrower;
  if (!allowed) {
    if (isLender || isBorrower) {
      // A party to the loan, but not the one allowed to take this action.
      fail("FORBIDDEN", `Only the ${party} can do that.`);
    }
    fail("NOT_FOUND", "That request no longer exists.");
  }
  return { user, loan };
}
