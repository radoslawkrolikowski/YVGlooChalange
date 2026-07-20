"use client";

/*
 * SupportCard (Step 18) — the quiet, private crisis-support card.
 *
 * Shown ONLY to the affected user (never to the circle, never to other
 * members). It gets the most careful visual treatment in the app: calm,
 * deliberately softer than a standard Banner. Editorial palette only —
 * sage-soft fills on parchment, gold hairline, forest ink. No alarm reds, no
 * warning triangles, no urgent iconography (plan → Decisions → visual
 * identity; brief §5.11). Warm plain language. Resources render as large
 * tappable rows with `tel:` links. A gentle, always-available dismiss.
 *
 * Purely presentational: it takes already-resolved resources and an optional
 * dismiss handler. Classification, audit logging, and resource resolution all
 * happen server-side before this ever renders.
 */

import { useState } from "react";
import { Phone, X } from "lucide-react";
import type { CrisisResource } from "@/config/crisis-resources";

export function SupportCard({
  resources,
  onDismiss,
}: {
  resources: CrisisResource[];
  /** Called on gentle dismiss; when omitted the card self-dismisses locally. */
  onDismiss?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  function dismiss() {
    if (onDismiss) onDismiss();
    else setDismissed(true);
  }

  return (
    <section
      aria-label="A quiet moment of support"
      className="relative overflow-hidden rounded-lg border border-sage/40 bg-sage-soft/70 p-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-ivory/70 hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <X size={18} aria-hidden />
      </button>

      <div className="pr-8">
        <h2 className="font-serif text-lg font-semibold text-ink">
          It sounds like this is a heavy moment.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          You don&apos;t have to carry it alone. If you&apos;re willing, reach out
          to someone you trust — or talk with someone right now, any time, for
          free.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {resources.map((resource) => (
          <a
            key={resource.tel}
            href={`tel:${resource.tel}`}
            className="flex items-center gap-3 rounded-md border border-line bg-ivory px-4 py-3 transition-colors hover:bg-gold-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span
              aria-hidden
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-sage-soft text-primary"
            >
              <Phone size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">
                {resource.name}
              </span>
              <span className="block text-sm text-ink-soft">
                {resource.description}
              </span>
              <span className="mt-0.5 block text-xs text-ink-faint">
                {resource.availability}
              </span>
            </span>
            <span className="shrink-0 font-serif text-lg font-semibold text-primary">
              {resource.phone}
            </span>
          </a>
        ))}
      </div>

      <button
        type="button"
        onClick={dismiss}
        className="mt-4 text-sm font-medium text-ink-faint underline-offset-4 transition-colors hover:text-ink-soft hover:underline"
      >
        Not now
      </button>
    </section>
  );
}
