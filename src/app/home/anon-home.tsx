"use client";

import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { useAnonSession } from "@/lib/use-anon-session";
import { HomeScreen } from "./home-screen";
import { HomeSkeleton } from "./home-skeleton";
import { UpgradeBanner } from "./upgrade-banner";

// Step 8: the app interior an Instant Access visitor lands on. Later steps
// replace the body (onboarding, plan, passage) — the session handling stays.
export function AnonHome() {
  const session = useAnonSession();

  if (!session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <HomeSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell
      banner={<UpgradeBanner />}
      headerAction={
        <HeaderMenu displayName={session.displayName} isAnonymous />
      }
    >
      <HomeScreen
        displayName={session.displayName}
        language={session.language}
        bibleVersionId={session.bibleVersionId}
        isAnonymous
      />
    </AppShell>
  );
}
