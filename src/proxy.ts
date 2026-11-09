import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// First line of defence only: signed-out visitors get sent to sign in before
// a private page renders. The real access rules are enforced in Convex, so a
// request that skips this (e.g. calling Convex directly) is still checked.
const isPrivate = createRouteMatcher([
  "/tools(.*)",
  "/listings(.*)",
  "/requests(.*)",
  "/incoming(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPrivate(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
