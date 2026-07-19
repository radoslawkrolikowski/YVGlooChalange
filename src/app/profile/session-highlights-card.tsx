"use client";

import { Highlighter } from "lucide-react";
import { Card, SectionLabel, VersionAttribution } from "@/components/ui";

/*
 * "Highlighted in Round" profile section (Step 14 follow-up): every phrase
 * the user highlighted while reading in the app, newest first, with the
 * version it was made in. Presentational — Path A feeds it server-loaded
 * rows, Path B feeds it sessionStorage entries. Private to the owner, like
 * all highlight and progress data.
 *
 * The quoted text is Bible text (captured from the rendered YouVersion
 * passage), so each version's copyright attribution renders with it — shown
 * once per run of same-version entries, matching the imported card's idiom.
 */

export interface SessionHighlightDisplayEntry {
  /** Unique within the list: row id (Path A) or index key (Path B). */
  key: string | number;
  /** Human-readable passage reference, e.g. "Salmos 23". */
  label: string;
  versionId: number;
  versionAbbreviation: string | null;
  text: string;
  attribution: string | null;
  createdAt: string;
}

export function SessionHighlightsCard({
  entries,
}: {
  entries: SessionHighlightDisplayEntry[];
}) {
  return (
    <Card className="flex flex-col gap-3">
      <SectionLabel icon={<Highlighter size={14} aria-hidden />}>
        Highlights
      </SectionLabel>
      <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
        Highlighted in Round
      </h2>
      <p className="text-2xl font-bold text-ink">
        {entries.length}{" "}
        <span className="text-sm font-normal text-ink-soft">
          {entries.length === 1 ? "highlight" : "highlights"}
        </span>
      </p>

      {entries.length > 0 ? (
        <ul className="flex flex-col">
          {entries.map((entry, index) => (
            <li
              key={entry.key}
              className={`flex flex-col gap-1 py-3 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  {entry.label}
                </span>
                <span className="flex shrink-0 items-baseline gap-2 text-xs text-ink-faint">
                  {entry.versionAbbreviation && (
                    <span>{entry.versionAbbreviation}</span>
                  )}
                  <span>
                    {new Date(entry.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                </span>
              </div>
              <p className="text-sm text-ink-soft">
                <mark className="rounded-sm bg-highlight px-0.5 text-ink-soft">
                  {entry.text}
                </mark>
              </p>
              {entry.attribution &&
                entries[index + 1]?.versionId !== entry.versionId && (
                  <VersionAttribution text={entry.attribution} />
                )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">
          Nothing highlighted yet. Select any phrase while reading and it will
          be saved here — visible only to you.
        </p>
      )}
    </Card>
  );
}
