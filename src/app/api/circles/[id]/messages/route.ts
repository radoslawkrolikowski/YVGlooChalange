import { after, NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { maybeBotReply } from "@/lib/circle-bot";
import {
  isCircleMember,
  isPublicCircle,
  loadCircleCurrentDay,
  loadThreadCircle,
  loadThreadMessages,
} from "@/lib/circles";
import { resolveSession, type Session } from "@/lib/session";
import { ensureReaderTranslations, translateNewMessage } from "@/lib/translation";

export const dynamic = "force-dynamic";

// Step 17: the circle thread's read/write endpoint. Step 30 opens it to
// anonymous Instant Access sessions for the PUBLIC demo circle only.
//
// GET returns the circle's messages oldest-first; the client polls it every 10
// seconds while the tab is visible (Decisions → polling). POST appends one
// message — the original body is written once and never modified (brief §5.12).
// Access: a signed-in member may read/post to their own circle; an anonymous
// session may read/post to the public circle (Step 30) and nothing else. An
// anonymous post carries the session id + "Reader #n" name instead of an
// authorId (brief §7 — no users row).

const MAX_BODY_LENGTH = 4000;

/** The author identity to stamp on a post, derived from the session. */
interface ThreadAuthor {
  authorId: string | null;
  anonSessionId: string | null;
  anonName: string | null;
  language: string | null;
}

/**
 * Resolve the requester and confirm they may touch this circle's thread.
 * A member (Path A) may touch their own circle; an anonymous session (Path B)
 * may touch only the public demo circle.
 */
async function requireThreadAccess(
  request: Request,
  circleId: string,
): Promise<
  | { error: NextResponse }
  | { session: Session; author: ThreadAuthor }
> {
  const session = await resolveSession(request);
  if (!session) {
    return {
      error: NextResponse.json(
        { ok: false, error: "No valid session" },
        { status: 401 },
      ),
    };
  }

  if (session.kind === "user") {
    if (!(await isCircleMember(session.userId, circleId))) {
      return {
        error: NextResponse.json(
          { ok: false, error: "You are not a member of this circle" },
          { status: 403 },
        ),
      };
    }
    return {
      session,
      author: {
        authorId: session.userId,
        anonSessionId: null,
        anonName: null,
        language: session.language,
      },
    };
  }

  // Anonymous session: the public demo circle is the only one it may join.
  if (!(await isPublicCircle(circleId))) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Circles require a YouVersion account" },
        { status: 403 },
      ),
    };
  }
  return {
    session,
    author: {
      authorId: null,
      anonSessionId: session.sessionId,
      anonName: session.displayName,
      language: session.language,
    },
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: circleId } = await params;
  const access = await requireThreadAccess(request, circleId);
  if ("error" in access) return access.error;
  const { session } = access;

  // reflectionDay is included for anonymous callers (Path B has no server-
  // rendered thread page): the public circle's current day, so the composer can
  // offer reflection mode without a ?reflect param. Members get it from the
  // server-rendered page instead, but it is harmless to include here.
  const [circle, messageList, reflectionDay] = await Promise.all([
    loadThreadCircle(circleId),
    loadThreadMessages(circleId, session.language),
    loadCircleCurrentDay(circleId),
  ]);

  // Backfill translations into the reader's language for member-authored posts
  // that lack one — the path that lets an anonymous reader read the public
  // circle in a language no member speaks (Step 30). Async: the next poll swaps
  // the translation in. Harmless for members (their language is already covered).
  after(() => ensureReaderTranslations(circleId, session.language ?? null));

  return NextResponse.json({
    ok: true,
    circle,
    messages: messageList,
    reflectionDay,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: circleId } = await params;
  const access = await requireThreadAccess(request, circleId);
  if ("error" in access) return access.error;
  const { session, author } = access;

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
  // the Translation Agent detects and translates. Storing the original is a
  // one-time insert — the body is never modified after this.
  const [inserted] = await db
    .insert(messages)
    .values({
      circleId,
      authorId: author.authorId,
      anonSessionId: author.anonSessionId,
      anonName: author.anonName,
      body: text,
      sourceLanguage: author.language ?? null,
    })
    .returning({ id: messages.id });

  // Translate into each distinct circle-member language after the response, so
  // the Gloo fan-out never blocks the post (Decisions → asynchronous timing).
  after(() => translateNewMessage(inserted.id));
  // Step 30: the public circle's bot member may reply like a normal member. The
  // guards (bot circle, no self/bot trigger, cooldown, Escalation-first) all
  // live in maybeBotReply; the thread's poll swaps the reply in.
  after(() => maybeBotReply(circleId, inserted.id));

  // Return the fresh thread so the poster sees their message immediately,
  // without waiting for the next poll interval — in the poster's own language.
  const messageList = await loadThreadMessages(circleId, session.language);
  return NextResponse.json({ ok: true, id: inserted.id, messages: messageList });
}
