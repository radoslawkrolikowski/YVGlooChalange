// Notification bell — read side (Step 29) and the event-driven reply
// notification (Step 30A).
//
// The header bell polls this data: an owner's recent notifications and their
// unread count. Written by the daily Reminder sweep (src/lib/reminders.ts,
// Path A only) and by notifyThreadReply below; read here for the bell + list UI
// and marked read when the bell is opened.
//
// Step 30A makes the read side owner-scoped (src/lib/session-owner.ts), so an
// anonymous Instant Access session sees its own session-scoped notifications
// through the same queries a signed-in user does. Nothing is persisted past the
// session: anonymous rows carry no user id and are pruned on the Step 31 rail.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { messageTranslations, notifications, users } from "@/db/schema";
import {
  ownerColumns,
  ownerWhere,
  type SessionOwner,
} from "@/lib/session-owner";

/** How many notifications the bell list shows — newest first. */
const LIST_LIMIT = 30;

/** One notification as the bell renders it. */
export interface NotificationItem {
  id: string;
  /** "reading", "messages", or "reply" — drives the type icon. */
  type: string;
  title: string;
  body: string;
  /** Human-readable passage/circle label, or null. */
  label: string | null;
  /** Missed passage USFM reference (reading reminders), or null. */
  reference: string | null;
  /** The circle it is about, or null. */
  circleId: string | null;
  /** False until the user opens the bell. */
  read: boolean;
  /** ISO timestamp — the client formats the relative label. */
  createdAt: string;
}

export interface NotificationFeed {
  items: NotificationItem[];
  /** Unread count for the bell badge. */
  unreadCount: number;
}

/** An owner's recent notifications plus their unread count. */
export async function loadNotifications(
  owner: SessionOwner,
): Promise<NotificationFeed> {
  const scope = ownerWhere(
    notifications.userId,
    notifications.anonSessionId,
    owner,
  );

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      label: notifications.label,
      reference: notifications.reference,
      circleId: notifications.circleId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(scope)
    .orderBy(desc(notifications.createdAt))
    .limit(LIST_LIMIT);

  const items: NotificationItem[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    label: row.label,
    reference: row.reference,
    circleId: row.circleId,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));

  const [count] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(scope, isNull(notifications.readAt)));

  return { items, unreadCount: count?.unread ?? 0 };
}

/**
 * Mark all of an owner's unread notifications read (the bell was opened). Only
 * touches unread rows so readAt records the FIRST time each was seen, not the
 * last. Returns the fresh feed for the caller to hand straight back.
 */
export async function markNotificationsRead(
  owner: SessionOwner,
): Promise<NotificationFeed> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        ownerWhere(notifications.userId, notifications.anonSessionId, owner),
        isNull(notifications.readAt),
      ),
    );
  return loadNotifications(owner);
}

// --- Reply notifications (Step 30A) ---------------------------------------
//
// The only in-session notification source a demo visitor can actually trigger:
// the public circle's bot member answering their post. Event-driven rather than
// scheduled, so it rides no cron rail — it is written by src/lib/circle-bot.ts
// after the reply lands, inside the same `after()` background work.
//
// Deliberately NOT a Gloo call: the notification carries the bot's own reply,
// which was already generated live (and logged) one step earlier, in the
// recipient's language whenever Step 27 has produced that translation by the
// time we look. A second generation would spend a Gloo call to paraphrase text
// we are already holding.

/** How much of the reply the bell card previews. */
const REPLY_PREVIEW_CHARS = 180;

function preview(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= REPLY_PREVIEW_CHARS
    ? clean
    : `${clean.slice(0, REPLY_PREVIEW_CHARS - 1)}…`;
}

/**
 * Notify the author of `triggerMessageId` that the circle's bot member replied.
 * Works for either path: a signed-in member gets a user-scoped row, an Instant
 * Access visitor a session-scoped one. Never throws — a missing notification
 * must never cost the reply that earned it. Idempotent through the
 * (owner, type, period_key) unique fence, with period_key = "reply:<reply id>".
 */
export async function notifyThreadReply(input: {
  circleId: string;
  /** The bot's reply message — its body is the notification's text. */
  replyMessageId: string;
  replyBody: string;
  /** Language the reply was written in. */
  replyLanguage: string;
  /** The post being answered — its author is the recipient. */
  triggerAuthorId: string | null;
  triggerAnonSessionId: string | null;
  /** The recipient's language, best known — picks the translated variant. */
  recipientLanguage: string | null;
  /** Display name of the bot, for the card's title. */
  botName: string;
}): Promise<boolean> {
  try {
    const owner: SessionOwner | null = input.triggerAuthorId
      ? { kind: "user", userId: input.triggerAuthorId }
      : input.triggerAnonSessionId
        ? { kind: "anonymous", sessionId: input.triggerAnonSessionId }
        : null;
    // A system ("Round") post has no author to notify.
    if (!owner) return false;

    // Never notify a bot about a reply to its own persona content.
    if (owner.kind === "user") {
      const [author] = await db
        .select({ isBot: users.isBot })
        .from(users)
        .where(eq(users.id, owner.userId));
      if (author?.isBot) return false;
    }

    // Prefer the reader's own language: Step 27 writes the reply's translations
    // before this runs, so a member language is already covered. A language with
    // no variant yet falls back to the original — the thread itself is the
    // authoritative surface, and it swaps the translation in on the next poll.
    let body = input.replyBody;
    let language = input.replyLanguage;
    if (input.recipientLanguage && input.recipientLanguage !== language) {
      const [translated] = await db
        .select({ body: messageTranslations.body })
        .from(messageTranslations)
        .where(
          and(
            eq(messageTranslations.messageId, input.replyMessageId),
            eq(messageTranslations.targetLanguage, input.recipientLanguage),
          ),
        );
      if (translated) {
        body = translated.body;
        language = input.recipientLanguage;
      }
    }

    const inserted = await db
      .insert(notifications)
      .values({
        ...ownerColumns(owner),
        type: "reply",
        title: `${input.botName} replied to you`,
        body: preview(body),
        circleId: input.circleId,
        // The event is the fence, not a calendar day: one notification per
        // reply, however many times this runs.
        periodKey: `reply:${input.replyMessageId}`,
        language,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    return inserted.length > 0;
  } catch {
    // Best-effort background work — the reply is what matters.
    return false;
  }
}
