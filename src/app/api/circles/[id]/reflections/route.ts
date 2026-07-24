import { after, NextResponse } from "next/server";
import { maybeBotReply } from "@/lib/circle-bot";
import {
  isCircleMember,
  isPublicCircle,
  loadCirclePlanDay,
  loadThreadMessages,
} from "@/lib/circles";
import { submitReflection } from "@/lib/reflections";
import { GlooApiError } from "@/lib/gloo";
import { resolveSession, type Session } from "@/lib/session";
import { translateNewMessage } from "@/lib/translation";

export const dynamic = "force-dynamic";

// Step 19: reflection submission through the Escalation gate. Step 30 opens it
// to anonymous Instant Access sessions for the PUBLIC demo circle only.
//
// POST appends one reflection for a plan day. The Escalation Agent runs first,
// synchronously, inside submitReflection() — before anything is stored or
// posted. Unflagged reflections post to the thread as a day-tagged reflection
// card; flagged ones are stored privately (never posted) and the response
// carries the crisis resources for the author's support card. A member reflects
// in their own circle; an anonymous session reflects in the public circle,
// tagged with its session id + "Reader #n" name (brief §7 — no users row).

const MAX_BODY_LENGTH = 4000;

/** The author identity to stamp on a reflection, derived from the session. */
interface ReflectionAuthor {
  authorId: string | null;
  anonSessionId: string | null;
  anonName: string | null;
  language: string | null;
}

async function requireThreadAccess(
  request: Request,
  circleId: string,
): Promise<
  | { error: NextResponse }
  | { session: Session; author: ReflectionAuthor }
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
      { ok: false, error: "A reflection is required" },
      { status: 400 },
    );
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "That reflection is too long" },
      { status: 400 },
    );
  }

  const dayNumber = body.dayNumber;
  if (!Number.isInteger(dayNumber) || (dayNumber as number) < 1) {
    return NextResponse.json(
      { ok: false, error: "dayNumber must be a positive integer" },
      { status: 400 },
    );
  }

  // Resolve the plan day from the circle's own plan — the client never dictates
  // the reference/label, so a reflection can only ever be tagged to a real day
  // of the circle's plan.
  const day = await loadCirclePlanDay(circleId, dayNumber as number);
  if (!day) {
    return NextResponse.json(
      { ok: false, error: "That plan day does not exist for this circle" },
      { status: 400 },
    );
  }

  try {
    const result = await submitReflection({
      circleId,
      authorId: author.authorId,
      anonSessionId: author.anonSessionId,
      anonName: author.anonName,
      sourceLanguage: author.language ?? null,
      dayNumber: day.dayNumber,
      reference: day.reference,
      label: day.label,
      body: text,
    });

    if (result.flagged) {
      // Never posted — no thread returned. The author gets the support card;
      // other members' thread views show no trace of this reflection.
      return NextResponse.json({
        ok: true,
        flagged: true,
        resources: result.resources,
      });
    }

    // A reflection is member-authored content, so it is translated like any
    // message (Step 27): async, post-response, so the Gloo fan-out never blocks.
    // The public circle's bot member may also reply to it (Step 30).
    if (result.messageId) {
      const reflectionMessageId = result.messageId;
      after(() => translateNewMessage(reflectionMessageId));
      after(() => maybeBotReply(circleId, reflectionMessageId));
    }

    // Unflagged: return the fresh thread so the poster sees their reflection
    // immediately, without waiting for the next poll interval — in their language.
    const messageList = await loadThreadMessages(circleId, session.language);
    return NextResponse.json({
      ok: true,
      flagged: false,
      messages: messageList,
    });
  } catch (error) {
    // Fail safe: the Escalation gate could not produce a verdict, so nothing
    // was stored or posted. Tell the author to try again rather than letting
    // an unscreened reflection through.
    if (error instanceof GlooApiError) {
      return NextResponse.json(
        { ok: false, error: "Your reflection could not be checked. Please try again." },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Your reflection could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
