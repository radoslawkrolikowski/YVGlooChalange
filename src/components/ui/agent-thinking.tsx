"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "./skeleton";

/*
 * AgentThinking (born in Step 12) — the standard wait treatment for every
 * user-facing agent (reused by Steps 15, 21, 26, 35): a warm, branded
 * thinking state instead of a spinner on a blank page. Editorial shimmer
 * skeleton + per-agent rotating status lines fed as props; when real
 * progress is known (e.g. the validation loop's "Checking day 4 of 14…"),
 * `progress` overrides the rotation with honest reporting. The "light"
 * variant is a single-row treatment for short waits (Step 15's prompt card).
 */

const ROTATE_INTERVAL_MS = 2800;

function RotatingLine({
  lines,
  progress,
}: {
  lines: string[];
  progress?: string | null;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (progress || lines.length <= 1) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % lines.length),
      ROTATE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [progress, lines.length]);

  const text = progress ?? lines[index % Math.max(lines.length, 1)] ?? "";

  return (
    <p
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-ink-soft"
    >
      <Sparkles size={14} className="shrink-0 animate-pulse text-gold" aria-hidden />
      <span key={text}>{text}</span>
    </p>
  );
}

/** Skeleton day rows matching the plan day list's rhythm. */
function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="size-7 shrink-0 rounded-full bg-line" />
          <div className="h-4 flex-1 rounded-sm bg-line" />
          <div className="h-5 w-20 rounded-full bg-line" />
        </div>
      ))}
    </div>
  );
}

export function AgentThinking({
  title,
  lines,
  progress,
  variant = "full",
  skeletonRows = 6,
}: {
  /** Serif heading naming the work, e.g. "Building your plan…". */
  title: string;
  /** Rotating status lines — honest, per-agent, personalised where possible. */
  lines: string[];
  /** Real progress text; when set it replaces the rotating lines. */
  progress?: string | null;
  /** "light": compact single-row treatment for short waits. */
  variant?: "full" | "light";
  /** Number of shimmer rows in the full variant. */
  skeletonRows?: number;
}) {
  if (variant === "light") {
    return (
      <div className="flex flex-col gap-2.5" role="status">
        <RotatingLine lines={lines} progress={progress} />
        <Skeleton variant="text" className="w-2/3" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" role="status">
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <RotatingLine lines={lines} progress={progress} />
      </div>
      <div className="border-t border-gold-soft pt-4">
        <SkeletonRows rows={skeletonRows} />
      </div>
    </div>
  );
}
