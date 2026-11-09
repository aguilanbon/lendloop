import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { audit } from "./lib/audit";
import { getViewer, requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";

const MAX_NAME = 60;

/**
 * Creates the caller's user row on first sign-in, and keeps name and email in
 * sync with Clerk after that. Takes no arguments: everything comes from the
 * verified Clerk token, and the role is never set here.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("UNAUTHENTICATED", "Please sign in to continue.");

    const email = identity.email?.toLowerCase();
    const name = (
      identity.name ??
      identity.givenName ??
      identity.nickname ??
      email?.split("@")[0] ??
      "Neighbour"
    ).slice(0, MAX_NAME);

    const existing = await getViewer(ctx);
    if (existing) {
      // Only sync what the token actually carries: a token without claims
      // must never wipe a name or email we already have.
      const patch: { name?: string; email?: string } = {};
      const tokenName = (identity.name ?? identity.givenName ?? identity.nickname)?.slice(0, MAX_NAME);
      if (tokenName && tokenName !== existing.name) patch.name = tokenName;
      if (email && email !== existing.email) patch.email = email;
      if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: "user",
      trustedLender: false,
    });
  },
});

/** The caller's own profile. Returns only what the UI needs. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

/** Admin: everyone, with a masked email so admins can tell people apart. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(500);
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      maskedEmail: u.email ? maskEmail(u.email) : null,
      role: u.role,
      trustedLender: u.trustedLender,
    }));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) fail("NOT_FOUND", "That user no longer exists.");
    if (target.trustedLender === trusted) return;
    await ctx.db.patch(userId, { trustedLender: trusted });
    await audit(ctx, admin._id, trusted ? "user.trusted" : "user.untrusted", {
      table: "users",
      id: userId,
    });
  },
});

/**
 * Promotes a user to admin. Internal, so it can't be called from a browser:
 * run it from the CLI or the Convex dashboard.
 *   npx convex run users:grantAdmin '{"email":"you@example.com"}'
 */
export const grantAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const users = await ctx.db.query("users").collect();
    const user = users.find((u) => u.email === email.toLowerCase());
    if (!user) throw new Error(`No user with email ${email}. Sign in once first.`);
    await ctx.db.patch(user._id, { role: "admin" });
    return `${user.name} is now an admin.`;
  },
});

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}
