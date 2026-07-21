// AI circle matching and its fallbacks — orchestration (Step 21).
//
// The third path into a circle, alongside create (Step 16) and browse: the
// user asks to be matched, this module gathers their Step 10 onboarding
// profile and a summary of every open circle, runs the Matching agent, and
// returns a proposal the user confirms before joining. The join itself stays
// on the existing /api/circles/[id]/join route, so the plan-switch prompt,
// size limits, and forming → active transition are enforced in exactly one
// place, whatever brought the user to the circle.
//
// The Decisions section fixes the fallbacks, and both are implemented here:
// - An imperfect match is still offered, with an honest explanation. If Gloo
//   itself is unavailable, the proposal falls back to the longest-standing
//   open circle with a plainly worded explanation that does not pretend to be
//   a considered match — the user still gets somewhere to go.
// - Zero open circles creates a `forming` circle immediately with the user as
//   founding member. Queuing was rejected: a waiting user is a dead end.
//
// Circle summaries carry controlled-vocabulary labels only — never another
// member's free-text goals, and never any reading progress, pace, or
// completion (the no-comparison constraint).
//
// Path A only: circles are membership rows against users.id, so anonymous
// Instant Access sessions never reach this module.

import { eq, inArray } from "drizzle-orm";
import {
  matchCircle,
  type CircleCandidateSummary,
  type MatchingProfile,
} from "@/agents/matching";
import {
  FAMILIARITY_OPTIONS,
  LIFE_SEASON_OPTIONS,
  MOTIVATION_OPTIONS,
  optionLabel,
  TOPIC_OPTIONS,
  CIRCLE_HOPE_OPTIONS,
} from "@/config/profile";
import { db } from "@/db";
import { circleMembers, circles, plans, users } from "@/db/schema";
import {
  alignActivePlan,
  listOpenCircles,
  type CircleBrowseItem,
} from "@/lib/circles";
import { listPlans, loadUserPlanState } from "@/lib/plans";
import { loadUserProfileAnswers } from "@/lib/profile";

/** A circle proposed to the user, awaiting their confirmation to join. */
export interface CircleMatchProposal {
  kind: "match";
  circle: CircleBrowseItem;
  /** Gloo's explanation, shown before the user confirms — or the honest
   * fallback line when Gloo could not be reached. */
  explanation: string;
}

/** No open circle existed, so one was created with the user in it. */
export interface FoundingCircleResult {
  kind: "founded";
  circleId: string;
  circleName: string;
  planName: string;
}

export type MatchResult = CircleMatchProposal | FoundingCircleResult;

/** Shown when Gloo is unavailable — honest about what it is, never overstated. */
const FALLBACK_EXPLANATION =
  "Round couldn't weigh the circles just now, so this is simply the open circle that's been waiting longest for another reader. Have a look at what it's reading — and if it isn't for you, browse the others.";

/** Map a slug list to its display labels, dropping anything unrecognised. */
function labels(
  options: typeof TOPIC_OPTIONS,
  values: string[] | null,
): string[] {
  return (values ?? [])
    .map((value) => optionLabel(options, value))
    .filter((label): label is string => label !== null);
}

/** De-duplicate while preserving order — circle signals read as a small set. */
function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

/**
 * Summarise each candidate circle for the agent: what it reads, how many
 * readers, and the aggregated onboarding signals of its members. Free-text
 * goals are deliberately excluded — a member's own words are theirs, and the
 * controlled vocabularies are what the matching decision actually turns on.
 */
async function summariseCandidates(
  candidates: CircleBrowseItem[],
): Promise<CircleCandidateSummary[]> {
  const circleIds = candidates.map((candidate) => candidate.id);
  const memberRows = await db
    .select({
      circleId: circleMembers.circleId,
      lifeSeason: users.lifeSeason,
      motivation: users.motivation,
      bibleFamiliarity: users.bibleFamiliarity,
      topics: users.topics,
      circleHopes: users.circleHopes,
    })
    .from(circleMembers)
    .innerJoin(users, eq(users.id, circleMembers.userId))
    .where(inArray(circleMembers.circleId, circleIds));

  const descriptions = new Map<string, string>();
  const planRows = await db
    .select({ id: plans.id, description: plans.description })
    .from(plans)
    .where(inArray(plans.id, unique(candidates.map((item) => item.planId))));
  for (const row of planRows) descriptions.set(row.id, row.description);

  return candidates.map((candidate, position) => {
    const members = memberRows.filter((row) => row.circleId === candidate.id);
    return {
      index: position + 1,
      name: candidate.name,
      planName: candidate.planName,
      planDescription: descriptions.get(candidate.planId) ?? "",
      memberCount: candidate.memberCount,
      lifeSeasons: unique(
        members.flatMap((row) => labels(LIFE_SEASON_OPTIONS, [row.lifeSeason ?? ""])),
      ),
      motivations: unique(
        members.flatMap((row) => labels(MOTIVATION_OPTIONS, [row.motivation ?? ""])),
      ),
      familiarity: unique(
        members.flatMap((row) =>
          labels(FAMILIARITY_OPTIONS, [row.bibleFamiliarity ?? ""]),
        ),
      ),
      topics: unique(members.flatMap((row) => labels(TOPIC_OPTIONS, row.topics))),
      hopes: unique(
        members.flatMap((row) => labels(CIRCLE_HOPE_OPTIONS, row.circleHopes)),
      ),
    };
  });
}

/** The user's own onboarding answers, in the label form the agent reads. */
async function loadMatchingProfile(userId: string): Promise<MatchingProfile> {
  const answers = await loadUserProfileAnswers(userId);
  return {
    goals: answers.goals,
    motivation: optionLabel(MOTIVATION_OPTIONS, answers.motivation),
    bibleFamiliarity: optionLabel(
      FAMILIARITY_OPTIONS,
      answers.bibleFamiliarity,
    ),
    lifeSeason: optionLabel(LIFE_SEASON_OPTIONS, answers.lifeSeason),
    topics: labels(TOPIC_OPTIONS, answers.topics),
    circleHopes: labels(CIRCLE_HOPE_OPTIONS, answers.circleHopes),
  };
}

/**
 * The zero-open-circles fallback: create a `forming` circle immediately with
 * the user as its founding member, rather than queuing them.
 *
 * The circle reads the user's own active plan (so nothing about their reading
 * changes and no plan-switch prompt is needed); a user with no active plan yet
 * gets the longest library plan, which then becomes their active plan exactly
 * as creating a circle by hand does. The name is derived from the plan so the
 * founding path needs no extra form and no extra Gloo call.
 *
 * Returns null when no plan exists at all to attach (an unseeded database) —
 * the caller surfaces that as an error rather than creating a broken circle.
 */
async function foundCircle(
  userId: string,
): Promise<FoundingCircleResult | null> {
  const active = await loadUserPlanState(userId);
  const plan = active?.plan ?? (await listPlans())[0];
  if (!plan) return null;

  const name = `${plan.name} Circle`;
  const [circle] = await db
    .insert(circles)
    .values({ name, planId: plan.id, createdBy: userId, state: "forming" })
    .returning({ id: circles.id });
  await db.insert(circleMembers).values({ circleId: circle.id, userId });
  // No-op when the plan is already active; creates the progress row when the
  // founder had no active plan (Step 12A shape — never overwrites a paused one).
  await alignActivePlan(userId, plan.id);

  return {
    kind: "founded",
    circleId: circle.id,
    circleName: name,
    planName: plan.name,
  };
}

/**
 * Match the user into a circle, or found one when there is nothing to join.
 *
 * Returns null only when the database has no plan to found a circle on. Every
 * other path ends with either a proposal or a circle the user is already in —
 * the definition of "never a dead end".
 */
export async function matchUserToCircle(
  userId: string,
  language: string,
): Promise<MatchResult | null> {
  const candidates = await listOpenCircles(userId);
  if (candidates.length === 0) return foundCircle(userId);

  const [profile, summaries] = await Promise.all([
    loadMatchingProfile(userId),
    summariseCandidates(candidates),
  ]);

  try {
    const { match } = await matchCircle({
      profile,
      candidates: summaries,
      language,
    });
    return {
      kind: "match",
      circle: candidates[match.choice - 1],
      explanation: match.explanation,
    };
  } catch {
    // Gloo unavailable or unusable: still propose a circle, but say plainly
    // that it was not weighed. Better an honest oldest-open-circle offer than
    // an error screen at the one moment the user asked for help deciding.
    return {
      kind: "match",
      circle: candidates[0],
      explanation: FALLBACK_EXPLANATION,
    };
  }
}
