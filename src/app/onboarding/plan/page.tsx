import { auth } from "@/lib/auth";
import { loadUserPlanState } from "@/lib/plans";
import { AnonPlan } from "./anon-plan";
import { PlanOnboardingScreen } from "./plan-screen";

export const dynamic = "force-dynamic";

// Onboarding step 3 entry (Step 11), mirroring /onboarding's session split.
export default async function PlanOnboardingPage() {
  const session = await auth();

  if (session?.user) {
    const state = await loadUserPlanState(session.user.id);
    return (
      <PlanOnboardingScreen
        displayName={session.user.name ?? "YouVersion reader"}
        initialPlanId={state?.plan.id ?? null}
        isAnonymous={false}
      />
    );
  }

  return <AnonPlan />;
}
