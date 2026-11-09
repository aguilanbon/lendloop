"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { LoanCard } from "@/components/LoanCard";
import { ActionButton, EmptyState, Loading, PageHeader } from "@/components/ui";
import { todayIso } from "@/lib/format";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const today = todayIso();

  return (
    <>
      <PageHeader title="My requests" description="Things you've asked to borrow." />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet">
          <Link href="/tools" className="underline">
            Browse tools
          </Link>{" "}
          to find something to borrow.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => {
            const canCancel =
              loan.status === "pending" || (loan.status === "approved" && loan.startDate > today);
            return (
              <li key={loan._id}>
                <LoanCard
                  loan={loan}
                  perspective="borrower"
                  actions={
                    canCancel && (
                      <ActionButton
                        variant="danger"
                        confirm="Cancel this request?"
                        action={() => cancel({ loanId: loan._id })}
                      >
                        Cancel
                      </ActionButton>
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
