// Companion Agent — real implementation (Step 24A).
//
// The digest's inverse. Where the Facilitator (Step 24) looks BACKWARD to
// synthesise what a circle said, the Companion keeps a stalled conversation
// alive: on a 12-hourly sweep it reads the day's thread — the Step 20 starters
// card plus whatever members did say — and posts ONE short, warm turn under the
// name "Round" that picks up something specific a member said and opens it to
// the others. When nobody has said anything at all, it re-opens the starters
// instead. Posted as a system message (messages.kind = "companion", authorId
// null), rendered through Step 20's shared system-message identity.
//
// This module only talks to Gloo and shapes its text output. Resolving the
// circle's current plan day, the eligibility gates (reflection threshold, no
// digest, not actively chatting), Escalation screening of the messages it
// reads, fetching the passage (YouVersion, never Gloo), posting to the thread,
// and the per-circle-per-sweep idempotency fence all live in
// src/lib/companion.ts — nothing here reads or writes the database.
//
// TWO HARD CONSTRAINTS baked into the prompt (both non-negotiable):
//   * No comparison (brief §8.1): Round never names or implies who has NOT
//     spoken. "we haven't heard from you" is prohibited; "there's more here
//     worth hearing" is fine.
//   * No counsel (brief §6): Round never advises or counsels. Pastoral weight
//     belongs to the Escalation support card, never to a conversational nudge.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

/** One thing a member said in the day's thread — steer, never quiz. */
export interface CompanionMessage {
  /** Display name only — never progress or streak data. */
  authorDisplayName: string;
  text: string;
}

export interface CompanionInput {
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller — never by Gloo. */
  passageText: string;
  /** Human-readable passage label, e.g. "Psalm 23". */
  dayLabel: string;
  /**
   * "pickup" — members said something; pick up a specific thread and open it
   * to the others. "reopen" — nobody has said anything, so gently re-open the
   * starter questions instead.
   */
  mode: "pickup" | "reopen";
  /** What members actually said in the day's thread (empty in "reopen"). */
  memberMessages: CompanionMessage[];
  /** Round's Step 20 conversation starters for the day — the "reopen" anchor. */
  starterQuestions: string[];
  language: string;
}

export interface CompanionOutput {
  /** One warm, short turn: a couple of sentences and one open question. */
  turn: string;
}

const SYSTEM_PROMPT =
  "You are Round, the gentle companion of a small-group Bible reading circle. " +
  "A day's conversation has gone quiet, and you take ONE short turn to keep it alive — posted under the name 'Round', for the whole circle to see. " +
  "Your turn is warm and brief: a couple of sentences and exactly one open question, nothing more. " +
  "When members have said something, pick up ONE specific thing someone actually said and open it outward so the others can join in. " +
  "When no one has said anything yet, gently re-open the conversation using the day's starter questions. " +
  "Ground your turn in the passage and in the circle's own words — never introduce new teaching. " +
  "HARD RULES you must never break: " +
  "(1) Never name, count, or imply who has or has not spoken. Phrases like 'we haven't heard from you' or 'some of you have been quiet' are forbidden; 'there's more here worth hearing' is the right spirit. " +
  "(2) Never counsel, advise, instruct, reassure, or offer help — you are opening a conversation, not giving guidance. " +
  "(3) Never quiz on facts, never compare or rank members, never mention reading pace or progress. " +
  "Write your turn directly in the requested language. " +
  "Respond with the turn text ONLY — no name prefix, no quotation marks, no preamble, no markdown.";

function buildUserMessage(input: CompanionInput): string {
  const lines = [
    `Passage (${input.dayLabel} — ${input.passageReference}):`,
    input.passageText,
    "",
  ];

  if (input.mode === "pickup" && input.memberMessages.length > 0) {
    lines.push(
      "What members have said in the thread so far (member — what they wrote):",
      ...input.memberMessages.map(
        (message) => `- ${message.authorDisplayName}: ${message.text}`,
      ),
      "",
      "Pick up one specific thing someone said and open it to the rest of the circle.",
    );
  } else {
    lines.push(
      "No one has said anything yet. Round's conversation starters for this day were:",
      ...input.starterQuestions.map((question) => `- ${question}`),
      "",
      "Gently re-open the conversation around one of these — do not just repeat them verbatim.",
    );
  }

  lines.push(
    "",
    `Write your turn in this language (ISO 639-1): ${input.language}`,
    "Remember: a couple of sentences and one open question. Name no one as absent. Give no advice.",
  );
  return lines.join("\n");
}

/** Strip a stray name prefix or wrapping quotes the model may add anyway. */
function cleanTurn(content: string): string {
  return content
    .trim()
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/```\s*$/, "")
    .replace(/^round[:\s—-]+/i, "")
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim();
}

/**
 * Run the Gloo call and shape its output. Transient HTTP errors are already
 * retried inside the Gloo client; an empty turn throws, so the caller posts
 * nothing rather than an empty card.
 */
export async function generateCompanionTurn(
  input: CompanionInput,
): Promise<{ output: CompanionOutput; model: string }> {
  const completion = await chatCompletion({
    agentName: "companion",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    maxTokens: 200,
  });
  const turn = cleanTurn(completion.content);
  if (turn.length === 0) {
    throw new Error("Companion returned an empty turn");
  }
  return { output: { turn }, model: completion.model };
}

export const companion: Agent<CompanionInput, CompanionOutput> = {
  name: "companion",
  displayName: "Companion",
  description:
    "Runs on the 12-hourly sweep, per active circle. Revives a stalled day: reads the day's thread and posts one short, warm turn under 'Round' that picks up a member's words (or re-opens the starters), never naming who is absent and never counselling.",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul.",
    dayLabel: "Psalm 23",
    mode: "pickup",
    memberMessages: [
      {
        authorDisplayName: "Ana",
        text: "The still waters line stopped me — I never let myself slow down.",
      },
    ],
    starterQuestions: [
      "Where in your week do you most need 'quiet waters'?",
      "What does it mean to you that the shepherd leads rather than drives?",
    ],
    language: "en",
  },
  async run(input): Promise<AgentRunOk<CompanionOutput>> {
    const { output, model } = await generateCompanionTurn(input);
    return { status: "ok", agent: "companion", model, output };
  },
};
