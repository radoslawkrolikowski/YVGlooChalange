// Summary Agent — shell (Step 5). Real implementation: Step 25, generated
// alongside each Facilitator digest in the same sweep.

import { shellAgent } from "./types";

export interface SummaryInput {
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller. */
  passageText: string;
  /** Themes the circle raised in reflections, if any. */
  circleThemes?: string[];
  language: string;
}

export const summary = shellAgent<SummaryInput>({
  name: "summary",
  displayName: "Summary",
  description:
    "Runs alongside the Facilitator. Generates a 3–5 sentence plain-language lesson summary from the passage and reflection themes, shown as a collapsible card.",
  tier: 1,
  systemPrompt:
    "You are the Summary agent for Round. You write a 3-5 sentence plain-language summary of a Bible passage's main teaching, " +
    "informed by the passage text and the themes a reading circle raised. No jargon. Respond in the requested language.",
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures...",
    circleThemes: ["rest", "trust"],
    language: "en",
  },
  // Absent context is omitted, never sent as a "none yet" placeholder — see
  // the note in src/agents/post-reading.ts (prompt hygiene, and Gloo's
  // whole-payload content guardrail).
  buildUserMessage: (input) =>
    [
      `Passage (${input.passageReference}):`,
      input.passageText,
      "",
      ...(input.circleThemes && input.circleThemes.length > 0
        ? [`Themes the circle raised: ${input.circleThemes.join(", ")}`]
        : []),
      `Language: ${input.language}`,
      "",
      "Write the lesson summary.",
    ].join("\n"),
});
