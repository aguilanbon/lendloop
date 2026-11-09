/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import type { ErrorCode } from "./lib/errors";

// Shared setup for the backend tests. Not a Convex function module: Convex
// skips files whose name contains ".test.", and this file only exports helpers.

export const modules = import.meta.glob("./**/*.*s");

export const TODAY = "2026-11-09";
export const NOW = new Date(`${TODAY}T12:00:00Z`);

export function setup() {
  return convexTest(schema, modules);
}

export type T = ReturnType<typeof setup>;

/** Signs in as a person and creates their user row, like the app does on first load. */
export async function signIn(
  t: T,
  name: string,
  opts: { admin?: boolean; email?: string | null } = {},
) {
  const email = opts.email === null ? undefined : (opts.email ?? `${name.toLowerCase()}@example.com`);
  const as = t.withIdentity({ tokenIdentifier: `test|${name}`, subject: name, name, email });
  const userId = await as.mutation(api.users.ensureUser, {});
  if (opts.admin) await t.run((ctx) => ctx.db.patch(userId, { role: "admin" }));
  return { as, userId };
}

export async function listTool(
  as: Awaited<ReturnType<typeof signIn>>["as"],
  name = "Cordless drill",
): Promise<Id<"tools">> {
  return as.mutation(api.tools.create, {
    name,
    category: "power_tools",
    condition: "good",
    description: "Comes with two batteries.",
  });
}

/** Asserts a call fails with our structured ConvexError code. */
export async function expectCode(promise: Promise<unknown>, code: ErrorCode) {
  let caught: unknown;
  try {
    await promise;
  } catch (e) {
    caught = e;
  }
  expect(caught, `expected ${code} error`).toBeDefined();
  const data = (caught as { data?: { code?: string } }).data;
  expect(data?.code).toBe(code);
}
