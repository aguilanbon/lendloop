"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { LoanView } from "@convex/loans";
import { LoanCard } from "@/components/LoanCard";
import { ActionButton, EmptyState, Loading, PageHeader } from "@/components/ui";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);

  if (loans === undefined) {
    return (
      <>
        <PageHeader title="Incoming requests" />
        <Loading />
      </>
    );
  }

  const pending = loans.filter((l) => l.status === "pending");
  const out = loans.filter((l) => l.status === "approved");
  const history = loans.filter((l) => l.status !== "pending" && l.status !== "approved");

  return (
    <>
      <PageHeader title="Incoming requests" description="Requests to borrow your tools." />
      {loans.length === 0 ? (
        <EmptyState title="No requests yet">
          When a neighbour asks to borrow one of your tools, it shows up here.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          <Section title="Waiting for your answer" loans={pending} empty="You're all caught up.">
            {(loan) => (
              <>
                <ActionButton variant="primary" action={() => approve({ loanId: loan._id })}>
                  Approve
                </ActionButton>
                <ActionButton action={() => decline({ loanId: loan._id })}>Decline</ActionButton>
              </>
            )}
          </Section>
          <Section title="Lent out" loans={out} empty="Nothing out on loan right now.">
            {(loan) => (
              <ActionButton
                confirm={`Confirm ${loan.tool.name} is back with you?`}
                action={() => markReturned({ loanId: loan._id })}
              >
                Mark returned
              </ActionButton>
            )}
          </Section>
          {history.length > 0 && <Section title="History" loans={history} />}
        </div>
      )}
    </>
  );
}

function Section({
  title,
  loans,
  empty,
  children,
}: {
  title: string;
  loans: LoanView[];
  empty?: string;
  children?: (loan: LoanView) => React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        {title} <span className="font-normal">({loans.length})</span>
      </h2>
      {loans.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => (
            <li key={loan._id}>
              <LoanCard loan={loan} perspective="lender" actions={children?.(loan)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
