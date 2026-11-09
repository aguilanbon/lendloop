import { query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

/** Admin: the latest audit entries with actor names resolved. */
export const recentAudit = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const entries = await ctx.db.query("auditLog").order("desc").take(50);
    const names = new Map<string, string>();
    return Promise.all(
      entries.map(async (e) => {
        if (!names.has(e.actorId)) names.set(e.actorId, (await ctx.db.get(e.actorId))?.name ?? "Unknown");
        return {
          _id: e._id,
          at: e._creationTime,
          actor: names.get(e.actorId)!,
          action: e.action,
          target: `${e.targetTable}/${e.targetId}`,
        };
      }),
    );
  },
});
