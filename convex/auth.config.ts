import type { AuthConfig } from "convex/server";

// Convex verifies Clerk-issued JWTs against this issuer. Set CLERK_JWT_ISSUER_DOMAIN
// in the Convex dashboard (or `npx convex env set`) to your Clerk Frontend API URL.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
