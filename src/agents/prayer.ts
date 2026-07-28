// Prayer Agent — real implementation (Step 26).
//
// A personal, private prayer feature living on its own /prayer tab (never the
// circle thread). Three operations:
//   - "daily":  a "prayer for the day", first-person singular, drawn from the
//               user's OWN material — onboarding answers, their reflections and
//               highlights, and today's reading.
//   - "custom": a prayer led by a free-text request ("for a good interview
//               tomorrow"), lightly coloured by that same private context.
//   - "recast": rewrites a finished personal prayer into an intercessory form
//               that NAMES the author, so their circle can pray it over them
//               ("I pray that Maria will have a good interview") — the version
//               posted when the user chooses to share.
//
// Like the other agents, this module only talks to Gloo and shapes its output;
// gathering the private context lives in src/lib/prayer-context.ts and the
// streaming/route wiring lives in the /api/prayer routes. The Gloo client
// writes the agent_logs row for every call (streamed or not).

import { chatCompletion, type GlooMessage } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

export type PrayerMode = "daily" | "custom" | "recast";

export interface PrayerInput {
  mode: PrayerMode;
  /** ISO 639-1 code of the language to write in, e.g. "en". */
  language: string;
  /** Free-text request — "custom" mode only. */
  userPrompt?: string;
  /** USFM reference of today's reading — "daily" mode, when a plan exists. */
  readingReference?: string;
  /** Compact, privacy-safe summary of the user's own material — daily/custom. */
  privateContext?: string;
  /** The finished prayer to rewrite — "recast" mode only. */
  originalPrayer?: string;
  /** The author's display name, named as the subject — "recast" mode only. */
  authorName?: string;
}

export interface PrayerOutput {
  /** The prayer text, in the requested language. */
  text: string;
}

const PRAYER_SYSTEM =
  "You are the Prayer agent for Round, a Scripture reading app. You write a short personal prayer of " +
  "5-8 sentences in the FIRST PERSON SINGULAR (I / me / my) — a prayer the person can pray for themselves. " +
  "Sincere, simple, unadorned; grounded in the person's own life and reading, never generic. " +
  "Do not add a title, heading, or 'Amen' unless it falls naturally. Write directly in the requested language. " +
  "Respond with the prayer text only — no preamble, no markdown.";

const RECAST_SYSTEM =
  "You are the Prayer agent for Round. You are given a personal prayer someone wrote for themselves and are " +
  "sharing with their small reading circle so the circle can pray it over them. Rewrite it as a short " +
  "intercessory prayer that NAMES the person in the third person as its subject — e.g. 'I pray for a good " +
  "interview' becomes 'I pray that {name} will have a good interview'. Keep the substance and warmth; keep it " +
  "to a few sentences. Do not add commentary. Write directly in the requested language. " +
  "Respond with the prayer text only — no preamble, no markdown.";

/** Absent context is OMITTED, never sent as a "none" placeholder — same prompt
 * hygiene as pre-reading/post-reading (and it avoids Gloo's content guardrail
 * tripping on filler). */
function buildUserMessage(input: PrayerInput): string {
  if (input.mode === "recast") {
    const lines = [
      `Rewrite this prayer to intercede for ${input.authorName ?? "this person"} by name.`,
      `Write in this language (ISO 639-1): ${input.language}`,
      "",
      "Prayer:",
      input.originalPrayer ?? "",
    ];
    return lines.join("\n");
  }

  const lines: string[] = [];
  if (input.mode === "custom") {
    lines.push(
      `Write a personal prayer about this request: ${input.userPrompt ?? ""}`,
      "Stay focused on the request; only lightly draw on the context below where it fits.",
    );
  } else {
    lines.push("Write a personal prayer for the person today.");
    if (input.readingReference) {
      lines.push(`Today's reading: ${input.readingReference}`);
    }
  }
  if (input.privateContext?.trim()) {
    lines.push("", `About the person (private, from their own app data): ${input.privateContext.trim()}`);
  }
  lines.push("", `Write in this language (ISO 639-1): ${input.language}`);
  return lines.join("\n");
}

/** The system+user messages for a prayer call — shared by the streamed route
 * (src/app/api/prayer) and the non-streamed run()/fallback below. */
export function buildPrayerMessages(input: PrayerInput): GlooMessage[] {
  return [
    { role: "system", content: input.mode === "recast" ? RECAST_SYSTEM : PRAYER_SYSTEM },
    { role: "user", content: buildUserMessage(input) },
  ];
}

/** Non-streamed generation — used by the dev console and as the streaming
 * fallback when an SSE stream is interrupted. */
export async function generatePrayer(
  input: PrayerInput,
): Promise<{ text: string; model: string }> {
  const completion = await chatCompletion({
    agentName: "prayer",
    messages: buildPrayerMessages(input),
    maxTokens: 1200,
  });
  return { text: completion.content.trim(), model: completion.model };
}

export const prayer: Agent<PrayerInput, PrayerOutput> = {
  name: "prayer",
  displayName: "Prayer",
  description:
    "Runs on user request from the Prayer tab. Writes a private, first-person prayer for the day or from a free-text request; can recast a prayer to intercede for the author by name when they share it. Never auto-posted to the circle.",
  tier: 1,
  implementation: "real",
  systemPrompt: PRAYER_SYSTEM,
  sampleInput: {
    mode: "daily",
    language: "en",
    readingReference: "PSA.23",
    privateContext:
      "Goals: finding peace in a stressful season. Recently reflected on how hard it is to stop striving.",
  },
  async run(input): Promise<AgentRunOk<PrayerOutput>> {
    const { text, model } = await generatePrayer(input);
    return { status: "ok", agent: "prayer", model, output: { text } };
  },
};
