"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LIMITS } from "@convex/lib/validators";
import { addDays, errorMessage, todayIso } from "@/lib/format";
import { Button, Field, inputClass } from "./ui";

export function RequestForm({
  toolId,
  toolName,
  onDone,
}: {
  toolId: Id<"tools">;
  toolName: string;
  onDone: (sent: boolean) => void;
}) {
  const request = useMutation(api.loans.request);
  const today = todayIso();
  const [startDate, setStart] = useState(addDays(today, 1));
  const [endDate, setEnd] = useState(addDays(today, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request({ toolId, startDate, endDate });
      onDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">
        Ask to borrow <span className="font-medium text-ink">{toolName}</span>. The owner gets a
        notification and can approve or decline.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input
            type="date"
            className={inputClass}
            value={startDate}
            min={today}
            max={addDays(today, LIMITS.maxBookingAheadDays)}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value > endDate) setEnd(e.target.value);
            }}
            required
          />
        </Field>
        <Field label="Until">
          <input
            type="date"
            className={inputClass}
            value={endDate}
            min={startDate}
            max={addDays(startDate, LIMITS.maxLoanDays - 1)}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </Field>
      </div>
      <p className="text-xs text-muted">Up to {LIMITS.maxLoanDays} days. Dates are inclusive.</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          Send request
        </Button>
      </div>
    </form>
  );
}
