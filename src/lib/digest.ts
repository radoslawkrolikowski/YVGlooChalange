// Daily digest — orchestration (Step 24; extended in Step 25).
//
// Ties the daily Facilitator sweep (Step 23 rail) to the circle thread: for one
// circle, resolves the current plan day, counts DISTINCT reflection authors
// against the 50%/min-2 threshold, runs the Facilitator agent, and posts the
// result to the thread as a system message attributed to "Round"
// (messages.kind = "digest", authorId null — it renders through Step 20's
// system-message identity).
//
// Step 25: alongside the digest, in this same sweep and under the digest's
// (circle, day) fence, the Summary agent writes a 3–5 sentence plain-language
// lesson summary of the passage, stored on the same digests row (summary
// column). Digest and summary are generated together before either is posted,
// so every digest is accompanied by exactly one summary; a failure of either
// releases the claim and both regenerate next sweep.
//
// "Current plan day" is the LATEST day for which the circle has any unflagged
// reflection — the day the circle has advanced to. Nothing stores a circle-level
// day pointer, and this is the day whose reflections there are to synthesise.
//
// Two idempotency fences, exactly as the plan requires ("agent_runs plus a
// unique constraint on the digest itself"). agent_runs is claimed by the sweep
// (src/lib/cron-sweeps.ts). Here, the digests row is CLAIMED (synthesis/question
// null) on (circle, day) BEFORE the Gloo call — a re-run, or a later day's sweep
// still sitting on the same plan day, loses that race and spends no Gloo call. A
// generation or post failure deletes the claim so a later sweep can retry.
//
// DISTINCT authors, never row count (Step 19 allows a member to reflect more
// than once a day): counting rows would let one member trip the threshold alone
// and receive a "collective synthesis" of themselves. Flagged reflections are
// excluded from input (`where flagged = false`) per the escalation-handling
// decision.
//
// Per-language native generation (Step 28). The base digest and summary are
// generated in the circle's base language (the earliest member's, English
// fallback) and posted as the messages/digests rows. Then, for every OTHER
// distinct member language present, the Facilitator and Summary agents are run
// AGAIN in that language and stored as message_variants rows — one native
// generation per language, never a translation (brief §5.12). Each reader's
// thread renders the variant in their own language; Step 27's Translation Agent
// skips these authorId-null system posts entirely. A variant failure is
// swallowed per language — the base post always stands.
//
// Path A only — circles are membership rows against users.id, so anonymous
// Instant Access sessions never reach this module.

import { and, asc, desc, eq } from "drizzle-orm";
import { generateDigest } from "@/agents/facilitator";
import { generateSummary } from "@/agents/summary";
import { effectiveVersionId } from "@/config/bible-versions";
import { db } from "@/db";
import {
  circleMembers,
  digests,
  messages,
  messageVariants,
  reflections,
  users,
} from "@/db/schema";
import { loadCircleMemberLanguages, loadCirclePlanDay } from "@/lib/circles";
import { fetchPassage } from "@/lib/youversion";

/** Passage text is grounding context only — cap it to keep the prompt small. */
const MAX_PASSAGE_CHARS = 4000;

/**
 * The readable prose body carried on the thread post (and each variant), so a
 * message-centric consumer has plain text and the post is never blank if the
 * structured row is ever unavailable. Overlap names are language-independent; the
 * theme phrase is in the same language as the synthesis/question passed here.
 */
function buildDigestBody(
  synthesis: string,
  overlapMembers: string[],
  overlapTheme: string | null,
  question: string,
): string {
  const lines = [synthesis];
  if (overlapMembers.length > 0 && overlapTheme) {
    lines.push("", `Shared: ${overlapMembers.join(", ")} — ${overlapTheme}`);
  }
  lines.push("", question);
  return lines.join("\n");
}

/** The outcome of one circle's digest attempt, for the sweep to report. */
export type DigestOutcome =
  | { posted: true; detail: string }
  | {
      posted: false;
      /** "error" releases the agent_runs claim so a later sweep retries. */
      reason: "no_reflections" | "below_threshold" | "already_posted" | "error";
      detail: string;
    };

/** The threshold: at least 50% of members, minimum 2 (distinct authors). */
export function requiredReflectionAuthors(memberCount: number): number {
  return Math.max(2, Math.ceil(memberCount / 2));
}

/** Member count and the digest's language (earliest member's, English fallback). */
async function loadCircleFacts(
  circleId: string,
): Promise<{ memberCount: number; language: string }> {
  const rows = await db
    .select({ language: users.language, joinedAt: circleMembers.joinedAt })
    .from(circleMembers)
    .innerJoin(users, eq(users.id, circleMembers.userId))
    .where(eq(circleMembers.circleId, circleId))
    .orderBy(asc(circleMembers.joinedAt));
  const language = rows.find((row) => row.language)?.language ?? "en";
  return { memberCount: rows.length, language };
}

/** The latest plan day with any unflagged reflection — the circle's current day. */
async function resolveCurrentDay(circleId: string): Promise<number | null> {
  const [row] = await db
    .select({ dayNumber: reflections.dayNumber })
    .from(reflections)
    .where(and(eq(reflections.circleId, circleId), eq(reflections.flagged, false)))
    .orderBy(desc(reflections.dayNumber))
    .limit(1);
  return row?.dayNumber ?? null;
}

interface DayReflections {
  /** Distinct-author count — the value the threshold is checked against. */
  authorCount: number;
  /** One entry per unflagged reflection (a member may appear more than once). */
  entries: { authorDisplayName: string; text: string }[];
  /** The distinct author display names, for overlap-name validation. */
  authorNames: string[];
}

/** A day's unflagged reflections, oldest first, with the distinct-author count. */
async function loadDayReflections(
  circleId: string,
  dayNumber: number,
): Promise<DayReflections> {
  const rows = await db
    .select({
      authorId: reflections.authorId,
      authorName: users.name,
      body: reflections.body,
    })
    .from(reflections)
    .innerJoin(users, eq(users.id, reflections.authorId))
    .where(
      and(
        eq(reflections.circleId, circleId),
        eq(reflections.dayNumber, dayNumber),
        eq(reflections.flagged, false),
      ),
    )
    .orderBy(asc(reflections.createdAt));

  const distinctAuthors = new Set<string>();
  const nameByAuthor = new Map<string, string>();
  const entries = rows.map((row) => {
    distinctAuthors.add(row.authorId);
    const name = row.authorName ?? "Reader";
    nameByAuthor.set(row.authorId, name);
    return { authorDisplayName: name, text: row.body };
  });
  return {
    authorCount: distinctAuthors.size,
    entries,
    authorNames: [...nameByAuthor.values()],
  };
}

/**
 * Keep only overlap names that match a real reflection author for the day
 * (case-insensitive), returning the author's stored casing. The model is told
 * to use the exact names, but the avatar chips must never name a member who did
 * not actually reflect — this is the client-side guard behind that.
 */
function validateOverlapMembers(
  claimed: string[],
  authorNames: string[],
): string[] {
  const byLower = new Map(authorNames.map((name) => [name.toLowerCase(), name]));
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const name of claimed) {
    const match = byLower.get(name.trim().toLowerCase());
    if (match && !seen.has(match)) {
      seen.add(match);
      kept.push(match);
    }
  }
  return kept;
}

/**
 * Generate and post one circle's daily digest.
 *
 * Never throws — the sweep must survive one circle's failure. Returns a
 * DigestOutcome the sweep reports and (on `reason: "error"`) uses to release the
 * agent_runs claim so a later sweep can retry.
 */
export async function runCircleDigest(circleId: string): Promise<DigestOutcome> {
  const dayNumber = await resolveCurrentDay(circleId);
  if (dayNumber === null) {
    return { posted: false, reason: "no_reflections", detail: "no reflections yet" };
  }

  const [facts, dayReflections, planDay] = await Promise.all([
    loadCircleFacts(circleId),
    loadDayReflections(circleId, dayNumber),
    loadCirclePlanDay(circleId, dayNumber),
  ]);

  const required = requiredReflectionAuthors(facts.memberCount);
  if (dayReflections.authorCount < required) {
    return {
      posted: false,
      reason: "below_threshold",
      detail: `below threshold (${dayReflections.authorCount}/${facts.memberCount}, need ${required})`,
    };
  }
  if (!planDay) {
    // The day has reflections but is not in the circle's plan — nothing to
    // ground a digest in. Treat as a no-op, not an error.
    return { posted: false, reason: "no_reflections", detail: "day not in plan" };
  }

  // Claim the (circle, day) slot BEFORE the Gloo call. A re-run — or a later
  // sweep still on this day — conflicts here and spends nothing.
  const [claim] = await db
    .insert(digests)
    .values({
      circleId,
      dayNumber: planDay.dayNumber,
      reference: planDay.reference,
      label: planDay.label,
      language: facts.language,
    })
    .onConflictDoNothing({ target: [digests.circleId, digests.dayNumber] })
    .returning({ id: digests.id });
  if (!claim) {
    return {
      posted: false,
      reason: "already_posted",
      detail: `digest already exists for ${planDay.label}`,
    };
  }

  try {
    const passage = await fetchPassage(
      planDay.reference,
      effectiveVersionId(facts.language, null),
      { format: "text" },
    );

    const passageText = passage.content.slice(0, MAX_PASSAGE_CHARS);
    const { digest, model } = await generateDigest({
      passageReference: planDay.reference,
      passageText,
      reflections: dayReflections.entries,
      language: facts.language,
    });

    // Drop any hallucinated names so the callout can only chip real authors.
    // An overlap needs at least two real members — one surviving name is not a
    // convergence, so collapse it to "no overlap".
    const validated = validateOverlapMembers(
      digest.overlap.members,
      dayReflections.authorNames,
    );
    const overlapMembers = validated.length >= 2 ? validated : [];
    const overlapTheme = overlapMembers.length >= 2 ? digest.overlap.theme : null;

    // The lesson summary (Step 25) runs in this same sweep, under this row's
    // (circle, day) fence — no separate run key. "Themes the circle raised" are
    // taken from the digest just generated: its synthesis plus the shared theme
    // are the freshest distilled articulation of what the circle noticed today.
    // Generated BEFORE anything is posted so the digest and its summary ship
    // atomically — a summary failure below releases the claim and both
    // regenerate on the next sweep, never leaving a digest without a summary.
    const circleThemes = [digest.synthesis, overlapTheme].filter(
      (theme): theme is string => Boolean(theme),
    );
    const { summary } = await generateSummary({
      passageReference: planDay.reference,
      passageText,
      circleThemes,
      language: facts.language,
    });

    // The thread post carries a readable rendering of the digest in its body
    // too: it keeps the post meaningful if the digests row is ever unavailable,
    // and gives a message-centric consumer plain text to read. authorId null so
    // it renders with Round's system identity.
    const [message] = await db
      .insert(messages)
      .values({
        circleId,
        authorId: null,
        body: buildDigestBody(
          digest.synthesis,
          overlapMembers,
          overlapTheme,
          digest.question,
        ),
        sourceLanguage: facts.language,
        kind: "digest",
        dayNumber: planDay.dayNumber,
        dayLabel: planDay.label,
      })
      .returning({ id: messages.id });

    await db
      .update(digests)
      .set({
        synthesis: digest.synthesis,
        overlapMembers,
        overlapTheme,
        question: digest.question,
        summary,
        model,
        messageId: message.id,
      })
      .where(eq(digests.id, claim.id));

    // Step 28 — one native generation per OTHER member language. The overlap
    // MEMBER names are reused as-is (display names, language-independent); only
    // the theme phrase, synthesis, question, and summary are regenerated in the
    // reader's language. Each variant is best-effort: a failure leaves the base
    // digest standing rather than releasing the whole day's claim.
    await generateDigestVariants({
      messageId: message.id,
      baseLanguage: facts.language,
      circleId,
      passageReference: planDay.reference,
      passageText,
      reflections: dayReflections.entries,
      overlapMembers,
      baseOverlapTheme: overlapTheme,
    });

    return { posted: true, detail: `digest posted for ${planDay.label}` };
  } catch (error) {
    // Release the claim so a later sweep can retry — the (circle, day) unique
    // index still prevents a duplicate if a partial run ever raced.
    await db
      .delete(digests)
      .where(eq(digests.id, claim.id))
      .catch(() => {
        // Nothing more to do — the day keeps its (empty) claim.
      });
    return {
      posted: false,
      reason: "error",
      detail: `generation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

interface DigestVariantsInput {
  messageId: string;
  /** The base post's own language — skipped; it already lives on the base rows. */
  baseLanguage: string;
  circleId: string;
  passageReference: string;
  passageText: string;
  reflections: { authorDisplayName: string; text: string }[];
  /** Validated overlap member names, reused for every language (chips). */
  overlapMembers: string[];
  /** The base-language theme phrase, used as a fallback if a variant omits one. */
  baseOverlapTheme: string | null;
}

/**
 * Generate and store one native digest+summary variant per distinct member
 * language other than the base. Each language is independent and best-effort: a
 * failure is swallowed so one language never robs another (or the base post) of
 * its digest. The (message, language) primary key makes a re-run idempotent —
 * the digest's own (circle, day) claim already gates the whole run, so this only
 * ever executes once per digest.
 */
async function generateDigestVariants(input: DigestVariantsInput): Promise<void> {
  const languages = await loadCircleMemberLanguages(input.circleId);
  const hasOverlap = input.overlapMembers.length >= 2;

  for (const language of languages) {
    if (language === input.baseLanguage) continue;
    try {
      const { digest, model } = await generateDigest({
        passageReference: input.passageReference,
        passageText: input.passageText,
        reflections: input.reflections,
        language,
      });
      // Reuse the base overlap decision; only the theme phrase is taken in the
      // reader's language (falling back to the base phrase if the model omitted
      // one). Overlap names come from the base row at render time.
      const overlapTheme = hasOverlap
        ? (digest.overlap.theme || input.baseOverlapTheme)
        : null;
      const circleThemes = [digest.synthesis, overlapTheme].filter(
        (theme): theme is string => Boolean(theme),
      );
      const { summary } = await generateSummary({
        passageReference: input.passageReference,
        passageText: input.passageText,
        circleThemes,
        language,
      });

      await db
        .insert(messageVariants)
        .values({
          messageId: input.messageId,
          language,
          body: buildDigestBody(
            digest.synthesis,
            input.overlapMembers,
            overlapTheme,
            digest.question,
          ),
          synthesis: digest.synthesis,
          overlapTheme,
          question: digest.question,
          summary,
          model,
        })
        .onConflictDoNothing({
          target: [messageVariants.messageId, messageVariants.language],
        });
    } catch {
      // Best-effort: this reader falls back to the base-language digest.
    }
  }
}
