"use client";

import { useEffect, useRef, useState } from "react";
import { versionsForLanguage } from "@/config/bible-versions";
import { Badge, BottomSheet, SelectionCard } from "@/components/ui";

/*
 * One-tap version switcher (Step 13), inside the library's bottom sheet.
 * Offers exactly the curated SUPPORTED_VERSIONS for the session's language
 * (rendered instantly from config, per the Decisions section), enriched in
 * the background against the cached live catalogue via /api/bible/versions —
 * the same data source and selectable rule as the Step 9 picker. Unlicensed
 * versions render disabled with "Coming soon"; tapping a version switches
 * immediately.
 */

interface EnrichedVersionData {
  id: number;
  title: string;
  selectable: boolean;
}

export function VersionSwitcherSheet({
  open,
  onClose,
  language,
  currentVersionId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  language: string;
  currentVersionId: number | null;
  onPick: (versionId: number) => void;
}) {
  // null = enrichment in flight, "failed" = catalogue unreachable (the
  // curated config stands alone).
  const [enrichment, setEnrichment] = useState<
    Map<number, EnrichedVersionData> | "failed" | null
  >(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    fetch(`/api/bible/versions?language=${language}`)
      .then((response) => response.json())
      .then((body) => {
        if (!body.ok) throw new Error(body.error);
        setEnrichment(
          new Map(
            (body.versions as EnrichedVersionData[]).map((v) => [v.id, v]),
          ),
        );
      })
      .catch(() => {
        requested.current = false;
        setEnrichment("failed");
      });
  }, [open, language]);

  const versions = versionsForLanguage(language);

  return (
    <BottomSheet open={open} onClose={onClose} title="Bible version">
      <div
        role="radiogroup"
        aria-label="Bible version"
        className="flex flex-col gap-2"
      >
        {versions.map((version) => {
          const live =
            enrichment instanceof Map ? enrichment.get(version.id) : undefined;
          const selectable = live ? live.selectable : version.licensed;
          return (
            <SelectionCard
              key={version.id}
              title={version.abbreviation}
              subtitle={live?.title ?? version.title}
              selected={currentVersionId === version.id}
              disabled={!selectable}
              trailing={
                selectable ? undefined : (
                  <Badge status="neutral">Coming soon</Badge>
                )
              }
              onSelect={() => onPick(version.id)}
            />
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-faint" role="status">
        {enrichment === null
          ? "Checking live availability…"
          : enrichment === "failed"
            ? "Couldn't reach the live catalogue — showing Round's curated list."
            : "Availability verified against the live YouVersion catalogue."}
      </p>
    </BottomSheet>
  );
}
