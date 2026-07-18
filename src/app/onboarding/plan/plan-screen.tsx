"use client";

import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { PlanPicker } from "@/components/plan/plan-picker";
import { Button, Card, ProgressSteps, SectionLabel } from "@/components/ui";
import { UpgradeBanner } from "../../home/upgrade-banner";
import { ONBOARDING_STEPS } from "../onboarding-screen";

/*
 * Onboarding step 3 of 3 (Step 11): pick a pre-defined reading plan.
 * Finishing lands on Home with the Today card populated. Path B sees the
 * usual clearly visible skip. Once Step 12 lands, "create my own plan"
 * becomes the recommended default here and this library becomes the
 * secondary path.
 */
export function PlanOnboardingScreen({
  displayName,
  initialPlanId,
  isAnonymous,
}: {
  displayName: string;
  initialPlanId: string | null;
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
            Choose your first plan
          </h1>
          <p className="text-sm text-ink-soft">
            A reading plan gives every day its passage. Your circle reads the
            same plan together — you can change it any time.
          </p>
        </div>

        <Card variant="elevated" className="flex flex-col gap-4">
          <SectionLabel icon={<BookOpen size={14} aria-hidden />}>
            Plan library
          </SectionLabel>
          <PlanPicker
            initialPlanId={initialPlanId}
            submitLabel="Start this plan"
            onSaved={() => router.push("/home")}
          />
        </Card>

        {isAnonymous && (
          <Button variant="ghost" full onClick={() => router.push("/home")}>
            Skip for now — choose a plan later
          </Button>
        )}
      </div>
    </AppShell>
  );
}
