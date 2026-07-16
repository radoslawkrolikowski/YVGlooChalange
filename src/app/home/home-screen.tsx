"use client";

import Link from "next/link";
import { findSupportedVersion } from "@/config/bible-versions";
import { CircleCard } from "./circle-card";
import { TodayCard } from "./today-card";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
};

function salutation(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/*
 * Home screen (Step 8C): organised around the user's journey per the
 * home-information-principle decision — greeting, Today card (private
 * reading), Circle card (shared conversation), settings footer (link to
 * Profile). Rendered for both session paths. Language and version are null
 * for signed-in users until onboarding (Step 9) sets them — the footer then
 * hides and the null state lives on the Profile reading-settings card.
 */
export function HomeScreen({
  displayName,
  language,
  bibleVersionId,
  isAnonymous,
}: {
  displayName: string;
  language: string | null;
  bibleVersionId: number | null;
  isAnonymous: boolean;
}) {
  const version =
    bibleVersionId === null ? null : findSupportedVersion(bibleVersionId);

  const settingsParts: string[] = [];
  if (language) {
    settingsParts.push(`Reading in ${LANGUAGE_NAMES[language] ?? language}`);
  }
  if (bibleVersionId !== null) {
    settingsParts.push(
      `Bible: ${version ? version.abbreviation : `Version ${bibleVersionId}`}`,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* Time-of-day is recomputed on the client; the server-rendered
            salutation may differ across time zones, hence the suppression. */}
        <p className="text-base text-ink-soft" suppressHydrationWarning>
          {salutation(new Date().getHours())},
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
          {displayName}
        </h1>
      </div>

      <TodayCard />

      <CircleCard />

      {settingsParts.length > 0 && (
        <p className="text-center text-sm text-ink-faint">
          <Link
            href="/profile"
            className="transition-colors hover:text-ink-soft"
          >
            {settingsParts.join(" · ")}
            {isAnonymous && " (default)"}
          </Link>
        </p>
      )}
    </div>
  );
}
