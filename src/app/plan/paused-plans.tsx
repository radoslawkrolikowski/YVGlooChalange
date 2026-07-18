"use client";

import { History } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { selectPlan } from "@/components/plan/plan-picker";
import { Banner, Button, Card, SectionLabel } from "@/components/ui";
import type { PausedPlanSummary } from "@/lib/plans";

/*
 * The /plan "Your plans" section (Step 12A): paused plans as flat cards with
 * a Resume action behind an inline confirmation. Progress shown ("n of m
 * days") is the owner's own — this section never renders anyone else's
 * data. Parent hides the section entirely when there are no paused plans.
 */
export function PausedPlans({ plans }: { plans: PausedPlanSummary[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume(planId: string) {
    setResuming(true);
    setError(null);
    try {
      await selectPlan(planId);
      // Server components re-read the active row: the resumed plan becomes
      // the hero and drops out of this list.
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong",
      );
      setResuming(false);
      setConfirming(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <SectionLabel icon={<History size={14} aria-hidden />}>
        Your plans
      </SectionLabel>
      {error && <Banner tone="error">{error}</Banner>}
      <ul className="flex flex-col gap-3">
        {plans.map((plan) => (
          <li
            key={plan.id}
            className="flex flex-col gap-3 rounded-lg border border-line p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-serif font-semibold text-ink">{plan.name}</p>
              <p className="shrink-0 text-sm text-ink-soft">
                {plan.completedCount} of {plan.lengthDays} days
              </p>
            </div>
            {confirming === plan.id ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-soft">
                  Switch your reading to {plan.name}? Your current plan is
                  paused, not lost.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => resume(plan.id)}
                    disabled={resuming}
                    className="flex-1"
                  >
                    {resuming ? "Switching…" : "Switch"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirming(null)}
                    disabled={resuming}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setConfirming(plan.id)}
                disabled={resuming}
              >
                Resume
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
