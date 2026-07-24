"use client";

import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "@/app/home/upgrade-banner";
import { PrayerScreen } from "./prayer-screen";

// Step 26 — the Prayer tab for an Instant Access visitor (Path B). Prayers
// generate live in the session's language and are kept in sessionStorage for
// the browser session only (no database row). Sharing to a circle needs a
// YouVersion account, so the Share action is absent here (hasCircle=false).
export function AnonPrayer() {
  const session = useAnonSession();

  return (
    <AppShell
      banner={<UpgradeBanner />}
      headerAction={
        session ? (
          <HeaderMenu displayName={session.displayName} isAnonymous />
        ) : undefined
      }
    >
      <PrayerScreen isAnonymous hasCircle={false} />
    </AppShell>
  );
}
