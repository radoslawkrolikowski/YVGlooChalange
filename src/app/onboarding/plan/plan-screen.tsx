"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { Button, ProgressSteps } from "@/components/ui";
import type { ProfileAnswers } from "@/config/profile";
import { UpgradeBanner } from "../../home/upgrade-banner";
import { ONBOARDING_STEPS } from "../onboarding-screen";
import { BuildPlan } from "./build-plan";

/*
 * Onboarding step 3 of 3 (Step 12): "create my own plan" is the recommended
 * default — a builder form pre-filled from the Step 10 answers with "Build
 * my plan" as the single primary action; the Step 11 pre-defined library is
 * the quiet secondary path at /onboarding/plan/library.
 */
export function PlanOnboardingScreen({
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
        <ProgressSteps steps={ONBOARDING_STEPS} current={2} />

        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
            Let&apos;s build your plan
          </h1>
          <p className="text-sm text-ink-soft">
            Round designs a day-by-day reading plan around your goals, your
            time, and your topics — every passage checked against YouVersion.
          </p>
        </div>

        <BuildPlan initialAnswers={initialAnswers} />

        {isAnonymous && (
          <Button variant="ghost" full onClick={() => router.push("/home")}>
            Skip for now — choose a plan later
          </Button>
        )}
      </div>
    </AppShell>
  );
}
