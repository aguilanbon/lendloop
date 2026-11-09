"use client";

import type { ReactNode } from "react";
import type { LoanView } from "@convex/loans";
import { STATUS_LABELS, formatRange, timeAgo } from "@/lib/format";
import { Badge, Card } from "./ui";

const STATUS_TONE = {
  pending: "warn",
  approved: "accent",
  declined: "neutral",
  cancelled: "neutral",
  returned: "neutral",
} as const;

export function StatusBadge({ loan }: { loan: Pick<LoanView, "status" | "overdue"> }) {
  if (loan.overdue) return <Badge tone="danger">Overdue</Badge>;
  return <Badge tone={STATUS_TONE[loan.status]}>{STATUS_LABELS[loan.status]}</Badge>;
}

/**
 * One loan or request. `perspective` decides whose name is shown:
 * borrowers see the lender, lenders see the borrower, admins see both.
 */
export function LoanCard({
  loan,
  perspective,
  actions,
}: {
  loan: LoanView;
  perspective: "borrower" | "lender" | "admin";
  actions?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{loan.tool.name}</h3>
            <StatusBadge loan={loan} />
            {loan.tool.removed && <Badge>Listing removed</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono text-xs">{formatRange(loan.startDate, loan.endDate)}</span>
            <span className="mx-2">·</span>
            {perspective === "borrower" && <>from {loan.lender.name}</>}
            {perspective === "lender" && <>requested by {loan.borrower.name}</>}
            {perspective === "admin" && (
              <>
                {loan.borrower.name} borrowing from {loan.lender.name}
              </>
            )}
            {perspective === "borrower" && loan.lender.trustedLender && (
              <span className="ml-2">
                <Badge tone="accent">Trusted Lender</Badge>
              </span>
            )}
          </p>
        </div>
        {actions && <div className="flex flex-wrap items-start gap-2">{actions}</div>}
      </div>
      <Activity items={loan.activity} />
    </Card>
  );
}

const KIND_LABEL = { notification: "Notification", reminder: "Reminder" } as const;

/** Recent n8n activity on this loan, e.g. "Reminder sent 2 days ago". */
function Activity({ items }: { items: LoanView["activity"] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${item.status === "sent" ? "bg-accent" : "bg-danger"}`}
          />
          <span>
            {KIND_LABEL[item.kind]} {item.status === "sent" ? "sent" : "failed"}{" "}
            {timeAgo(item.occurredAt)}
            {item.detail && <> · {item.detail}</>}
          </span>
        </li>
      ))}
    </ul>
  );
}
