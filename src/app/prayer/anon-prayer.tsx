"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "@/app/home/upgrade-banner";
import { PrayerScreen } from "./prayer-screen";

// Step 26 — the Prayer tab for an Instant Access visitor (Path B). Step 30A
// makes it the same tab a member gets: prayers generate live in the session's
// language, save as session-scoped rows (no users row, gone with the session),
// and may be shared into the public demo circle — the one circle Path B takes
// part in (Step 30) — through the same recast-and-confirm flow, so there is no
// "sign in to use this" gate anywhere on this screen.
export function AnonPrayer() {
  const session = useAnonSession();
  const [hasPublicCircle, setHasPublicCircle] = useState(false);

  useEffect(() => {
    fetch("/api/circles/public")
      .then((response) => response.json())
      .then((body) => setHasPublicCircle(Boolean(body.ok && body.circle)))
      .catch(() => {
        // No public circle resolved — Share simply doesn't offer itself.
      });
  }, []);

  return (
    <AppShell
      banner={<UpgradeBanner />}
      headerAction={
        session ? (
          <HeaderMenu displayName={session.displayName} isAnonymous />
        ) : undefined
      }
    >
      <PrayerScreen isAnonymous hasCircle={hasPublicCircle} />
    </AppShell>
  );
}
