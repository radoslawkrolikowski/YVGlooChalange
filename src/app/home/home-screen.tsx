"use client";

import { Avatar, Badge, Button, Card, SectionHeader } from "@/components/ui";
import { findSupportedVersion } from "@/config/bible-versions";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
};

/*
 * Shared home screen layout (Steps 6 + 8A). Rendered for both session paths:
 * anonymous sessions arrive with their defaults; signed-in users' language
 * and version are null until onboarding (Step 9) sets them.
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar name={displayName} size="lg" />
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
            Welcome, {displayName}
          </h1>
          <p className="text-sm text-ink-soft">Good to have you here today.</p>
        </div>
      </div>

      <Card variant="elevated" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionHeader title="Today's reading" />
          <Badge status="forming">Plan coming soon</Badge>
        </div>
        <p className="text-base text-ink-soft">
          Your reading plan arrives with the next update. Start here when it
          does — today's passage will be waiting.
        </p>
        <Button full disabled>
          Start reading
        </Button>
      </Card>

      <Card className="flex flex-col gap-2">
        <SectionHeader title="Your settings" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-ink-faint">Language</dt>
          <dd className="font-medium text-ink">
            {language ? (
              <>
                {LANGUAGE_NAMES[language] ?? language}{" "}
                {isAnonymous && (
                  <span className="text-ink-faint">(default)</span>
                )}
              </>
            ) : (
              <span className="text-ink-faint">
                Choose during onboarding — coming soon
              </span>
            )}
          </dd>
          <dt className="text-ink-faint">Bible version</dt>
          <dd className="font-medium text-ink">
            {bibleVersionId === null ? (
              <span className="text-ink-faint">
                Choose during onboarding — coming soon
              </span>
            ) : (
              <>
                {version
                  ? `${version.abbreviation} — ${version.title}`
                  : `Version ${bibleVersionId}`}{" "}
                {isAnonymous && (
                  <span className="text-ink-faint">(default)</span>
                )}
              </>
            )}
          </dd>
        </dl>
      </Card>
    </div>
  );
}
