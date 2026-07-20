"use client";

import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { ButtonLink, EmptyState, SectionLabel, SkeletonText } from "@/components/ui";
import { Users } from "lucide-react";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "../home/upgrade-banner";

/*
 * Path B /circles tab (Step 16). Circles are persistent, account-backed
 * groups — an Instant Access visitor has no user row to be a member of, so
 * creating and joining need a YouVersion account. Anonymous visitors join the
 * pre-seeded demo circle instead, which arrives in Step 30; until then this
 * points them at sign-in without a dead end.
 */
export function AnonCircles() {
  const session = useAnonSession();

  if (!session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <SkeletonText lines={4} />
      </AppShell>
    );
  }

  return (
    <AppShell
      banner={<UpgradeBanner />}
      headerAction={<HeaderMenu displayName={session.displayName} isAnonymous />}
    >
      <div className="flex flex-col gap-6">
        <SectionLabel icon={<Users size={14} aria-hidden />}>
          Circles
        </SectionLabel>
        <EmptyState
          icon="◎"
          heading="Reading circles need an account"
          subtext="Sign in with YouVersion to create or join a circle and read alongside others."
          cta={<ButtonLink href="/">Sign in with YouVersion</ButtonLink>}
        />
      </div>
    </AppShell>
  );
}
