"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { CATEGORY_LABELS } from "@/lib/format";
import { EmptyState } from "./ui";

/** Read-only, public. The query only returns name and category. */
export function PublicToolList() {
  const tools = useQuery(api.tools.listPublic);

  if (tools === undefined) {
    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="h-16 animate-pulse rounded-xl bg-line/50" />
        ))}
      </ul>
    );
  }
  if (tools.length === 0) {
    return (
      <EmptyState title="Nothing on the shelf yet">
        Sign in and list the first tool for your neighbours.
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool, i) => (
        <li
          key={`${tool.name}-${i}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3"
        >
          <span className="font-medium">{tool.name}</span>
          <span className="shrink-0 text-xs text-muted">{CATEGORY_LABELS[tool.category]}</span>
        </li>
      ))}
    </ul>
  );
}
