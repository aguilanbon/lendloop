import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sign } from "./lib/hmac";
import { NOW, listTool, setup, signIn, type T } from "./test.helpers";

const SECRET = "inbound-secret";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.N8N_INBOUND_SECRET = SECRET;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.N8N_INBOUND_SECRET;
});

async function signedPost(
  t: T,
  path: string,
  data: unknown,
  opts: { secret?: string; timestamp?: number } = {},
) {
  const body = JSON.stringify(data);
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  return t.fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LendLoop-Timestamp": ts,
      "X-LendLoop-Signature": await sign(opts.secret ?? SECRET, ts, body),
    },
    body,
  });
}

/** Bob borrowed Alice's drill from Nov 1 to Nov 5; today is Nov 9, so it's 4 days overdue. */
async function overdueLoan() {
  const t = setup();
  const alice = await signIn(t, "Alice");
  const bob = await signIn(t, "Bob");
  const toolId = await listTool(alice.as);
  const loanId = await t.run(async (ctx) => {
    const [lender, borrower] = await Promise.all([ctx.db.get(alice.userId), ctx.db.get(bob.userId)]);
    return ctx.db.insert("loans", {
      toolId,
      lenderId: lender!._id,
      borrowerId: borrower!._id,
      startDate: "2026-11-01",
      endDate: "2026-11-05",
      status: "approved",
    });
  });
  return { t, alice, bob, loanId };
}

describe("signature checks", () => {
  test("rejects unsigned, wrongly signed and stale requests", async () => {
    const { t } = await overdueLoan();

    const unsigned = await t.fetch("/n8n/overdue-loans", { method: "POST", body: "{}" });
    expect(unsigned.status).toBe(401);

    const wrongSecret = await signedPost(t, "/n8n/overdue-loans", {}, { secret: "guess" });
    expect(wrongSecret.status).toBe(401);

    const stale = await signedPost(t, "/n8n/overdue-loans", {}, {
      timestamp: Math.floor(Date.now() / 1000) - 10 * 60,
    });
    expect(stale.status).toBe(401);
  });

  test("rejects a body that was changed after signing", async () => {
    const { t } = await overdueLoan();
    const ts = String(Math.floor(Date.now() / 1000));
    const response = await t.fetch("/n8n/workflow-errors", {
      method: "POST",
      headers: {
        "X-LendLoop-Timestamp": ts,
        "X-LendLoop-Signature": await sign(SECRET, ts, '{"a":1}'),
      },
      body: '{"a":2}',
    });
    expect(response.status).toBe(401);
  });

  test("returns a generic error, not the reason", async () => {
    const { t } = await overdueLoan();
    const response = await signedPost(t, "/n8n/overdue-loans", {}, { secret: "guess" });
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});

describe("overdue loans endpoint", () => {
  test("lists overdue loans with only the fields a reminder needs", async () => {
    const { t, loanId } = await overdueLoan();
    const response = await signedPost(t, "/n8n/overdue-loans", {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      asOf: "2026-11-09",
      count: 1,
      loans: [
        {
          loanId,
          reminderKey: `reminder:${loanId}:2026-11-09`,
          borrower: { name: "Bob", email: "bob@example.com" },
          toolName: "Cordless drill",
          endDate: "2026-11-05",
          daysOverdue: 4,
        },
      ],
    });
  });

  test("skips loans that already got today's reminder", async () => {
    const { t, loanId } = await overdueLoan();
    await signedPost(t, "/n8n/automation-events", reminder(loanId, "sent"));
    const body = await (await signedPost(t, "/n8n/overdue-loans", {})).json();
    expect(body.count).toBe(0);
  });
});

function reminder(loanId: Id<"loans">, status: "sent" | "failed") {
  return {
    idempotencyKey: `reminder:${loanId}:2026-11-09`,
    loanId,
    kind: "reminder",
    status,
    channel: "mock-email",
    detail: "Overdue reminder",
  };
}

describe("write-back idempotency", () => {
  async function eventsFor(t: T, loanId: Id<"loans">) {
    return t.run((ctx) =>
      ctx.db
        .query("automationEvents")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect(),
    );
  }

  test("the same write-back twice stores one record", async () => {
    const { t, loanId } = await overdueLoan();
    const first = await signedPost(t, "/n8n/automation-events", reminder(loanId, "sent"));
    const retry = await signedPost(t, "/n8n/automation-events", reminder(loanId, "sent"));
    expect(await first.json()).toEqual({ result: "created" });
    expect(await retry.json()).toEqual({ result: "duplicate" });
    expect(await eventsFor(t, loanId)).toHaveLength(1);
  });

  test("failed then sent upgrades the record; sent is never downgraded", async () => {
    const { t, loanId } = await overdueLoan();
    await signedPost(t, "/n8n/automation-events", reminder(loanId, "failed"));
    await signedPost(t, "/n8n/automation-events", reminder(loanId, "sent"));
    await signedPost(t, "/n8n/automation-events", reminder(loanId, "failed"));
    const events = await eventsFor(t, loanId);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("sent");
  });

  test("a key must belong to the loan it claims", async () => {
    const { t, loanId } = await overdueLoan();
    const response = await signedPost(t, "/n8n/automation-events", {
      ...reminder(loanId, "sent"),
      idempotencyKey: "reminder:someOtherLoan:2026-11-09",
    });
    expect(response.status).toBe(422);
  });

  test("invalid bodies are rejected", async () => {
    const { t, loanId } = await overdueLoan();
    const response = await signedPost(t, "/n8n/automation-events", { loanId, kind: "sms" });
    expect(response.status).toBe(400);
  });

  test("the activity shows up on the loan for both parties", async () => {
    const { t, alice, bob, loanId } = await overdueLoan();
    await signedPost(t, "/n8n/automation-events", reminder(loanId, "sent"));
    const [asBorrower] = await bob.as.query(api.loans.myRequests, {});
    const [asLender] = await alice.as.query(api.loans.incoming, {});
    expect(asBorrower.activity).toEqual([
      expect.objectContaining({ kind: "reminder", status: "sent", channel: "mock-email" }),
    ]);
    expect(asLender.overdue).toBe(true);
  });
});

describe("workflow error reports", () => {
  test("are stored once per n8n execution and shown to admins", async () => {
    const { t } = await overdueLoan();
    const report = {
      executionId: "1234",
      workflowName: "LendLoop – Overdue reminders",
      nodeName: "Fetch overdue loans",
      message: "connect ECONNREFUSED",
    };
    await signedPost(t, "/n8n/workflow-errors", report);
    await signedPost(t, "/n8n/workflow-errors", report);

    const admin = await signIn(t, "Ada", { admin: true });
    const health = await admin.as.query(api.automation.healthForAdmin, {});
    expect(health.workflowFailures).toHaveLength(1);
    expect(health.workflowFailures[0]).toMatchObject({ nodeName: "Fetch overdue loans" });
  });
});
