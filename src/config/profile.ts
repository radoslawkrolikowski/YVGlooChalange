// Onboarding profile questions — Step 10.
//
// Single source of truth for the controlled vocabularies behind the chip
// questions, mirroring how src/config/bible-versions.ts anchors the version
// picker. Downstream consumers depend on these exact values: circle matching
// compares topics across users (Step 21), the PlanBuilder fallback pool is
// tagged with the same topic values (Step 12), and the profile screen renders
// them as chips. Values are stable slugs; labels are the display text.

export interface ProfileAnswers {
  /** Free text — the primary `goals` input to PlanBuilder. */
  goals: string;
  /** One of MOTIVATION_OPTIONS. */
  motivation: string | null;
  /** One of FAMILIARITY_OPTIONS. */
  bibleFamiliarity: string | null;
  /** One of LIFE_SEASON_OPTIONS. */
  lifeSeason: string | null;
  /** One of TIME_PER_DAY_OPTIONS. */
  timePerDayMinutes: number | null;
  /** Subset of TOPIC_OPTIONS. */
  topics: string[];
  /** Free-text "other" topic. */
  topicsOther: string;
  /** Subset of CIRCLE_HOPE_OPTIONS. Not used by PlanBuilder. */
  circleHopes: string[];
}

export interface ProfileOption {
  value: string;
  label: string;
}

export const MOTIVATION_OPTIONS: ProfileOption[] = [
  { value: "grow_closer_to_god", label: "Grow closer to God" },
  { value: "understand_basics", label: "Understand the basics" },
  { value: "find_comfort", label: "Find comfort" },
  { value: "build_habit", label: "Build a habit" },
  { value: "study_deeper", label: "Study deeper" },
];

export const FAMILIARITY_OPTIONS: ProfileOption[] = [
  { value: "brand_new", label: "Brand new" },
  { value: "read_some", label: "Read some" },
  { value: "read_regularly", label: "Read regularly" },
];

export const LIFE_SEASON_OPTIONS: ProfileOption[] = [
  { value: "new_to_faith", label: "New to faith" },
  { value: "parenting", label: "Parenting" },
  { value: "student", label: "Student" },
  { value: "busy_career", label: "Busy career" },
  { value: "grief_or_loss", label: "Grief or loss" },
  { value: "big_transition", label: "Big transition" },
];

export const TIME_PER_DAY_OPTIONS = [5, 10, 15, 30] as const;

export const TOPIC_OPTIONS: ProfileOption[] = [
  { value: "forgiveness", label: "Forgiveness" },
  { value: "grace", label: "Grace" },
  { value: "anxiety_peace", label: "Anxiety & peace" },
  { value: "relationships", label: "Relationships" },
  { value: "purpose", label: "Purpose" },
  { value: "prayer", label: "Prayer" },
  { value: "wisdom", label: "Wisdom" },
  { value: "faith_basics", label: "Faith basics" },
];

export const CIRCLE_HOPE_OPTIONS: ProfileOption[] = [
  { value: "encouragement", label: "Encouragement" },
  { value: "honest_discussion", label: "Honest discussion" },
  { value: "accountability", label: "Accountability" },
  { value: "prayer_support", label: "Prayer support" },
  { value: "learning_together", label: "Learning together" },
];

// Path B skip / unset defaults per the plan: 10 minutes, "read some",
// general topics (an empty topics list renders as "General").
export const PROFILE_DEFAULTS: ProfileAnswers = {
  goals: "",
  motivation: null,
  bibleFamiliarity: "read_some",
  lifeSeason: null,
  timePerDayMinutes: 10,
  topics: [],
  topicsOther: "",
  circleHopes: [],
};

export function optionLabel(
  options: ProfileOption[],
  value: string | null,
): string | null {
  return options.find((option) => option.value === value)?.label ?? null;
}

export function isOptionValue(
  options: ProfileOption[],
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    options.some((option) => option.value === value)
  );
}
