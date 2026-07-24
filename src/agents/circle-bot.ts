// Circle Bot Agent — real implementation (Step 30).
//
// The public demo circle ("Public Round Circle — Psalms") has a seeded AI
// MEMBER — a warm, ordinary reader persona — so an Instant Access visitor who
// posts is answered like they would be in a real, living circle. This agent is
// that member's voice: given the day's passage and the recent thread, it writes
// ONE short, natural reply in the first person, as a fellow reader.
//
// It is deliberately NOT "Round". Round is the facilitator identity behind the
// authorId-null system posts (starters, digest, companion). The Circle Bot is a
// MEMBER: its posts carry a real authorId (the bot's users row), render as an
// ordinary member message, and are translated like any member message (Step 27)
// — persona content, not Round's facilitation output, so brief §5.12's
// "AI content is never translated after the fact" does not apply.
//
// This module only talks to Gloo and shapes text. Resolving the circle, the
// bot member, rate-limiting, Escalation-screening the message it answers, the
// passage fetch (YouVersion, never Gloo), and posting all live in
// src/lib/circle-bot.ts — nothing here reads or writes the database.
//
// HARD RULES in the prompt: a fellow reader, never a counsellor or teacher; no
// crisis handling (the Escalation gate owns that, upstream); no reading-pace or
// progress talk (brief §8.1); never claims to be a bot or an assistant.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

/** One earlier thread post the bot has read, for continuity. */
export interface CircleBotContextMessage {
  /** Display name only — never progress or streak data. */
  authorDisplayName: string;
  text: string;
}

export interface CircleBotInput {
  /** The persona's own name, so it can speak as itself and address others. */
  botName: string;
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller — never by Gloo. */
  passageText: string;
  /** Human-readable passage label, e.g. "Psalm 1". */
  dayLabel: string;
  /** The recent thread the bot has read, oldest first (may be empty). */
  recentMessages: CircleBotContextMessage[];
  /** The specific message the bot is replying to — who said it, and what. */
  triggerAuthorDisplayName: string;
  triggerText: string;
  /** The language the reply is written in (the bot's own profile language). */
  language: string;
}

export interface CircleBotOutput {
  /** One warm, short, first-person reply from a fellow reader. */
  reply: string;
}

const SYSTEM_PROMPT =
  "You are a warm, thoughtful member of a small-group Bible reading circle — an ordinary fellow reader, not a leader. " +
  "You are replying to something another member just posted in the circle's thread. " +
  "Write ONE short, natural reply in the first person, as yourself: a couple of sentences at most, sometimes ending with a gentle question that invites them to say more. " +
  "React to what THEY actually said and tie it to the day's passage in a personal way — what it stirred in you, a line that stayed with you — never a lecture. " +
  "HARD RULES you must never break: " +
  "(1) You are a fellow reader, never a counsellor, teacher, or expert. Do not instruct, advise, correct, or explain doctrine. " +
  "(2) Never counsel or handle crisis — if someone shares something heavy, respond with plain human warmth only, nothing more. " +
  "(3) Never mention reading pace, progress, streaks, or who has or hasn't posted (this circle never compares its members). " +
  "(4) Never say or imply you are an AI, a bot, or an assistant, and never call yourself 'Round'. You are just another reader. " +
  "Write directly in the requested language. " +
  "Respond with the reply text ONLY — no name prefix, no quotation marks, no preamble, no markdown.";

function buildUserMessage(input: CircleBotInput): string {
  const lines = [
    `You are "${input.botName}", a member of this circle.`,
    `Today's passage (${input.dayLabel} — ${input.passageReference}):`,
    input.passageText,
    "",
  ];

  if (input.recentMessages.length > 0) {
    lines.push(
      "Recent thread (member — what they wrote), oldest first:",
      ...input.recentMessages.map(
        (message) => `- ${message.authorDisplayName}: ${message.text}`,
      ),
      "",
    );
  }

  lines.push(
    `${input.triggerAuthorDisplayName} just posted:`,
    input.triggerText,
    "",
    `Reply to ${input.triggerAuthorDisplayName} as ${input.botName}, in this language (ISO 639-1): ${input.language}.`,
    "Remember: a couple of sentences, personal and warm, grounded in the passage. Give no advice. Name no one as absent.",
  );
  return lines.join("\n");
}

/** Strip a stray name prefix or wrapping quotes the model may add anyway. */
function cleanReply(content: string): string {
  return content
    .trim()
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/```\s*$/, "")
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim();
}

/**
 * Run the Gloo call and shape its output. Transient HTTP errors are already
 * retried inside the Gloo client; an empty reply throws, so the caller posts
 * nothing rather than an empty message.
 */
export async function generateCircleBotReply(
  input: CircleBotInput,
): Promise<{ output: CircleBotOutput; model: string }> {
  const completion = await chatCompletion({
    agentName: "circle-bot",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    maxTokens: 180,
  });
  const reply = cleanReply(completion.content);
  if (reply.length === 0) {
    throw new Error("Circle Bot returned an empty reply");
  }
  return { output: { reply }, model: completion.model };
}

export const circleBot: Agent<CircleBotInput, CircleBotOutput> = {
  name: "circle-bot",
  displayName: "Circle Bot",
  description:
    "The seeded AI member of the public demo circle (Step 30). Replies to a member's post like an ordinary fellow reader — short, warm, first-person, grounded in the day's passage — never as Round, never counselling, never mentioning pace. Its posts are member-authored, so they translate like any member message.",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    botName: "Ada",
    passageReference: "PSA.1",
    passageText:
      "Blessed is the one who does not walk in step with the wicked… but whose delight is in the law of the LORD, and who meditates on his law day and night. That person is like a tree planted by streams of water.",
    dayLabel: "Psalm 1",
    recentMessages: [],
    triggerAuthorDisplayName: "Reader #4",
    triggerText:
      "The tree by the water stayed with me — I want to be that steady but I feel more like the chaff most weeks.",
    language: "en",
  },
  async run(input): Promise<AgentRunOk<CircleBotOutput>> {
    const { output, model } = await generateCircleBotReply(input);
    return { status: "ok", agent: "circle-bot", model, output };
  },
};
