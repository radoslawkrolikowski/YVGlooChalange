"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
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
import {
  loadAnonHighlights,
  MAX_SESSION_HIGHLIGHT_LENGTH,
  saveAnonHighlight,
} from "@/lib/anon-highlights";
import type { PlanDay } from "@/lib/plans";
import { HighlightablePassage } from "./highlightable-passage";
import { NoteCard } from "./note-card";
import { PreReadingCard } from "./pre-reading-card";
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

/** One highlight as the reading screen tracks it, either path. */
interface HighlightEntry {
  versionId: number;
  text: string;
}

export function ReadScreen({
  day,
  language,
  preferredVersionId,
  isAnonymous,
  dayCompleted,
  isLastDay,
  nextReference = null,
  circleId,
  focusNote = false,
}: {
  day: PlanDay;
  language: string | null;
  /** The session's stored version choice — pre-selects the switcher. */
  preferredVersionId: number | null;
  /** Path B: highlights stay in sessionStorage, completion re-mints token. */
  isAnonymous: boolean;
  /** Whether this day is already marked complete (Step 14). */
  dayCompleted: boolean;
  /** Last day of the plan — no "Continue to Day n+1" after completing it. */
  isLastDay: boolean;
  /** USFM reference of the day after this one, when there is one. Needed
   * because the plan day list can open ANY day: "Continue to Day n+1" has to
   * go to this day's successor, not to whatever "today" resolves to. */
  nextReference?: string | null;
  /** The reader's circle, if any — enables the Step 19 reflection prompt. */
  circleId: string | null;
  /** Deep-linked from Profile's "My notes" — open the note expanded, focused. */
  focusNote?: boolean;
}) {
  const [result, setResult] = useState<PassageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [highlights, setHighlights] = useState<HighlightEntry[]>([]);
  const [completed, setCompleted] = useState(dayCompleted);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);

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

  // Load this passage's stored highlights, all versions at once — the render
  // filters to the version on display, so a version switch needs no refetch.
  useEffect(() => {
    if (isAnonymous) {
      setHighlights(
        loadAnonHighlights().filter((h) => h.reference === day.reference),
      );
      return;
    }
    fetch(
      `/api/highlights/session?reference=${encodeURIComponent(day.reference)}`,
    )
      .then((response) => response.json())
      .then((body) => {
        if (body.ok) setHighlights(body.highlights as HighlightEntry[]);
      })
      .catch(() => {
        // Stored highlights just don't render this visit; reading goes on.
      });
  }, [day.reference, isAnonymous]);

  // A new highlight always belongs to the version actually on screen — after
  // a fallback fetch that is the fallback version, per the brief ("stored
  // with the version they were made in").
  function addHighlight(selectedText: string) {
    if (!result) return;
    const text = selectedText.trim().slice(0, MAX_SESSION_HIGHLIGHT_LENGTH);
    const versionId = result.passage.versionId;
    if (text.length === 0) return;
    if (highlights.some((h) => h.versionId === versionId && h.text === text)) {
      return;
    }
    setHighlights((previous) => [...previous, { versionId, text }]);
    const entry = {
      reference: day.reference,
      label: result.passage.reference,
      versionId,
      versionAbbreviation: result.passage.versionAbbreviation,
      text,
    };
    if (isAnonymous) {
      saveAnonHighlight({
        ...entry,
        attribution: result.attribution,
        createdAt: new Date().toISOString(),
      });
      return;
    }
    fetch("/api/highlights/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry),
    }).catch(() => {
      // Best-effort persistence; the on-screen wash already happened.
    });
  }

  async function finishReading() {
    setFinishing(true);
    setFinishError(false);
    try {
      const response = await fetch("/api/session/plan/complete", {
        method: "POST",
        headers: { "content-type": "application/json", ...anonHeaders() },
        body: JSON.stringify({ dayNumber: day.dayNumber }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error);
      if (body.token) {
        sessionStorage.setItem(ANON_TOKEN_STORAGE_KEY, body.token);
      }
      setCompleted(true);
    } catch {
      setFinishError(true);
    } finally {
      setFinishing(false);
    }
  }

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
            {/* Personalised pre-reading prompts, above the passage (Step 15).
                Fetches independently; hides itself silently on failure so the
                reading experience never blocks on it. */}
            <PreReadingCard
              reference={day.reference}
              isAnonymous={isAnonymous}
            />

            <p className="text-xs text-ink-faint">
              Select any phrase to save a highlight — only you can see it.
            </p>

            <HighlightablePassage
              content={result.passage.content}
              highlightTexts={highlights
                .filter((h) => h.versionId === result.passage.versionId)
                .map((h) => h.text)}
              onHighlight={addHighlight}
            />

            <hr className="w-12 border-t-2 border-gold" />

            {/* Always the attribution of the version actually rendered. */}
            {result.attribution && (
              <VersionAttribution text={result.attribution} />
            )}

            {/* Private per-passage note (Step 19A) — a quiet scratch surface
                beside highlights, keyed on the reference so a version switch
                keeps the same note. Never posted, shared, or fed to an agent. */}
            <NoteCard
              reference={day.reference}
              label={day.label}
              isAnonymous={isAnonymous}
              autoFocus={focusNote}
            />

            {/* "Finished reading" — private progress, no streak language. */}
            {completed ? (
              <>
                <div className="flex items-center gap-3 rounded-lg bg-success-soft px-4 py-3.5">
                  <span
                    aria-hidden
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-ivory"
                  >
                    <Check size={16} strokeWidth={3} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-success">
                      Day {day.dayNumber} complete
                    </p>
                    <p className="text-sm text-ink-soft">
                      Well done — take today&rsquo;s words with you.
                    </p>
                  </div>
                </div>
                {/* The intended next step (Step 19): reflect with your circle.
                    Routes to the thread with the composer primed for this plan
                    day; the Escalation gate runs server-side on submit. */}
                {circleId && (
                  <ButtonLink
                    href={`/circles/${circleId}?reflect=${day.dayNumber}`}
                    full
                  >
                    <MessageCircle size={18} aria-hidden />
                    Share a reflection with your circle
                  </ButtonLink>
                )}
                {!isLastDay && (
                  <Button
                    full
                    variant={circleId ? "secondary" : "primary"}
                    // Full navigation, not client routing, so the next day's
                    // state is resolved fresh — Path A re-reads the active
                    // progress row, Path B the re-minted token. Targets the
                    // successor explicitly when known: arriving here from the
                    // plan's day list, "today" is not this day + 1.
                    onClick={() =>
                      window.location.assign(
                        nextReference
                          ? `/read?ref=${encodeURIComponent(nextReference)}`
                          : "/read",
                      )
                    }
                  >
                    Continue to Day {day.dayNumber + 1}
                    <ArrowRight size={18} aria-hidden />
                  </Button>
                )}
                <ButtonLink href="/plan" variant="secondary" full>
                  Back to plan
                </ButtonLink>
              </>
            ) : (
              <>
                <Button full onClick={finishReading} disabled={finishing}>
                  <Check size={18} aria-hidden />
                  {finishing ? "Saving…" : "Finished reading"}
                </Button>
                {finishError && (
                  <Banner tone="error">
                    Your progress could not be saved. Please try again.
                  </Banner>
                )}
              </>
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
