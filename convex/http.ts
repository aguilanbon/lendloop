import { httpRouter } from "convex/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./lib/hmac";

// n8n → Convex endpoints. All are POST with a JSON body and all require an
// HMAC signature made with N8N_INBOUND_SECRET (a different secret from the one
// Convex uses to sign outbound webhooks, so leaking one doesn't open both
// directions). Failures return a generic message; the exact reason is only
// logged server-side.

const MAX_BODY_BYTES = 64 * 1024;

type Handler = (ctx: ActionCtx, body: unknown) => Promise<Response>;

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function signedRoute(name: string, handler: Handler) {
  return httpAction(async (ctx, request) => {
    const secret = process.env.N8N_INBOUND_SECRET;
    if (!secret) {
      console.error(`[http:${name}] N8N_INBOUND_SECRET is not set`);
      return json(503, { error: "not configured" });
    }

    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) return json(413, { error: "payload too large" });
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "payload too large" });

    const check = await verify({
      secret,
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      signature: request.headers.get(SIGNATURE_HEADER),
      body: raw,
    });
    if (!check.ok) {
      console.warn(`[http:${name}] rejected: ${check.reason}`);
      return json(401, { error: "unauthorized" });
    }

    let body: unknown;
    try {
      body = raw.length ? JSON.parse(raw) : {};
    } catch {
      return json(400, { error: "invalid json" });
    }
    return handler(ctx, body);
  });
}

const automationEventBody = z.object({
  idempotencyKey: z.string().min(1).max(200),
  loanId: z.string().min(1).max(64),
  kind: z.enum(["notification", "reminder"]),
  status: z.enum(["sent", "failed"]),
  channel: z.string().min(1).max(40),
  detail: z.string().max(200).optional(),
});

const workflowFailureBody = z.object({
  executionId: z.string().min(1).max(64),
  workflowName: z.string().min(1).max(120),
  nodeName: z.string().max(120).optional(),
  message: z.string().min(1).max(2000),
});

const http = httpRouter();

/** Daily reminder workflow: list loans that need a reminder today. */
http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: signedRoute("overdue-loans", async (ctx) => {
    const result = await ctx.runQuery(internal.automation.overdueLoans, {});
    return json(200, result);
  }),
});

/** Write-back from both workflows: a notification or reminder was sent (or failed). */
http.route({
  path: "/n8n/automation-events",
  method: "POST",
  handler: signedRoute("automation-events", async (ctx, body) => {
    const parsed = automationEventBody.safeParse(body);
    if (!parsed.success) return json(400, { error: "invalid body" });
    const { result } = await ctx.runMutation(internal.automation.recordAutomationEvent, parsed.data);
    if (result === "unknown_loan" || result === "bad_key") return json(422, { error: result });
    // 200 for "duplicate" too: the caller's goal (the record exists) is met,
    // so a retried write-back succeeds instead of looping.
    return json(200, { result });
  }),
});

/** n8n error workflow: record a failed execution so admins see it in the app. */
http.route({
  path: "/n8n/workflow-errors",
  method: "POST",
  handler: signedRoute("workflow-errors", async (ctx, body) => {
    const parsed = workflowFailureBody.safeParse(body);
    if (!parsed.success) return json(400, { error: "invalid body" });
    const { result } = await ctx.runMutation(internal.automation.recordWorkflowFailure, parsed.data);
    return json(200, { result });
  }),
});

export default http;
