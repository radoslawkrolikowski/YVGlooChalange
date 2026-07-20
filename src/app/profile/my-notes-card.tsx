"use client";

import { ChevronRight, NotebookPen } from "lucide-react";
import Link from "next/link";
import { Card, SectionLabel } from "@/components/ui";

/*
 * "My notes" profile section (Step 19A): every private per-passage note the
 * reader has kept, most-recently-edited first, in one place — not only by
 * returning to each passage. Presentational: Path A feeds it server-loaded
 * rows, Path B feeds it sessionStorage entries. Private to the owner, like all
 * note, highlight, and progress data — never shown to any other member.
 *
 * Each row shows the passage label, a short note preview, and a relative
 * last-edited time; tapping it opens that passage's reading screen with the
 * note in focus (?ref=…&note=1).
 */

export interface MyNoteDisplayEntry {
  /** Unique within the list — the passage reference works as the key. */
  reference: string;
  label: string;
  body: string;
  updatedAt: string;
}

/** "just now" / "3 hours ago" / "2 days ago" — a gentle relative timestamp. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function MyNotesCard({ entries }: { entries: MyNoteDisplayEntry[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <SectionLabel icon={<NotebookPen size={14} aria-hidden />}>
        Notes
      </SectionLabel>
      <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
        My notes
      </h2>
      <p className="text-2xl font-bold text-ink">
        {entries.length}{" "}
        <span className="text-sm font-normal text-ink-soft">
          {entries.length === 1 ? "note" : "notes"}
        </span>
      </p>

      {entries.length > 0 ? (
        <ul className="flex flex-col">
          {entries.map((entry, index) => (
            <li key={entry.reference}>
              <Link
                href={`/read?ref=${encodeURIComponent(entry.reference)}&note=1`}
                className={`flex items-center gap-3 py-3 transition-colors hover:bg-sage-soft/50 ${
                  index > 0 ? "border-t border-line" : ""
                }`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {entry.label}
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {relativeTime(entry.updatedAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-ink-soft">
                    {entry.body}
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  aria-hidden
                  className="shrink-0 text-ink-faint"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">
          No notes yet. While reading, jot a private thought against a passage
          and it will appear here — visible only to you.
        </p>
      )}
    </Card>
  );
}
