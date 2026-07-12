// Escalation Agent — shell (Step 5). Real implementation: Step 18, with the
// crisis classification prompt, the resource config file, the private support
// card, and the reference-only audit log. It must run on every reflection
// before any other processing (brief §8.2) — that pipeline wiring is Step 19.

import { shellAgent } from "./types";

export interface EscalationInput {
  /** Reference to the reflection being checked — only this is ever logged. */
  reflectionId: string;
  /** The reflection text to classify. Never stored in any log. */
  text: string;
}

export const escalation = shellAgent<EscalationInput>({
  name: "escalation",
  displayName: "Escalation",
  description:
    "Runs on every reflection, immediately and before any other agent. Detects crisis signals; shows a private support card to the affected user only; logs reference only, never content.",
  tier: 1,
  systemPrompt:
    "You are the Escalation agent for Round. You check a user's reflection text for crisis signals. " +
    "Placeholder prompt — the real classification contract (suicidal ideation, self-harm, acute crisis, hopelessness; " +
    "structured flagged/unflagged output) is defined in Step 18. For now, describe in one sentence whether the text appears concerning.",
  sampleInput: {
    reflectionId: "reflection-demo-1",
    text: "This psalm reminded me to slow down this week.",
  },
  buildUserMessage: (input) =>
    `Reflection (id ${input.reflectionId}):\n${input.text}`,
  maxTokens: 150,
});
