"use client";

import { Button } from "@/components/ui";

/*
 * The explicit "switch your reading?" confirmation before an aligning join
 * (Step 16) — never a silent swap. Extracted from the circles screen in Step 21
 * so the match flow confirms a join in exactly the same words as browse does.
 */
export interface PlanSwitchPrompt {
  circleId: string;
  circleName: string;
  planName: string;
}

export function PlanSwitchDialog({
  prompt,
  busy,
  isAnonymous = false,
  onConfirm,
  onCancel,
}: {
  prompt: { circleName: string; planName: string };
  busy: boolean;
  /** Path B carries exactly one plan in its token, with no history to pause
   * into (Step 12A) — so the consequence stated here has to differ. */
  isAnonymous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 animate-sheet-fade bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch your reading?"
        className="relative flex w-full max-w-lg animate-sheet-up flex-col gap-4 rounded-t-xl bg-surface px-4 py-5 shadow-card"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
          Switch your reading?
        </h2>
        <p className="text-sm text-ink-soft">
          {prompt.circleName} reads {prompt.planName}. Joining makes it your
          active plan;{" "}
          {isAnonymous
            ? "it replaces the plan you picked, and your progress on that one is not kept — an anonymous session carries one plan at a time."
            : "your current plan pauses and keeps its progress — you can resume it any time from My Plan."}
        </p>
        <div className="flex gap-3">
          <Button full onClick={onConfirm} disabled={busy}>
            {busy ? "Joining…" : `Switch and join`}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
