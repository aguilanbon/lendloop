"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { ToolForm, type ToolDraft } from "@/components/ToolForm";
import { ActionButton, Button, Card, Dialog, EmptyState, Loading, PageHeader } from "@/components/ui";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/format";

type Editing = { mode: "new" } | { mode: "edit"; toolId: Id<"tools">; initial: ToolDraft };

export default function MyListingsPage() {
  const tools = useQuery(api.tools.myListings);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Editing | null>(null);

  return (
    <>
      <PageHeader
        title="My listings"
        description="Tools you're lending to the neighbourhood."
        action={
          <Button variant="primary" onClick={() => setEditing({ mode: "new" })}>
            List a tool
          </Button>
        }
      />

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <EmptyState title="You haven't listed anything yet">
          Got a ladder, a pressure washer or a tent? List it and neighbours can ask to borrow it.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {tools.map((tool) => (
            <li key={tool._id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{tool.name}</h2>
                      <AvailabilityBadge availability={tool.availability} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]} condition
                      {tool.pendingRequests > 0 && (
                        <>
                          {" · "}
                          <Link href="/incoming" className="text-accent underline">
                            {tool.pendingRequests} pending request{tool.pendingRequests > 1 ? "s" : ""}
                          </Link>
                        </>
                      )}
                    </p>
                    {tool.description && <p className="mt-2 text-sm">{tool.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        setEditing({
                          mode: "edit",
                          toolId: tool._id,
                          initial: {
                            name: tool.name,
                            category: tool.category,
                            condition: tool.condition,
                            description: tool.description,
                          },
                        })
                      }
                    >
                      Edit
                    </Button>
                    <ActionButton
                      variant="danger"
                      confirm={`Delete "${tool.name}"? Pending requests for it will be declined.`}
                      action={() => remove({ toolId: tool._id })}
                    >
                      Delete
                    </ActionButton>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === "edit" ? "Edit listing" : "List a tool"}
      >
        {editing && (
          <ToolForm
            toolId={editing.mode === "edit" ? editing.toolId : undefined}
            initial={editing.mode === "edit" ? editing.initial : undefined}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  );
}
