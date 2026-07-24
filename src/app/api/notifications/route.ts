import { NextResponse } from "next/server";
import {
  loadNotifications,
  markNotificationsRead,
} from "@/lib/notifications";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 29: the notification bell's data.
//
// GET  /api/notifications         → this user's recent notifications + unread
//   count (the bell polls this).
// POST /api/notifications  { read: true } → mark all read (the bell was opened);
//   returns the fresh feed.
//
// Anonymous Instant Access sessions have no notifications (no database row, per
// the brief), so both handlers answer an empty feed rather than a 401 — the bell
// is not rendered for them anyway, and an empty feed keeps any stray poll quiet.

const EMPTY = { ok: true, items: [], unreadCount: 0 } as const;

export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session || session.kind !== "user") {
    return NextResponse.json(EMPTY);
  }
  const feed = await loadNotifications(session.userId);
  return NextResponse.json({ ok: true, ...feed });
}

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session || session.kind !== "user") {
    return NextResponse.json(EMPTY);
  }
  const feed = await markNotificationsRead(session.userId);
  return NextResponse.json({ ok: true, ...feed });
}
