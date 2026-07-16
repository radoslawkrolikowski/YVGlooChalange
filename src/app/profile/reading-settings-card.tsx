import { BookOpenText } from "lucide-react";
import Link from "next/link";
import { Card, Divider, SectionLabel } from "@/components/ui";
import { findSupportedVersion } from "@/config/bible-versions";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
};

/*
 * Reading settings card (Step 8C, wired in Step 9): language and Bible
 * version as list rows, with "Change" linking to the reading settings
 * screen. Anonymous defaults keep the "(default)" annotation until the
 * visitor explicitly chooses in onboarding/settings.
 */
export function ReadingSettingsCard({
  language,
  bibleVersionId,
  isAnonymous,
}: {
  language: string | null;
  bibleVersionId: number | null;
  isAnonymous: boolean;
}) {
  const version =
    bibleVersionId === null ? null : findSupportedVersion(bibleVersionId);

  return (
    <Card className="flex flex-col gap-3">
      <SectionLabel icon={<BookOpenText size={14} aria-hidden />}>
        Reading settings
      </SectionLabel>
      <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
        Language &amp; Bible
      </h2>
      <div className="flex flex-col gap-3">
        <SettingRow
          label="Language"
          value={
            language ? (
              <>
                {LANGUAGE_NAMES[language] ?? language}{" "}
                {isAnonymous && (
                  <span className="font-normal text-ink-faint">(default)</span>
                )}
              </>
            ) : null
          }
        />
        <Divider />
        <SettingRow
          label="Bible version"
          value={
            bibleVersionId === null ? null : (
              <>
                {version
                  ? `${version.abbreviation} — ${version.title}`
                  : `Version ${bibleVersionId}`}{" "}
                {isAnonymous && (
                  <span className="font-normal text-ink-faint">(default)</span>
                )}
              </>
            )
          }
        />
      </div>
    </Card>
  );
}

function SettingRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">
          {label}
        </p>
        <p className="text-sm font-medium text-ink">
          {value ?? (
            <span className="font-normal text-ink-faint">Not chosen yet</span>
          )}
        </p>
      </div>
      <Link
        href="/settings/reading"
        className="shrink-0 rounded-full border border-primary/50 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-sage-soft"
      >
        Change
      </Link>
    </div>
  );
}
