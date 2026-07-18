"use client";

import { useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { Banner, Button, EmptyState, SelectionCard } from "@/components/ui";
import type { PlanSummary } from "@/lib/plans";

/*
 * Plan library picker (Step 11): elevated selection cards (name, length,
 * one-line description) with a clear selected state, behind both the
 * onboarding "Your plan" step and later re-selection. Works for both
 * session paths: Path A rides the NextAuth cookie, Path B sends the
 * sessionStorage token and swaps in the reminted one — the same mechanism
 * as the Step 9/10 forms.
 */

function anonHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
  if (token) headers["x-round-session"] = token;
  return headers;
}

export async function selectPlan(planId: string): Promise<void> {
  const response = await fetch("/api/session/plan", {
    method: "POST",
    headers: anonHeaders(),
    body: JSON.stringify({ planId }),
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error ?? "Could not save your plan");
  if (body.token) {
    sessionStorage.setItem(ANON_TOKEN_STORAGE_KEY, body.token);
  }
}

function planLength(lengthDays: number): string {
  return lengthDays === 1 ? "1 day" : `${lengthDays} days`;
}

export function PlanPicker({
  initialPlanId = null,
  submitLabel = "Continue",
  onSaved,
}: {
  /** Currently active plan, pre-selected when re-picking. */
  initialPlanId?: string | null;
  submitLabel?: string;
  onSaved: () => void;
}) {
  const [plansList, setPlansList] = useState<PlanSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(initialPlanId);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plans", { headers: anonHeaders() })
      .then((response) => response.json())
      .then((body) => {
        if (body.ok) setPlansList(body.plans);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true));
  }, []);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await selectPlan(selected);
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong",
      );
      setSaving(false);
    }
  }

  if (loadError) {
    return <Banner tone="error">The plan library could not be loaded. Please try again.</Banner>;
  }

  if (plansList === null) {
    return (
      <div aria-hidden className="flex animate-pulse flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-20 rounded-lg bg-line" />
        ))}
      </div>
    );
  }

  if (plansList.length === 0) {
    return (
      <EmptyState
        icon="📖"
        heading="No plans available"
        subtext="The plan library is empty right now. Please check back soon."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Reading plan" className="flex flex-col gap-3">
        {plansList.map((plan) => (
          <SelectionCard
            key={plan.id}
            title={plan.name}
            subtitle={`${planLength(plan.lengthDays)} · ${plan.description}`}
            selected={selected === plan.id}
            onSelect={() => setSelected(plan.id)}
          />
        ))}
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <Button full onClick={save} disabled={!selected || saving}>
        {saving ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
