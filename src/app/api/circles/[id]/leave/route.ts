import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { circleMembers } from "@/db/schema";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 30: leave a circle (Path A only). Removes the member's circle_members
// row so they can join another circle — a user belongs to at most one circle
// (the one-per-user unique index), so leaving is the prerequisite for joining a
// different one, including the public demo circle. Idempotent: not a member →
// still ok. The member's reading plan is left untouched (they keep reading);
// only the membership is dropped. Anonymous sessions have no membership row and
// never reach this route.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }
  if (session.kind !== "user") {
    return NextResponse.json(
      { ok: false, error: "Circles require a YouVersion account" },
      { status: 403 },
    );
  }

  const { id: circleId } = await params;
  await db
    .delete(circleMembers)
    .where(
      and(
        eq(circleMembers.circleId, circleId),
        eq(circleMembers.userId, session.userId),
      ),
    );

  return NextResponse.json({ ok: true });
}
