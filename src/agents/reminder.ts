// Reminder Agent — shell (Step 5). Real implementation: Step 29, on the
// daily cron sweep with in-app + plain-text email delivery, idempotent per
// user+type+day.

import { shellAgent } from "./types";

export interface ReminderInput {
  /** "reading" = 2+ days behind plan; "messages" = unread thread messages. */
  type: "reading" | "messages";
  userDisplayName: string;
  /** For reading reminders: the missed passage reference. */
  missedPassageReference?: string;
  /** What the circle has been discussing / what the user missed. */
  circleContext: string;
  language: string;
}

export const reminder = shellAgent<ReminderInput>({
  name: "reminder",
  displayName: "Reminder",
  description:
    "Runs on a schedule per user. Generates personalised reading reminders (2+ days behind) and unread-message summaries, delivered in-app and by plain-text email.",
  tier: 1,
  systemPrompt:
    "You are the Reminder agent for Round. You write short, personal, pastoral nudges — never marketing tone, no guilt. " +
    "Either a reading reminder referencing a missed passage and what the circle discussed, or a brief summary of unread circle messages. " +
    "Respond in the requested language.",
  sampleInput: {
    type: "reading",
    userDisplayName: "Ana",
    missedPassageReference: "PSA.24",
    circleContext:
      "The circle has been talking about rest and trust from Psalm 23.",
    language: "en",
  },
  buildUserMessage: (input) =>
    `Reminder type: ${input.type}\nUser: ${input.userDisplayName}\nMissed passage: ${input.missedPassageReference ?? "n/a"}\nCircle context: ${input.circleContext}\nLanguage: ${input.language}\n\nWrite the reminder message.`,
  maxTokens: 250,
});
