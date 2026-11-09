import { ConvexError } from "convex/values";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT";

/**
 * Throws an error the client can show. `ConvexError` data is sent to the
 * client as-is, so messages here must never include internal details.
 */
export function fail(code: ErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}
