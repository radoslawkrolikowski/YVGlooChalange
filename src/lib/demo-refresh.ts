// Demo freshness and anonymous data pruning — Step 31.
//
// The daily job that keeps the public demo circle (Step 30) alive *today* and
// keeps anonymous-session data from outliving its session. Two independent
// pieces of work, both riding the Step 23 cron rail (src/lib/cron-sweeps.ts):
//
//   1. PRUNE — delete every anonymous-session row older than the PREVIOUS
//      refresh (the cutoff is stored in app_meta, written at the end of each
//      run). Deliberately not "everything anonymous right now": a visitor who
//      is mid-session when the 05:00 UTC cron fires must never watch their own
//      reflection vanish from the thread. The Agent Console's Step 30A
//      "Prune anonymous data" button is the immediate, cutoff-of-now variant.
//      This piece runs even when the demo circle has not been seeded, because
//      anonymous prayers, highlights and notifications exist without it.
//
//   2. REFRESH — re-date the demo circle's seeded content so its timestamps
//      read as today, then regenerate that circle's conversation starters and
//      its digest + lesson summary through REAL Gloo calls, so the wording
//      varies day to day and the demo doubles as a standing live integration
//      test of the agent pipeline (Decisions → Instant Access demo circle
//      freshness).
//
// What counts as "seeded content" for re-dating: posts in the demo circle that
// are Round's own system cards (authorId and anonSessionId both null) or are
// authored by a bot user (users.is_bot). A REAL person's messages are never
// re-dated — rewriting a human's timestamps would be a lie about their history
// — and anonymous rows are never re-dated either, because their age is exactly
// what the prune above is measuring.
//
// Regeneration is delete-then-generate: the digests and conversation_starters
// (circle, day) unique indexes are idempotency fences that would otherwise
// refuse a second generation for the same day, so the previous day's card is
// removed first and the ordinary Step 20/24/25 orchestrators are then run
// unchanged — which means the per-language native variants of Step 28 come
// along for free. If a regeneration fails the sweep releases its agent_runs
// claim and the next run retries; the daily Facilitator sweep is a second
// safety net, since a missing digest is exactly what it exists to post.

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  appMeta,
  conversationStarters,
  digests,
  messages,
  reflections,
  users,
} from "@/db/schema";
import {
  pruneAnonSessionData,
  totalPruned,
  type AnonPruneCounts,
} from "@/lib/anon-prune";
import { loadResponderBotId } from "@/lib/circle-bot";
import { loadCirclePlanDay } from "@/lib/circles";
import { runCircleDigest } from "@/lib/digest";
import { postConversationStarters } from "@/lib/post-reading";

/** app_meta key holding the ISO timestamp of the last completed anon prune. */
export const ANON_PRUNE_MARKER_KEY = "demo_anon_pruned_at";
/** Cutoff used on the very first run, before any marker exists: one interval. */
const DEFAULT_PRUNE_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * Where the newest re-dated seed post lands relative to "now". The starters and
 * digest regenerated immediately afterwards are stamped with the real current
 * time, so this gap is what keeps the thread's chronology natural: seeded
 * hello and reflections earlier today, Round's fresh cards at the end.
 */
const SEED_TAIL_GAP_MS = 90 * 60 * 1000;
/** Language fallback when the bot has no profile language set. */
const FALLBACK_LANGUAGE = "en";

// --- 1. Anonymous prune ----------------------------------------------------

export interface AnonPruneOutcome {
  /** The cutoff actually used — the previous refresh, or one window back. */
  cutoff: Date;
  counts: AnonPruneCounts;
  total: number;
}

/** ISO timestamp of the previous refresh, or null when there has been none. */
async function loadPreviousPruneAt(): Promise<Date | null> {
  const [row] = await db
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, ANON_PRUNE_MARKER_KEY));
  if (!row) return null;
  const parsed = new Date(row.value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Delete anonymous-session data older than the previous refresh, then record
 * this refresh as the new cutoff. Every anon-owned table is covered — the
 * Step 30A helper is the single place that knows the full list — so reflections,
 * thread messages, in-app highlights, saved prayers and notifications all go in
 * one pass. Content owned by a users row (the seeded bot members, any real
 * signed-in member) is structurally out of reach: every filter there requires a
 * non-null session id.
 */
export async function pruneAnonymousSessions(
  now: Date = new Date(),
): Promise<AnonPruneOutcome> {
  const previous = await loadPreviousPruneAt();
  const cutoff = previous ?? new Date(now.getTime() - DEFAULT_PRUNE_WINDOW_MS);

  const counts = await pruneAnonSessionData(cutoff);

  const stamp = now.toISOString();
  await db
    .insert(appMeta)
    .values({ key: ANON_PRUNE_MARKER_KEY, value: stamp })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: stamp, updatedAt: now },
    });

  return { cutoff, counts, total: totalPruned(counts) };
}

// --- 2. Demo circle refresh ------------------------------------------------

export interface DemoRefreshOutcome {
  /** What the run did, for the console line. */
  detail: string;
  /** True when a Gloo regeneration failed — the sweep releases its claim. */
  errored: boolean;
}

/** The demo's bot member ids — the authors whose content is seed content. */
async function loadBotIds(): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isBot, true));
  return rows.map((row) => row.id);
}

/**
 * "Authored by Round or by a bot": null author (a system card) or one of the
 * seeded bot users. With no bots seeded it collapses to system cards only —
 * `inArray` with an empty list is not a condition worth building.
 */
function seedAuthored(
  column: typeof messages.authorId | typeof reflections.authorId,
  botIds: string[],
): SQL | undefined {
  return botIds.length > 0
    ? or(isNull(column), inArray(column, botIds))
    : isNull(column);
}

interface RedateResult {
  /** Seconds every seed row moved forward; 0 when nothing needed moving. */
  shiftedSeconds: number;
  messages: number;
  reflections: number;
}

/**
 * Move the circle's seeded content forward in time as one block, so the newest
 * seed post lands SEED_TAIL_GAP_MS before now and the relative spacing between
 * posts (hello, then reflections) is preserved exactly. A single shared delta,
 * never per-row rewriting: the conversation must still read in the order it was
 * written. Nothing moves backwards — if the content is already newer than the
 * target (a same-day re-run that slipped past the claim) the shift is skipped.
 */
async function redateSeedContent(
  circleId: string,
  botIds: string[],
  now: Date,
): Promise<RedateResult> {
  const messageFilter = and(
    eq(messages.circleId, circleId),
    isNull(messages.anonSessionId),
    seedAuthored(messages.authorId, botIds),
  );

  const [newest] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(messageFilter)
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!newest) return { shiftedSeconds: 0, messages: 0, reflections: 0 };

  const deltaMs = now.getTime() - SEED_TAIL_GAP_MS - newest.createdAt.getTime();
  if (deltaMs <= 0) return { shiftedSeconds: 0, messages: 0, reflections: 0 };
  const shiftedSeconds = Math.round(deltaMs / 1000);
  const shift = (column: AnyColumn) =>
    sql`${column} + make_interval(secs => ${shiftedSeconds}::double precision)`;

  const movedMessages = await db
    .update(messages)
    .set({ createdAt: shift(messages.createdAt) })
    .where(messageFilter)
    .returning({ id: messages.id });

  // The reflections rows behind those posts move by the same delta, so the
  // canonical record and the thread never disagree about when a reflection was
  // written. Flagged reflections (no message row) are covered by the same
  // filter — they are private, but their author should still see today's date.
  const movedReflections = await db
    .update(reflections)
    .set({ createdAt: shift(reflections.createdAt) })
    .where(
      and(
        eq(reflections.circleId, circleId),
        isNull(reflections.anonSessionId),
        seedAuthored(reflections.authorId, botIds),
      ),
    )
    .returning({ id: reflections.id });

  return {
    shiftedSeconds,
    messages: movedMessages.length,
    reflections: movedReflections.length,
  };
}

/**
 * Remove the circle's most recent digest so it can be regenerated. The digests
 * (circle, day) unique index is an idempotency fence — without this the fresh
 * generation would lose the race against yesterday's row and spend no Gloo call
 * at all. Deleting the thread message cascades its per-language variants.
 */
async function clearLatestDigest(circleId: string): Promise<number | null> {
  const [row] = await db
    .select({
      id: digests.id,
      dayNumber: digests.dayNumber,
      messageId: digests.messageId,
    })
    .from(digests)
    .where(eq(digests.circleId, circleId))
    .orderBy(desc(digests.dayNumber))
    .limit(1);
  if (!row) return null;

  await db.delete(digests).where(eq(digests.id, row.id));
  if (row.messageId) {
    await db.delete(messages).where(eq(messages.id, row.messageId));
  }
  return row.dayNumber;
}

/** The same, for the conversation-starters card and its (circle, day) fence. */
async function clearLatestStarters(circleId: string): Promise<number | null> {
  const [row] = await db
    .select({
      id: conversationStarters.id,
      dayNumber: conversationStarters.dayNumber,
      messageId: conversationStarters.messageId,
    })
    .from(conversationStarters)
    .where(eq(conversationStarters.circleId, circleId))
    .orderBy(desc(conversationStarters.dayNumber))
    .limit(1);
  if (!row) return null;

  await db.delete(conversationStarters).where(eq(conversationStarters.id, row.id));
  if (row.messageId) {
    await db.delete(messages).where(eq(messages.id, row.messageId));
  }
  return row.dayNumber;
}

/** The bot member whose reading "opens" the day, and the language it reads in. */
async function loadRefreshAuthor(): Promise<{
  userId: string;
  language: string;
  bibleVersionId: number | null;
} | null> {
  const botId = await loadResponderBotId();
  if (!botId) return null;
  const [row] = await db
    .select({ language: users.language, bibleVersionId: users.bibleVersionId })
    .from(users)
    .where(eq(users.id, botId));
  if (!row) return null;
  return {
    userId: botId,
    language: row.language ?? FALLBACK_LANGUAGE,
    bibleVersionId: row.bibleVersionId,
  };
}

/** "22h" / "45m" — how far the seed content moved, for the console line. */
function formatShift(seconds: number): string {
  return seconds >= 3600
    ? `${Math.round(seconds / 3600)}h`
    : `${Math.max(1, Math.round(seconds / 60))}m`;
}

/**
 * Re-date and regenerate one demo circle. Never throws — the sweep must survive
 * a bad day at Gloo — and reports `errored` so the sweep can release its claim
 * and let the next run retry.
 */
export async function refreshDemoCircle(
  circleId: string,
  now: Date = new Date(),
): Promise<DemoRefreshOutcome> {
  const parts: string[] = [];
  let errored = false;

  try {
    const botIds = await loadBotIds();

    // Clear the previous cards BEFORE re-dating: the day numbers they carry are
    // what the fresh generations are keyed to, and their own timestamps are
    // about to be replaced by real ones anyway.
    const startersDay = await clearLatestStarters(circleId);
    const digestDay = await clearLatestDigest(circleId);

    const redated = await redateSeedContent(circleId, botIds, now);
    if (redated.shiftedSeconds > 0) {
      parts.push(
        `re-dated ${redated.messages} posts and ${redated.reflections} reflections (+${formatShift(redated.shiftedSeconds)})`,
      );
    } else {
      parts.push("timestamps already current");
    }

    // Fresh conversation starters for the day the circle is reading. Grounded
    // exactly as any member's "finished reading" would ground them (Step 20).
    const author = await loadRefreshAuthor();
    if (author && startersDay !== null) {
      const day = await loadCirclePlanDay(circleId, startersDay);
      const messageId = await postConversationStarters({
        userId: author.userId,
        circleId,
        dayNumber: startersDay,
        language: author.language,
        bibleVersionId: author.bibleVersionId,
      });
      if (messageId) {
        parts.push(`starters regenerated (${day?.label ?? `day ${startersDay}`})`);
      } else {
        errored = true;
        parts.push("starters regeneration failed");
      }
    } else if (startersDay === null) {
      parts.push("no starters card to refresh");
    } else {
      parts.push("no seeded bot member — starters skipped");
    }

    // Fresh digest + lesson summary from the circle's own reflections. The
    // Facilitator resolves the current day itself; `digestDay` is only reported.
    const digest = await runCircleDigest(circleId);
    if (digest.posted) {
      parts.push(digest.detail);
    } else {
      if (digest.reason === "error") errored = true;
      parts.push(
        digestDay === null
          ? `no digest (${digest.detail})`
          : `digest not regenerated (${digest.detail})`,
      );
    }
  } catch (error) {
    errored = true;
    parts.push(
      `refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { detail: parts.join(" · "), errored };
}
