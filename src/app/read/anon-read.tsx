"use client";

import { useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { Banner, SkeletonText } from "@/components/ui";
import type { PlanState } from "@/lib/plans";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "../home/upgrade-banner";
import { ReadEmptyState, ReadScreen } from "./read-screen";

// Path B passage view: session resolves client-side, today's reference comes
// from /api/session/plan with the sessionStorage token, then the shared
// ReadScreen takes over — same reading surface as Path A.
export function AnonRead() {
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
        <div className="flex flex-col gap-6 py-2">
          <SkeletonText lines={5} />
          <SkeletonText lines={4} />
        </div>
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
          Today&rsquo;s reading could not be loaded. Please try again.
        </Banner>
      ) : state ? (
        <ReadScreen
          day={state.today}
          language={session.language}
          preferredVersionId={session.bibleVersionId}
        />
      ) : (
        <ReadEmptyState />
      )}
    </AppShell>
  );
}
