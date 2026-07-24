"use client";

import { Check } from "lucide-react";
import { useEffect } from "react";

/*
 * Toast (Step 26) — a brief, self-dismissing confirmation for quick success
 * feedback (prayer copied, saved, shared). Editorial skin: forest ink pill,
 * gold check, floats above the bottom tab bar on mobile. Purely presentational
 * and single-message; the caller owns the message string and clears it on
 * `onDone`. `role="status"` + aria-live announce it to screen readers.
 */
export function Toast({
  message,
  onDone,
  duration = 2600,
}: {
  message: string;
  onDone: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [onDone, duration]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 md:bottom-8"
    >
      <div className="flex animate-sheet-up items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ivory shadow-card">
        <Check size={16} aria-hidden className="text-gold" />
        {message}
      </div>
    </div>
  );
}
