// Translation — orchestration (Step 27).
//
// Ties a freshly posted member message to the Translation agent: detects the
// source language, then fans out one translation per DISTINCT reader language
// in the circle that differs from the source, writing each to
// message_translations (additive — the original message.body is never
// touched). Runs post-persist via `after()` from the posting routes, so a
// slow Gloo call never blocks or loses a member's message; the thread's
// 10-second poll (Decisions → asynchronous timing) swaps the cached
// translation in.
//
// SOURCE DETECTION — two-tier cascade (Decisions → language detection, with
// Step 27's regex short-circuit prepended):
//   1. Cheap English-marker regex. Enough hits ⇒ source is English, and NO
//      Gloo detection call is made (short devotional English defeats n-gram
//      detectors but trips these markers reliably, and English is the common
//      case).
//   2. Only if the regex is inconclusive: one Gloo detection call.
//   3. Only if that fails/answers implausibly: the author's profile language
//      already stored on the message row (the Step 17 best-effort guess).
// The detected code is written back onto messages.sourceLanguage — a metadata
// refinement of the Step 17 guess, NOT a change to the author's words (body is
// immutable, brief §5.12 / constraint #6). Keeping the stored source accurate
// keeps the thread's "needs translation?" and "Translating…" rendering honest.
//
// EXCLUSIONS (both enforced here): system/AI-authored posts (authorId null —
// starters, icebreaker, digest, companion, summary) are never translated after
// the fact; their per-language delivery is Step 28. Member-authored posts of
// every kind ARE covered — ordinary messages, reflections, and Step 26's
// shared_prayer cards alike.
//
// CACHE: message_translations' composite PK (messageId, targetLanguage) makes
// "never re-translate the same target" structural; an existence check skips the
// Gloo call, and onConflictDoNothing makes a concurrent double-run harmless.

import { and, eq, inArray } from "drizzle-orm";
import { detectLanguage, translateText } from "@/agents/translation";
import { db } from "@/db";
import { circleMembers, messageTranslations, messages, users } from "@/db/schema";

/**
 * Common English markers. Short circle messages ("I was struck by this", "the
 * verse about mercy", "you and I both") hit several of these; a message that
 * hits enough is treated as English and skips the Gloo detection call. Chosen
 * to be words that barely appear in Spanish/Portuguese devotional text, so a
 * non-English message rarely trips the threshold.
 */
const ENGLISH_MARKERS: RegExp[] = [
  /\bI was\b/i,
  /\bI am\b/i,
  /\bI have\b/i,
  /\bI feel\b/i,
  /\bthe\b/i,
  /\band\b/i,
  /\byou\b/i,
  /\bthis\b/i,
  /\bthat\b/i,
  /\bwith\b/i,
  /\bfor\b/i,
  /\babout\b/i,
];

/** How many distinct markers must match for the regex to call it English. */
const ENGLISH_MARKER_THRESHOLD = 2;

/** True when the text hits enough English markers to skip Gloo detection. */
export function looksEnglish(text: string): boolean {
  let hits = 0;
  for (const marker of ENGLISH_MARKERS) {
    if (marker.test(text)) {
      hits += 1;
      if (hits >= ENGLISH_MARKER_THRESHOLD) return true;
    }
  }
  return false;
}

/**
 * Resolve a message's source language via the two-tier cascade. `fallback` is
 * the author's profile language already on the row (may be null). Never throws:
 * a failed Gloo detection degrades to the fallback, which the safe-by-design
 * translation prompt (returns text unchanged if already in the target) makes a
 * cheap, non-fatal miss rather than a wrong display.
 */
export async function detectSourceLanguage(
  text: string,
  fallback: string | null,
): Promise<string> {
  if (looksEnglish(text)) return "en";
  try {
    const detected = await detectLanguage(text);
    if (detected) return detected;
  } catch {
    // Detection failed — fall through to the author's profile language.
  }
  return fallback ?? "en";
}

/** The distinct, non-null preferred languages of a circle's members. */
async function circleMemberLanguages(circleId: string): Promise<string[]> {
  const rows = await db
    .select({ language: users.language })
    .from(circleMembers)
    .innerJoin(users, eq(users.id, circleMembers.userId))
    .where(eq(circleMembers.circleId, circleId));
  const languages = new Set<string>();
  for (const row of rows) {
    if (row.language) languages.add(row.language);
  }
  return [...languages];
}

/** Target languages that already have a cached translation for this message. */
async function existingTargets(
  messageId: string,
  targets: string[],
): Promise<Set<string>> {
  if (targets.length === 0) return new Set();
  const rows = await db
    .select({ targetLanguage: messageTranslations.targetLanguage })
    .from(messageTranslations)
    .where(
      and(
        eq(messageTranslations.messageId, messageId),
        inArray(messageTranslations.targetLanguage, targets),
      ),
    );
  return new Set(rows.map((row) => row.targetLanguage));
}

/**
 * Detect the source of one posted message and translate it into every distinct
 * circle-member language that differs from the source. Safe to call more than
 * once for the same message (cache + onConflictDoNothing). Never throws: a
 * failure on one target is logged and skipped so the others still land, and the
 * whole call is best-effort background work invoked via `after()`.
 *
 * System posts (authorId null) are skipped: AI content is generated
 * per-language in Step 28, never translated after the fact.
 */
export async function translateNewMessage(messageId: string): Promise<void> {
  const [message] = await db
    .select({
      id: messages.id,
      circleId: messages.circleId,
      authorId: messages.authorId,
      body: messages.body,
      sourceLanguage: messages.sourceLanguage,
    })
    .from(messages)
    .where(eq(messages.id, messageId));

  // Missing row or a system/AI-authored post: nothing for this agent to do.
  if (!message || message.authorId === null) return;

  // Detect the true source and refine the row's best-effort Step 17 guess
  // (metadata only — the author's words are never touched).
  const source = await detectSourceLanguage(message.body, message.sourceLanguage);
  if (source !== message.sourceLanguage) {
    await db
      .update(messages)
      .set({ sourceLanguage: source })
      .where(eq(messages.id, messageId));
  }

  // Distinct member languages that differ from the source and are not cached.
  const memberLanguages = await circleMemberLanguages(message.circleId);
  const targets = memberLanguages.filter((language) => language !== source);
  const cached = await existingTargets(messageId, targets);
  const pending = targets.filter((language) => !cached.has(language));

  for (const targetLanguage of pending) {
    try {
      const { output, model } = await translateText({
        text: message.body,
        sourceLanguage: source,
        targetLanguage,
      });
      await db
        .insert(messageTranslations)
        .values({
          messageId,
          targetLanguage,
          body: output.text,
          model,
        })
        // A concurrent run may have written this target first — that is fine.
        .onConflictDoNothing({
          target: [messageTranslations.messageId, messageTranslations.targetLanguage],
        });
    } catch (error) {
      // One target failing must not sink the rest; the next post's run (or a
      // manual re-trigger) retries this target, and the reader keeps seeing the
      // original in the meantime.
      console.error(
        `translation failed for message ${messageId} → ${targetLanguage}`,
        error,
      );
    }
  }
}
