// Reflection submission pipeline (Step 19).
//
// The one hard rule this module enforces: the Escalation Agent runs FIRST,
// synchronously, before the reflection is stored, posted, or processed in any
// other way (brief §5.11, constraint #2; agents' shared rule). Only after the
// gate returns a verdict does anything get written.
//
//   * Unflagged → a `reflections` row PLUS a `messages` row (kind
//     "reflection", day-tagged) so it appears in the circle thread and every
//     message-centric feature (polling now, translation in Step 25) sees it.
//   * Flagged   → a `reflections` row only (messageId null): private to its
//     author, never posted, excluded from Facilitator digest input (Step 24
//     reads `where flagged = false`). The reference-only audit row and the
//     crisis resources come from screenReflection() (Step 18).
//
// If the gate cannot produce a verdict (Gloo unusable after its retry),
// screenReflection throws and this function propagates it: the caller fails
// safe and NOTHING is written — a reflection is never accepted while the gate
// is unresolved.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, reflections } from "@/db/schema";
import { screenReflection } from "@/lib/escalation";
import type { CrisisResource } from "@/config/crisis-resources";

export interface SubmitReflectionInput {
  circleId: string;
  authorId: string;
  /** Best-effort source language from the author's profile (Step 25 detects). */
  sourceLanguage: string | null;
  /** The plan day this reflection responds to. */
  dayNumber: number;
  /** USFM reference of that day, e.g. "PSA.23". */
  reference: string;
  /** Human-readable label of that day, e.g. "Psalm 23". */
  label: string;
  /** The author's original words. */
  body: string;
  /** Region for crisis-resource resolution; null → combined US + UK default. */
  region?: string | null;
}

export interface SubmitReflectionResult {
  /** True when the Escalation Agent flagged the reflection — kept private. */
  flagged: boolean;
  /** Crisis resources for the private support card; empty when unflagged. */
  resources: CrisisResource[];
  /** The thread message id of an UNFLAGGED reflection — the caller triggers the
   * Translation Agent on it (Step 27). Null when flagged (never posted). */
  messageId: string | null;
}

/**
 * Screen one reflection and, per the verdict, either post it to the thread
 * (unflagged) or store it privately (flagged). Escalation always runs before
 * the first write. Throws if screening is unusable — the caller must not treat
 * the reflection as accepted.
 */
export async function submitReflection(
  input: SubmitReflectionInput,
): Promise<SubmitReflectionResult> {
  // The reflection's id is fixed up front so the audit reference (written by
  // screenReflection when flagged) matches the row we then insert.
  const reflectionId = crypto.randomUUID();

  // Gate FIRST — before any row exists. A throw here leaves nothing written.
  const screen = await screenReflection({
    reflectionId,
    text: input.body,
    region: input.region ?? null,
  });

  await db.insert(reflections).values({
    id: reflectionId,
    circleId: input.circleId,
    authorId: input.authorId,
    dayNumber: input.dayNumber,
    reference: input.reference,
    label: input.label,
    body: input.body,
    sourceLanguage: input.sourceLanguage,
    flagged: screen.verdict.flagged,
  });

  if (screen.verdict.flagged) {
    // Never posted to the thread. Private to the author + support card.
    return { flagged: true, resources: screen.resources, messageId: null };
  }

  // Unflagged: post to the thread as a day-tagged reflection message, then
  // link the reflection to it. The original body is written once, never edited.
  const [message] = await db
    .insert(messages)
    .values({
      circleId: input.circleId,
      authorId: input.authorId,
      body: input.body,
      sourceLanguage: input.sourceLanguage,
      kind: "reflection",
      dayNumber: input.dayNumber,
      dayLabel: input.label,
    })
    .returning({ id: messages.id });

  await db
    .update(reflections)
    .set({ messageId: message.id })
    .where(eq(reflections.id, reflectionId));

  return { flagged: false, resources: [], messageId: message.id };
}

/** A reflection this member already posted for a plan day. */
export interface OwnReflectionSummary {
  body: string;
  createdAt: string;
}

/**
 * The member's most recent POSTED reflection for one plan day, or null.
 *
 * Reflecting twice on the same day is deliberately allowed — a reader who
 * returns to a passage days later may finally have words for it, and the
 * no-comparison/self-paced constraints mean the app never tells someone they
 * have already had their turn. This exists so the UI can say "you've already
 * reflected on this day" and make a second one a considered act rather than an
 * accident; it is not a gate.
 *
 * Flagged reflections are excluded: they never reached the thread, so the
 * member has not actually contributed to it, and their text must not be echoed
 * back to them in a "you already said this" affordance.
 */
export async function loadOwnReflection(
  circleId: string,
  authorId: string,
  dayNumber: number,
): Promise<OwnReflectionSummary | null> {
  const [row] = await db
    .select({ body: reflections.body, createdAt: reflections.createdAt })
    .from(reflections)
    .where(
      and(
        eq(reflections.circleId, circleId),
        eq(reflections.authorId, authorId),
        eq(reflections.dayNumber, dayNumber),
        eq(reflections.flagged, false),
      ),
    )
    .orderBy(desc(reflections.createdAt))
    .limit(1);
  if (!row) return null;
  return { body: row.body, createdAt: row.createdAt.toISOString() };
}
