"use client";

import { KeyRound } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import {
  Avatar,
  Badge,
  Button,
  Card,
  SectionLabel,
} from "@/components/ui";
import type { ProfileAnswers } from "@/config/profile";
import type {
  HighlightSummary,
  SessionHighlightListEntry,
} from "@/lib/highlights";
import type { NoteListEntry } from "@/lib/notes";
import { AboutYouCard } from "./about-you-card";
import { HighlightsCard } from "./highlights-card";
import { MyNotesCard } from "./my-notes-card";
import { ReadingSettingsCard } from "./reading-settings-card";
import { SessionHighlightsCard } from "./session-highlights-card";

/*
 * Signed-in profile (Step 6, recomposed in Step 8C): identity header,
 * reading settings (moved from Home), imported highlights, and account —
 * all in the Home screen's register (icon-chip labels, serif headings).
 * The highlights section (Step 7) shows the live imported count with sample
 * entries and the revoke/delete flow.
 */
export function UserProfile({
  displayName,
  language,
  bibleVersionId,
  profileAnswers,
  highlightSummary,
  highlightsConsent,
  sessionHighlights,
  notes,
}: {
  displayName: string;
  language: string | null;
  bibleVersionId: number | null;
  profileAnswers: ProfileAnswers;
  highlightSummary: HighlightSummary;
  highlightsConsent: string | null;
  sessionHighlights: SessionHighlightListEntry[];
  notes: NoteListEntry[];
}) {
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

        <SessionHighlightsCard
          entries={sessionHighlights.map((entry) => ({
            key: entry.id,
            label: entry.label ?? entry.reference,
            versionId: entry.versionId,
            versionAbbreviation: entry.versionAbbreviation,
            text: entry.text,
            attribution: entry.attribution,
            createdAt: entry.createdAt,
          }))}
        />

        <MyNotesCard
          entries={notes.map((note) => ({
            reference: note.reference,
            label: note.label ?? note.reference,
            body: note.body,
            updatedAt: note.updatedAt,
          }))}
        />

        <HighlightsCard
          initialSummary={highlightSummary}
          consent={highlightsConsent}
        />

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
