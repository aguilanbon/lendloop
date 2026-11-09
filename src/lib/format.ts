import { ConvexError } from "convex/values";
import type { ToolCategory, ToolCondition, LoanStatus } from "@convex/lib/validators";

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const CONDITION_LABELS: Record<ToolCondition, string> = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Well used",
};

export const STATUS_LABELS: Record<LoanStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
};

/** Today as YYYY-MM-DD in UTC, matching the server's notion of "today". */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

export function formatRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 days ago", "yesterday", "just now". */
export function timeAgo(ms: number, now: number = Date.now()): string {
  const seconds = Math.round((ms - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}

/** A message safe to show: our ConvexError text, or a generic fallback. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return "Something went wrong. Please try again.";
}
