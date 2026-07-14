"use client";

import { Avatar, Badge, Button, Card, SectionHeader } from "@/components/ui";
import { findSupportedVersion } from "@/config/bible-versions";

/*
 * Shared home screen layout (Step 8A). Rendered for anonymous sessions now;
 * the signed-in home (Step 6) reuses it with the user's YouVersion display
 * name and no upgrade banner — same layout, per the step spec.
 */
export function HomeScreen({
  displayName,
  bibleVersionId,
  isAnonymous,
}: {
  displayName: string;
  bibleVersionId: number;
  isAnonymous: boolean;
}) {
  const version = findSupportedVersion(bibleVersionId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar name={displayName} size="lg" />
        <div>
          <h1 className="text-xl font-bold text-ink">
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
            English {isAnonymous && <span className="text-ink-faint">(default)</span>}
          </dd>
          <dt className="text-ink-faint">Bible version</dt>
          <dd className="font-medium text-ink">
            {version
              ? `${version.abbreviation} — ${version.title}`
              : `Version ${bibleVersionId}`}{" "}
            {isAnonymous && <span className="text-ink-faint">(default)</span>}
          </dd>
        </dl>
      </Card>
    </div>
  );
}
