"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { AgentThinking, Card } from "@/components/ui";

/*
 * PreReading prompt card (Step 15) — the first personalised AI feature in the
 * reading loop. Sits above the passage, clearly personal ("Just for you"),
 * collapsible, and non-intrusive. While the prompts generate it shows the
 * shared AgentThinking component (light variant); on any failure it renders
 * nothing at all — the reading experience never blocks on this card.
 *
 * Path A: /api/pre-reading serves a per-user-per-day cache, so a reload is a
 * cache hit with no new Gloo call. Path B: prompts generate live, then the
 * client caches them in sessionStorage for the browser session (no database
 * row, per the brief), mirroring how in-app highlights persist for Path B.
 */

const ANON_CACHE_PREFIX = "round.pre-reading.";

export function PreReadingCard({
  reference,
  isAnonymous,
}: {
  reference: string;
  isAnonymous: boolean;
}) {
  const [prompts, setPrompts] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Path B: within-session cache first, so reopening a passage doesn't
    // re-call Gloo. No database row is ever written for anonymous sessions.
    if (isAnonymous) {
      const stored = sessionStorage.getItem(ANON_CACHE_PREFIX + reference);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as string[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPrompts(parsed);
            setLoading(false);
            return;
          }
        } catch {
          // Corrupt cache entry — fall through and fetch fresh.
        }
      }
    }

    const token = isAnonymous
      ? sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY)
      : null;

    fetch(`/api/pre-reading?reference=${encodeURIComponent(reference)}`, {
      headers: token ? { "x-round-session": token } : undefined,
    })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        const result =
          body.ok && Array.isArray(body.prompts) && body.prompts.length > 0
            ? (body.prompts as string[])
            : null;
        setPrompts(result);
        if (result && isAnonymous) {
          sessionStorage.setItem(
            ANON_CACHE_PREFIX + reference,
            JSON.stringify(result),
          );
        }
      })
      .catch(() => {
        // Silent hidden state — reading goes on without the card.
        if (!cancelled) setPrompts(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reference, isAnonymous]);

  if (loading) {
    return (
      <Card className="border-gold-soft bg-gold-soft/25">
        <AgentThinking
          variant="light"
          title=""
          lines={["Preparing your prompts…"]}
        />
      </Card>
    );
  }

  // Silent hidden state on failure — never blocks the reading experience.
  if (!prompts) return null;

  return (
    <Card className="border-gold-soft bg-gold-soft/25">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-gold-soft text-primary"
          >
            <Sparkles size={13} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
            Just for you
          </span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-ink-faint transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <ul className="flex flex-col gap-2.5">
            {prompts.map((prompt, index) => (
              <li
                key={index}
                className="flex gap-2.5 text-sm leading-relaxed text-ink-soft"
              >
                <span
                  aria-hidden
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-gold"
                />
                <span>{prompt}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-faint">
            Personal to you — never shared with your circle.
          </p>
        </div>
      )}
    </Card>
  );
}
