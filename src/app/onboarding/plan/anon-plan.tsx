"use client";

import { AppShell } from "@/components/layout/app-shell";
import { PROFILE_DEFAULTS } from "@/config/profile";
import { useAnonSession } from "@/lib/use-anon-session";
import { HomeSkeleton } from "../../home/home-skeleton";
import { UpgradeBanner } from "../../home/upgrade-banner";
import { PlanOnboardingScreen } from "./plan-screen";

// Path B plan builder: the anonymous session resolves client-side from
// sessionStorage — same guard as the earlier onboarding steps. The builder
// form pre-fills from the token's profile answers (or the skip defaults).
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
      initialAnswers={session.profile ?? PROFILE_DEFAULTS}
      isAnonymous
    />
  );
}
