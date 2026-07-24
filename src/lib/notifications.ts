// Notification bell — read side (Step 29).
//
// The header bell polls this data: a user's recent notifications and their
// unread count. Written by the Reminder sweep (src/lib/reminders.ts); read here
// for the bell + list UI and marked read when the user opens the bell. Path A
// only — Instant Access has no notifications (no database row, brief §7), so the
// API route answers an empty list for anonymous sessions.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

/** How many notifications the bell list shows — newest first. */
const LIST_LIMIT = 30;

/** One notification as the bell renders it. */
export interface NotificationItem {
  id: string;
  /** "reading" or "messages" — drives the type icon. */
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

/** A user's recent notifications plus their unread count. */
export async function loadNotifications(
  userId: string,
): Promise<NotificationFeed> {
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
    .where(eq(notifications.userId, userId))
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
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );

  return { items, unreadCount: count?.unread ?? 0 };
}

/**
 * Mark all of a user's unread notifications read (the bell was opened). Only
 * touches unread rows so readAt records the FIRST time each was seen, not the
 * last. Returns the fresh feed for the caller to hand straight back.
 */
export async function markNotificationsRead(
  userId: string,
): Promise<NotificationFeed> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return loadNotifications(userId);
}
