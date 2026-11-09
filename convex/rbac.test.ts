import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { NOW, expectCode, listTool, setup, signIn } from "./test.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("public page data", () => {
  test("returns name and category only, and works signed out", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    await listTool(alice.as, "Hedge trimmer");

    const tools = await t.query(api.tools.listPublic, {});
    expect(tools).toEqual([{ name: "Hedge trimmer", category: "power_tools" }]);
    expect(Object.keys(tools[0]).sort()).toEqual(["category", "name"]);
  });

  test("hides tools that are out on loan", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const bob = await signIn(t, "Bob");
    const toolId = await listTool(alice.as);
    const loanId = await bob.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-09",
      endDate: "2026-11-10",
    });
    await alice.as.mutation(api.loans.approve, { loanId });

    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  test("signed-in views reject anonymous callers", async () => {
    const t = setup();
    await expectCode(t.query(api.tools.listAll, {}), "UNAUTHENTICATED");
    await expectCode(t.query(api.loans.myRequests, {}), "UNAUTHENTICATED");
    await expectCode(
      t.mutation(api.tools.create, {
        name: "x",
        category: "garden",
        condition: "good",
        description: "",
      }),
      "UNAUTHENTICATED",
    );
  });
});

describe("listings", () => {
  test("new users are plain users; the role can't be chosen", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    expect(await alice.as.query(api.users.me, {})).toMatchObject({ role: "user" });
  });

  test("a token without name or email never wipes what we already have", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const bare = t.withIdentity({ tokenIdentifier: "test|Alice", subject: "Alice" });
    await bare.mutation(api.users.ensureUser, {});
    const row = await t.run((ctx) => ctx.db.get(alice.userId));
    expect(row).toMatchObject({ name: "Alice", email: "alice@example.com" });
  });

  test("a user can't edit or delete someone else's listing", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const mallory = await signIn(t, "Mallory");
    const toolId = await listTool(alice.as);

    await expectCode(
      mallory.as.mutation(api.tools.update, {
        toolId,
        name: "Mine now",
        category: "garden",
        condition: "worn",
        description: "",
      }),
      "FORBIDDEN",
    );
    await expectCode(mallory.as.mutation(api.tools.remove, { toolId }), "FORBIDDEN");
  });

  test("an admin can remove any listing, but not rewrite it", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const admin = await signIn(t, "Ada", { admin: true });
    const toolId = await listTool(alice.as);

    await expectCode(
      admin.as.mutation(api.tools.update, {
        toolId,
        name: "Edited",
        category: "garden",
        condition: "good",
        description: "",
      }),
      "FORBIDDEN",
    );
    await admin.as.mutation(api.tools.remove, { toolId });
    expect(await alice.as.query(api.tools.myListings, {})).toEqual([]);
  });

  test("removing a listing declines its pending requests", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const bob = await signIn(t, "Bob");
    const toolId = await listTool(alice.as);
    await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-12", endDate: "2026-11-13" });

    await alice.as.mutation(api.tools.remove, { toolId });
    const [mine] = await bob.as.query(api.loans.myRequests, {});
    expect(mine.status).toBe("declined");
  });

  test("an owner can't delete a tool that's out on an approved loan", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const bob = await signIn(t, "Bob");
    const toolId = await listTool(alice.as);
    const loanId = await bob.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-09",
      endDate: "2026-11-11",
    });
    await alice.as.mutation(api.loans.approve, { loanId });
    await expectCode(alice.as.mutation(api.tools.remove, { toolId }), "CONFLICT");
  });

  test("input limits are enforced on the server", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    await expectCode(
      alice.as.mutation(api.tools.create, {
        name: "   ",
        category: "garden",
        condition: "good",
        description: "",
      }),
      "INVALID_INPUT",
    );
    await expectCode(
      alice.as.mutation(api.tools.create, {
        name: "Rake",
        category: "garden",
        condition: "good",
        description: "x".repeat(501),
      }),
      "INVALID_INPUT",
    );
  });
});

describe("loan permissions", () => {
  async function pendingRequest() {
    const t = setup();
    const alice = await signIn(t, "Alice"); // lender
    const bob = await signIn(t, "Bob"); // borrower
    const mallory = await signIn(t, "Mallory"); // unrelated
    const toolId = await listTool(alice.as);
    const loanId = await bob.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-10",
      endDate: "2026-11-12",
    });
    return { t, alice, bob, mallory, toolId, loanId };
  }

  test("you can't borrow your own tool", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const toolId = await listTool(alice.as);
    await expectCode(
      alice.as.mutation(api.loans.request, { toolId, startDate: "2026-11-10", endDate: "2026-11-11" }),
      "FORBIDDEN",
    );
  });

  test("another user can't approve or decline your request", async () => {
    const { mallory, loanId } = await pendingRequest();
    // NOT_FOUND, not FORBIDDEN: a stranger doesn't learn the loan exists.
    await expectCode(mallory.as.mutation(api.loans.approve, { loanId }), "NOT_FOUND");
    await expectCode(mallory.as.mutation(api.loans.decline, { loanId }), "NOT_FOUND");
    await expectCode(mallory.as.mutation(api.loans.cancel, { loanId }), "NOT_FOUND");
  });

  test("the borrower can't approve their own request", async () => {
    const { bob, loanId } = await pendingRequest();
    await expectCode(bob.as.mutation(api.loans.approve, { loanId }), "FORBIDDEN");
  });

  test("the lender can't cancel on the borrower's behalf", async () => {
    const { alice, loanId } = await pendingRequest();
    await expectCode(alice.as.mutation(api.loans.cancel, { loanId }), "FORBIDDEN");
  });

  test("only the lender can mark a loan returned", async () => {
    const { alice, bob, loanId } = await pendingRequest();
    await alice.as.mutation(api.loans.approve, { loanId });
    await expectCode(bob.as.mutation(api.loans.markReturned, { loanId }), "FORBIDDEN");
    await alice.as.mutation(api.loans.markReturned, { loanId });
  });

  test("admins can view all loans but not act on them", async () => {
    const { t, loanId } = await pendingRequest();
    const admin = await signIn(t, "Ada", { admin: true });
    expect(await admin.as.query(api.loans.listAllForAdmin, {})).toHaveLength(1);
    await expectCode(admin.as.mutation(api.loans.approve, { loanId }), "NOT_FOUND");
  });

  test("views only show your own side", async () => {
    const { alice, bob, mallory } = await pendingRequest();
    expect(await bob.as.query(api.loans.myRequests, {})).toHaveLength(1);
    expect(await alice.as.query(api.loans.incoming, {})).toHaveLength(1);
    expect(await mallory.as.query(api.loans.myRequests, {})).toHaveLength(0);
    expect(await mallory.as.query(api.loans.incoming, {})).toHaveLength(0);
  });
});

describe("admin-only functions", () => {
  test("plain users are refused", async () => {
    const t = setup();
    const bob = await signIn(t, "Bob");
    await expectCode(bob.as.query(api.loans.listAllForAdmin, {}), "FORBIDDEN");
    await expectCode(bob.as.query(api.users.listForAdmin, {}), "FORBIDDEN");
    await expectCode(bob.as.query(api.automation.healthForAdmin, {}), "FORBIDDEN");
    await expectCode(bob.as.query(api.admin.recentAudit, {}), "FORBIDDEN");
    await expectCode(
      bob.as.mutation(api.users.setTrustedLender, { userId: bob.userId, trusted: true }),
      "FORBIDDEN",
    );
  });

  test("an admin can mark a Trusted Lender, and it's audited", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const admin = await signIn(t, "Ada", { admin: true });
    await admin.as.mutation(api.users.setTrustedLender, { userId: alice.userId, trusted: true });

    expect(await alice.as.query(api.users.me, {})).toMatchObject({ trustedLender: true });
    const [entry] = await admin.as.query(api.admin.recentAudit, {});
    expect(entry).toMatchObject({ actor: "Ada", action: "user.trusted" });
  });

  test("the admin user list masks emails", async () => {
    const t = setup();
    await signIn(t, "Alice");
    const admin = await signIn(t, "Ada", { admin: true });
    const users = await admin.as.query(api.users.listForAdmin, {});
    expect(users.find((u) => u.name === "Alice")?.maskedEmail).toBe("a***@example.com");
  });
});
