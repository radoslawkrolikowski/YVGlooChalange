// Step 10: server-side loader for a signed-in user's profile answers.
//
// Path A's answers live on the users row; unset fields fall back to
// PROFILE_DEFAULTS so form prefill and profile display match Path B's
// skip-with-defaults behaviour exactly.

import { eq } from "drizzle-orm";
import { PROFILE_DEFAULTS, type ProfileAnswers } from "@/config/profile";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function loadUserProfileAnswers(
  userId: string,
): Promise<ProfileAnswers> {
  const [row] = await db
    .select({
      goals: users.goals,
      motivation: users.motivation,
      bibleFamiliarity: users.bibleFamiliarity,
      lifeSeason: users.lifeSeason,
      timePerDayMinutes: users.timePerDayMinutes,
      topics: users.topics,
      topicsOther: users.topicsOther,
      circleHopes: users.circleHopes,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return PROFILE_DEFAULTS;

  return {
    goals: row.goals ?? PROFILE_DEFAULTS.goals,
    motivation: row.motivation ?? PROFILE_DEFAULTS.motivation,
    bibleFamiliarity: row.bibleFamiliarity ?? PROFILE_DEFAULTS.bibleFamiliarity,
    lifeSeason: row.lifeSeason ?? PROFILE_DEFAULTS.lifeSeason,
    timePerDayMinutes:
      row.timePerDayMinutes ?? PROFILE_DEFAULTS.timePerDayMinutes,
    topics: row.topics ?? PROFILE_DEFAULTS.topics,
    topicsOther: row.topicsOther ?? PROFILE_DEFAULTS.topicsOther,
    circleHopes: row.circleHopes ?? PROFILE_DEFAULTS.circleHopes,
  };
}
