"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { TOOL_CATEGORIES, type ToolCategory } from "@convex/lib/validators";
import { useMe } from "@/components/AppShell";
import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { RequestForm } from "@/components/RequestForm";
import { ActionButton, Badge, Button, Card, Dialog, EmptyState, Loading, PageHeader } from "@/components/ui";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/format";

export default function BrowsePage() {
  const [category, setCategory] = useState<ToolCategory | undefined>();
  const tools = useQuery(api.tools.listAll, { category });
  const me = useMe();
  // Admins moderate from here. The server checks the role again (requireToolOwner with allowAdmin).
  const removeListing = useMutation(api.tools.remove);
  const [requesting, setRequesting] = useState<{ id: Id<"tools">; name: string } | null>(null);
  const [sentFor, setSentFor] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Browse tools" description="Everything your neighbours are lending." />

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <FilterChip active={!category} onClick={() => setCategory(undefined)}>
          All
        </FilterChip>
        {TOOL_CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABELS[c]}
          </FilterChip>
        ))}
      </div>

      {sentFor && (
        <p role="status" className="mb-4 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-strong">
          Request sent for {sentFor}. Track it in <Link href="/requests" className="underline">My requests</Link>.
        </p>
      )}

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <EmptyState title={category ? `No ${CATEGORY_LABELS[category].toLowerCase()} yet` : "No tools listed yet"}>
          Be the first: <Link href="/listings" className="underline">list a tool</Link>.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool._id}>
              <Card className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{tool.name}</h2>
                  <AvailabilityBadge availability={tool.availability} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]} condition
                </p>
                {tool.description && <p className="mt-3 text-sm">{tool.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <p className="flex items-center gap-2 text-sm text-muted">
                    {tool.isMine ? "Your listing" : tool.owner.name}
                    {tool.owner.trustedLender && <Badge tone="accent">Trusted Lender</Badge>}
                  </p>
                  <div className="flex items-start gap-2">
                    {me.role === "admin" && !tool.isMine && (
                      <ActionButton
                        variant="danger"
                        confirm={`Remove "${tool.name}" as an admin? Pending requests for it will be declined.`}
                        action={() => removeListing({ toolId: tool._id })}
                      >
                        Remove
                      </ActionButton>
                    )}
                    {tool.isMine ? null : tool.requestedByMe ? (
                      <Badge tone="warn">Requested</Badge>
                    ) : (
                      <Button variant="primary" onClick={() => setRequesting({ id: tool._id, name: tool.name })}>
                        Request
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={requesting !== null} onClose={() => setRequesting(null)} title="Request to borrow">
        {requesting && (
          <RequestForm
            toolId={requesting.id}
            toolName={requesting.name}
            onDone={(sent) => {
              if (sent) setSentFor(requesting.name);
              setRequesting(null);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active ? "border-ink bg-ink text-paper" : "border-line bg-card text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
