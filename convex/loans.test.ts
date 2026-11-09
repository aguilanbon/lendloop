import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { verify } from "./lib/hmac";
import { NOW, expectCode, listTool, setup, signIn, type T } from "./test.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.N8N_LOAN_EVENTS_WEBHOOK_URL;
  delete process.env.CONVEX_TO_N8N_SECRET;
});

async function scenario() {
  const t = setup();
  const alice = await signIn(t, "Alice");
  const bob = await signIn(t, "Bob");
  const carol = await signIn(t, "Carol");
  const toolId = await listTool(alice.as);
  return { t, alice, bob, carol, toolId };
}

describe("status machine", () => {
  test("a declined request can't be approved, and a pending one can't be returned", async () => {
    const { alice, bob, toolId } = await scenario();
    const loanId = await bob.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-10",
      endDate: "2026-11-11",
    });
    await expectCode(alice.as.mutation(api.loans.markReturned, { loanId }), "CONFLICT");
    await alice.as.mutation(api.loans.decline, { loanId });
    await expectCode(alice.as.mutation(api.loans.approve, { loanId }), "CONFLICT");
  });

  test("approving declines clashing requests and blocks new ones for those dates", async () => {
    const { alice, bob, carol, toolId } = await scenario();
    const bobLoan = await bob.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-10",
      endDate: "2026-11-12",
    });
    const carolClash = await carol.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-12",
      endDate: "2026-11-14",
    });
    await alice.as.mutation(api.loans.approve, { loanId: bobLoan });

    const [carolView] = await carol.as.query(api.loans.myRequests, {});
    expect(carolView._id).toBe(carolClash);
    expect(carolView.status).toBe("declined");

    await expectCode(
      carol.as.mutation(api.loans.request, { toolId, startDate: "2026-11-11", endDate: "2026-11-11" }),
      "CONFLICT",
    );
    // Non-overlapping dates are still bookable.
    await carol.as.mutation(api.loans.request, { toolId, startDate: "2026-11-13", endDate: "2026-11-14" });
  });

  test("dates are validated on the server", async () => {
    const { bob, toolId } = await scenario();
    const req = (startDate: string, endDate: string) =>
      bob.as.mutation(api.loans.request, { toolId, startDate, endDate });
    await expectCode(req("2026-11-08", "2026-11-10"), "INVALID_INPUT"); // in the past
    await expectCode(req("2026-11-12", "2026-11-10"), "INVALID_INPUT"); // ends before it starts
    await expectCode(req("2026-11-10", "2026-12-20"), "INVALID_INPUT"); // longer than 30 days
    await expectCode(req("2026-02-30", "2026-03-01"), "INVALID_INPUT"); // not a real date
  });

  test("one pending request per tool per borrower", async () => {
    const { bob, toolId } = await scenario();
    await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-10", endDate: "2026-11-11" });
    await expectCode(
      bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-20", endDate: "2026-11-21" }),
      "CONFLICT",
    );
  });
});

describe("webhook outbox", () => {
  async function outboxRows(t: T) {
    return t.run((ctx) => ctx.db.query("outbox").collect());
  }

  test("each transition queues one event with a minimal payload for the right person", async () => {
    const { t, alice, bob, toolId } = await scenario();
    const loanId = await bob.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-10",
      endDate: "2026-11-11",
    });

    const [requested] = await outboxRows(t);
    const payload = JSON.parse(requested.payload);
    expect(payload).toEqual({
      eventId: `${loanId}.loan.requested`,
      type: "loan.requested",
      occurredAt: expect.any(String),
      loanId,
      recipient: { name: "Alice", email: "alice@example.com" }, // the lender
      counterpartyName: "Bob",
      toolName: "Cordless drill",
      startDate: "2026-11-10",
      endDate: "2026-11-11",
    });
    // The borrower's email never goes to n8n for an event meant for the lender.
    expect(requested.payload).not.toContain("bob@example.com");

    await alice.as.mutation(api.loans.approve, { loanId });
    const approved = (await outboxRows(t)).find((r) => r.type === "loan.approved")!;
    expect(JSON.parse(approved.payload).recipient.email).toBe("bob@example.com");
  });

  test("a recipient without an email is skipped, not sent", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice", { email: null });
    const bob = await signIn(t, "Bob");
    const toolId = await listTool(alice.as);
    await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-10", endDate: "2026-11-11" });
    const [row] = await outboxRows(t);
    expect(row.status).toBe("skipped");
    expect(row.payload).toBe("");
  });

  async function queuedEvent() {
    const { t, bob, toolId } = await scenario();
    await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-10", endDate: "2026-11-11" });
    const [row] = await outboxRows(t);
    return { t, outboxId: row._id as Id<"outbox"> };
  }

  test("delivery is skipped (not failed) when n8n isn't configured", async () => {
    const { t, outboxId } = await queuedEvent();
    await t.action(internal.notifications.deliver, { outboxId });
    expect((await t.run((ctx) => ctx.db.get(outboxId)))?.status).toBe("skipped");
  });

  test("delivery signs the body so n8n can verify it", async () => {
    process.env.N8N_LOAN_EVENTS_WEBHOOK_URL = "https://n8n.test/webhook/lendloop";
    process.env.CONVEX_TO_N8N_SECRET = "outbound-secret";
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { t, outboxId } = await queuedEvent();
    await t.action(internal.notifications.deliver, { outboxId });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    const result = await verify({
      secret: "outbound-secret",
      timestamp: headers["X-LendLoop-Timestamp"],
      signature: headers["X-LendLoop-Signature"],
      body: init.body as string,
    });
    expect(result).toEqual({ ok: true });
    expect((await t.run((ctx) => ctx.db.get(outboxId)))?.status).toBe("delivered");
  });

  test("5xx and network errors retry with backoff; other 4xx fail at once", async () => {
    process.env.N8N_LOAN_EVENTS_WEBHOOK_URL = "https://n8n.test/webhook/lendloop";
    process.env.CONVEX_TO_N8N_SECRET = "outbound-secret";

    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const first = await queuedEvent();
    await first.t.action(internal.notifications.deliver, { outboxId: first.outboxId });
    expect(await first.t.run((ctx) => ctx.db.get(first.outboxId))).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "n8n responded 503",
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const second = await queuedEvent();
    await second.t.action(internal.notifications.deliver, { outboxId: second.outboxId });
    expect(await second.t.run((ctx) => ctx.db.get(second.outboxId))).toMatchObject({
      status: "failed",
      attempts: 1,
    });
  });

  test("gives up after the last retry and an admin can requeue it", async () => {
    const { t, outboxId } = await queuedEvent();
    for (let i = 0; i < 6; i++) {
      await t.mutation(internal.notifications.recordResult, { outboxId, outcome: "retry", error: "timeout" });
    }
    expect(await t.run((ctx) => ctx.db.get(outboxId))).toMatchObject({ status: "failed", attempts: 6 });

    const admin = await signIn(t, "Ada", { admin: true });
    const health = await admin.as.query(api.automation.healthForAdmin, {});
    expect(health.deliveryProblems).toHaveLength(1);

    await admin.as.mutation(api.notifications.retry, { outboxId });
    expect(await t.run((ctx) => ctx.db.get(outboxId))).toMatchObject({ status: "pending", attempts: 0 });
  });
});
