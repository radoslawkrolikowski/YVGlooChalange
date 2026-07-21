import { Check } from "lucide-react";
import Link from "next/link";
import { Badge, Divider } from "@/components/ui";
import type { PlanDay } from "@/lib/plans";

/*
 * Scrollable plan day list (Step 11): current day highlighted, completed
 * days check-marked, per-day references as chips. Presentational and
 * session-agnostic — reused by the Step 12 plan preview (where "adjusted"
 * days add a badge via `trailing`) and updated live by Step 14 completion.
 *
 * Rows become tappable only when the caller supplies `href`: on the /plan tab
 * every day opens its passage, including completed ones (a reader must be able
 * to return to a passage they have already read). The Step 12 preview passes
 * no `href` — that plan is not saved yet, so its days have nothing to open.
 */
export function PlanDayList({
  days,
  currentDay,
  completedDays = [],
  trailing,
  href,
}: {
  days: PlanDay[];
  /** 1-based day to highlight; omit for a neutral list (Step 12 preview). */
  currentDay?: number;
  completedDays?: number[];
  /** Optional per-day right-aligned slot, e.g. Step 12's "adjusted" badge. */
  trailing?: (day: PlanDay) => React.ReactNode;
  /** Makes rows tappable — the destination for a day, e.g. its passage. */
  href?: (day: PlanDay) => string;
}) {
  const done = new Set(completedDays);

  return (
    <ol className="flex flex-col">
      {days.map((day, index) => {
        const isCurrent = day.dayNumber === currentDay;
        const isDone = done.has(day.dayNumber);
        const destination = href?.(day);
        const rowClass = `flex items-center gap-3 rounded-lg px-3 py-2.5 ${
          isCurrent ? "bg-primary-light" : ""
        } ${
          destination
            ? "transition-colors hover:bg-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            : ""
        }`;
        const content = (
          <>
            <span
              aria-hidden
              className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isCurrent
                  ? "bg-primary text-ivory"
                  : isDone
                    ? "bg-success-soft text-success"
                    : "bg-surface-soft text-ink-soft"
              }`}
            >
              {isDone ? <Check size={14} strokeWidth={3} /> : day.dayNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm ${
                  isCurrent ? "font-semibold text-ink" : "text-ink-soft"
                }`}
              >
                Day {day.dayNumber}
                {isDone && <span className="sr-only"> — completed</span>}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {trailing?.(day)}
              <Badge>{day.label}</Badge>
            </span>
          </>
        );
        return (
          <li key={day.dayNumber}>
            {index > 0 && <Divider />}
            {destination ? (
              <Link
                href={destination}
                aria-current={isCurrent ? "date" : undefined}
                aria-label={`Day ${day.dayNumber}, ${day.label}${isDone ? ", completed" : ""}`}
                className={rowClass}
              >
                {content}
              </Link>
            ) : (
              <div
                aria-current={isCurrent ? "date" : undefined}
                className={rowClass}
              >
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Loading placeholder matching the day list's rhythm (8C skeleton idiom). */
export function PlanDayListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-4 px-3 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="size-7 rounded-full bg-line" />
          <div className="h-4 flex-1 rounded-sm bg-line" />
          <div className="h-5 w-20 rounded-full bg-line" />
        </div>
      ))}
    </div>
  );
}
