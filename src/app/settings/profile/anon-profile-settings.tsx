"use client";

import { AppShell } from "@/components/layout/app-shell";
import { PROFILE_DEFAULTS } from "@/config/profile";
import { useAnonSession } from "@/lib/use-anon-session";
import { HomeSkeleton } from "../../home/home-skeleton";
import { UpgradeBanner } from "../../home/upgrade-banner";
import { ProfileSettingsScreen } from "./profile-settings-screen";

// Path B profile settings: anonymous session resolves client-side from
// sessionStorage, same guard as /home and /settings/reading.
export function AnonProfileSettings() {
  const session = useAnonSession();

  if (!session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <HomeSkeleton />
      </AppShell>
    );
  }

  return (
    <ProfileSettingsScreen
      displayName={session.displayName}
      initialAnswers={session.profile ?? PROFILE_DEFAULTS}
      isAnonymous
    />
  );
}
