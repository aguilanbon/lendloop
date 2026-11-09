import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="LendLoop home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="12" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="3" className="text-accent" />
        <circle cx="20" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="3" className="text-ink" />
      </svg>
      <span className="font-display text-xl tracking-tight">LendLoop</span>
    </Link>
  );
}
