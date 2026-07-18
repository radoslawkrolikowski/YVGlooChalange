// PlanBuilder Agent — real implementation (Step 12).
//
// Generates a structured day-by-day reading plan draft from the user's
// onboarding answers via Gloo Completions V2, and regenerates single failing
// days with the validation error fed back into the prompt. This module only
// talks to Gloo and shapes JSON; the live YouVersion validation loop, the
// fallback-pool substitution, and the database save live in
// src/lib/plan-generation.ts — no plan is ever saved from here.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

export interface PlanBuilderInput {
  /** Onboarding: what the user wants to learn (free text). */
  goals: string;
  /** Available reading time per day in minutes: 5 / 10 / 15 / 30. */
  timePerDayMinutes: number;
  /** TOPIC_OPTIONS slugs the user picked. */
  topics: string[];
  /** Plan length in days — the draft must contain exactly this many. */
  durationDays: number;
  /** ISO 639-1 code of the user's preferred language, e.g. "en". */
  language: string;
  /** FAMILIARITY_OPTIONS value — steers passage difficulty (Step 10). */
  bibleFamiliarity: string | null;
}

export interface PlanBuilderDay {
  /** 1-based day number. */
  dayNumber: number;
  /** USFM reference, e.g. "PSA.23", "MAT.18.21-35". */
  reference: string;
  /** Human-readable label in the user's language, e.g. "Psalm 23". */
  label: string;
}

export interface PlanBuilderDraft {
  /** Short plan name in the user's language, e.g. "A Path to Forgiveness". */
  name: string;
  /** One-line description for the plan library card. */
  description: string;
  days: PlanBuilderDay[];
}

const USFM_RULES =
  "Every reference MUST be a USFM passage reference: a 3-letter book code " +
  '(e.g. GEN, PSA, PRO, ISA, MAT, MRK, LUK, JHN, ROM, 1CO, 2CO, EPH, PHP, COL, 1TH, 2TI, TIT, HEB, JAS, 1PE, 1JN, REV), ' +
  'then chapter, then an optional verse range: "PSA.23" (whole chapter), ' +
  '"JHN.3.1-21" (verse range), "MAT.5.3-12". Never span multiple chapters ' +
  "in one reference and never invent book codes.";

const SYSTEM_PROMPT =
  "You are the PlanBuilder agent for Round, an app for small-group Bible reading. " +
  "You design day-by-day Bible reading plans from a user's stated goals, available time, and topics of interest. " +
  "Choose real, well-known passages that genuinely serve the user's goals; keep each day's reading finishable in the user's available time " +
  "(roughly: 5 minutes ≈ 10-15 verses, 10 minutes ≈ 20-30 verses, 15 minutes ≈ one chapter, 30 minutes ≈ one long or two short chapters). " +
  "For newcomers prefer narrative Gospels and short Psalms; for regular readers epistles and prophets are fine. " +
  `${USFM_RULES} ` +
  "Respond with JSON only — no prose, no markdown fences.";

function draftUserMessage(input: PlanBuilderInput): string {
  return [
    `Create a ${input.durationDays}-day Bible reading plan.`,
    `Goals: ${input.goals || "general encouragement and growth"}`,
    `Time per day: ${input.timePerDayMinutes} minutes`,
    `Topics of interest: ${input.topics.length > 0 ? input.topics.join(", ") : "general"}`,
    `Bible familiarity: ${input.bibleFamiliarity ?? "read_some"}`,
    `User language (for name, description, and labels): ${input.language}`,
    "",
    "Respond with exactly this JSON shape:",
    '{"name": "<short plan name>", "description": "<one-line description>", "days": [{"dayNumber": 1, "reference": "<USFM>", "label": "<human-readable reference>"}, ...]}',
    `The "days" array must contain exactly ${input.durationDays} entries, dayNumber 1 through ${input.durationDays}, each with a distinct passage.`,
  ].join("\n");
}

/** Parse the model's JSON, tolerating markdown fences it was told to skip. */
function parseJson(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

function asDraft(raw: unknown, durationDays: number): PlanBuilderDraft {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Plan draft is not an object");
  }
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
    throw new Error("Plan draft is missing a name");
  }
  if (typeof candidate.description !== "string") {
    throw new Error("Plan draft is missing a description");
  }
  if (!Array.isArray(candidate.days)) {
    throw new Error("Plan draft is missing a days array");
  }
  if (candidate.days.length !== durationDays) {
    throw new Error(
      `Plan draft has ${candidate.days.length} days, expected ${durationDays}`,
    );
  }
  const days = candidate.days.map((entry, index) => {
    const day = entry as Record<string, unknown>;
    if (
      typeof day.reference !== "string" ||
      day.reference.trim() === "" ||
      typeof day.label !== "string" ||
      day.label.trim() === ""
    ) {
      throw new Error(`Day ${index + 1} is missing a reference or label`);
    }
    return {
      dayNumber: index + 1,
      reference: day.reference.trim().toUpperCase(),
      label: day.label.trim(),
    };
  });
  return {
    name: candidate.name.trim(),
    description: candidate.description.trim(),
    days,
  };
}

/**
 * Generate the full plan draft. One re-ask on malformed JSON (with the
 * parse failure fed back); transient HTTP errors are already retried inside
 * the Gloo client. Throws when both attempts fail — the caller turns that
 * into the wholesale-failure path offering the pre-defined library.
 */
export async function generatePlanDraft(
  input: PlanBuilderInput,
): Promise<{ draft: PlanBuilderDraft; model: string }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await chatCompletion({
      agentName: "plan-builder",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            draftUserMessage(input) +
            (lastError
              ? `\n\nYour previous answer was invalid (${lastError}). Return only the corrected JSON.`
              : ""),
        },
      ],
      maxTokens: 3500,
    });
    try {
      return {
        draft: asDraft(parseJson(completion.content), input.durationDays),
        model: completion.model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`PlanBuilder returned an unusable plan draft: ${lastError}`);
}

/**
 * Regenerate a single failing day, feeding the invalid reference and the
 * YouVersion validation error back to Gloo (Decisions: reference
 * validation). Returns the replacement day, or throws on unusable output —
 * the caller counts that as a failed retry.
 */
export async function regeneratePlanDay(
  input: PlanBuilderInput,
  draft: PlanBuilderDraft,
  dayNumber: number,
  failedReference: string,
  validationError: string,
): Promise<PlanBuilderDay> {
  const otherReferences = draft.days
    .filter((day) => day.dayNumber !== dayNumber)
    .map((day) => day.reference);
  const completion = await chatCompletion({
    agentName: "plan-builder",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          `You are fixing one day of a ${input.durationDays}-day plan called "${draft.name}".`,
          `Day ${dayNumber}'s reference "${failedReference}" failed validation against the YouVersion Bible API: ${validationError}`,
          `Pick a different passage for day ${dayNumber} that fits the plan's goals (${input.goals || "general growth"}) and the user's ${input.timePerDayMinutes} minutes per day.`,
          `Do not reuse any of these references already in the plan: ${otherReferences.join(", ")}`,
          `User language for the label: ${input.language}`,
          "",
          "Respond with exactly this JSON shape:",
          `{"dayNumber": ${dayNumber}, "reference": "<USFM>", "label": "<human-readable reference>"}`,
        ].join("\n"),
      },
    ],
    maxTokens: 200,
  });
  const raw = parseJson(completion.content) as Record<string, unknown>;
  if (
    typeof raw.reference !== "string" ||
    raw.reference.trim() === "" ||
    typeof raw.label !== "string" ||
    raw.label.trim() === ""
  ) {
    throw new Error("Regenerated day is missing a reference or label");
  }
  return {
    dayNumber,
    reference: raw.reference.trim().toUpperCase(),
    label: raw.label.trim(),
  };
}

export const planBuilder: Agent<PlanBuilderInput, PlanBuilderDraft> = {
  name: "plan-builder",
  displayName: "PlanBuilder",
  description:
    "Runs at onboarding or on request. Generates a day-by-day reading plan from the user's goals; every reference is validated against YouVersion before saving.",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    goals: "Learn about forgiveness",
    timePerDayMinutes: 10,
    topics: ["forgiveness", "grace"],
    durationDays: 7,
    language: "en",
    bibleFamiliarity: "read_some",
  },
  // The agent-console entry point runs draft generation only (a real Gloo
  // call, logged as always); validation and saving belong to the API route's
  // orchestration in src/lib/plan-generation.ts.
  async run(input): Promise<AgentRunOk<PlanBuilderDraft>> {
    const { draft, model } = await generatePlanDraft(input);
    return { status: "ok", agent: "plan-builder", model, output: draft };
  },
};
