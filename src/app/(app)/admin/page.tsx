"use client";

import { useMutation, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { useMe } from "@/components/AppShell";
import { LoanCard } from "@/components/LoanCard";
import { ActionButton, Badge, Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/format";

// The UI hides this page from non-admins, but every query below also calls
// requireAdmin on the server: a non-admin calling them directly gets FORBIDDEN.

export default function AdminPage() {
  const me = useMe();
  if (me.role !== "admin") {
    return <EmptyState title="Admins only">You don&apos;t have access to this page.</EmptyState>;
  }
  return (
    <>
      <PageHeader
        title="Admin"
        description="Automation health, people, all loans and the audit trail. Remove any listing from Browse."
      />
      <div className="space-y-12">
        <AutomationHealth />
        <People />
        <AllLoans />
        <AuditTrail />
      </div>
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mb-4 mt-1 text-sm text-muted">{description}</p>}
      {children}
    </section>
  );
}

function AutomationHealth() {
  const health = useQuery(api.automation.healthForAdmin);
  const retry = useMutation(api.notifications.retry);
  if (health === undefined) return <Loading />;
  const allGood = health.deliveryProblems.length === 0 && health.workflowFailures.length === 0;

  return (
    <Section
      title="Automation health"
      description="Webhooks to n8n that failed or were skipped, and n8n runs reported by its error workflow."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={health.pendingDeliveries > 0 ? "warn" : "neutral"}>
          {health.pendingDeliveries} delivery(ies) queued
        </Badge>
        {allGood && <Badge tone="accent">No failures</Badge>}
      </div>
      {health.deliveryProblems.length > 0 && (
        <ul className="mb-4 space-y-2">
          {health.deliveryProblems.map((d) => (
            <li key={d._id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={d.status === "failed" ? "danger" : "warn"}>{d.status}</Badge>
                    <span className="font-mono text-xs">{d.type}</span>
                    <span className="text-xs text-muted">{timeAgo(d.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-muted">
                    {d.lastError ?? "No error recorded"} · {d.attempts} attempt(s)
                  </p>
                </div>
                {d.canRetry && (
                  <ActionButton action={() => retry({ outboxId: d._id })}>Retry</ActionButton>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {health.workflowFailures.length > 0 && (
        <ul className="space-y-2">
          {health.workflowFailures.map((f) => (
            <li key={f._id}>
              <Card className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="danger">n8n run failed</Badge>
                  <span className="font-medium">{f.workflowName}</span>
                  {f.nodeName && <span className="text-muted">at “{f.nodeName}”</span>}
                  <span className="text-xs text-muted">{timeAgo(f.occurredAt)}</span>
                </div>
                <p className="mt-1 text-muted">{f.message}</p>
                <p className="mt-1 font-mono text-xs text-muted">execution {f.executionId}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function People() {
  const users = useQuery(api.users.listForAdmin);
  const setTrusted = useMutation(api.users.setTrustedLender);
  if (users === undefined) return <Loading />;
  return (
    <Section title="People" description="Mark reliable lenders as Trusted Lenders. Emails are masked.">
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="text-sm">
                <span className="font-medium">{u.name}</span>
                <span className="ml-2 text-muted">{u.maskedEmail ?? "no email"}</span>
                <span className="ml-2 inline-flex gap-1">
                  {u.role === "admin" && <Badge>Admin</Badge>}
                  {u.trustedLender && <Badge tone="accent">Trusted Lender</Badge>}
                </span>
              </div>
              <ActionButton
                variant={u.trustedLender ? "ghost" : "secondary"}
                action={() => setTrusted({ userId: u._id, trusted: !u.trustedLender })}
              >
                {u.trustedLender ? "Remove badge" : "Mark trusted"}
              </ActionButton>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

function AllLoans() {
  const loans = useQuery(api.loans.listAllForAdmin);
  if (loans === undefined) return <Loading />;
  return (
    <Section title="All loans" description="Read-only. Only the people involved can act on a loan.">
      {loans.length === 0 ? (
        <EmptyState title="No loans yet" />
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => (
            <li key={loan._id}>
              <LoanCard loan={loan} perspective="admin" />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AuditTrail() {
  const entries = useQuery(api.admin.recentAudit);
  if (entries === undefined) return <Loading />;
  return (
    <Section title="Audit trail" description="The latest 50 changes: who did what, and when.">
      {entries.length === 0 ? (
        <EmptyState title="Nothing yet" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Who</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((e) => (
                <tr key={e._id}>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{timeAgo(e.at)}</td>
                  <td className="px-4 py-2">{e.actor}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{e.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Section>
  );
}
