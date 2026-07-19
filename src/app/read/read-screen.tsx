"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import {
  Banner,
  Button,
  ButtonLink,
  EmptyState,
  Skeleton,
  SkeletonText,
  VersionAttribution,
} from "@/components/ui";
import type { PlanDay } from "@/lib/plans";
import { VersionSwitcherSheet } from "./version-switcher-sheet";

/*
 * The reading screen (Step 13) — the app's flagship surface, shared by both
 * session paths. Fetches today's passage live from /api/passage (YouVersion,
 * session's effective version), renders it for comfortable long-form
 * reading, and keeps the version abbreviation persistently beside the
 * reference as a tappable chip opening the bottom-sheet switcher.
 *
 * The copyright attribution rendered at the end of the passage always comes
 * from the same API response as the text itself, so it can never belong to a
 * different version than the one on screen — including after a version
 * switch or a fallback fetch.
 *
 * Switching versions persists the choice through /api/session/preferences
 * (users row for Path A, re-minted token for Path B) — the same store the
 * Step 9 settings write, so highlights (Step 14) and later fetches see it.
 * A fallback fetch never writes anything.
 */

/** No active plan — nothing to read yet. Shared by both session paths. */
export function ReadEmptyState() {
  return (
    <EmptyState
      icon="📖"
      heading="Nothing to read yet"
      subtext="Pick a reading plan and today's passage will be waiting here."
      cta={<ButtonLink href="/onboarding/plan">Choose a plan</ButtonLink>}
    />
  );
}

interface PassageResult {
  passage: {
    reference: string;
    content: string;
    versionId: number;
    versionAbbreviation: string;
  };
  attribution: string | null;
  deepLink: string;
  fallback: {
    requestedVersionId: number;
    requestedAbbreviation: string;
  } | null;
}

function anonHeaders(): Record<string, string> {
  const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
  return token ? { "x-round-session": token } : {};
}

export function ReadScreen({
  day,
  language,
  preferredVersionId,
}: {
  day: PlanDay;
  language: string | null;
  /** The session's stored version choice — pre-selects the switcher. */
  preferredVersionId: number | null;
}) {
  const [result, setResult] = useState<PassageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const load = useCallback(
    async (versionId?: number) => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ reference: day.reference });
        if (versionId !== undefined) params.set("versionId", String(versionId));
        const response = await fetch(`/api/passage?${params}`, {
          headers: anonHeaders(),
        });
        const body = await response.json();
        if (!body.ok) throw new Error(body.error);
        setResult(body as PassageResult);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [day.reference],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function switchVersion(versionId: number) {
    setSwitcherOpen(false);
    if (versionId === result?.passage.versionId) return;
    // Persist the choice first (best-effort — the fetch below shows the
    // right text and attribution either way), then re-fetch in one go.
    try {
      const response = await fetch("/api/session/preferences", {
        method: "POST",
        headers: { "content-type": "application/json", ...anonHeaders() },
        body: JSON.stringify({
          language: language ?? "en",
          bibleVersionId: versionId,
        }),
      });
      const body = await response.json();
      if (body.ok && body.token) {
        sessionStorage.setItem(ANON_TOKEN_STORAGE_KEY, body.token);
      }
    } catch {
      // Preference not saved — the switched view still renders correctly.
    }
    await load(versionId);
  }

  const versionChipId = result?.passage.versionId ?? null;

  return (
    <article className="flex flex-col">
      {/* Sticky reference header — pinned below the app header while the
          passage scrolls. The version abbreviation lives here persistently,
          as the switcher chip. */}
      <div className="sticky top-0 z-[5] -mx-4 -mt-5 border-b border-line bg-surface-soft/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 md:max-w-3xl">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
              Day {day.dayNumber}
            </p>
            <h1 className="truncate font-serif text-xl font-semibold tracking-tight text-ink">
              {result?.passage.reference ?? day.label}
            </h1>
          </div>
          {loading ? (
            <Skeleton className="h-8 w-16 rounded-full" />
          ) : result ? (
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              aria-label={`Bible version: ${result.passage.versionAbbreviation}. Change version`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/50 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {result.passage.versionAbbreviation}
              <ChevronDown size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-5 pt-5">
        {result?.fallback && (
          <Banner tone="info">
            This passage isn&rsquo;t available in{" "}
            {result.fallback.requestedAbbreviation} yet, so it&rsquo;s shown in{" "}
            {result.passage.versionAbbreviation}. Your version choice is
            unchanged.
          </Banner>
        )}

        {loading ? (
          <div className="flex flex-col gap-6 py-2">
            <SkeletonText lines={5} />
            <SkeletonText lines={4} />
            <SkeletonText lines={5} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3">
            <Banner tone="error" className="w-full">
              The passage could not be loaded. Please try again.
            </Banner>
            <Button variant="secondary" onClick={() => load()}>
              Try again
            </Button>
          </div>
        ) : result ? (
          <>
            {/* Long-form reading: reading-size type, generous line height. */}
            <div className="flex flex-col gap-4 text-lg leading-8 text-ink">
              {result.passage.content
                .split(/\n+/)
                .filter((paragraph) => paragraph.trim().length > 0)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
            </div>

            <hr className="w-12 border-t-2 border-gold" />

            {/* Always the attribution of the version actually rendered. */}
            {result.attribution && (
              <VersionAttribution text={result.attribution} />
            )}

            <ButtonLink
              href={result.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              full
            >
              <ExternalLink size={18} aria-hidden />
              Open in Bible App
            </ButtonLink>
          </>
        ) : null}
      </div>

      <VersionSwitcherSheet
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        language={language ?? "en"}
        currentVersionId={versionChipId ?? preferredVersionId}
        onPick={switchVersion}
      />
    </article>
  );
}
