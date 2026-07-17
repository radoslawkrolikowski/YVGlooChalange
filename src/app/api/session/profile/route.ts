import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  CIRCLE_HOPE_OPTIONS,
  FAMILIARITY_OPTIONS,
  isOptionValue,
  LIFE_SEASON_OPTIONS,
  MOTIVATION_OPTIONS,
  type ProfileAnswers,
  type ProfileOption,
  TIME_PER_DAY_OPTIONS,
  TOPIC_OPTIONS,
} from "@/config/profile";
import { db } from "@/db";
import { users } from "@/db/schema";
import { remintAnonProfile } from "@/lib/anon-session";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 10: persists the onboarding profile answers. Path A: written to the
// users row. Path B: a replacement signed token is minted and returned — the
// client swaps it into sessionStorage (same mechanism as /api/session/
// preferences). Server-side validation enforces the controlled vocabulary in
// src/config/profile.ts no matter what the client sends, so downstream
// consumers (circle matching, the PlanBuilder fallback pool) can rely on the
// stored values.

const MAX_GOALS_LENGTH = 500;
const MAX_TOPICS_OTHER_LENGTH = 100;

function freeText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > maxLength) return null;
  return value.trim();
}

function chipValue(value: unknown, options: ProfileOption[]): string | null | undefined {
  if (value === undefined || value === null) return null;
  return isOptionValue(options, value) ? value : undefined;
}

function chipValues(value: unknown, options: ProfileOption[]): string[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return undefined;
  const unique = [...new Set(value)];
  if (!unique.every((entry) => isOptionValue(options, entry))) return undefined;
  return unique as string[];
}

/** Returns validated answers, or null when anything is out of vocabulary. */
function parseAnswers(body: Record<string, unknown>): ProfileAnswers | null {
  const goals = freeText(body.goals, MAX_GOALS_LENGTH);
  const topicsOther = freeText(body.topicsOther, MAX_TOPICS_OTHER_LENGTH);
  const motivation = chipValue(body.motivation, MOTIVATION_OPTIONS);
  const bibleFamiliarity = chipValue(body.bibleFamiliarity, FAMILIARITY_OPTIONS);
  const lifeSeason = chipValue(body.lifeSeason, LIFE_SEASON_OPTIONS);
  const topics = chipValues(body.topics, TOPIC_OPTIONS);
  const circleHopes = chipValues(body.circleHopes, CIRCLE_HOPE_OPTIONS);
  const timePerDayMinutes =
    body.timePerDayMinutes === undefined || body.timePerDayMinutes === null
      ? null
      : (TIME_PER_DAY_OPTIONS as readonly number[]).includes(
            body.timePerDayMinutes as number,
          )
        ? (body.timePerDayMinutes as number)
        : undefined;

  if (
    goals === null ||
    topicsOther === null ||
    motivation === undefined ||
    bibleFamiliarity === undefined ||
    lifeSeason === undefined ||
    topics === undefined ||
    circleHopes === undefined ||
    timePerDayMinutes === undefined
  ) {
    return null;
  }

  return {
    goals,
    motivation,
    bibleFamiliarity,
    lifeSeason,
    timePerDayMinutes,
    topics,
    topicsOther,
    circleHopes,
  };
}

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const answers = parseAnswers(body);
  if (!answers) {
    return NextResponse.json(
      { ok: false, error: "One or more answers are not valid options" },
      { status: 400 },
    );
  }

  if (session.kind === "user") {
    await db.update(users).set(answers).where(eq(users.id, session.userId));
    return NextResponse.json({ ok: true, session });
  }

  const reminted = remintAnonProfile(session, answers);
  return NextResponse.json({
    ok: true,
    token: reminted.token,
    session: reminted.session,
  });
}
