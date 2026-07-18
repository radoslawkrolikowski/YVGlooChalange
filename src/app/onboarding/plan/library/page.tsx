import { auth } from "@/lib/auth";
import { loadUserPlanState } from "@/lib/plans";
import { AnonLibrary } from "./anon-library";
import { PlanLibraryScreen } from "./library-screen";

export const dynamic = "force-dynamic";

// The pre-defined plan library (Step 11), now the secondary path behind the
// Step 12 builder at /onboarding/plan.
export default async function PlanLibraryPage() {
  const session = await auth();

  if (session?.user) {
    const state = await loadUserPlanState(session.user.id);
    return (
      <PlanLibraryScreen
        displayName={session.user.name ?? "YouVersion reader"}
        initialPlanId={state?.plan.id ?? null}
        isAnonymous={false}
      />
    );
  }

  return <AnonLibrary />;
}
