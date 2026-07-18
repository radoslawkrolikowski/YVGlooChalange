import { auth } from "@/lib/auth";
import { loadUserProfileAnswers } from "@/lib/profile";
import { AnonPlan } from "./anon-plan";
import { PlanOnboardingScreen } from "./plan-screen";

export const dynamic = "force-dynamic";

// Onboarding step 3 entry (Step 12): the plan builder, pre-filled from the
// Step 10 profile answers, mirroring /onboarding's session split.
export default async function PlanOnboardingPage() {
  const session = await auth();

  if (session?.user) {
    const answers = await loadUserProfileAnswers(session.user.id);
    return (
      <PlanOnboardingScreen
        displayName={session.user.name ?? "YouVersion reader"}
        initialAnswers={answers}
        isAnonymous={false}
      />
    );
  }

  return <AnonPlan />;
}
