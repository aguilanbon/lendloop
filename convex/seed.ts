import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { todayUtc } from "./lib/dates";
import type { ToolCategory, ToolCondition } from "./lib/validators";

// Demo data for local development and reviewers. Internal, so it can only be
// run from the CLI or dashboard:
//   npx convex run seed:demo
// Pass your own email to make the demo overdue loan yours, so the reminder
// workflow has something to send you:
//   npx convex run seed:demo '{"borrowerEmail":"you@example.com"}'

const NEIGHBOURS = [
  { key: "maya", name: "Maya", email: "maya@lendloop.test", trusted: true },
  { key: "tom", name: "Tom", email: "tom@lendloop.test", trusted: false },
  { key: "priya", name: "Priya", email: "priya@lendloop.test", trusted: false },
] as const;

const TOOLS: {
  owner: (typeof NEIGHBOURS)[number]["key"];
  name: string;
  category: ToolCategory;
  condition: ToolCondition;
  description: string;
}[] = [
  { owner: "maya", name: "Cordless drill", category: "power_tools", condition: "good", description: "18V with two batteries and a bit set." },
  { owner: "maya", name: "Extension ladder", category: "hand_tools", condition: "fair", description: "3.5 m. Needs two people to carry." },
  { owner: "tom", name: "Pressure washer", category: "cleaning", condition: "like_new", description: "Great for decks and driveways. Hose included." },
  { owner: "tom", name: "Four-person tent", category: "camping", condition: "good", description: "Pitches in about 10 minutes. Pegs and mallet in the bag." },
  { owner: "priya", name: "Hedge trimmer", category: "garden", condition: "good", description: "Electric, 50 cm blade." },
  { owner: "priya", name: "Stand mixer", category: "kitchen", condition: "worn", description: "Works fine, bowl is scratched. Dough hook and whisk." },
];

function shift(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const demo = internalMutation({
  args: { borrowerEmail: v.optional(v.string()) },
  handler: async (ctx, { borrowerEmail }) => {
    if (await ctx.db.query("tools").first()) return "Already seeded. Clear the tables to reseed.";

    const ids: Record<string, Awaited<ReturnType<typeof ctx.db.insert<"users">>>> = {};
    for (const n of NEIGHBOURS) {
      ids[n.key] = await ctx.db.insert("users", {
        tokenIdentifier: `seed|${n.key}`, // can't sign in as these: no Clerk account behind them
        name: n.name,
        email: n.email,
        role: "user",
        trustedLender: n.trusted,
      });
    }

    const toolIds: Record<string, Awaited<ReturnType<typeof ctx.db.insert<"tools">>>> = {};
    for (const t of TOOLS) {
      toolIds[t.name] = await ctx.db.insert("tools", {
        ownerId: ids[t.owner],
        name: t.name,
        category: t.category,
        condition: t.condition,
        description: t.description,
      });
    }

    // An overdue loan, so the daily reminder workflow has work to do.
    let borrowerId = ids.priya;
    if (borrowerEmail) {
      const users = await ctx.db.query("users").collect();
      const you = users.find((u) => u.email === borrowerEmail.toLowerCase());
      if (you) borrowerId = you._id;
    }
    const today = todayUtc();
    await ctx.db.insert("loans", {
      toolId: toolIds["Pressure washer"],
      lenderId: ids.tom,
      borrowerId,
      startDate: shift(today, -6),
      endDate: shift(today, -2),
      status: "approved",
      decidedAt: Date.now(),
    });
    // A pending request waiting on Maya.
    await ctx.db.insert("loans", {
      toolId: toolIds["Cordless drill"],
      lenderId: ids.maya,
      borrowerId: ids.tom,
      startDate: shift(today, 2),
      endDate: shift(today, 4),
      status: "pending",
    });
    return `Seeded ${NEIGHBOURS.length} neighbours, ${TOOLS.length} tools and 2 loans.`;
  },
});
