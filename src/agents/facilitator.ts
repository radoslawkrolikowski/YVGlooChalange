// Facilitator Agent — shell (Step 5). Real implementation: Step 24, on the
// daily cron sweep with reflection thresholds and idempotent digests.

import { shellAgent } from "./types";

export interface FacilitatorReflection {
  /** Display name only — never progress or streak data. */
  authorDisplayName: string;
  text: string;
}

export interface FacilitatorInput {
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller. */
  passageText: string;
  /** The day's unflagged reflections (flagged ones are excluded upstream). */
  reflections: FacilitatorReflection[];
  /** Optional commentary grounding supplied by the Context agent (Step 33). */
  contextGrounding?: string;
  language: string;
}

export const facilitator = shellAgent<FacilitatorInput>({
  name: "facilitator",
  displayName: "Facilitator",
  description:
    "Runs daily per circle. Synthesises the day's reflections into a digest: collective synthesis, overlap callout naming members on the same theme, and one grounded discussion question.",
  tier: 1,
  systemPrompt:
    "You are the Facilitator agent for Round. Once a day you read a circle's reflections on a Bible passage and produce a digest: " +
    "a 2-3 sentence synthesis of what the circle noticed collectively, an overlap callout naming which members landed on the same theme or line, " +
    "and one discussion question grounded in the passage and the circle's own words. Respond in the requested language.",
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures...",
    reflections: [
      {
        authorDisplayName: "Ana",
        text: "The still waters line stopped me — I never slow down.",
      },
      {
        authorDisplayName: "Ben",
        text: "Still waters again. I keep rushing past rest like it is optional.",
      },
    ],
    language: "en",
  },
  buildUserMessage: (input) =>
    `Passage (${input.passageReference}):\n${input.passageText}\n\nReflections:\n${input.reflections.map((reflection) => `- ${reflection.authorDisplayName}: ${reflection.text}`).join("\n")}\n${input.contextGrounding ? `\nCommentary grounding:\n${input.contextGrounding}\n` : ""}\nLanguage: ${input.language}\n\nWrite the daily digest.`,
  maxTokens: 500,
});
