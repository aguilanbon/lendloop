"use client";

import { RedirectToSignIn, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Logo } from "./Logo";
import { Badge, Loading } from "./ui";

type Me = NonNullable<FunctionReturnType<typeof api.users.me>>;
const MeContext = createContext<Me | null>(null);

/** The signed-in user's profile. Only usable inside the app shell. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside <AppShell>");
  return me;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <Frame>
          <Loading />
        </Frame>
      </AuthLoading>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
      <Authenticated>
        <ProvisionedUser>{children}</ProvisionedUser>
      </Authenticated>
    </>
  );
}

/** Makes sure the Convex user row exists before rendering pages that need it. */
function ProvisionedUser({ children }: { children: ReactNode }) {
  const ensureUser = useMutation(api.users.ensureUser);
  const me = useQuery(api.users.me);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    ensureUser().catch(() => setFailed(true));
  }, [ensureUser]);

  if (failed) {
    return (
      <Frame>
        <p className="text-sm text-danger">We couldn&apos;t load your account. Refresh to try again.</p>
      </Frame>
    );
  }
  if (!me) {
    return (
      <Frame>
        <Loading label="Setting up your account" />
      </Frame>
    );
  }
  return (
    <MeContext value={me}>
      <Frame me={me}>{children}</Frame>
    </MeContext>
  );
}

const NAV = [
  { href: "/tools", label: "Browse" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
];

function Frame({ me, children }: { me?: Me; children: ReactNode }) {
  const pathname = usePathname();
  const items = me?.role === "admin" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <Logo href="/tools" />
        <div className="flex items-center gap-3">
          {me?.trustedLender && <Badge tone="accent">Trusted Lender</Badge>}
          {me && <UserButton />}
        </div>
      </header>
      {me && (
        <nav className="-mx-4 mb-8 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-1">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm ${
                      active ? "font-medium text-ink" : "text-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                    {item.href === "/incoming" && <PendingCount />}
                    {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-accent" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <main className="flex-1 pb-16">{children}</main>
    </div>
  );
}

function PendingCount() {
  const incoming = useQuery(api.loans.incoming);
  const count = incoming?.filter((l) => l.status === "pending").length ?? 0;
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-4 text-white dark:text-[#10241a]">
      {count}
    </span>
  );
}
