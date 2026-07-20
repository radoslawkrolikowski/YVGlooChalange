import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { isCircleMember, loadThreadMessages } from "@/lib/circles";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 17: the circle thread's read/write endpoint (Path A only).
//
// GET returns the circle's messages oldest-first; the client polls it every 10
// seconds while the tab is visible (Decisions → polling). POST appends one
// message — the original body is written once and never modified (brief §5.12).
// Both are gated on membership: circles are a signed-in feature (anonymous
// Instant Access sessions join the demo circle in Step 30), and only a member
// may read or post to a circle's thread.

const MAX_BODY_LENGTH = 4000;

/** Resolve the requester and confirm they may touch this circle's thread. */
async function requireMember(request: Request, circleId: string) {
  const session = await resolveSession(request);
  if (!session) {
    return {
      error: NextResponse.json(
        { ok: false, error: "No valid session" },
        { status: 401 },
      ),
    };
  }
  if (session.kind !== "user") {
    return {
      error: NextResponse.json(
        { ok: false, error: "Circles require a YouVersion account" },
        { status: 403 },
      ),
    };
  }
  if (!(await isCircleMember(session.userId, circleId))) {
    return {
      error: NextResponse.json(
        { ok: false, error: "You are not a member of this circle" },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: circleId } = await params;
  const guard = await requireMember(request, circleId);
  if (guard.error) return guard.error;

  const messageList = await loadThreadMessages(circleId);
  return NextResponse.json({ ok: true, messages: messageList });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: circleId } = await params;
  const guard = await requireMember(request, circleId);
  if (guard.error) return guard.error;
  const { session } = guard;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0) {
    return NextResponse.json(
      { ok: false, error: "A message is required" },
      { status: 400 },
    );
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "That message is too long" },
      { status: 400 },
    );
  }

  // Source language is filled best-effort from the author's profile language;
  // the Translation Agent (Step 19+) is what detects and translates. Storing
  // the original is a one-time insert — the body is never modified after this.
  const [inserted] = await db
    .insert(messages)
    .values({
      circleId,
      authorId: session.userId,
      body: text,
      sourceLanguage: session.language ?? null,
    })
    .returning({ id: messages.id });

  // Return the fresh thread so the poster sees their message immediately,
  // without waiting for the next poll interval.
  const messageList = await loadThreadMessages(circleId);
  return NextResponse.json({ ok: true, id: inserted.id, messages: messageList });
}
