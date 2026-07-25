// Anonymous-session data pruning — Step 30A.
//
// Everything an Instant Access visitor creates is a row tagged with their
// anonymous session id and nothing else: reflections and thread messages
// (Step 30), and in-app highlights, saved prayers and notifications (Step 30A).
// Closing the browser already makes all of it unreachable — the signed token
// that names the session lives only in sessionStorage — but "no data persisted
// between sessions" is a promise about the database too, so it is deleted.
//
// This module is the single place that knows the full list of anon-owned
// tables, so nothing can be forgotten when the daily job calls it. Step 30A
// ships the helper and a dev trigger; Step 31 owns the scheduled sweep that
// runs it on the cron rail alongside the demo refresh. Seeded bot and human
// member content carries a users id, never a session id, so it is structurally
// out of reach of every delete here.

import { and, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  highlights,
  messages,
  notifications,
  reflections,
  savedPrayers,
} from "@/db/schema";

/** Rows deleted per table, for the caller to report. */
export interface AnonPruneCounts {
  reflections: number;
  messages: number;
  highlights: number;
  savedPrayers: number;
  notifications: number;
}

export function totalPruned(counts: AnonPruneCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

/**
 * Delete every anonymous-session row created before `cutoff`. Reflections go
 * first: their `message_id` points at a thread message, so clearing them before
 * the messages keeps the delete order honest rather than leaning on the
 * on-delete rule. Anything owned by a user row is untouched by construction —
 * every filter here requires a non-null session id.
 */
export async function pruneAnonSessionData(
  cutoff: Date,
): Promise<AnonPruneCounts> {
  const prunedReflections = await db
    .delete(reflections)
    .where(
      and(
        isNotNull(reflections.anonSessionId),
        lt(reflections.createdAt, cutoff),
      ),
    )
    .returning({ id: reflections.id });

  const prunedMessages = await db
    .delete(messages)
    .where(
      and(isNotNull(messages.anonSessionId), lt(messages.createdAt, cutoff)),
    )
    .returning({ id: messages.id });

  const prunedHighlights = await db
    .delete(highlights)
    .where(
      and(
        isNotNull(highlights.anonSessionId),
        lt(highlights.importedAt, cutoff),
      ),
    )
    .returning({ id: highlights.id });

  const prunedPrayers = await db
    .delete(savedPrayers)
    .where(
      and(
        isNotNull(savedPrayers.anonSessionId),
        lt(savedPrayers.createdAt, cutoff),
      ),
    )
    .returning({ id: savedPrayers.id });

  const prunedNotifications = await db
    .delete(notifications)
    .where(
      and(
        isNotNull(notifications.anonSessionId),
        lt(notifications.createdAt, cutoff),
      ),
    )
    .returning({ id: notifications.id });

  return {
    reflections: prunedReflections.length,
    messages: prunedMessages.length,
    highlights: prunedHighlights.length,
    savedPrayers: prunedPrayers.length,
    notifications: prunedNotifications.length,
  };
}
