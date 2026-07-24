// Reminder delivery — orchestration (Step 29).
//
// Ties the daily Reminder sweep (Step 23 rail) to the notification bell: for one
// user, works out whether either reminder type is due, runs the Reminder agent
// to write the pastoral nudge in the user's language, and writes it as an in-app
// notification row. Delivery is IN-APP ONLY — no email (Step 29 as amended).
//
// TWO IDEMPOTENCY FENCES, the same discipline as the digest (Step 24). The sweep
// claims agent_runs (reminder, userId, day) — the first fence, so a re-run of the
// sweep skips a user already handled today. Here, each notification is inserted
// with onConflictDoNothing on the notifications (user, type, period) unique index
// — the second fence, so even if the sweep's claim is released after a partial
// failure and retried, the type that already delivered is never duplicated. A
// type whose Gloo call throws is swallowed per type (the OTHER type still
// delivers) and reported as errored so the sweep releases its claim for a retry;
// the delivered type's fence keeps that retry from doubling it.
//
// THE TWO TYPES:
//   * "reading" — the user is 2+ days behind their ACTIVE plan. "Behind" is
//     (days the plan expects completed by today) minus (days actually completed);
//     the missed passage referenced is the earliest plan day not yet completed.
//   * "messages" — unread circle messages older than 24h, via the activity-based
//     proxy: messages in the user's circle they did not author, newer than the
//     user's own last activity there (a post or a reflection; the join time as a
//     floor), whose NEWEST is already older than 24h. A still-fresh thread (newest
//     unseen message within 24h) is left alone — the reader has likely just seen
//     it, and a live conversation is not a "you missed this" moment.
//
// Path A only — reminders are keyed to users.id, so Instant Access sessions (no
// database row) never reach this module (brief §7).

import { and, asc, desc, eq, gt, isNotNull, isNull, ne, or } from "drizzle-orm";
import { generateReminder } from "@/agents/reminder";
import { db } from "@/db";
import {
  circleMembers,
  circles,
  digests,
  messages,
  notifications,
  plans,
  planDays,
  reflections,
  userPlanProgress,
  users,
} from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How much of the missed conversation the summary is grounded in. */
const MAX_MISSED_MESSAGES = 8;
/** Keep each quoted message short so the prompt stays small. */
const MAX_MESSAGE_CHARS = 240;

/** The outcome of one user's reminder attempt, for the sweep to report. */
export interface ReminderOutcome {
  /** True when any type's Gloo call failed — the sweep releases its claim. */
  errored: boolean;
  /** Human-readable summary shown inline in the Agent Console. */
  detail: string;
}

interface UserFacts {
  displayName: string;
  language: string;
}

/** The user's display name and language (English fallback). */
async function loadUserFacts(userId: string): Promise<UserFacts | null> {
  const [row] = await db
    .select({ name: users.name, language: users.language })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return null;
  return {
    displayName: row.name ?? "Reader",
    language: row.language ?? "en",
  };
}

/** The user's circle (id + name), or null when they belong to none. */
async function loadUserCircle(
  userId: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: circles.id, name: circles.name })
    .from(circleMembers)
    .innerJoin(circles, eq(circles.id, circleMembers.circleId))
    .where(eq(circleMembers.userId, userId))
    .limit(1);
  return row ?? null;
}

// --- Reading reminder -----------------------------------------------------

interface ReadingDue {
  reference: string;
  label: string;
}

/**
 * Is the user 2+ days behind their active plan, and if so, which passage have
 * they not read yet? Behind = (days the plan expects completed by today) minus
 * (days actually completed). The missed passage is the earliest plan day not in
 * completedDays — the natural place to pick the plan back up. Returns null when
 * there is no active plan, the reader is fewer than 2 days behind, or every day
 * is already done.
 */
async function readingDue(userId: string): Promise<ReadingDue | null> {
  const [progress] = await db
    .select({
      planId: userPlanProgress.planId,
      startedAt: userPlanProgress.startedAt,
      completedDays: userPlanProgress.completedDays,
      lengthDays: plans.lengthDays,
    })
    .from(userPlanProgress)
    .innerJoin(plans, eq(plans.id, userPlanProgress.planId))
    .where(
      and(
        eq(userPlanProgress.userId, userId),
        eq(userPlanProgress.isActive, true),
      ),
    );
  if (!progress) return null;

  const daysSinceStart = Math.floor(
    (Date.now() - progress.startedAt.getTime()) / DAY_MS,
  );
  // Day 1 is the start day, so by the end of today the plan expects
  // (daysSinceStart + 1) days done, capped at the plan's length.
  const expectedCompleted = Math.min(daysSinceStart + 1, progress.lengthDays);
  const completed = new Set(progress.completedDays);
  const behind = expectedCompleted - completed.size;
  if (behind < 2) return null;

  // The earliest plan day the reader has not completed — where they pick up.
  const missedDay = firstMissingDay(completed, progress.lengthDays);
  if (missedDay === null) return null;

  const [day] = await db
    .select({ reference: planDays.reference, label: planDays.label })
    .from(planDays)
    .where(
      and(
        eq(planDays.planId, progress.planId),
        eq(planDays.dayNumber, missedDay),
      ),
    );
  if (!day) return null;
  return { reference: day.reference, label: day.label };
}

/** The smallest day number in 1..length not present in `completed`, or null. */
function firstMissingDay(completed: Set<number>, length: number): number | null {
  for (let day = 1; day <= length; day++) {
    if (!completed.has(day)) return day;
  }
  return null;
}

/**
 * What the user's circle has been reflecting on — grounding for the reading
 * nudge. The most recent digest's synthesis is the freshest distilled account of
 * what the circle noticed; absent one (a young circle), fall back to a gentle
 * generic. The digest may be in the circle's base language, but the nudge itself
 * is regenerated in the reader's language, so this is only grounding.
 */
async function circleReflectionContext(circleId: string | null): Promise<string> {
  if (!circleId) {
    return "their circle has been reading along together";
  }
  const [row] = await db
    .select({ synthesis: digests.synthesis, label: digests.label })
    .from(digests)
    .where(and(eq(digests.circleId, circleId), isNotNull(digests.synthesis)))
    .orderBy(desc(digests.createdAt))
    .limit(1);
  if (!row?.synthesis) {
    return "their circle has been reading along together";
  }
  return row.label
    ? `On ${row.label}, the circle reflected: ${row.synthesis}`
    : row.synthesis;
}

// --- Messages reminder ----------------------------------------------------

/**
 * The user's last activity time in a circle: the newest of their own posts and
 * reflections there. Falls back to their circle-join time — before joining there
 * is nothing they could have missed. This is the "seen up to here" watermark the
 * unread proxy reads against, without a dedicated read-tracking table.
 */
async function lastActivityAt(userId: string, circleId: string): Promise<Date> {
  const [membership] = await db
    .select({ joinedAt: circleMembers.joinedAt })
    .from(circleMembers)
    .where(
      and(
        eq(circleMembers.circleId, circleId),
        eq(circleMembers.userId, userId),
      ),
    );
  let latest = membership?.joinedAt ?? new Date(0);

  const [lastMessage] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(eq(messages.circleId, circleId), eq(messages.authorId, userId)),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (lastMessage && lastMessage.createdAt > latest) {
    latest = lastMessage.createdAt;
  }

  const [lastReflection] = await db
    .select({ createdAt: reflections.createdAt })
    .from(reflections)
    .where(
      and(
        eq(reflections.circleId, circleId),
        eq(reflections.authorId, userId),
      ),
    )
    .orderBy(desc(reflections.createdAt))
    .limit(1);
  if (lastReflection && lastReflection.createdAt > latest) {
    latest = lastReflection.createdAt;
  }
  return latest;
}

/**
 * Unread circle messages older than 24h (the activity-based proxy). Returns a
 * short grounding string of what the reader missed, or null when nothing
 * qualifies: no messages since their last activity, or the newest such message
 * is still within 24h (a fresh or live thread is not a "you missed this" moment).
 * Round's own system posts count as circle messages the reader can miss; the
 * reader's own posts never do (they are excluded on authorId).
 */
async function messagesDue(
  userId: string,
  circleId: string,
): Promise<string | null> {
  const since = await lastActivityAt(userId, circleId);
  const rows = await db
    .select({
      authorName: users.name,
      authorId: messages.authorId,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(
      and(
        eq(messages.circleId, circleId),
        gt(messages.createdAt, since),
        // Everything the reader did not author: Round's system posts (authorId
        // null) OR another member's post. `ne(authorId, userId)` alone would drop
        // the system posts, since NULL <> userId is NULL (not true) in SQL — the
        // explicit isNull branch keeps them.
        or(isNull(messages.authorId), ne(messages.authorId, userId)),
      ),
    )
    .orderBy(asc(messages.createdAt));

  if (rows.length === 0) return null;

  const newest = rows[rows.length - 1].createdAt;
  if (Date.now() - newest.getTime() < DAY_MS) {
    // The newest unread message is still fresh — leave a live/just-seen thread.
    return null;
  }

  const recent = rows.slice(-MAX_MISSED_MESSAGES);
  return recent
    .map((row) => {
      const name = row.authorId === null ? "Round" : (row.authorName ?? "Reader");
      const text = row.body.slice(0, MAX_MESSAGE_CHARS);
      return `${name}: ${text}`;
    })
    .join("\n");
}

// --- Delivery -------------------------------------------------------------

/**
 * Insert one notification, idempotent per (user, type, period). Returns true
 * when a row was actually written, false when the day's notification of that
 * type already existed (the second fence). Never throws on a conflict.
 */
async function deliver(row: typeof notifications.$inferInsert): Promise<boolean> {
  const inserted = await db
    .insert(notifications)
    .values(row)
    .onConflictDoNothing({
      target: [
        notifications.userId,
        notifications.type,
        notifications.periodKey,
      ],
    })
    .returning({ id: notifications.id });
  return inserted.length > 0;
}

/**
 * Run both reminder types for one user and deliver any that are due. Never
 * throws — the sweep must survive one user's failure. Each type is independent:
 * a Gloo failure on one is swallowed (the other still delivers) and flagged so
 * the sweep releases its claim for a retry; the notifications unique fence keeps
 * that retry from duplicating a type that already delivered.
 *
 * Idempotency across the sweep is the caller's agent_runs claim (one run per
 * user per day); this function assumes that claim was already won.
 */
export async function runUserReminders(
  userId: string,
  periodKey: string,
): Promise<ReminderOutcome> {
  const facts = await loadUserFacts(userId);
  if (!facts) {
    return { errored: false, detail: "user not found" };
  }
  const circle = await loadUserCircle(userId);
  const delivered: string[] = [];
  let errored = false;

  // Reading reminder — 2+ days behind the active plan.
  try {
    const due = await readingDue(userId);
    if (due) {
      const context = await circleReflectionContext(circle?.id ?? null);
      const { text, model } = await generateReminder({
        type: "reading",
        userDisplayName: facts.displayName,
        missedPassageReference: due.reference,
        circleContext: context,
        language: facts.language,
      });
      const wrote = await deliver({
        userId,
        type: "reading",
        title: "A passage is waiting",
        body: text,
        reference: due.reference,
        label: due.label,
        circleId: circle?.id ?? null,
        periodKey,
        language: facts.language,
        model,
      });
      delivered.push(wrote ? `reading (${due.label})` : "reading (already sent)");
    }
  } catch (error) {
    errored = true;
    delivered.push(
      `reading failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Messages reminder — unread circle messages older than 24h.
  try {
    if (circle) {
      const missed = await messagesDue(userId, circle.id);
      if (missed) {
        const { text, model } = await generateReminder({
          type: "messages",
          userDisplayName: facts.displayName,
          circleContext: missed,
          language: facts.language,
        });
        const wrote = await deliver({
          userId,
          type: "messages",
          title: `New in ${circle.name}`,
          body: text,
          label: circle.name,
          circleId: circle.id,
          periodKey,
          language: facts.language,
          model,
        });
        delivered.push(wrote ? "messages" : "messages (already sent)");
      }
    }
  } catch (error) {
    errored = true;
    delivered.push(
      `messages failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    errored,
    detail: delivered.length > 0 ? delivered.join("; ") : "nothing due",
  };
}
