"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useAnonSession } from "@/lib/use-anon-session";
import { HomeSkeleton } from "../../home/home-skeleton";
import { UpgradeBanner } from "../../home/upgrade-banner";
import { ReadingSettingsScreen } from "./reading-settings-screen";

// Path B reading settings: anonymous session resolves client-side from
// sessionStorage, same guard as /home and /onboarding.
export function AnonReadingSettings() {
  const session = useAnonSession();

  if (!session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <HomeSkeleton />
      </AppShell>
    );
  }

  return (
    <ReadingSettingsScreen
      displayName={session.displayName}
      initialLanguage={session.language}
      initialVersionId={session.bibleVersionId}
      isAnonymous
    />
  );
}
