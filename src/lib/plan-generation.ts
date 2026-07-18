// PlanBuilder orchestration (Step 12): draft → live YouVersion validation →
// retry/fallback repair → save. The Definition of done lives here: a
// generated plan reaches the plans/plan_days tables only after EVERY
// reference has passed a live Passages fetch. Progress callbacks drive the
// UI's real validation progress ("Checking day 4 of 14…").

import { randomUUID } from "node:crypto";
import {
  generatePlanDraft,
  regeneratePlanDay,
  type PlanBuilderDraft,
  type PlanBuilderInput,
} from "@/agents/plan-builder";
import { pickFallbackPassage } from "@/config/fallback-passages";
import { db } from "@/db";
import { planDays, plans } from "@/db/schema";
import { validatePassageReference } from "@/lib/youversion";

/** Per the Decisions section: 2 single-day regenerations per failed day. */
const MAX_DAY_REGENERATIONS = 2;

export interface GeneratedPlanDay {
  dayNumber: number;
  reference: string;
  label: string;
  /** True when the day was substituted from the curated fallback pool. */
  adjusted: boolean;
}

export interface GeneratedPlan {
  planId: string;
  name: string;
  description: string;
  lengthDays: number;
  days: GeneratedPlanDay[];
}

/** Progress events streamed to the builder UI while generation runs. */
export type PlanGenerationProgress =
  | { type: "generating" }
  | { type: "validating"; day: number; total: number }
  | { type: "regenerating"; day: number; total: number };

export class PlanGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanGenerationError";
  }
}

async function validate(
  reference: string,
  versionId: number,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const cached = cache.get(reference);
  if (cached !== undefined) return cached;
  const result = await validatePassageReference(reference, versionId);
  cache.set(reference, result);
  return result;
}

/**
 * Generate, validate, repair, and save a reading plan.
 *
 * @param versionId The session's Bible version — every reference is
 *   validated with a live Passages fetch against this version, since it is
 *   the version the user will actually read in.
 * @param forceInvalidDay Dev-only test hook (the route gates it behind
 *   devToolingEnabled): corrupts that day's generated reference before
 *   validation so the retry-then-fallback path can be observed on demand.
 */
export async function generateAndSavePlan(
  input: PlanBuilderInput,
  versionId: number,
  onProgress: (event: PlanGenerationProgress) => void,
  forceInvalidDay?: number,
): Promise<GeneratedPlan> {
  onProgress({ type: "generating" });

  let draft: PlanBuilderDraft;
  try {
    ({ draft } = await generatePlanDraft(input));
  } catch (error) {
    throw new PlanGenerationError(
      error instanceof Error ? error.message : "Plan generation failed",
    );
  }

  if (forceInvalidDay) {
    const target = draft.days.find((d) => d.dayNumber === forceInvalidDay);
    if (target) target.reference = "BOGUS.99.1-5";
  }

  const total = draft.days.length;
  const validationCache = new Map<string, string | null>();

  // First pass: validate every generated reference live. A majority-invalid
  // draft fails wholesale (Decisions) — the user is offered the library
  // rather than a plan that is mostly substitutions.
  const failures = new Map<number, string>();
  for (const day of draft.days) {
    onProgress({ type: "validating", day: day.dayNumber, total });
    const error = await validate(day.reference, versionId, validationCache);
    if (error !== null) failures.set(day.dayNumber, error);
  }
  if (failures.size > total / 2) {
    throw new PlanGenerationError(
      `Most generated references were invalid (${failures.size} of ${total})`,
    );
  }

  // Repair pass: up to 2 single-day regenerations with the failure fed back
  // to Gloo, then substitution from the curated fallback pool — the day is
  // then marked "adjusted" for the preview.
  const adjustedDays = new Set<number>();
  for (const [dayNumber, firstError] of failures) {
    const day = draft.days.find((d) => d.dayNumber === dayNumber)!;
    let validationError = firstError;
    let repaired = false;

    for (let retry = 1; retry <= MAX_DAY_REGENERATIONS; retry++) {
      onProgress({ type: "regenerating", day: dayNumber, total });
      try {
        const replacement = await regeneratePlanDay(
          input,
          draft,
          dayNumber,
          day.reference,
          validationError,
        );
        const error = await validate(
          replacement.reference,
          versionId,
          validationCache,
        );
        if (error === null) {
          day.reference = replacement.reference;
          day.label = replacement.label;
          repaired = true;
          break;
        }
        day.reference = replacement.reference;
        day.label = replacement.label;
        validationError = error;
      } catch (error) {
        // Unusable regeneration output or a Gloo failure counts as a spent
        // retry; the fallback pool is still behind it.
        validationError =
          error instanceof Error ? error.message : String(error);
      }
    }

    if (!repaired) {
      const used = new Set(
        draft.days.filter((d) => d.dayNumber !== dayNumber).map((d) => d.reference),
      );
      let substituted = false;
      // The pool is curated to always resolve, but nothing is saved
      // unvalidated — try pool entries until one passes the live fetch.
      for (let i = 0; i < 5; i++) {
        const fallback = pickFallbackPassage(input.topics, used);
        if (!fallback) break;
        used.add(fallback.reference);
        onProgress({ type: "validating", day: dayNumber, total });
        if (
          (await validate(fallback.reference, versionId, validationCache)) ===
          null
        ) {
          day.reference = fallback.reference;
          day.label = fallback.label;
          adjustedDays.add(dayNumber);
          substituted = true;
          break;
        }
      }
      if (!substituted) {
        throw new PlanGenerationError(
          `Day ${dayNumber} could not be filled with a valid reference`,
        );
      }
    }
  }

  // Every reference has now passed a live YouVersion fetch — save, in the
  // identical structure as the seeded plans (same tables, source flag only).
  const planId = randomUUID();
  await db.insert(plans).values({
    id: planId,
    name: draft.name,
    description: draft.description,
    lengthDays: total,
    source: "generated",
  });
  await db.insert(planDays).values(
    draft.days.map((day) => ({
      planId,
      dayNumber: day.dayNumber,
      reference: day.reference,
      label: day.label,
    })),
  );

  return {
    planId,
    name: draft.name,
    description: draft.description,
    lengthDays: total,
    days: draft.days.map((day) => ({
      ...day,
      adjusted: adjustedDays.has(day.dayNumber),
    })),
  };
}
