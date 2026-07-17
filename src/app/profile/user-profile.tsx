"use client";

import { Highlighter, KeyRound } from "lucide-react";
import { signOut } from "next-auth/react";
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
import type { ProfileAnswers } from "@/config/profile";
import { AboutYouCard } from "./about-you-card";
import { ReadingSettingsCard } from "./reading-settings-card";

/*
 * Signed-in profile (Step 6, recomposed in Step 8C): identity header,
 * reading settings (moved from Home), imported highlights, and account —
 * all in the Home screen's register (icon-chip labels, serif headings).
 * The highlights section keeps the production layout with an explanatory
 * empty state until Step 7 imports real highlights.
 */
export function UserProfile({
  displayName,
  language,
  bibleVersionId,
  profileAnswers,
}: {
  displayName: string;
  language: string | null;
  bibleVersionId: number | null;
  profileAnswers: ProfileAnswers;
}) {
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut({ redirectTo: "/" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <AppShell
      headerAction={<HeaderMenu displayName={displayName} isAnonymous={false} />}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Avatar name={displayName} size="lg" />
          <div className="flex flex-col items-start gap-1">
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
              {displayName}
            </h1>
            <Badge status="active">YouVersion account</Badge>
          </div>
        </div>

        <ReadingSettingsCard
          language={language}
          bibleVersionId={bibleVersionId}
          isAnonymous={false}
        />

        <AboutYouCard answers={profileAnswers} isDefaults={false} />

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
            Highlight import arrives with the next update. You&rsquo;ll choose
            exactly what is imported and why before anything is stored.
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
            Account
          </SectionLabel>
          <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
            Your account
          </h2>
          <p className="text-sm text-ink-soft">
            You&rsquo;re signed in with YouVersion. Your circles, plans, and
            highlights stay saved between visits.
          </p>
          <Button
            variant="destructive"
            full
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
