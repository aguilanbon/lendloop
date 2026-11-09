import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  automationKind,
  automationStatus,
  loanEventType,
  loanStatus,
  role,
  toolCategory,
  toolCondition,
} from "./lib/validators";

export default defineSchema({
  // One row per Clerk user. Created on first sign-in by `users.ensureUser`.
  // We keep only what the app needs: a display name for the UI and an email
  // address so n8n can deliver notifications. Role is never taken from the client.
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    role,
    trustedLender: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  // Listings are soft-deleted (`removedAt`) so past loans keep a valid tool
  // reference and the audit trail stays intact.
  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: toolCategory,
    condition: toolCondition,
    description: v.string(),
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_removed_category", ["removedAt", "category"]),

  // A borrow request and, once approved, the loan itself.
  // Status machine: pending → approved | declined | cancelled; approved → returned.
  // `lenderId` is copied from the tool at request time so authorisation checks
  // and the "incoming requests" view need a single index lookup.
  loans: defineTable({
    toolId: v.id("tools"),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD (calendar date, no time zone)
    endDate: v.string(), // YYYY-MM-DD, inclusive
    status: loanStatus,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_tool_status", ["toolId", "status"])
    .index("by_status_endDate", ["status", "endDate"]),

  // Transactional outbox for Convex → n8n webhooks. A mutation inserts the row
  // and schedules delivery in the same transaction, so an event is never lost
  // and never sent for a change that rolled back.
  outbox: defineTable({
    eventId: v.string(), // sent to n8n; n8n de-duplicates on it
    type: loanEventType,
    loanId: v.id("loans"),
    payload: v.string(), // the exact JSON body that gets signed and sent
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_status", ["status"]),

  // What n8n reports back: notifications delivered and overdue reminders sent.
  // `idempotencyKey` is unique, so a retried write-back updates the same row
  // instead of creating a duplicate. Powers the per-loan activity feed.
  automationEvents: defineTable({
    idempotencyKey: v.string(),
    loanId: v.id("loans"),
    kind: automationKind,
    status: automationStatus,
    channel: v.string(),
    detail: v.optional(v.string()),
    occurredAt: v.number(),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  // Failed n8n executions, reported by the n8n error workflow, so failures are
  // visible to admins in the app and not only inside n8n.
  workflowFailures: defineTable({
    executionId: v.string(),
    workflowName: v.string(),
    nodeName: v.optional(v.string()),
    message: v.string(),
    occurredAt: v.number(),
  }).index("by_executionId", ["executionId"]),

  // Append-only record of who changed what. No free-text user content is
  // copied in, only ids and the action name.
  auditLog: defineTable({
    actorId: v.id("users"),
    action: v.string(),
    targetTable: v.union(v.literal("tools"), v.literal("loans"), v.literal("users")),
    targetId: v.string(),
  }),
});
