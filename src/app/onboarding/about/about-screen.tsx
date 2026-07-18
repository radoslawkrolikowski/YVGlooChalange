"use client";

import { HeartHandshake } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import {
  GoalsSection,
  JourneySection,
  saveProfileAnswers,
  TopicsSection,
} from "@/components/profile/profile-questions-form";
import {
  Banner,
  Button,
  Card,
  ProgressSteps,
  SectionLabel,
} from "@/components/ui";
import type { ProfileAnswers } from "@/config/profile";
import { UpgradeBanner } from "../../home/upgrade-banner";
import { ONBOARDING_STEPS } from "../onboarding-screen";

/*
 * Onboarding step 2 of 3 (Step 10): the profile questions, paged as small
 * groups per the step spec — goals, journey, topics — inside the same shell
 * and progress indicator as step 1. Finishing continues to plan selection
 * (Step 11). Path B sees a clearly visible skip that keeps the defaults;
 * every answer is optional on both paths.
 */

const PAGES: {
  title: string;
  blurb: string;
  Section: typeof GoalsSection;
}[] = [
  {
    title: "What brings you here?",
    blurb:
      "Your answers shape the reading plan Round builds and how your circle gets to know you.",
    Section: GoalsSection,
  },
  {
    title: "Where are you on the journey?",
    blurb:
      "This helps Round pick passages that fit your experience and your days.",
    Section: JourneySection,
  },
  {
    title: "What should we read about?",
    blurb:
      "Pick as many as you like — your circle forms around shared interests.",
    Section: TopicsSection,
  },
];

export function AboutScreen({
  displayName,
  initialAnswers,
  isAnonymous,
}: {
  displayName: string;
  initialAnswers: ProfileAnswers;
  isAnonymous: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { title, blurb, Section } = PAGES[page];
  const isLastPage = page === PAGES.length - 1;

  function patch(update: Partial<ProfileAnswers>) {
    setAnswers((current) => ({ ...current, ...update }));
  }

  async function continueOrFinish() {
    if (!isLastPage) {
      setPage(page + 1);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProfileAnswers(answers);
      router.push("/onboarding/plan");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong",
      );
      setSaving(false);
    }
  }

  return (
    <AppShell
      banner={isAnonymous ? <UpgradeBanner /> : undefined}
      headerAction={
        <HeaderMenu displayName={displayName} isAnonymous={isAnonymous} />
      }
    >
      <div className="flex flex-col gap-6">
        <ProgressSteps steps={ONBOARDING_STEPS} current={1} />

        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="text-sm text-ink-soft">{blurb}</p>
        </div>

        <Card variant="elevated" className="flex flex-col gap-4">
          <SectionLabel icon={<HeartHandshake size={14} aria-hidden />}>
            About you · {page + 1} of {PAGES.length}
          </SectionLabel>
          <Section answers={answers} onChange={patch} />
        </Card>

        {error && <Banner tone="error">{error}</Banner>}

        <div className="flex gap-2">
          {page > 0 && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setPage(page - 1)}
              disabled={saving}
            >
              Back
            </Button>
          )}
          <Button className="flex-1" onClick={continueOrFinish} disabled={saving}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>

        {isAnonymous && (
          <Button
            variant="ghost"
            full
            onClick={() => router.push("/home")}
            disabled={saving}
          >
            Skip for now — use sensible defaults
          </Button>
        )}
      </div>
    </AppShell>
  );
}
