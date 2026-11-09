import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { requireToolOwner, requireUser } from "./lib/auth";
import { todayUtc } from "./lib/dates";
import { fail } from "./lib/errors";
import { enqueueLoanEvent } from "./notifications";
import { LIMITS, toolCategory, toolCondition } from "./lib/validators";

export type Availability =
  | { state: "available"; nextBookingStart: string | null }
  | { state: "on_loan"; until: string; overdue: boolean };

async function availabilityOf(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  today: string,
): Promise<Availability> {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  const current = approved.find((l) => l.startDate <= today);
  if (current) {
    return { state: "on_loan", until: current.endDate, overdue: current.endDate < today };
  }
  const upcoming = approved.map((l) => l.startDate).sort();
  return { state: "available", nextBookingStart: upcoming[0] ?? null };
}

function liveTools(ctx: QueryCtx) {
  return ctx.db
    .query("tools")
    .withIndex("by_removed_category", (q) => q.eq("removedAt", undefined));
}

function cleanText(value: string, field: string, max: number, required: boolean): string {
  const trimmed = value.trim();
  if (required && trimmed.length === 0) fail("INVALID_INPUT", `${field} is required.`);
  if (trimmed.length > max) fail("INVALID_INPUT", `${field} must be ${max} characters or fewer.`);
  return trimmed;
}

/**
 * Public, no sign-in needed. Returns name and category only: no ids, owners,
 * descriptions or dates, so nothing here identifies a neighbour.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const tools = await liveTools(ctx).take(200);
    const result: { name: string; category: Doc<"tools">["category"] }[] = [];
    for (const tool of tools) {
      const availability = await availabilityOf(ctx, tool._id, today);
      if (availability.state === "available") {
        result.push({ name: tool.name, category: tool.category });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Signed-in board: every live listing with availability, optionally by category. */
export const listAll = query({
  args: { category: v.optional(toolCategory) },
  handler: async (ctx, { category }) => {
    const viewer = await requireUser(ctx);
    const today = todayUtc();
    const tools = await liveTools(ctx)
      .filter((q) => (category ? q.eq(q.field("category"), category) : true))
      .take(200);

    const myPending = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    const requestedToolIds = new Set(myPending.map((l) => l.toolId));

    const owners = new Map<Id<"users">, Doc<"users"> | null>();
    const rows = [];
    for (const tool of tools) {
      if (!owners.has(tool.ownerId)) owners.set(tool.ownerId, await ctx.db.get(tool.ownerId));
      const owner = owners.get(tool.ownerId);
      rows.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        // Signed-in neighbours see the lender's display name and badge only.
        owner: { name: owner?.name ?? "Unknown", trustedLender: owner?.trustedLender ?? false },
        isMine: tool.ownerId === viewer._id,
        requestedByMe: requestedToolIds.has(tool._id),
        availability: await availabilityOf(ctx, tool._id, today),
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const myListings = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const today = todayUtc();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .filter((q) => q.eq(q.field("removedAt"), undefined))
      .collect();
    const rows = [];
    for (const tool of tools) {
      const pending = await ctx.db
        .query("loans")
        .withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", "pending"))
        .collect();
      rows.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        pendingRequests: pending.length,
        availability: await availabilityOf(ctx, tool._id, today),
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

const toolFields = {
  name: v.string(),
  category: toolCategory,
  condition: toolCondition,
  description: v.string(),
};

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const toolId = await ctx.db.insert("tools", {
      ownerId: user._id,
      name: cleanText(args.name, "Name", LIMITS.toolName, true),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, "Description", LIMITS.toolDescription, false),
    });
    await audit(ctx, user._id, "tool.created", { table: "tools", id: toolId });
    return toolId;
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...args }) => {
    // Owners only. Admins moderate by removing, not by editing someone's words.
    const { user } = await requireToolOwner(ctx, toolId);
    await ctx.db.patch(toolId, {
      name: cleanText(args.name, "Name", LIMITS.toolName, true),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, "Description", LIMITS.toolDescription, false),
    });
    await audit(ctx, user._id, "tool.updated", { table: "tools", id: toolId });
  },
});

/**
 * Owner deletes their listing, or an admin removes any listing.
 * Soft delete: past loans keep pointing at a real row. Open requests are
 * declined so borrowers hear about it.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const { user, tool } = await requireToolOwner(ctx, toolId, { allowAdmin: true });
    const isAdminAction = tool.ownerId !== user._id;

    const approved = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
      .collect();
    if (approved.length > 0 && !isAdminAction) {
      fail(
        "CONFLICT",
        "This tool has an approved loan. Mark it returned (or wait for it to finish) before deleting.",
      );
    }

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect();
    for (const loan of pending) {
      await ctx.db.patch(loan._id, { status: "declined", decidedAt: Date.now() });
      await enqueueLoanEvent(ctx, loan._id, "loan.declined");
    }

    await ctx.db.patch(toolId, { removedAt: Date.now(), removedBy: user._id });
    await audit(ctx, user._id, isAdminAction ? "tool.removed_by_admin" : "tool.deleted", {
      table: "tools",
      id: toolId,
    });
  },
});
