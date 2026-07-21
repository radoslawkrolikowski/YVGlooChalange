import { HeaderMenu } from "@/components/layout/header-menu";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";
import { loadUserCircle } from "@/lib/circles";
import { loadUserPlanState } from "@/lib/plans";
import { loadOwnReflection } from "@/lib/reflections";
import { AnonRead } from "./anon-read";
import { ReadEmptyState, ReadScreen } from "./read-screen";

export const dynamic = "force-dynamic";

// The passage view (Step 13), mirroring /plan's session split: Path A
// resolves the active plan server-side and hands today's reference to the
// client reading screen; everyone else falls through to the client-side
// Instant Access guard. The passage itself is always fetched client-side
// through /api/passage so both paths share one reading code path.
//
// Step 19A adds a `?ref=<reference>&note=1` deep link from Profile's "My
// notes": when `ref` matches a day in the active plan, that passage opens
// (instead of today) with its private note expanded and focused.
export default async function ReadPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; note?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user) {
    const [state, userCircle] = await Promise.all([
      loadUserPlanState(session.user.id),
      loadUserCircle(session.user.id),
    ]);
    const targetDay = params.ref
      ? state?.days.find((day) => day.reference === params.ref)
      : undefined;
    const day = targetDay ?? state?.today;
    const focusNote = !!targetDay && params.note === "1";
    // The day after the one on screen — which is not "today" when the reader
    // opened an earlier day from the plan's day list.
    const nextReference =
      state?.days.find((d) => d.dayNumber === (day?.dayNumber ?? 0) + 1)
        ?.reference ?? null;
    // Whether this reader has already reflected on the day on screen — softens
    // the reflection call to action rather than removing it (Step 19).
    const ownReflection =
      userCircle && day
        ? await loadOwnReflection(userCircle.id, session.user.id, day.dayNumber)
        : null;
    return (
      <AppShell
        headerAction={
          <HeaderMenu
            displayName={session.user.name ?? "YouVersion reader"}
            isAnonymous={false}
          />
        }
      >
        {state && day ? (
          <ReadScreen
            day={day}
            language={session.user.language}
            preferredVersionId={session.user.bibleVersionId}
            isAnonymous={false}
            dayCompleted={state.completedDays.includes(day.dayNumber)}
            isLastDay={day.dayNumber >= state.plan.lengthDays}
            nextReference={nextReference}
            circleId={userCircle?.id ?? null}
            ownReflection={ownReflection}
            focusNote={focusNote}
          />
        ) : (
          <ReadEmptyState />
        )}
      </AppShell>
    );
  }

  return <AnonRead />;
}
