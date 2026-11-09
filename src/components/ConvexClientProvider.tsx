"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` once to create it.");
}
const convex = new ConvexReactClient(convexUrl);

/**
 * Always authenticate Convex with Clerk's "convex" JWT template.
 *
 * If Clerk's one-click Convex integration is on, the session token itself has
 * aud=convex and ConvexProviderWithClerk would send that instead. That token
 * carries no email or name, which the app needs for notifications. Hiding the
 * session claims makes the provider request the template every time.
 * Defined at module level so the provider sees a stable hook.
 */
function useAuthWithConvexTemplate() {
  return { ...useAuth(), sessionClaims: null };
}

/** Gives every client component a Convex client authenticated with the Clerk session. */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuthWithConvexTemplate}>
      {children}
    </ConvexProviderWithClerk>
  );
}
