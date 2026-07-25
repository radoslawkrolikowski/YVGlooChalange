import { NextResponse } from "next/server";
import {
  loadNotifications,
  markNotificationsRead,
} from "@/lib/notifications";
import { resolveSession } from "@/lib/session";
import { sessionOwner } from "@/lib/session-owner";

export const dynamic = "force-dynamic";

// Step 29: the notification bell's data. Step 30A opens it to anonymous
// Instant Access sessions, whose notifications are session-scoped rows (no user
// row, pruned on the Step 31 rail) — so the bell surface works identically on
// both paths and the demo can show a live bot reply landing in it.
//
// GET  /api/notifications         → the caller's recent notifications + unread
//   count (the bell polls this).
// POST /api/notifications  { read: true } → mark all read (the bell was opened);
//   returns the fresh feed.
//
// A request with no session at all answers an empty feed rather than a 401 — a
// stray poll from a screen the visitor has already left stays quiet.

const EMPTY = { ok: true, items: [], unreadCount: 0 } as const;

export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) return NextResponse.json(EMPTY);
  const feed = await loadNotifications(sessionOwner(session));
  return NextResponse.json({ ok: true, ...feed });
}

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) return NextResponse.json(EMPTY);
  const feed = await markNotificationsRead(sessionOwner(session));
  return NextResponse.json({ ok: true, ...feed });
}
