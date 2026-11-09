// HMAC-SHA256 request signing, shared by both directions of the n8n link.
//
//   signed string:  `${timestamp}.${rawBody}`
//   headers:        X-LendLoop-Timestamp: <unix seconds>
//                   X-LendLoop-Signature: v1=<hex digest>
//
// Signing the timestamp together with the body means a captured request can't
// be replayed later with a fresh timestamp. Receivers reject timestamps outside
// a 5-minute window, and duplicate deliveries inside the window are absorbed
// by idempotency keys.
//
// Uses Web Crypto so it runs in Convex's default runtime and in tests.

export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const MAX_SKEW_SECONDS = 5 * 60;

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(new ArrayBuffer(32));
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await importKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return `v1=${toHex(mac)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function verify(args: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds?: number;
}): Promise<VerifyResult> {
  const { secret, timestamp, signature, body } = args;
  if (!timestamp || !signature) return { ok: false, reason: "missing signature headers" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "malformed timestamp" };

  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale timestamp" };
  }

  const digest = fromHex(signature.startsWith("v1=") ? signature.slice(3) : "");
  if (!digest) return { ok: false, reason: "malformed signature" };

  // subtle.verify does a constant-time comparison, so response timing does
  // not leak how many bytes of a forged signature were correct.
  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    digest,
    encoder.encode(`${timestamp}.${body}`),
  );
  return valid ? { ok: true } : { ok: false, reason: "bad signature" };
}
