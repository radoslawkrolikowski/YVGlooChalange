// Plan duration choices for the Step 12 "create my own plan" form.
//
// Duration is per-plan, not per-profile (Decisions/Step 10): it is asked on
// the builder form, never in onboarding's About-you questions. Client-safe —
// no server imports — because the form renders the chips directly.

export interface PlanDurationOption {
  /** Plan length in days — PlanBuilder generates exactly this many. */
  days: number;
  label: string;
}

export const PLAN_DURATION_OPTIONS: PlanDurationOption[] = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "30 days" },
];

export const DEFAULT_PLAN_DURATION_DAYS = 14;

export function isPlanDurationDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    PLAN_DURATION_OPTIONS.some((option) => option.days === value)
  );
}
