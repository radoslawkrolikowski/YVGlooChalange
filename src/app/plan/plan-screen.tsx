import { BookOpen, CalendarDays } from "lucide-react";
import Link from "next/link";
import { PlanDayList } from "@/components/plan/plan-day-list";
import { ButtonLink, Card, EmptyState, SectionLabel } from "@/components/ui";
import type { PausedPlanSummary, PlanState } from "@/lib/plans";
import { PausedPlans } from "./paused-plans";

/*
 * The /plan tab (Step 11), composed in the 8C register: "MY PLAN" icon-chip
 * label, the current day as the screen's hero card with "Continue reading"
 * as the single primary action, and the scrollable day list below. The
 * primary action stays disabled until Step 13 builds the passage view it
 * will open. Step 12A adds the "Your plans" paused-plan section beneath the
 * day list — hidden entirely when there is nothing paused. Progress shown
 * here is private to this user only.
 */
export function PlanScreen({
  state,
  pausedPlans = [],
}: {
  state: PlanState;
  pausedPlans?: PausedPlanSummary[];
}) {
  const { plan, days, currentDay, completedDays, today } = state;

  return (
    <div className="flex flex-col gap-6">
      <Card variant="elevated" className="flex flex-col gap-3">
        <SectionLabel icon={<BookOpen size={14} aria-hidden />}>
          My plan
        </SectionLabel>
        <p className="text-sm text-ink-soft">{plan.name}</p>
        <p className="font-serif text-2xl font-semibold tracking-tight text-ink">
          Day {currentDay} · {today.label}
        </p>
        <hr className="w-12 border-t-2 border-gold" />
        <p className="text-sm text-ink-soft">
          Read today&rsquo;s passage at your own pace.
        </p>
        <ButtonLink href="/read" full className="mt-1">
          <BookOpen size={18} aria-hidden />
          Continue reading
        </ButtonLink>
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionLabel icon={<CalendarDays size={14} aria-hidden />}>
          {plan.lengthDays} days
        </SectionLabel>
        {/* Every day opens its own passage — completed days included, so a
            reader can always return to something they have already read. */}
        <PlanDayList
          days={days}
          currentDay={currentDay}
          completedDays={completedDays}
          href={(day) => `/read?ref=${encodeURIComponent(day.reference)}`}
        />
      </Card>

      {pausedPlans.length > 0 && <PausedPlans plans={pausedPlans} />}

      <p className="text-center text-sm text-ink-faint">
        <Link
          href="/onboarding/plan"
          className="transition-colors hover:text-ink-soft"
        >
          Change plan
        </Link>
      </p>
    </div>
  );
}

/**
 * No active plan — the tab's designed empty state. Paused plans still render
 * beneath it (a user whose switch was interrupted can always resume).
 */
export function PlanEmptyState({
  pausedPlans = [],
}: {
  pausedPlans?: PausedPlanSummary[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        icon="📖"
        heading="No reading plan yet"
        subtext="Pick a plan and every day gets its passage — read at your own pace."
        cta={<ButtonLink href="/onboarding/plan">Choose a plan</ButtonLink>}
      />
      {pausedPlans.length > 0 && <PausedPlans plans={pausedPlans} />}
    </div>
  );
}
