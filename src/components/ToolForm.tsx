"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  LIMITS,
  TOOL_CATEGORIES,
  TOOL_CONDITIONS,
  type ToolCategory,
  type ToolCondition,
} from "@convex/lib/validators";
import { CATEGORY_LABELS, CONDITION_LABELS, errorMessage } from "@/lib/format";
import { Button, Field, inputClass } from "./ui";

export type ToolDraft = {
  name: string;
  category: ToolCategory;
  condition: ToolCondition;
  description: string;
};

const EMPTY: ToolDraft = { name: "", category: "power_tools", condition: "good", description: "" };

/** Create a listing, or edit one when `toolId` is given. */
export function ToolForm({
  toolId,
  initial = EMPTY,
  onDone,
}: {
  toolId?: Id<"tools">;
  initial?: ToolDraft;
  onDone: () => void;
}) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [draft, setDraft] = useState<ToolDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ToolDraft>(key: K, value: ToolDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (toolId) await update({ toolId, ...draft });
      else await create(draft);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name">
        <input
          className={inputClass}
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={LIMITS.toolName}
          placeholder="e.g. Cordless drill"
          required
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select
            className={inputClass}
            value={draft.category}
            onChange={(e) => set("category", e.target.value as ToolCategory)}
          >
            {TOOL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select
            className={inputClass}
            value={draft.condition}
            onChange={(e) => set("condition", e.target.value as ToolCondition)}
          >
            {TOOL_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description" hint={`${draft.description.length}/${LIMITS.toolDescription}`}>
        <textarea
          className={`${inputClass} min-h-24`}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={LIMITS.toolDescription}
          placeholder="What's included, anything to know before borrowing."
        />
      </Field>
      <p className="text-xs text-muted">
        Don&apos;t include your address or phone number. Signed-in neighbours see your display name only.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {toolId ? "Save changes" : "List tool"}
        </Button>
      </div>
    </form>
  );
}
