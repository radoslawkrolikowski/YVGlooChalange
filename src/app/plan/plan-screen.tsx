import { BookOpen, CalendarDays } from "lucide-react";
import Link from "next/link";
import { PlanDayList } from "@/components/plan/plan-day-list";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  SectionLabel,
} from "@/components/ui";
import type { PlanState } from "@/lib/plans";

/*
 * The /plan tab (Step 11), composed in the 8C register: "MY PLAN" icon-chip
 * label, the current day as the screen's hero card with "Continue reading"
 * as the single primary action, and the scrollable day list below. The
 * primary action stays disabled until Step 13 builds the passage view it
 * will open. Progress shown here is private to this user only.
 */
export function PlanScreen({ state }: { state: PlanState }) {
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
        {/* Disabled until Step 13 builds the passage view this opens. */}
        <Button full disabled className="mt-1">
          <BookOpen size={18} aria-hidden />
          Continue reading
        </Button>
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionLabel icon={<CalendarDays size={14} aria-hidden />}>
          {plan.lengthDays} days
        </SectionLabel>
        <PlanDayList
          days={days}
          currentDay={currentDay}
          completedDays={completedDays}
        />
      </Card>

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

/** No plan selected yet — the tab's designed empty state. */
export function PlanEmptyState() {
  return (
    <EmptyState
      icon="📖"
      heading="No reading plan yet"
      subtext="Pick a plan and every day gets its passage — read at your own pace."
      cta={<ButtonLink href="/onboarding/plan">Choose a plan</ButtonLink>}
    />
  );
}
