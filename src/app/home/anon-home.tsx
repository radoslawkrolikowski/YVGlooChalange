"use client";

import { useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { useAnonSession } from "@/lib/use-anon-session";
import { HomeScreen } from "./home-screen";
import { HomeSkeleton } from "./home-skeleton";
import type { TodayReading } from "./today-card";
import { UpgradeBanner } from "./upgrade-banner";

// Step 8: the app interior an Instant Access visitor lands on. Later steps
// replace the body (onboarding, plan, passage) — the session handling stays.
export function AnonHome() {
  const session = useAnonSession();
  const [reading, setReading] = useState<TodayReading | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [circleName, setCircleName] = useState<string | null>(null);

  // Today's reading comes from the plan state in the signed token (Step 11);
  // a failed fetch just leaves the Today card in its designed empty state.
  useEffect(() => {
    if (!session) return;
    if (!session.plan) {
      setPlanLoading(false);
      return;
    }
    const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
    fetch("/api/session/plan", {
      headers: token ? { "x-round-session": token } : undefined,
    })
      .then((response) => response.json())
      .then((body) => {
        if (body.ok && body.state) {
          setReading({
            dayNumber: body.state.currentDay,
            passageReference: body.state.today.label,
          });
        }
      })
      .catch(() => {})
      .finally(() => setPlanLoading(false));
  }, [session]);

  // Joining the public circle lights up Home's circle card, the same slot a
  // member's circle fills (Step 8C). Membership lives in the token (Step 30A).
  useEffect(() => {
    if (!session?.circleId) {
      setCircleName(null);
      return;
    }
    fetch("/api/circles/public")
      .then((response) => response.json())
      .then((body) => {
        if (body.ok && body.circle?.id === session.circleId) {
          setCircleName(body.circle.name as string);
        }
      })
      .catch(() => {
        // The card falls back to its empty state — nothing else breaks.
      });
  }, [session]);

  if (!session || planLoading) {
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
        reading={reading}
        circle={circleName ? { heading: circleName, activity: [] } : null}
      />
    </AppShell>
  );
}
