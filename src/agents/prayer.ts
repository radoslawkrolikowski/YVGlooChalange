// Prayer Agent — shell (Step 5). Real implementation: Step 26, shown
// privately to the requester with copy/save, never broadcast to the circle.

import { shellAgent } from "./types";

export interface PrayerInput {
  passageReference: string;
  /** What the circle discussed today: reflections and digest, summarised. */
  discussionSummary: string;
  language: string;
}

export const prayer = shellAgent<PrayerInput>({
  name: "prayer",
  displayName: "Prayer",
  description:
    "Runs on user request. Generates a 5–8 sentence first-person-plural prayer grounded in the day's discussion, attributed 'Round — based on today's reading'.",
  tier: 1,
  systemPrompt:
    "You are the Prayer agent for Round. On request you write a short prayer of 5-8 sentences in first-person plural (we/us), " +
    "grounded in what a reading circle discussed that day about a Bible passage. Sincere, simple, unadorned. Respond in the requested language.",
  sampleInput: {
    passageReference: "PSA.23",
    discussionSummary:
      "The circle noticed the invitation to rest by still waters and admitted how hard it is to stop striving.",
    language: "en",
  },
  buildUserMessage: (input) =>
    `Passage: ${input.passageReference}\nToday's discussion: ${input.discussionSummary}\nLanguage: ${input.language}\n\nWrite the prayer.`,
});
