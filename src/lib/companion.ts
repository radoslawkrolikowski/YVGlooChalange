// Companion turn — orchestration (Step 24A).
//
// The digest's inverse (Step 24): where the Facilitator synthesises what a
// circle SAID, the Companion revives a day whose conversation has stalled. Ties
// the 12-hourly sweep (Step 23 rail) to the circle thread: for one active
// circle, resolves the current plan day, checks the three eligibility gates,
// screens the messages Round is about to read Escalation-first, runs the
// Companion agent, and posts one short turn to the thread as a system message
// attributed to "Round" (messages.kind = "companion", authorId null — it
// renders through Step 20's system-message identity).
//
// "Current plan day" is the day of the circle's MOST RECENT starters card
// (Step 20) — the marker of the day the circle last opened for reading, and the
// day whose thread the Companion reads. A circle with no starters card has
// never opened a day's reading, so there is nothing to revive: skip.
//
// THREE ELIGIBILITY GATES, all must pass for Round to take a turn:
//   (1) fewer than half the members have reflected for that day (distinct
//       unflagged authors, never a row count — Step 19 allows a member to
//       reflect more than once; a digest owns a well-reflected day, Step 24);
//   (2) no digest has been posted for that day (the digest owns it);
//   (3) the circle is not actively chatting. A SINGLE unanswered member message
//       is exactly the stall Round revives; two or more member messages in the
//       last 12 hours is a live back-and-forth and is left alone.
//
// ESCALATION FIRST, as everywhere else. Ordinary thread messages do not pass
// the Escalation gate (Step 19 gates reflections only), so every ordinary
// member message the Companion is about to read is screened via the Step 18
// agent BEFORE Round says anything. Any flag and Round stays silent for this
// circle this sweep — a conversational nudge must never land on top of a
// disclosure of crisis — and only the reference-only audit row is written
// (screenReflection writes it). The flagged author's support card cannot be
// shown here (no user request is in flight); Step 29 delivers it through the
// notification surface — that is the gap Step 29 closes.
//
// Reflections already passed the Step 18 gate at submission (Step 19), so they
// are NOT re-screened here; only ordinary member messages are.
//
// Single language for now — the earliest member's, English fallback, mirroring
// the digest (Step 24) and icebreaker (Step 22). Per brief §5.12 AI content is
// never translated after the fact; Step 28 upgrades this into one native
// generation per member language, so Step 27's Translation Agent skips
// authorId-null system posts.
//
// Path A only — circles are membership rows against users.id, so anonymous
// Instant Access sessions never reach this module.

import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { generateCompanionTurn, type CompanionMessage } from "@/agents/companion";
import { effectiveVersionId } from "@/config/bible-versions";
import { db } from "@/db";
import {
  circleMembers,
  conversationStarters,
  digests,
  messages,
  reflections,
  users,
} from "@/db/schema";
import { loadCirclePlanDay } from "@/lib/circles";
import { screenReflection } from "@/lib/escalation";
import { fetchPassage } from "@/lib/youversion";

/** Passage text is grounding context only — cap it to keep the prompt small. */
const MAX_PASSAGE_CHARS = 4000;
/** How much of the day's thread Round reads — most recent, capped. */
const MAX_MEMBER_MESSAGES = 12;
/** "Actively chatting" starts at this many member messages in the window. */
const CHATTING_MESSAGE_COUNT = 2;

/** The outcome of one circle's Companion attempt, for the sweep to report. */
export type CompanionOutcome =
  | { posted: true; detail: string }
  | {
      posted: false;
      /** "error" releases the agent_runs claim so a later sweep retries. */
      reason:
        | "no_starters"
        | "day_not_in_plan"
        | "digest_covers_day"
        | "enough_reflected"
        | "actively_chatting"
        | "silent_crisis"
        | "error";
      detail: string;
    };

/** The most recent starters card in a circle — the current-day anchor. */
interface StartersAnchor {
  messageId: string;
  dayNumber: number;
  createdAt: Date;
}

/** The latest Step 20 starters card, or null when the circle never opened a day. */
async function loadStartersAnchor(
  circleId: string,
): Promise<StartersAnchor | null> {
  const [row] = await db
    .select({
      messageId: messages.id,
      dayNumber: messages.dayNumber,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(eq(messages.circleId, circleId), eq(messages.kind, "starters")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!row || row.dayNumber === null) return null;
  return {
    messageId: row.messageId,
    dayNumber: row.dayNumber,
    createdAt: row.createdAt,
  };
}

/** Member count and the turn's language (earliest member's, English fallback). */
async function loadCircleFacts(
  circleId: string,
): Promise<{ memberCount: number; language: string }> {
  const rows = await db
    .select({ language: users.language, joinedAt: circleMembers.joinedAt })
    .from(circleMembers)
    .innerJoin(users, eq(users.id, circleMembers.userId))
    .where(eq(circleMembers.circleId, circleId))
    .orderBy(asc(circleMembers.joinedAt));
  const language = rows.find((row) => row.language)?.language ?? "en";
  return { memberCount: rows.length, language };
}

/** Distinct unflagged reflection authors for one plan day. */
async function countReflectionAuthors(
  circleId: string,
  dayNumber: number,
): Promise<number> {
  const rows = await db
    .select({ authorId: reflections.authorId })
    .from(reflections)
    .where(
      and(
        eq(reflections.circleId, circleId),
        eq(reflections.dayNumber, dayNumber),
        eq(reflections.flagged, false),
      ),
    );
  return new Set(rows.map((row) => row.authorId)).size;
}

/** True when a digest has already been posted for this circle+day (Step 24). */
async function digestExists(
  circleId: string,
  dayNumber: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: digests.id })
    .from(digests)
    .where(and(eq(digests.circleId, circleId), eq(digests.dayNumber, dayNumber)))
    .limit(1);
  return Boolean(row);
}

/**
 * Count ordinary member chat messages in the last 12 hours — the chatting gate.
 * Only kind = "message": a reflection is a distinct day-tagged submission, not
 * conversation (Step 19 keeps the two apart), and it already drives its own
 * gate above — counting it here too would silence a circle where members
 * reflected but never actually talked, which is exactly what Round should open.
 */
async function countRecentMemberMessages(
  circleId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.circleId, circleId),
        isNotNull(messages.authorId),
        eq(messages.kind, "message"),
        gte(messages.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

/** One ordinary member message in the day's thread, with its author name. */
interface DayMessage {
  id: string;
  authorDisplayName: string;
  text: string;
}

/**
 * The ordinary member messages posted in the day's thread (from the starters
 * card onward), oldest first — the conversation Round reads and screens. Only
 * kind = "message" (reflections already passed the Step 18 gate in Step 19).
 */
async function loadDayMessages(
  circleId: string,
  since: Date,
): Promise<DayMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      authorName: users.name,
      body: messages.body,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.authorId))
    .where(
      and(
        eq(messages.circleId, circleId),
        eq(messages.kind, "message"),
        gte(messages.createdAt, since),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(MAX_MEMBER_MESSAGES);
  return rows.map((row) => ({
    id: row.id,
    authorDisplayName: row.authorName ?? "Reader",
    text: row.body,
  }));
}

/** Round's starter questions for the day, for the "reopen" branch. */
async function loadStarterQuestions(messageId: string): Promise<string[]> {
  const [row] = await db
    .select({ questions: conversationStarters.questions })
    .from(conversationStarters)
    .where(eq(conversationStarters.messageId, messageId))
    .limit(1);
  return row?.questions ?? [];
}

/**
 * Screen every ordinary member message Round is about to read. Returns true if
 * ANY message flags — Round then stays silent for this circle this sweep.
 * screenReflection writes the reference-only audit row on a flag; it may throw
 * on an unusable classification, which propagates so the caller fails safe
 * (posts nothing and releases the claim for a later retry).
 */
async function anyMessageFlagged(dayMessages: DayMessage[]): Promise<boolean> {
  for (const message of dayMessages) {
    const { verdict } = await screenReflection({
      reflectionId: message.id,
      text: message.text,
    });
    if (verdict.flagged) return true;
  }
  return false;
}

/**
 * Generate and post one circle's Companion turn.
 *
 * Never throws — the sweep must survive one circle's failure. Returns a
 * CompanionOutcome the sweep reports and (on `reason: "error"`) uses to release
 * the agent_runs claim so a later sweep can retry. Idempotency across a sweep
 * is the caller's agent_runs claim (one turn per circle per half-day); this
 * function assumes the claim was already won.
 */
export async function runCircleCompanion(
  circleId: string,
): Promise<CompanionOutcome> {
  const anchor = await loadStartersAnchor(circleId);
  if (!anchor) {
    return { posted: false, reason: "no_starters", detail: "no starters card yet" };
  }

  const planDay = await loadCirclePlanDay(circleId, anchor.dayNumber);
  if (!planDay) {
    return {
      posted: false,
      reason: "day_not_in_plan",
      detail: `day ${anchor.dayNumber} not in plan`,
    };
  }

  // Gate 1 — a digest already owns this day (Step 24 is its facilitator).
  if (await digestExists(circleId, anchor.dayNumber)) {
    return {
      posted: false,
      reason: "digest_covers_day",
      detail: `digest already covers ${planDay.label}`,
    };
  }

  const facts = await loadCircleFacts(circleId);

  // Gate 2 — fewer than half the members must have reflected (distinct authors).
  // Not fewer than half → the day is well-attended; the digest owns it, not us.
  const reflectedAuthors = await countReflectionAuthors(circleId, anchor.dayNumber);
  if (reflectedAuthors * 2 >= facts.memberCount) {
    return {
      posted: false,
      reason: "enough_reflected",
      detail: `enough reflected (${reflectedAuthors}/${facts.memberCount})`,
    };
  }

  // Gate 3 — an actively chatting circle is left alone. One unanswered member
  // message is the stall Round revives; two or more in the last 12h is a live
  // conversation.
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const recentMemberMessages = await countRecentMemberMessages(
    circleId,
    twelveHoursAgo,
  );
  if (recentMemberMessages >= CHATTING_MESSAGE_COUNT) {
    return {
      posted: false,
      reason: "actively_chatting",
      detail: `actively chatting (${recentMemberMessages} recent messages)`,
    };
  }

  try {
    // The day's thread Round reads: ordinary member messages from the starters
    // card onward. Screen them Escalation-first — any flag and Round is silent.
    const dayMessages = await loadDayMessages(circleId, anchor.createdAt);
    if (await anyMessageFlagged(dayMessages)) {
      return {
        posted: false,
        reason: "silent_crisis",
        detail: "crisis signal in thread — Round stays silent",
      };
    }

    const passage = await fetchPassage(
      planDay.reference,
      effectiveVersionId(facts.language, null),
      { format: "text" },
    );

    const memberMessages: CompanionMessage[] = dayMessages.map((message) => ({
      authorDisplayName: message.authorDisplayName,
      text: message.text,
    }));
    const starterQuestions = await loadStarterQuestions(anchor.messageId);

    const { output } = await generateCompanionTurn({
      passageReference: planDay.reference,
      passageText: passage.content.slice(0, MAX_PASSAGE_CHARS),
      dayLabel: planDay.label,
      mode: memberMessages.length > 0 ? "pickup" : "reopen",
      memberMessages,
      starterQuestions,
      language: facts.language,
    });

    // authorId null so it renders with Round's system identity (Step 20).
    await db.insert(messages).values({
      circleId,
      authorId: null,
      body: output.turn,
      sourceLanguage: facts.language,
      kind: "companion",
      dayNumber: planDay.dayNumber,
      dayLabel: planDay.label,
    });

    return { posted: true, detail: `companion turn posted for ${planDay.label}` };
  } catch (error) {
    return {
      posted: false,
      reason: "error",
      detail: `companion turn failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
