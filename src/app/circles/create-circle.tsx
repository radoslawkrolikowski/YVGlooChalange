"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  SectionLabel,
  SelectionCard,
  TextInput,
} from "@/components/ui";
import type { CreatablePlan } from "@/lib/circles";
import { Plus } from "lucide-react";

/*
 * Create-circle form (Step 16): a short library form — circle name plus a plan
 * chosen from the pre-defined library. Creating aligns the creator's own
 * reading to the chosen plan (Step 12A pause), stated plainly here since every
 * circle member shares the circle's plan. Path A only.
 */
export function CreateCircle({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [plans, setPlans] = useState<CreatablePlan[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/circles/plan-options")
      .then((response) => response.json())
      .then((body) => {
        if (body.ok) {
          setPlans(body.plans);
          // Pre-select the creator's active plan — the most likely choice.
          const active = body.plans.find((plan: CreatablePlan) => plan.active);
          if (active) setPlanId(active.id);
        } else setLoadError(true);
      })
      .catch(() => setLoadError(true));
  }, []);

  async function create() {
    if (name.trim().length === 0 || !planId) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/circles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), planId }),
      });
      const body = await response.json();
      if (body.ok) {
        onCreated();
        return;
      }
      setError(body.error ?? "Your circle could not be created.");
    } catch {
      setError("Your circle could not be created.");
    }
    setSaving(false);
  }

  return (
    <Card variant="elevated" className="flex flex-col gap-4">
      <SectionLabel icon={<Plus size={14} aria-hidden />}>
        Start a circle
      </SectionLabel>

      <TextInput
        label="Circle name"
        placeholder="e.g. Morning Psalms"
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink">Reading plan</p>
        <p className="text-sm text-ink-faint">
          Your reading will follow this plan.
        </p>
        {loadError ? (
          <Banner tone="error">
            The plan library could not be loaded. Please try again.
          </Banner>
        ) : plans === null ? (
          <div aria-hidden className="flex animate-pulse flex-col gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-16 rounded-lg bg-line" />
            ))}
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="Reading plan"
            className="flex flex-col gap-2"
          >
            {plans.map((plan) => (
              <SelectionCard
                key={plan.id}
                title={plan.name}
                subtitle={`${plan.lengthDays} days · ${plan.description}`}
                trailing={plan.mine ? <Badge status="neutral">Yours</Badge> : undefined}
                selected={planId === plan.id}
                onSelect={() => setPlanId(plan.id)}
              />
            ))}
          </div>
        )}
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      <div className="flex gap-3">
        <Button
          full
          onClick={create}
          disabled={saving || name.trim().length === 0 || !planId}
        >
          {saving ? "Creating…" : "Create circle"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
