// Reminder Agent — real implementation (Step 29).
//
// Runs on the daily Reminder sweep (Step 23 rail), per user. Two message types:
// a "reading" nudge for a user 2+ days behind their plan (referencing the missed
// passage and what their circle discussed), and a "messages" summary of unread
// circle messages older than 24h. Delivery is IN-APP ONLY — the notifications
// table (no email). Idempotency (per user+type+day) and all database access live
// in src/lib/reminders.ts; this module only talks to Gloo and returns text, in
// the same shape the shell it replaced did (ShellOutput { text }).
//
// The text is generated DIRECTLY in the user's language (brief §5.12): a reminder
// is 1:1 with one user, so there is only ever one language to write — nothing is
// translated after the fact.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk, ShellOutput } from "./types";

export interface ReminderInput {
  /** "reading" = 2+ days behind plan; "messages" = unread thread messages. */
  type: "reading" | "messages";
  userDisplayName: string;
  /** For reading reminders: the missed passage reference. */
  missedPassageReference?: string;
  /** What the circle has been discussing (reading), or a digest of the unread
   * messages (messages) — the grounding the nudge is written from. */
  circleContext: string;
  language: string;
}

const SYSTEM_PROMPT =
  "You are the Reminder agent for Round, an app for small-group Bible reading. " +
  "You write ONE short, personal, pastoral nudge — two or three sentences, warm and unhurried. " +
  "Never marketing tone, never guilt, never shame about falling behind, never mention pace, streaks, or how many days were missed. " +
  "For a reading reminder: gently invite the reader back to the passage they have not read yet, and mention what their circle has been reflecting on so returning feels like rejoining friends. " +
  "For a messages reminder: briefly say what the reader missed in their circle's conversation, warmly, so they want to open it. " +
  "Write directly in the requested language. Respond with the message text only — no greeting line, no sign-off, no quotation marks, no subject line.";

function buildUserMessage(input: ReminderInput): string {
  const lines = [
    `Reminder type: ${input.type}`,
    `Reader's name: ${input.userDisplayName}`,
  ];
  if (input.type === "reading") {
    lines.push(
      `Passage they have not read yet: ${input.missedPassageReference ?? "their next reading"}`,
      `What their circle has been reflecting on: ${input.circleContext}`,
    );
  } else {
    lines.push(`What they missed in the circle conversation:`, input.circleContext);
  }
  lines.push(
    `Write the nudge in this language (ISO 639-1): ${input.language}`,
    "",
    "Return the message text only.",
  );
  return lines.join("\n");
}

/** A trimmed non-empty completion, or throw — the caller posts nothing on failure. */
function asText(content: string): string {
  const trimmed = content.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (!trimmed) throw new Error("Reminder returned empty text");
  return trimmed;
}

/**
 * Run the Gloo call and return the reminder text plus the model that served it.
 * Transient HTTP errors are already retried inside the Gloo client; a guardrail
 * refusal or empty completion throws, and the caller (src/lib/reminders.ts)
 * treats that as "deliver nothing this type" rather than crashing the sweep.
 */
export async function generateReminder(
  input: ReminderInput,
): Promise<{ text: string; model: string }> {
  const completion = await chatCompletion({
    agentName: "reminder",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    maxTokens: 250,
  });
  return { text: asText(completion.content), model: completion.model };
}

export const reminder: Agent<ReminderInput, ShellOutput> = {
  name: "reminder",
  displayName: "Reminder",
  description:
    "Runs daily per user. Generates personalised reading reminders (2+ days behind) and unread-message summaries, delivered in-app to the notification bell (no email).",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    type: "reading",
    userDisplayName: "Ana",
    missedPassageReference: "PSA.24",
    circleContext:
      "The circle has been talking about rest and trust from Psalm 23.",
    language: "en",
  },
  async run(input): Promise<AgentRunOk<ShellOutput>> {
    const { text, model } = await generateReminder(input);
    return { status: "ok", agent: "reminder", model, output: { text } };
  },
};
