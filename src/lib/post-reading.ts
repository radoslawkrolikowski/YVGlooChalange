// Conversation starters — orchestration (Step 20).
//
// Ties "Finished reading" (Step 14) to the circle thread (Step 17): gathers
// the passage text (from YouVersion, the only source of Bible text), the
// phrases the reader highlighted during this session (Step 14), and the
// pre-reading prompts they were shown (Step 15), runs the PostReading agent,
// and posts the result to the thread as a system message attributed to "Round"
// (messages.kind = "starters", authorId null).
//
// Idempotency ("exactly once per user per plan day") is a database fence, not
// a check-then-act: the conversation_starters row is CLAIMED with an empty
// questions array before the Gloo call, so a repeated or concurrent completion
// loses the unique-index race and exits without spending a call. A generation
// or post failure deletes its own claim so the next completion can retry.
//
// Path A only — anonymous sessions have no circle membership until Step 30, so
// there is nothing to post to and this module is never reached for them.

import { and, eq } from "drizzle-orm";
import { generateConversationStarters } from "@/agents/post-reading";
import { effectiveVersionId } from "@/config/bible-versions";
import { db } from "@/db";
import {
  conversationStarters,
  highlights,
  messages,
  preReadingPrompts,
} from "@/db/schema";
import { loadCirclePlanDay } from "@/lib/circles";
import { fetchPassage } from "@/lib/youversion";

/** Passage text is context only — cap it to keep the Gloo prompt small. */
const MAX_PASSAGE_CHARS = 4000;
/** Session highlights passed to the agent, most recent first. */
const MAX_SESSION_HIGHLIGHTS = 8;

export interface PostConversationStartersInput {
  userId: string;
  circleId: string;
  /** The plan day just completed — part of the idempotency key. */
  dayNumber: number;
  /** The reader's preferred language; the questions are written in it. */
  language: string;
  /** The reader's stored version choice, used to fetch the passage text. */
  bibleVersionId: number | null;
}

/** Phrases this reader highlighted in this passage — steer, never quoted. */
async function loadSessionHighlightTexts(
  userId: string,
  reference: string,
): Promise<string[]> {
  const rows = await db
    .select({ snippet: highlights.snippet })
    .from(highlights)
    .where(
      and(
        eq(highlights.userId, userId),
        eq(highlights.source, "in_app"),
        eq(highlights.reference, reference),
      ),
    )
    .limit(MAX_SESSION_HIGHLIGHTS);
  return rows
    .map((row) => row.snippet)
    .filter((snippet): snippet is string => Boolean(snippet?.trim()));
}

/** The pre-reading prompts this reader was shown for this passage (Step 15). */
async function loadShownPrompts(
  userId: string,
  reference: string,
): Promise<string[]> {
  const [row] = await db
    .select({ prompts: preReadingPrompts.prompts })
    .from(preReadingPrompts)
    .where(
      and(
        eq(preReadingPrompts.userId, userId),
        eq(preReadingPrompts.reference, reference),
      ),
    )
    .limit(1);
  return row?.prompts ?? [];
}

/**
 * Generate and post this reader's conversation starters for one plan day.
 *
 * Returns the posted message id, or null when nothing was posted — already
 * done for this user+day, the day is not part of the circle's plan, or the
 * passage/generation failed. Never throws: finishing a reading must succeed
 * even when Round has nothing to say, so every failure path is swallowed here
 * after cleaning up its claim row.
 */
export async function postConversationStarters(
  input: PostConversationStartersInput,
): Promise<string | null> {
  const day = await loadCirclePlanDay(input.circleId, input.dayNumber);
  if (!day) return null;

  // Claim the (user, circle, day) slot BEFORE calling Gloo. A second
  // completion of the same day conflicts here and returns nothing.
  const [claim] = await db
    .insert(conversationStarters)
    .values({
      circleId: input.circleId,
      userId: input.userId,
      dayNumber: day.dayNumber,
      reference: day.reference,
      label: day.label,
      language: input.language,
    })
    .onConflictDoNothing({
      target: [
        conversationStarters.userId,
        conversationStarters.circleId,
        conversationStarters.dayNumber,
      ],
    })
    .returning({ id: conversationStarters.id });
  if (!claim) return null;

  try {
    const passage = await fetchPassage(
      day.reference,
      effectiveVersionId(input.language, input.bibleVersionId),
      { format: "text" },
    );
    const [sessionHighlights, prompts] = await Promise.all([
      loadSessionHighlightTexts(input.userId, day.reference),
      loadShownPrompts(input.userId, day.reference),
    ]);

    const { questions, model } = await generateConversationStarters({
      passageReference: day.reference,
      passageText: passage.content.slice(0, MAX_PASSAGE_CHARS),
      sessionHighlights,
      preReadingPrompts: prompts,
      language: input.language,
    });

    // The thread post: no author, so it renders with Round's system identity.
    // The body carries the questions as plain lines too — it is what a
    // message-centric consumer (the Translation Agent, Step 25) reads, and it
    // keeps the post meaningful even if the starters row is ever unavailable.
    const [message] = await db
      .insert(messages)
      .values({
        circleId: input.circleId,
        authorId: null,
        body: questions.join("\n"),
        sourceLanguage: input.language,
        kind: "starters",
        dayNumber: day.dayNumber,
        dayLabel: day.label,
      })
      .returning({ id: messages.id });

    await db
      .update(conversationStarters)
      .set({ questions, model, messageId: message.id })
      .where(eq(conversationStarters.id, claim.id));

    return message.id;
  } catch {
    // Release the claim so a later completion of this day can try again.
    await db
      .delete(conversationStarters)
      .where(eq(conversationStarters.id, claim.id))
      .catch(() => {
        // Nothing more to do — the day simply keeps its (empty) claim.
      });
    return null;
  }
}
