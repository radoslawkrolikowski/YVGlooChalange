"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { ReadingPreferencesForm } from "@/components/reading/reading-preferences-form";
import { Button, Card, ProgressSteps, SectionLabel } from "@/components/ui";
import { UpgradeBanner } from "../home/upgrade-banner";

/*
 * Onboarding step 1 of 3 (Step 9): language and Bible version. The stepped
 * progress indicator is shared with Steps 10–12; until Step 10 builds the
 * next screen, Continue lands on Home. Path B (anonymous) sees a clearly
 * visible skip that keeps the minted defaults, per the brief's "optional
 * prompt" — Path A is expected to choose.
 */

export const ONBOARDING_STEPS = ["Language & Bible", "About you", "Your plan"];

export function OnboardingScreen({
  displayName,
  initialLanguage,
  initialVersionId,
  isAnonymous,
}: {
  displayName: string;
  initialLanguage: string | null;
  initialVersionId: number | null;
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
        <ProgressSteps steps={ONBOARDING_STEPS} current={0} />

        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
            Read in your own words
          </h1>
          <p className="text-sm text-ink-soft">
            Choose the language and Bible version Round uses for every passage
            you read. You can change both at any time from your profile.
          </p>
        </div>

        <Card variant="elevated" className="flex flex-col gap-4">
          <SectionLabel icon={<Languages size={14} aria-hidden />}>
            Your Bible
          </SectionLabel>
          <ReadingPreferencesForm
            initialLanguage={initialLanguage}
            initialVersionId={initialVersionId}
            submitLabel="Continue"
            onSaved={() => router.push("/home")}
          />
        </Card>

        {isAnonymous && (
          <Button variant="ghost" full onClick={() => router.push("/home")}>
            Skip for now — keep the English defaults
          </Button>
        )}
      </div>
    </AppShell>
  );
}
