"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useAnonSession } from "@/lib/use-anon-session";
import { HomeSkeleton } from "../../../home/home-skeleton";
import { UpgradeBanner } from "../../../home/upgrade-banner";
import { PlanLibraryScreen } from "./library-screen";

// Path B plan library: anonymous session resolves client-side, same guard
// as the other onboarding steps.
export function AnonLibrary() {
  const session = useAnonSession();

  if (!session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <HomeSkeleton />
      </AppShell>
    );
  }

  return (
    <PlanLibraryScreen
      displayName={session.displayName}
      initialPlanId={session.plan?.planId ?? null}
      isAnonymous
    />
  );
}
