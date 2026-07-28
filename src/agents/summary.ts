// Summary Agent — real implementation (Step 25).
//
// Alongside each Facilitator digest, in the same daily sweep, this writes a 3–5
// sentence plain-language summary of the passage's MAIN TEACHING — informed by
// the passage text and the themes the circle raised that day. Unlike the digest
// (which looks backward at what MEMBERS said) the summary explains the TEXT, in
// plain modern language, so it reads the same for a first-time reader as for a
// scholar. It is available, never forced — the thread renders it collapsed.
//
// This module only talks to Gloo and shapes its text output. Resolving the
// circle's day, fetching the passage (from YouVersion, never Gloo), deriving the
// circle's themes from the digest, and persisting alongside the digest under its
// (circle, day) fence all live in src/lib/digest.ts — nothing here reads or
// writes the database.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

export interface SummaryInput {
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller — never by Gloo. */
  passageText: string;
  /** What the circle raised today — the digest's synthesis and shared theme,
   * distilled by the Facilitator in the same sweep. Grounds the summary in THIS
   * circle's reading. Omitted (never a "none yet" placeholder) when there is no
   * digest content to lean on — the summary then rests on the passage alone. */
  circleThemes?: string[];
  language: string;
}

export interface SummaryOutput {
  /** 3–5 sentence plain-language summary of the passage's main teaching. */
  summary: string;
}

const SYSTEM_PROMPT =
  "You are the Summary agent for Round, an app for small-group Bible reading. " +
  "Alongside the day's digest you write a short lesson summary of a Bible passage's main teaching. " +
  "Write 3 to 5 sentences in warm, plain modern language — no jargon, no archaic phrasing, no verse-by-verse walkthrough. " +
  "Explain what the passage is fundamentally about and what it invites the reader to see or do. " +
  "When you are told what the circle noticed today, let it shape your emphasis, but summarise the PASSAGE'S teaching, not the circle's discussion. " +
  "Do not name members, do not quote the digest, do not add a title or heading, do not use markdown. " +
  "Write directly in the requested language. Respond with the summary prose only.";

function buildUserMessage(input: SummaryInput): string {
  const lines = [
    `Passage (${input.passageReference}):`,
    input.passageText,
    "",
  ];
  // Absent themes are omitted, never sent as a "none yet" placeholder — see the
  // note in src/agents/post-reading.ts (prompt hygiene, Gloo's content guard).
  if (input.circleThemes && input.circleThemes.length > 0) {
    lines.push(
      "What the circle noticed today:",
      ...input.circleThemes.map((theme) => `- ${theme}`),
      "",
    );
  }
  lines.push(
    `Write the summary in this language (ISO 639-1): ${input.language}`,
    "",
    "Write 3 to 5 plain-language sentences on the passage's main teaching.",
  );
  return lines.join("\n");
}

/** A trimmed non-empty string, or null. */
function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Token budget for one summary. Far larger than 5 sentences of prose need,
 * because Gloo routes to reasoning models (gemini-2.5-flash among them) whose
 * THINKING tokens are spent from this same budget: at 320 the thinking consumed
 * nearly all of it and the summary came back as "Psalm 1 vividly contrasts two
 * ways of life, inviting us" — a fragment, stored as if it were a summary.
 */
const MAX_TOKENS = 900;

/**
 * Run the Gloo call and return the summary prose. One re-ask when the answer is
 * empty or was CUT OFF by the token budget (transient HTTP errors are already
 * retried inside the Gloo client), the second attempt with a doubled budget.
 * Throws when both attempts fail — the caller (src/lib/digest.ts) treats that as
 * a generation failure and posts neither summary nor digest, so a bad generation
 * is invisible rather than half-formed.
 */
export async function generateSummary(
  input: SummaryInput,
): Promise<{ summary: string; model: string }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await chatCompletion({
      agentName: "summary",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            buildUserMessage(input) +
            (lastError
              ? `\n\nYour previous answer was unusable (${lastError}). Return the complete summary prose, 3 to 5 sentences.`
              : ""),
        },
      ],
      maxTokens: MAX_TOKENS * attempt,
    });
    const summary = asText(completion.content);
    // A truncated answer is neither empty nor malformed — without this check it
    // would be stored mid-sentence and shown on the digest card.
    if (summary && !completion.truncated) {
      return { summary, model: completion.model };
    }
    lastError = completion.truncated ? "cut off mid-sentence" : "empty summary";
  }
  throw new Error(`Summary returned an unusable summary: ${lastError}`);
}

export const summary: Agent<SummaryInput, SummaryOutput> = {
  name: "summary",
  displayName: "Summary",
  description:
    "Runs alongside the Facilitator. Generates a 3–5 sentence plain-language lesson summary from the passage and the circle's themes, shown as a collapsible card on the digest.",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul.",
    circleThemes: ["rest", "trust"],
    language: "en",
  },
  async run(input): Promise<AgentRunOk<SummaryOutput>> {
    const { summary: text, model } = await generateSummary(input);
    return { status: "ok", agent: "summary", model, output: { summary: text } };
  },
};
