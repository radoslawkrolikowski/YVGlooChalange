"use client";

import { Highlighter } from "lucide-react";
import { useState } from "react";
import {
  Banner,
  Button,
  Card,
  Divider,
  SectionLabel,
  VersionAttribution,
} from "@/components/ui";
import type { HighlightSummary } from "@/lib/highlights";

/*
 * Imported-highlights profile section — Step 7. Shows the live count with
 * sample entries as list rows, and the revoke/delete action behind a styled
 * confirmation. Empty states cover both "consented but no highlights" and
 * "import is off" (declined or revoked).
 */
export function HighlightsCard({
  initialSummary,
  consent,
}: {
  initialSummary: HighlightSummary;
  consent: string | null;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [importOff, setImportOff] = useState(consent !== "granted");
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      const response = await fetch("/api/highlights", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setSummary({ count: 0, sample: [] });
      setImportOff(true);
      setRevoked(true);
      setConfirmingRevoke(false);
    } catch {
      setError("Deleting highlights failed. Please try again.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <SectionLabel icon={<Highlighter size={14} aria-hidden />}>
        Highlights
      </SectionLabel>
      <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
        Imported highlights
      </h2>
      <p className="text-2xl font-bold text-ink">
        {summary.count}{" "}
        <span className="text-sm font-normal text-ink-soft">
          {summary.count === 1 ? "highlight" : "highlights"}
        </span>
      </p>

      {revoked && (
        <Banner tone="success">
          All imported highlights were deleted from Round. Your highlights in
          the YouVersion app are untouched.
        </Banner>
      )}

      {summary.count > 0 ? (
        <ul className="flex flex-col">
          {summary.sample.map((entry, index) => (
            <li
              key={entry.id}
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
                    {new Date(entry.importedAt).toLocaleDateString()}
                  </span>
                </span>
              </div>
              {entry.snippet && (
                <p className="text-sm text-ink-soft">
                  &ldquo;{entry.snippet}&rdquo;
                </p>
              )}
              {entry.attribution &&
                summary.sample[index + 1]?.versionId !== entry.versionId && (
                  <VersionAttribution text={entry.attribution} />
                )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">
          {importOff
            ? "Highlight import is off — nothing from your YouVersion account is stored in Round."
            : "No highlights yet. Highlights you make in the YouVersion Bible App were not found for import."}
        </p>
      )}

      {summary.count > 0 && (
        <>
          <Divider />
          {error && <Banner tone="error">{error}</Banner>}
          {confirmingRevoke ? (
            <div className="flex flex-col gap-2">
              <Banner tone="warning">
                Delete all imported highlights from Round? This cannot be
                undone. Your highlights in the YouVersion app are not affected.
              </Banner>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={revoke}
                  disabled={revoking}
                >
                  {revoking ? "Deleting…" : "Delete highlights"}
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmingRevoke(false)}
                  disabled={revoking}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmingRevoke(true)}>
              Revoke &amp; delete imported highlights
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
