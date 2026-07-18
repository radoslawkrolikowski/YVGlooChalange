"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { PlanPicker } from "@/components/plan/plan-picker";
import { Button, Card, ProgressSteps, SectionLabel } from "@/components/ui";
import { UpgradeBanner } from "../../../home/upgrade-banner";
import { ONBOARDING_STEPS } from "../../onboarding-screen";

/*
 * The Step 11 pre-defined plan library, now the secondary path behind the
 * Step 12 builder — same onboarding shell and progress position, with a
 * quiet way back to "build my plan".
 */
export function PlanLibraryScreen({
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
            Choose a ready-made plan
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

        <p className="text-center text-sm text-ink-soft">
          Changed your mind?{" "}
          <Link
            href="/onboarding/plan"
            className="font-medium text-primary underline underline-offset-2"
          >
            Build my own plan instead
          </Link>
        </p>

        {isAnonymous && (
          <Button variant="ghost" full onClick={() => router.push("/home")}>
            Skip for now — choose a plan later
          </Button>
        )}
      </div>
    </AppShell>
  );
}
