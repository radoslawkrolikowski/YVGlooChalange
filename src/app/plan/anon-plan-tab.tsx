"use client";

import { useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { PlanDayListSkeleton } from "@/components/plan/plan-day-list";
import { Banner } from "@/components/ui";
import type { PlanState } from "@/lib/plans";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "../home/upgrade-banner";
import { PlanEmptyState, PlanScreen } from "./plan-screen";

// Path B /plan tab: session resolves client-side, then the plan state is
// fetched from /api/session/plan with the sessionStorage token.
export function AnonPlanTab() {
  const session = useAnonSession();
  const [state, setState] = useState<PlanState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!session) return;
    const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
    fetch("/api/session/plan", {
      headers: token ? { "x-round-session": token } : undefined,
    })
      .then((response) => response.json())
      .then((body) => {
        if (body.ok) setState(body.state);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session || loading) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <PlanDayListSkeleton />
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
      {error ? (
        <Banner tone="error">
          Your plan could not be loaded. Please try again.
        </Banner>
      ) : state ? (
        <PlanScreen state={state} />
      ) : (
        <PlanEmptyState />
      )}
    </AppShell>
  );
}
