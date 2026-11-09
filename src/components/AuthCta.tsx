"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";

const primary =
  "inline-flex items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-strong dark:text-[#10241a]";

/** "Sign in to lend or borrow" for visitors, a way into the board for members. */
export function AuthCta({ compact = false }: { compact?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <span className={`${primary} invisible`}>Sign in to lend or borrow</span>;
  if (isSignedIn) {
    return (
      <Link href="/tools" className={primary}>
        {compact ? "Open the board" : "Go to the board →"}
      </Link>
    );
  }
  return (
    <SignInButton mode="modal" forceRedirectUrl="/tools" signUpForceRedirectUrl="/tools">
      <button className={primary}>{compact ? "Sign in" : "Sign in to lend or borrow"}</button>
    </SignInButton>
  );
}
