import { describe, expect, test } from "vitest";
import { sign, verify } from "./lib/hmac";

describe("hmac", () => {
  const now = 1_800_000_000;
  const ts = String(now);

  test("round-trips", async () => {
    const signature = await sign("s3cret", ts, '{"a":1}');
    expect(signature).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(await verify({ secret: "s3cret", timestamp: ts, signature, body: '{"a":1}', nowSeconds: now }))
      .toEqual({ ok: true });
  });

  test("matches a known vector, so n8n's Node crypto code computes the same value", async () => {
    // node -e "console.log(require('crypto').createHmac('sha256','s3cret').update('1800000000.{}').digest('hex'))"
    expect(await sign("s3cret", ts, "{}")).toBe(
      "v1=1cd77f07c7f231a8a17cd9bc413e578ccb209c24eb17a0577ce1eb9218a4f3ed",
    );
  });

  test("rejects tampering, wrong secrets, stale and malformed input", async () => {
    const signature = await sign("s3cret", ts, "{}");
    const base = { secret: "s3cret", timestamp: ts, signature, body: "{}", nowSeconds: now };
    expect(await verify({ ...base, body: '{"x":1}' })).toMatchObject({ ok: false });
    expect(await verify({ ...base, secret: "other" })).toMatchObject({ ok: false });
    expect(await verify({ ...base, nowSeconds: now + 301 })).toEqual({ ok: false, reason: "stale timestamp" });
    expect(await verify({ ...base, signature: "v1=zz" })).toEqual({ ok: false, reason: "malformed signature" });
    expect(await verify({ ...base, timestamp: null })).toEqual({ ok: false, reason: "missing signature headers" });
  });
});
