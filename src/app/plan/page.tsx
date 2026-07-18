import { HeaderMenu } from "@/components/layout/header-menu";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";
import { loadUserPlanState } from "@/lib/plans";
import { AnonPlanTab } from "./anon-plan-tab";
import { PlanEmptyState, PlanScreen } from "./plan-screen";

export const dynamic = "force-dynamic";

// The /plan tab (Step 11), mirroring /home's session split: Path A resolves
// the plan server-side; everyone else falls through to the client-side
// Instant Access guard.
export default async function PlanPage() {
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
        {state ? <PlanScreen state={state} /> : <PlanEmptyState />}
      </AppShell>
    );
  }

  return <AnonPlanTab />;
}
