// Circle queries and membership rules — Step 16.
//
// One module answers "what circles can this user see, and what circle are
// they in?" and enforces the size/state rules on create and join. Circles are
// a Path A (signed-in) feature: membership is a foreign key to users.id, and
// anonymous Instant Access visitors (no database row) join the demo circle in
// Step 30 instead. No progress, pace, or completion is ever read or exposed
// here — the members list carries display names only (no-comparison
// constraint).

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  circleMembers,
  circles,
  conversationStarters,
  messages,
  planDays,
  plans,
  userPlanProgress,
  users,
} from "@/db/schema";

/** Min members to flip forming → active; join is refused at MAX_MEMBERS. */
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 5;

export type CircleState = "forming" | "active" | "stalled" | "archived";

/** An open circle as shown in the browse list — never any member progress. */
export interface CircleBrowseItem {
  id: string;
  name: string;
  planId: string;
  planName: string;
  state: CircleState;
  memberCount: number;
  /** Member display names for the stacked avatar chips — names only. */
  memberNames: string[];
}

/** The signed-in user's own circle, resolved for the hero card / Home. */
export interface UserCircle {
  id: string;
  name: string;
  planId: string;
  planName: string;
  state: CircleState;
  memberCount: number;
  /** Display names of every member — the roster shows names only. */
  memberNames: string[];
}

interface MemberRow {
  circleId: string;
  name: string | null;
  joinedAt: Date;
}

/** All members of the given circles, ordered by join time — names only. */
async function membersByCircle(
  circleIds: string[],
): Promise<Map<string, string[]>> {
  const byCircle = new Map<string, string[]>();
  if (circleIds.length === 0) return byCircle;
  const rows: MemberRow[] = await db
    .select({
      circleId: circleMembers.circleId,
      name: users.name,
      joinedAt: circleMembers.joinedAt,
    })
    .from(circleMembers)
    .innerJoin(users, eq(users.id, circleMembers.userId))
    .where(inArray(circleMembers.circleId, circleIds))
    .orderBy(asc(circleMembers.joinedAt));
  for (const row of rows) {
    const names = byCircle.get(row.circleId) ?? [];
    names.push(row.name ?? "Reader");
    byCircle.set(row.circleId, names);
  }
  return byCircle;
}

/**
 * Open circles a user can join: forming or active, and not yet full. The
 * caller's own circle is excluded (it renders as the hero card instead).
 * Full circles simply drop out of the browse list; the join route still
 * refuses a full circle explicitly, so a stale card cannot slip past.
 */
export async function listOpenCircles(
  excludeUserId?: string,
): Promise<CircleBrowseItem[]> {
  const rows = await db
    .select({
      id: circles.id,
      name: circles.name,
      planId: circles.planId,
      planName: plans.name,
      state: circles.state,
      memberCount: sql<number>`count(${circleMembers.userId})::int`,
    })
    .from(circles)
    .innerJoin(plans, eq(plans.id, circles.planId))
    .leftJoin(circleMembers, eq(circleMembers.circleId, circles.id))
    .where(sql`${circles.state} in ('forming', 'active')`)
    .groupBy(circles.id, plans.name)
    .having(sql`count(${circleMembers.userId}) < ${MAX_MEMBERS}`)
    .orderBy(asc(circles.createdAt));

  const open = rows.filter((row) => row.memberCount > 0);
  const names = await membersByCircle(open.map((row) => row.id));
  return open.map((row) => ({
    id: row.id,
    name: row.name,
    planId: row.planId,
    planName: row.planName,
    state: row.state as CircleState,
    memberCount: row.memberCount,
    memberNames: names.get(row.id) ?? [],
  }));
}

/** The circle the user belongs to, or null. At most one in Step 16. */
export async function loadUserCircle(
  userId: string,
): Promise<UserCircle | null> {
  const [membership] = await db
    .select({ circleId: circleMembers.circleId })
    .from(circleMembers)
    .where(eq(circleMembers.userId, userId));
  if (!membership) return null;

  const [circle] = await db
    .select({
      id: circles.id,
      name: circles.name,
      planId: circles.planId,
      planName: plans.name,
      state: circles.state,
    })
    .from(circles)
    .innerJoin(plans, eq(plans.id, circles.planId))
    .where(eq(circles.id, membership.circleId));
  if (!circle) return null;

  const names = (await membersByCircle([circle.id])).get(circle.id) ?? [];
  return {
    id: circle.id,
    name: circle.name,
    planId: circle.planId,
    planName: circle.planName,
    state: circle.state as CircleState,
    memberCount: names.length,
    memberNames: names,
  };
}

/** A plan the creator may attach to a new circle. */
export interface CreatablePlan {
  id: string;
  name: string;
  description: string;
  lengthDays: number;
  /** True for the creator's own plans (started/generated), false for library. */
  mine: boolean;
  /** True for the creator's currently active plan. */
  active: boolean;
}

/**
 * Plans a user can start a circle on (Step 16): the pre-defined library PLUS
 * every plan the user has already started — which includes their personal
 * AI-generated plans (source "generated"), so a reader can gather a circle
 * around a plan built for them. Generated plans stay out of the shared browse
 * library (listPlans) — this is the creator attaching their own plan to their
 * own circle, where members share the circle's plan by design.
 */
export async function listCreatablePlans(
  userId: string,
): Promise<CreatablePlan[]> {
  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      description: plans.description,
      lengthDays: plans.lengthDays,
      source: plans.source,
      progressUser: userPlanProgress.userId,
      active: userPlanProgress.isActive,
    })
    .from(plans)
    .leftJoin(
      userPlanProgress,
      and(
        eq(userPlanProgress.planId, plans.id),
        eq(userPlanProgress.userId, userId),
      ),
    )
    .where(
      sql`${plans.source} = 'predefined' or ${userPlanProgress.userId} is not null`,
    );

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      lengthDays: row.lengthDays,
      mine: row.progressUser !== null,
      active: row.active === true,
    }))
    // The creator's own plans first (active at the very top), then library,
    // longest first within each group.
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.mine !== b.mine) return a.mine ? -1 : 1;
      return b.lengthDays - a.lengthDays;
    });
}

/** May this user attach the given plan to a circle? (create-time guard). */
export async function canAttachPlan(
  userId: string,
  planId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ source: plans.source, progressUser: userPlanProgress.userId })
    .from(plans)
    .leftJoin(
      userPlanProgress,
      and(
        eq(userPlanProgress.planId, plans.id),
        eq(userPlanProgress.userId, userId),
      ),
    )
    .where(eq(plans.id, planId));
  if (!row) return false;
  return row.source === "predefined" || row.progressUser !== null;
}

// --- Circle thread (Step 17) ----------------------------------------------

/** One posted message as the thread renders it — the original body only.
 * Translations (message_translations) are additive and land in Step 25. */
export interface ThreadMessage {
  id: string;
  /** The member who posted, or null on Round's system posts (Step 20). */
  authorId: string | null;
  /** Author display name — the roster shows names only. "Round" on system. */
  authorName: string;
  /** The author's original, immutable words. */
  body: string;
  /** ISO 639-1 language of the original, or null when unknown. */
  sourceLanguage: string | null;
  /** "message" (ordinary post), "reflection" (day-tagged, Step 19),
   * "starters" (Round's conversation-starter card, Step 20), or "icebreaker"
   * (Round's cold-start opening message, Step 22). */
  kind: "message" | "reflection" | "starters" | "icebreaker";
  /** The plan day a reflection or starter set responds to; null otherwise. */
  dayNumber: number | null;
  /** Human-readable passage label for a reflection/starters card; else null. */
  dayLabel: string | null;
  /** The individually replyable questions on a "starters" post; else null. */
  questions: string[] | null;
  /** ISO timestamp — the client formats the relative label and date separators. */
  createdAt: string;
}

/** The circle header the thread screen needs — name, state, membership. */
export interface ThreadCircle {
  id: string;
  name: string;
  state: CircleState;
}

/** True when the user is a member of the circle — the thread's access gate. */
export async function isCircleMember(
  userId: string,
  circleId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: circleMembers.userId })
    .from(circleMembers)
    .where(
      and(
        eq(circleMembers.circleId, circleId),
        eq(circleMembers.userId, userId),
      ),
    );
  return Boolean(row);
}

/** The circle's header row, or null when it does not exist. */
export async function loadThreadCircle(
  circleId: string,
): Promise<ThreadCircle | null> {
  const [circle] = await db
    .select({ id: circles.id, name: circles.name, state: circles.state })
    .from(circles)
    .where(eq(circles.id, circleId));
  if (!circle) return null;
  return { ...circle, state: circle.state as CircleState };
}

/** Thread message kinds, narrowed from the free-text column. */
function threadKind(kind: string): ThreadMessage["kind"] {
  if (kind === "reflection") return "reflection";
  if (kind === "starters") return "starters";
  if (kind === "icebreaker") return "icebreaker";
  return "message";
}

/**
 * A circle's messages, oldest first — original bodies with author names.
 * The author join is a LEFT join: Round's system posts (Step 20 starters, and
 * later the icebreaker/digest/summary) have no author row, and they carry
 * their replyable question list from conversation_starters.
 */
export async function loadThreadMessages(
  circleId: string,
): Promise<ThreadMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      authorId: messages.authorId,
      authorName: users.name,
      body: messages.body,
      sourceLanguage: messages.sourceLanguage,
      kind: messages.kind,
      dayNumber: messages.dayNumber,
      dayLabel: messages.dayLabel,
      questions: conversationStarters.questions,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .leftJoin(
      conversationStarters,
      eq(conversationStarters.messageId, messages.id),
    )
    .where(eq(messages.circleId, circleId))
    .orderBy(asc(messages.createdAt));

  return rows.map((row) => {
    const kind = threadKind(row.kind);
    return {
      id: row.id,
      authorId: row.authorId,
      // Round is the author of every system post — never a member's name.
      authorName: row.authorId === null ? "Round" : (row.authorName ?? "Reader"),
      body: row.body,
      sourceLanguage: row.sourceLanguage,
      kind,
      dayNumber: row.dayNumber,
      dayLabel: row.dayLabel,
      questions:
        kind === "starters"
          ? // Fall back to the body's lines if the starters row ever vanishes.
            (row.questions?.length ? row.questions : row.body.split("\n"))
          : null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** A circle's plan day, resolved for priming the reflection composer. */
export interface CirclePlanDay {
  dayNumber: number;
  /** USFM reference, e.g. "PSA.23". */
  reference: string;
  /** Human-readable label, e.g. "Psalm 23". */
  label: string;
}

/**
 * Resolve one day of a circle's attached plan (Step 19): the reference and
 * label the reflection composer shows and tags the reflection with. Returns
 * null when the circle or day does not exist, so a bad ?reflect param simply
 * falls back to ordinary chat rather than erroring.
 */
export async function loadCirclePlanDay(
  circleId: string,
  dayNumber: number,
): Promise<CirclePlanDay | null> {
  const [row] = await db
    .select({
      dayNumber: planDays.dayNumber,
      reference: planDays.reference,
      label: planDays.label,
    })
    .from(circles)
    .innerJoin(planDays, eq(planDays.planId, circles.planId))
    .where(and(eq(circles.id, circleId), eq(planDays.dayNumber, dayNumber)));
  return row ?? null;
}

/** Count a circle's members — the size gate for join. */
export async function memberCount(circleId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(circleMembers)
    .where(eq(circleMembers.circleId, circleId));
  return row?.count ?? 0;
}

/** True when the user already belongs to a circle (Step 16: max one). */
export async function userHasCircle(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: circleMembers.userId })
    .from(circleMembers)
    .where(eq(circleMembers.userId, userId));
  return Boolean(row);
}

/**
 * Align the user's active reading plan to the circle's plan (Step 12A):
 * pause every other plan, then activate (or resume) the circle's plan. Called
 * on create and on a confirmed join — a paused plan keeps its completed_days
 * and resumes later, never overwritten. Mirrors /api/session/plan exactly.
 */
export async function alignActivePlan(
  userId: string,
  planId: string,
): Promise<void> {
  await db
    .update(userPlanProgress)
    .set({ isActive: false })
    .where(
      and(
        eq(userPlanProgress.userId, userId),
        ne(userPlanProgress.planId, planId),
      ),
    );
  await db
    .insert(userPlanProgress)
    .values({ userId, planId, isActive: true })
    .onConflictDoUpdate({
      target: [userPlanProgress.userId, userPlanProgress.planId],
      set: { isActive: true },
    });
}
