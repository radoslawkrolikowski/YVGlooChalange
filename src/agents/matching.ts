// Matching Agent — real implementation (Step 21).
//
// The third path into a circle: "match me." Gloo receives the user's Step 10
// onboarding profile (life season, motivation, Bible familiarity, goals,
// topics, and what they hope for from a circle) plus a summary of every open
// circle, and returns the best match with a short explanation shown to the
// user before they confirm joining.
//
// Two rules from the Decisions section shape the prompt:
// - An imperfect match is still offered, framed honestly ("closest fit: this
//   circle is also reading Psalms, though in a different life season"). The
//   agent is never allowed to answer "none of these" — the caller has already
//   guaranteed at least one candidate, and a user left without a path forward
//   is the dead end this feature exists to remove.
// - Zero open circles never reaches this agent at all: that fallback creates a
//   founding circle directly (see src/lib/matching.ts).
//
// Candidates are addressed by a 1-based index, never by database id, so a
// hallucinated identifier cannot resolve to a real circle. Member signals are
// controlled-vocabulary labels only (life season, motivation, familiarity,
// topics, hopes) — another member's free-text goals are never sent here, and
// no reading progress, pace, or completion is ever part of a circle summary.
//
// This module only talks to Gloo and shapes its JSON output. Gathering the
// profile, summarising circles, validating the choice, and the join itself
// live in src/lib/matching.ts — nothing here reads or writes the database.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

/** One open circle as the agent sees it — labels only, never progress. */
export interface CircleCandidateSummary {
  /** 1-based position in the candidate list; the model chooses by this. */
  index: number;
  name: string;
  planName: string;
  planDescription: string;
  memberCount: number;
  /** Members' life seasons, e.g. ["Grief or loss", "Parenting"]. */
  lifeSeasons: string[];
  /** Members' stated motivations for reading. */
  motivations: string[];
  /** Members' Bible familiarity levels. */
  familiarity: string[];
  /** Topics members chose during onboarding. */
  topics: string[];
  /** What members hope for from a circle. */
  hopes: string[];
}

/** The seeking user's own onboarding profile — the Step 10 answers. */
export interface MatchingProfile {
  /** Free text: "what do you want to learn?" — the strongest signal. */
  goals: string;
  motivation: string | null;
  bibleFamiliarity: string | null;
  lifeSeason: string | null;
  topics: string[];
  circleHopes: string[];
}

export interface MatchingInput {
  profile: MatchingProfile;
  candidates: CircleCandidateSummary[];
  /** ISO 639-1 code the explanation is written in, e.g. "en". */
  language: string;
}

export interface MatchingOutput {
  /** 1-based index of the chosen candidate. */
  choice: number;
  /** Two or three sentences shown to the user before they confirm joining. */
  explanation: string;
}

const SYSTEM_PROMPT =
  "You are the Matching agent for Round, an app for small-group Bible reading. " +
  "A reader has finished onboarding and wants to be placed in a reading circle. " +
  "You are given their profile and a numbered list of open circles, and you choose the one circle that fits them best. " +
  "Weigh what the circle is reading against the reader's goals and topics first, then their life season, what they hope for from a circle, and their Bible familiarity. " +
  "You must always choose a circle — there is no 'none of these'. " +
  "Then write a short explanation (2-3 sentences) addressed to the reader, in the second person, naming the specific thing that connects them to this circle — their own words where possible. " +
  "If the fit is imperfect, say so plainly in the explanation and name what does and does not line up; never oversell a weak match. " +
  "Do not mention other members by name, and never mention anyone's reading progress or pace. " +
  "Warm, plain language. Write the explanation directly in the requested language. " +
  "Respond with JSON only — no prose, no markdown fences.";

/**
 * Absent profile answers are OMITTED rather than sent as "none" placeholders —
 * same discipline as the PostReading agent: empty-context filler dilutes the
 * real signal and gives Gloo's content guardrail extra surface to score.
 */
function buildUserMessage(input: MatchingInput): string {
  const lines: string[] = ["The reader:"];
  if (input.profile.goals.trim()) {
    lines.push(`- Wants to learn: ${input.profile.goals.trim()}`);
  }
  if (input.profile.motivation) {
    lines.push(`- Reads the Bible to: ${input.profile.motivation}`);
  }
  if (input.profile.lifeSeason) {
    lines.push(`- Life season: ${input.profile.lifeSeason}`);
  }
  if (input.profile.bibleFamiliarity) {
    lines.push(`- Bible familiarity: ${input.profile.bibleFamiliarity}`);
  }
  if (input.profile.topics.length > 0) {
    lines.push(`- Topics of interest: ${input.profile.topics.join(", ")}`);
  }
  if (input.profile.circleHopes.length > 0) {
    lines.push(`- Hopes for a circle: ${input.profile.circleHopes.join(", ")}`);
  }

  lines.push("", "Open circles:");
  for (const candidate of input.candidates) {
    const facts = [
      `reading "${candidate.planName}" (${candidate.planDescription})`,
      `${candidate.memberCount} member${candidate.memberCount === 1 ? "" : "s"}`,
    ];
    if (candidate.lifeSeasons.length > 0) {
      facts.push(`life seasons: ${candidate.lifeSeasons.join(", ")}`);
    }
    if (candidate.motivations.length > 0) {
      facts.push(`reading to: ${candidate.motivations.join(", ")}`);
    }
    if (candidate.familiarity.length > 0) {
      facts.push(`familiarity: ${candidate.familiarity.join(", ")}`);
    }
    if (candidate.topics.length > 0) {
      facts.push(`topics: ${candidate.topics.join(", ")}`);
    }
    if (candidate.hopes.length > 0) {
      facts.push(`hoping for: ${candidate.hopes.join(", ")}`);
    }
    lines.push(`${candidate.index}. "${candidate.name}" — ${facts.join("; ")}`);
  }

  lines.push(
    "",
    `Write the explanation in this language (ISO 639-1): ${input.language}`,
    "",
    "Respond with exactly this JSON shape:",
    '{"choice": <number of the chosen circle>, "explanation": "<2-3 sentences to the reader>"}',
    `The choice must be a number between 1 and ${input.candidates.length}.`,
  );
  return lines.join("\n");
}

/** Parse the model's JSON, tolerating markdown fences it was told to skip. */
function parseJson(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

/**
 * Coerce the model output into a valid in-range choice plus a non-empty
 * explanation. An out-of-range choice is rejected rather than clamped: a
 * number the model did not mean would attach a confident explanation to the
 * wrong circle, which is worse than re-asking.
 */
function asMatch(raw: unknown, candidateCount: number): MatchingOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Matching output is not an object");
  }
  const record = raw as Record<string, unknown>;
  const choice =
    typeof record.choice === "number"
      ? record.choice
      : Number.parseInt(String(record.choice), 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > candidateCount) {
    throw new Error(
      `Matching choice must be an integer between 1 and ${candidateCount}`,
    );
  }
  const explanation =
    typeof record.explanation === "string" ? record.explanation.trim() : "";
  if (explanation.length === 0) {
    throw new Error("Matching returned an empty explanation");
  }
  return { choice, explanation };
}

/**
 * Run the Gloo call and shape its output. One re-ask on malformed JSON (the
 * parse failure fed back); transient HTTP errors are already retried inside
 * the Gloo client. Throws when both attempts fail — the caller then falls back
 * to a deterministic proposal rather than leaving the user without one.
 */
export async function matchCircle(
  input: MatchingInput,
): Promise<{ match: MatchingOutput; model: string }> {
  if (input.candidates.length === 0) {
    throw new Error("Matching requires at least one candidate circle");
  }

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await chatCompletion({
      agentName: "matching",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            buildUserMessage(input) +
            (lastError
              ? `\n\nYour previous answer was invalid (${lastError}). Return only the corrected JSON.`
              : ""),
        },
      ],
      maxTokens: 900,
    });
    try {
      return {
        match: asMatch(parseJson(completion.content), input.candidates.length),
        model: completion.model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Matching returned an unusable choice: ${lastError}`);
}

export const matching: Agent<MatchingInput, MatchingOutput> = {
  name: "matching",
  displayName: "Matching",
  description:
    "Runs when a user asks to be matched into a circle. Compares their onboarding profile against every open circle and returns the best fit with a short explanation shown before they join.",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    profile: {
      goals: "learning the basics of Jesus' life",
      motivation: "Understand the basics",
      bibleFamiliarity: "Brand new",
      lifeSeason: "New to faith",
      topics: ["Faith basics"],
      circleHopes: ["Learning together"],
    },
    candidates: [
      {
        index: 1,
        name: "Quiet Waters",
        planName: "Psalms in 30 Days",
        planDescription: "A psalm a day, for comfort and lament",
        memberCount: 2,
        lifeSeasons: ["Grief or loss"],
        motivations: ["Find comfort"],
        familiarity: ["Read regularly"],
        topics: ["Anxiety & peace"],
        hopes: ["Prayer support"],
      },
      {
        index: 2,
        name: "First Steps",
        planName: "The Gospel of Mark",
        planDescription: "Mark's fast-moving account of Jesus' life",
        memberCount: 2,
        lifeSeasons: ["New to faith"],
        motivations: ["Understand the basics"],
        familiarity: ["Brand new"],
        topics: ["Faith basics"],
        hopes: ["Learning together"],
      },
    ],
    language: "en",
  },
  async run(input): Promise<AgentRunOk<MatchingOutput>> {
    const { match, model } = await matchCircle(input);
    return { status: "ok", agent: "matching", model, output: match };
  },
};
