"use client";

import { Highlighter, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  SectionLabel,
} from "@/components/ui";
import { PROFILE_DEFAULTS } from "@/config/profile";
import { loadAnonHighlights } from "@/lib/anon-highlights";
import { clearAnonSession, useAnonSession } from "@/lib/use-anon-session";
import { HomeSkeleton } from "../home/home-skeleton";
import { UpgradeBanner } from "../home/upgrade-banner";
import { AboutYouCard } from "./about-you-card";
import { ReadingSettingsCard } from "./reading-settings-card";
import { SessionHighlightsCard } from "./session-highlights-card";

/*
 * Anonymous profile (Steps 8/8A, recomposed in Step 8C): identity header,
 * reading settings (moved from Home, "(default)" annotation), highlights,
 * and session — in the Home screen's register. The highlights section
 * renders the production layout — count, revoke with a confirmation step —
 * fed by real data once Step 7 lands.
 */
export function AnonProfile() {
  const router = useRouter();
  const session = useAnonSession();
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  if (!session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <HomeSkeleton />
      </AppShell>
    );
  }

  function endSession() {
    clearAnonSession();
    router.replace("/");
  }

  return (
    <AppShell
      banner={<UpgradeBanner />}
      headerAction={
        <HeaderMenu displayName={session.displayName} isAnonymous />
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Avatar name={session.displayName} size="lg" />
          <div className="flex flex-col items-start gap-1">
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
              {session.displayName}
            </h1>
            <Badge status="neutral">Anonymous session</Badge>
          </div>
        </div>

        <ReadingSettingsCard
          language={session.language}
          bibleVersionId={session.bibleVersionId}
          isAnonymous={!session.onboarded}
        />

        <AboutYouCard
          answers={session.profile ?? PROFILE_DEFAULTS}
          isDefaults={!session.profile}
        />

        {/* In-app highlights (Step 14) — this session only, newest first;
            gone when the session ends, like everything anonymous. */}
        <SessionHighlightsCard
          entries={loadAnonHighlights()
            .map((entry, index) => ({
              key: index,
              label: entry.label ?? entry.reference,
              versionId: entry.versionId,
              versionAbbreviation: entry.versionAbbreviation,
              text: entry.text,
              attribution: entry.attribution ?? null,
              createdAt: entry.createdAt,
            }))
            .reverse()}
        />

        <Card className="flex flex-col gap-3">
          <SectionLabel icon={<Highlighter size={14} aria-hidden />}>
            Highlights
          </SectionLabel>
          <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
            Imported highlights
          </h2>
          <p className="text-2xl font-bold text-ink">
            0 <span className="text-sm font-normal text-ink-soft">highlights</span>
          </p>
          <p className="text-sm text-ink-soft">
            Highlight import needs a YouVersion account. Sign in to bring your
            highlights into Round.
          </p>
          <Divider />
          {confirmingRevoke ? (
            <div className="flex flex-col gap-2">
              <Banner tone="warning">
                Delete all imported highlights from Round? This cannot be
                undone. Your highlights in the YouVersion app are not affected.
              </Banner>
              <div className="flex gap-2">
                <Button variant="destructive" disabled className="flex-1">
                  Delete highlights
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmingRevoke(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmingRevoke(true)}>
              Revoke &amp; delete imported highlights
            </Button>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <SectionLabel icon={<KeyRound size={14} aria-hidden />}>
            Session
          </SectionLabel>
          <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
            Anonymous session
          </h2>
          <p className="text-sm text-ink-soft">
            You are browsing anonymously. Ending the session discards
            everything — nothing is stored.
          </p>
          <Button variant="destructive" full onClick={endSession}>
            End session
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
