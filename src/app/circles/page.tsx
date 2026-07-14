"use client";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, SkeletonText } from "@/components/ui";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "../home/upgrade-banner";

// Placeholder tab target (Step 8A shell). Circles arrive with Step 16.
export default function CirclesPage() {
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
        icon="◎"
        heading="No circles yet"
        subtext="Reading circles are on their way. You will create, browse, and join them here."
      />
    </AppShell>
  );
}
