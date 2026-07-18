"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useAnonSession } from "@/lib/use-anon-session";
import { HomeSkeleton } from "../../home/home-skeleton";
import { UpgradeBanner } from "../../home/upgrade-banner";
import { PlanOnboardingScreen } from "./plan-screen";

// Path B plan selection: the anonymous session resolves client-side from
// sessionStorage — same guard as the earlier onboarding steps.
export function AnonPlan() {
  const session = useAnonSession();

  if (!session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <HomeSkeleton />
      </AppShell>
    );
  }

  return (
    <PlanOnboardingScreen
      displayName={session.displayName}
      initialPlanId={session.plan?.planId ?? null}
      isAnonymous
    />
  );
}
