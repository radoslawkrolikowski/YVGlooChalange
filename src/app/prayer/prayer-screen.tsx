"use client";

import { HandHeart, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  SectionLabel,
  TextArea,
  Toast,
} from "@/components/ui";
import { PrayerSheet } from "./prayer-sheet";
import type { PrayerDraft, PrayerIntent, SavedPrayer } from "./types";

/*
 * Prayer tab (Step 26) — a personal, private prayer surface, separate from the
 * circle so a prayer never reads as shared. Two ways in: "Pray for today" (a
 * prayer drawn from the reader's own reading, reflections and highlights) and a
 * free-text request ("for a good interview tomorrow"). Generated prayers are
 * private; sharing to the circle is a separate, explicit, recast-first action
 * in the sheet. Saved prayers list here — Path A from the database, Path B from
 * sessionStorage for the browser session (no database row, per the brief).
 */

const ANON_SAVED_KEY = "round.saved-prayers";

function loadAnonSaved(): SavedPrayer[] {
  try {
    const raw = sessionStorage.getItem(ANON_SAVED_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedPrayer[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PrayerScreen({
  isAnonymous,
  hasCircle,
}: {
  isAnonymous: boolean;
  /** Path A only: the user is in a circle, so "Share" is available. */
  hasCircle: boolean;
}) {
  const [saved, setSaved] = useState<SavedPrayer[]>([]);
  const [prompt, setPrompt] = useState("");
  const [intent, setIntent] = useState<PrayerIntent | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Load saved prayers: the database (Path A) or sessionStorage (Path B).
  useEffect(() => {
    if (isAnonymous) {
      setSaved(loadAnonSaved());
      return;
    }
    let cancelled = false;
    fetch("/api/prayer")
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled && body.ok && Array.isArray(body.prayers)) {
          setSaved(body.prayers as SavedPrayer[]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAnonymous]);

  const persist = useCallback(
    async (draft: PrayerDraft): Promise<boolean> => {
      if (isAnonymous) {
        const entry: SavedPrayer = {
          id: crypto.randomUUID(),
          mode: draft.mode,
          title: draft.title,
          body: draft.body,
          readingReference: draft.readingReference,
          language: draft.language,
          createdAt: new Date().toISOString(),
        };
        const next = [entry, ...loadAnonSaved()];
        try {
          sessionStorage.setItem(ANON_SAVED_KEY, JSON.stringify(next));
        } catch {
          return false;
        }
        setSaved(next);
        return true;
      }
      try {
        const res = await fetch("/api/prayer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const body = await res.json();
        if (!res.ok || !body.ok || !body.prayer) return false;
        setSaved((current) => [body.prayer as SavedPrayer, ...current]);
        return true;
      } catch {
        return false;
      }
    },
    [isAnonymous],
  );

  function submitCustom() {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    setIntent({ kind: "custom", prompt: trimmed });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
          Prayer
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          A quiet, private space — only you see what you write here.
        </p>
      </div>

      {/* Prayer for the day — the page's hero action. */}
      <Card variant="elevated" className="flex flex-col gap-4">
        <SectionLabel icon={<HandHeart size={14} aria-hidden />}>Today</SectionLabel>
        <div>
          <h2 className="font-serif text-xl font-semibold tracking-tight text-ink">
            Pray for today
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            A prayer drawn from your reading, reflections, and highlights. Only
            you see it.
          </p>
        </div>
        <Button full onClick={() => setIntent({ kind: "daily" })}>
          <Sparkles size={16} aria-hidden /> Pray for today
        </Button>
      </Card>

      {/* Custom request. */}
      <Card className="flex flex-col gap-3">
        <SectionLabel icon={<Sparkles size={14} aria-hidden />}>
          Ask for a prayer
        </SectionLabel>
        <TextArea
          label="What would you like prayer for?"
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="e.g. for a good interview tomorrow"
          maxLength={2000}
        />
        <Button
          variant="secondary"
          onClick={submitCustom}
          disabled={prompt.trim().length === 0}
        >
          Write this prayer
        </Button>
      </Card>

      {/* Saved prayers. */}
      <Card className="flex flex-col gap-3">
        <SectionLabel icon={<HandHeart size={14} aria-hidden />}>Saved</SectionLabel>
        <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
          Saved prayers
        </h2>
        {saved.length > 0 ? (
          <ul className="flex flex-col">
            {saved.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setIntent({ kind: "view", prayer: entry })}
                  className={`flex w-full items-baseline justify-between gap-3 py-3 text-left transition-colors hover:bg-sage-soft/50 ${
                    index > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <span className="line-clamp-1 min-w-0 flex-1 text-sm text-ink-soft">
                    {entry.title?.trim() || entry.body}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {relativeDate(entry.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">
            No saved prayers yet. Generate one above and tap Save to keep it here
            {isAnonymous ? " for this session" : ""}.
          </p>
        )}
      </Card>

      {intent && (
        <PrayerSheet
          open
          onClose={() => setIntent(null)}
          intent={intent}
          isAnonymous={isAnonymous}
          hasCircle={hasCircle}
          onSave={persist}
          onToast={setToast}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
