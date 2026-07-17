"use client";

import { ArrowLeft, HeartHandshake } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { ProfileQuestionsForm } from "@/components/profile/profile-questions-form";
import { Card, SectionLabel } from "@/components/ui";
import type { ProfileAnswers } from "@/config/profile";
import { UpgradeBanner } from "../../home/upgrade-banner";

/*
 * Profile answer editing (Step 10): the "later changes" counterpart to the
 * onboarding questions, mirroring the reading settings screen. Saving stays
 * on the page with an inline success banner (per the step spec); the back
 * link refreshes the profile so the About-you card reflects the new values.
 */
export function ProfileSettingsScreen({
  displayName,
  initialAnswers,
  isAnonymous,
}: {
  displayName: string;
  initialAnswers: ProfileAnswers;
  isAnonymous: boolean;
}) {
  const router = useRouter();

  return (
    <AppShell
      banner={isAnonymous ? <UpgradeBanner /> : undefined}
      headerAction={
        <HeaderMenu displayName={displayName} isAnonymous={isAnonymous} />
      }
    >
      <div className="flex flex-col gap-6">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft size={16} aria-hidden />
          Profile
        </Link>

        <div className="flex flex-col gap-2">
          <SectionLabel icon={<HeartHandshake size={14} aria-hidden />}>
            About you
          </SectionLabel>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
            Your answers
          </h1>
          <p className="text-sm text-ink-soft">
            These shape your reading plan, your circle, and how Round speaks
            to you.
          </p>
        </div>

        <Card variant="elevated" className="flex flex-col gap-4">
          <ProfileQuestionsForm
            initialAnswers={initialAnswers}
            onSaved={() => router.refresh()}
          />
        </Card>
      </div>
    </AppShell>
  );
}
