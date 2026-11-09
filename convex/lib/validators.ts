import { v, type Infer } from "convex/values";

// Shared runtime validators. Convex checks every function argument against
// these before our code runs, so bad input never reaches a handler.

export const TOOL_CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;

export const TOOL_CONDITIONS = ["like_new", "good", "fair", "worn"] as const;

export const toolCategory = v.union(...TOOL_CATEGORIES.map((c) => v.literal(c)));
export const toolCondition = v.union(...TOOL_CONDITIONS.map((c) => v.literal(c)));

export const role = v.union(v.literal("admin"), v.literal("user"));

export const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

// Events sent to n8n. One per status change of a loan.
export const loanEventType = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.declined"),
  v.literal("loan.cancelled"),
  v.literal("loan.returned"),
);

export const automationKind = v.union(v.literal("notification"), v.literal("reminder"));
export const automationStatus = v.union(v.literal("sent"), v.literal("failed"));

export type ToolCategory = Infer<typeof toolCategory>;
export type ToolCondition = Infer<typeof toolCondition>;
export type Role = Infer<typeof role>;
export type LoanStatus = Infer<typeof loanStatus>;
export type LoanEventType = Infer<typeof loanEventType>;

export const LIMITS = {
  toolName: 80,
  toolDescription: 500,
  maxLoanDays: 30,
  maxBookingAheadDays: 90,
  maxPendingRequestsPerBorrower: 10,
} as const;
