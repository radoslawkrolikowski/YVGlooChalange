import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { loadUserCircle } from "@/lib/circles";
import { screenReflection } from "@/lib/escalation";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 26 — post a (confirmed, recast) prayer to the user's circle thread as a
// distinct member-authored `shared_prayer` card. Sharing is always explicit:
// the client shows the recast preview and a "your circle will see this" confirm
// before calling this.
//
// Escalation runs first, as on any circle-posted content — a flagged recast is
// never posted; the author gets the support card. The card is stored
// member-authored (authorId = the user), so Step 27's Translation Agent covers
// it for free once it ships.
//
// Circles are a signed-in feature (anonymous demo participation is Step 30), so
// only a member with a YouVersion account may share here.

const MAX_TEXT_LENGTH = 4000;

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No valid session" }, { status: 401 });
  }
  if (session.kind !== "user") {
    return NextResponse.json(
      { ok: false, error: "Sharing to a circle requires a YouVersion account" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length === 0) {
    return NextResponse.json({ ok: false, error: "A prayer is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ ok: false, error: "That prayer is too long" }, { status: 400 });
  }

  const circle = await loadUserCircle(session.userId);
  if (!circle) {
    return NextResponse.json(
      { ok: false, error: "You are not in a circle to share with" },
      { status: 400 },
    );
  }

  // Escalation first — never post a flagged prayer to the circle.
  try {
    const screen = await screenReflection({
      reflectionId: `shared-prayer-${crypto.randomUUID()}`,
      text,
    });
    if (screen.verdict.flagged) {
      return NextResponse.json({ ok: true, flagged: true, resources: screen.resources });
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Your prayer could not be checked. Please try again." },
      { status: 502 },
    );
  }

  await db.insert(messages).values({
    circleId: circle.id,
    authorId: session.userId,
    body: text,
    sourceLanguage: session.language ?? null,
    kind: "shared_prayer",
  });

  return NextResponse.json({ ok: true, flagged: false, circleId: circle.id });
}
