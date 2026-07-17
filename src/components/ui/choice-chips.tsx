"use client";

import { Check } from "lucide-react";

/*
 * Chip pickers (Step 10): the compact companions to SelectionCard for the
 * onboarding profile questions — a wrapping row of pill chips rather than a
 * stack of full-width cards. ChoiceChips is a radio group (one value, tap the
 * selected chip again does nothing); MultiChoiceChips toggles membership.
 */

function chipClass(selected: boolean): string {
  return (
    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium " +
    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
    (selected
      ? "border-primary bg-primary-light text-ink"
      : "border-line bg-surface text-ink-soft hover:border-primary/40")
  );
}

function ChipCheck({ selected }: { selected: boolean }) {
  if (!selected) return null;
  return <Check size={14} strokeWidth={3} className="text-primary" aria-hidden />;
}

export function ChoiceChips<Value extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  /** Accessible name for the group. */
  label: string;
  options: { value: Value; label: string }[];
  value: Value | null;
  onChange: (value: Value) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={chipClass(selected)}
          >
            <ChipCheck selected={selected} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function MultiChoiceChips({
  label,
  options,
  values,
  onChange,
}: {
  /** Accessible name for the group. */
  label: string;
  options: { value: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((entry) => entry !== value)
        : [...values, value],
    );
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(option.value)}
            className={chipClass(selected)}
          >
            <ChipCheck selected={selected} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
