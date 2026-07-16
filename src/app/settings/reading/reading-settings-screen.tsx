"use client";

import { ArrowLeft, BookOpenText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { ReadingPreferencesForm } from "@/components/reading/reading-preferences-form";
import { Card, SectionLabel } from "@/components/ui";
import { UpgradeBanner } from "../../home/upgrade-banner";

/*
 * Reading settings (Step 9): the "later changes" counterpart to onboarding,
 * in the profile screen's visual register — reached from the profile card's
 * Change action. Saving returns to the profile, whose reading settings card
 * reflects the new values immediately.
 */
export function ReadingSettingsScreen({
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

  function handleSaved() {
    // Profile re-renders server-side with the new users-row values (Path A)
    // or re-reads the swapped token (Path B); refresh clears any cached RSC
    // payload so the card can't show the old selection.
    router.push("/profile");
    router.refresh();
  }

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
          <SectionLabel icon={<BookOpenText size={14} aria-hidden />}>
            Reading settings
          </SectionLabel>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
            Language &amp; Bible
          </h1>
          <p className="text-sm text-ink-soft">
            Every passage is fetched from YouVersion in the version you choose
            here.
          </p>
        </div>

        <Card variant="elevated" className="flex flex-col gap-4">
          <ReadingPreferencesForm
            initialLanguage={initialLanguage}
            initialVersionId={initialVersionId}
            submitLabel="Save changes"
            onSaved={handleSaved}
          />
        </Card>
      </div>
    </AppShell>
  );
}
