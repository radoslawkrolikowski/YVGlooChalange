"use client";

import { Check } from "lucide-react";

/*
 * Tappable selection card (Step 9): the option row used by pickers —
 * language and Bible version in onboarding/settings, plan choices later.
 * A real radio under the hood (role/aria via the button), with a clear
 * selected state (forest border + check chip) and a disabled state that
 * hosts a trailing badge (e.g. "Coming soon").
 */
export function SelectionCard({
  title,
  subtitle,
  trailing,
  selected = false,
  disabled = false,
  onSelect,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned slot, e.g. a Badge. */
  trailing?: React.ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        selected
          ? "border-primary bg-primary-light"
          : "border-line bg-surface hover:border-primary/40"
      } ${disabled ? "cursor-not-allowed opacity-60 hover:border-line" : ""}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        {subtitle && (
          <span className="block truncate text-sm text-ink-soft">
            {subtitle}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {trailing}
        <span
          aria-hidden
          className={`inline-flex size-5 items-center justify-center rounded-full border ${
            selected
              ? "border-primary bg-primary text-ivory"
              : "border-line bg-surface"
          }`}
        >
          {selected && <Check size={12} strokeWidth={3} />}
        </span>
      </span>
    </button>
  );
}
