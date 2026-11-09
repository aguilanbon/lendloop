import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk's session handling only. Access isn't decided here by URL matching:
// every Convex function checks the caller itself (convex/lib/auth.ts), and the
// signed-in app shell redirects signed-out visitors to sign in. That follows
// Clerk's guidance to check auth where the data is, not by path.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
