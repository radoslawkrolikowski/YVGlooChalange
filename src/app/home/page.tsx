"use client";

import { AppShell } from "@/components/layout/app-shell";
import { SkeletonText } from "@/components/ui";
import { useAnonSession } from "@/lib/use-anon-session";
import { HomeScreen } from "./home-screen";
import { UpgradeBanner } from "./upgrade-banner";

// Step 8: the app interior an Instant Access visitor lands on. Later steps
// replace the body (onboarding, plan, passage) — the session handling stays.
export default function HomePage() {
  const session = useAnonSession();

  if (!session) {
    return (
      <AppShell>
        <SkeletonText lines={4} />
      </AppShell>
    );
  }

  return (
    <AppShell banner={<UpgradeBanner />}>
      <HomeScreen
        displayName={session.displayName}
        bibleVersionId={session.bibleVersionId}
        isAnonymous
      />
    </AppShell>
  );
}
