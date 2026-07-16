"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useAnonSession } from "@/lib/use-anon-session";
import { HomeSkeleton } from "../home/home-skeleton";
import { UpgradeBanner } from "../home/upgrade-banner";
import { OnboardingScreen } from "./onboarding-screen";

// Path B onboarding: the anonymous session resolves client-side from
// sessionStorage (no token → back to the landing page, same guard as /home).
export function AnonOnboarding() {
  const session = useAnonSession();

  if (!session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <HomeSkeleton />
      </AppShell>
    );
  }

  return (
    <OnboardingScreen
      displayName={session.displayName}
      initialLanguage={session.onboarded ? session.language : null}
      initialVersionId={session.onboarded ? session.bibleVersionId : null}
      isAnonymous
    />
  );
}
