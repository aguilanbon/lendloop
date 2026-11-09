import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Appends an audit entry. Ids and action names only, never user-written text. */
export async function audit(
  ctx: MutationCtx,
  actorId: Id<"users">,
  action: string,
  target: { table: "tools" | "loans" | "users"; id: string },
): Promise<void> {
  await ctx.db.insert("auditLog", {
    actorId,
    action,
    targetTable: target.table,
    targetId: target.id,
  });
}
