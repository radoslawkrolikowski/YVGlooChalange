"use client";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, SkeletonText } from "@/components/ui";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "../home/upgrade-banner";

// Placeholder tab target (Step 8A shell). Reading plans arrive with Step 11.
export default function PlanPage() {
  const session = useAnonSession();

  if (!session) {
    return (
      <AppShell>
        <SkeletonText lines={4} />
      </AppShell>
    );
  }

  return (
    <AppShell banner={<UpgradeBanner />}>
      <EmptyState
        icon="📖"
        heading="No reading plan yet"
        subtext="Reading plans are on their way. You will pick or create one here."
      />
    </AppShell>
  );
}
