import { HeaderMenu } from "@/components/layout/header-menu";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";
import { loadUserPlanState } from "@/lib/plans";
import { AnonRead } from "./anon-read";
import { ReadEmptyState, ReadScreen } from "./read-screen";

export const dynamic = "force-dynamic";

// The passage view (Step 13), mirroring /plan's session split: Path A
// resolves the active plan server-side and hands today's reference to the
// client reading screen; everyone else falls through to the client-side
// Instant Access guard. The passage itself is always fetched client-side
// through /api/passage so both paths share one reading code path.
export default async function ReadPage() {
  const session = await auth();

  if (session?.user) {
    const state = await loadUserPlanState(session.user.id);
    return (
      <AppShell
        headerAction={
          <HeaderMenu
            displayName={session.user.name ?? "YouVersion reader"}
            isAnonymous={false}
          />
        }
      >
        {state ? (
          <ReadScreen
            day={state.today}
            language={session.user.language}
            preferredVersionId={session.user.bibleVersionId}
            isAnonymous={false}
            dayCompleted={state.completedDays.includes(state.today.dayNumber)}
          />
        ) : (
          <ReadEmptyState />
        )}
      </AppShell>
    );
  }

  return <AnonRead />;
}
