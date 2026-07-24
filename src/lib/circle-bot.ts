// Circle Bot — orchestration (Step 30).
//
// Makes the public demo circle's seeded AI member (src/agents/circle-bot.ts)
// reply like a normal member when someone posts. Invoked post-persist via
// `after()` from the public circle's message/reflection routes, so a slow Gloo
// call never blocks or loses the poster's message; the thread's 10-second poll
// swaps the bot's reply in on the next cycle.
//
// GUARDS, all here (the agent module is pure text):
//   * Only the circle that has the seeded bot member runs — the responder's
//     users id is stored in app_meta at seed time (Step 30).
//   * The bot never replies to its own or another bot's post (persona seed
//     reflections are bot-authored too), so it can never talk to itself or loop.
//   * Rate-limited: at most one bot reply per short cooldown window per circle,
//     so a burst of posts yields one reply, not a wall of them.
//   * Escalation FIRST, like every user-facing turn: the triggering text is
//     screened before the bot speaks; any flag and the bot stays silent (a
//     conversational reply must never land on a crisis disclosure). The audit
//     row is written by screenReflection; nothing else is stored.
//
// The bot's reply is MEMBER-authored (authorId = the bot's users row), so it
// renders as an ordinary member message and Step 27's Translation Agent covers
// it (called here after the insert) — persona content, never Round's
// authorId-null facilitation output.

import { and, desc, eq, gte, isNotNull, ne, or } from "drizzle-orm";
import { generateCircleBotReply, type CircleBotContextMessage } from "@/agents/circle-bot";
import { effectiveVersionId } from "@/config/bible-versions";
import { db } from "@/db";
import { appMeta, circleMembers, messages, users } from "@/db/schema";
import { loadCirclePlanDay } from "@/lib/circles";
import { screenReflection } from "@/lib/escalation";
import { translateNewMessage } from "@/lib/translation";
import { fetchPassage } from "@/lib/youversion";

/** app_meta key holding the responding bot's users id (set at seed time). */
export const BOT_RESPONDER_META_KEY = "demo_bot_user_id";

/** At most one bot reply per circle inside this window — a burst yields one. */
const BOT_COOLDOWN_MS = 45_000;
/** How much of the recent thread the bot reads for continuity. */
const MAX_CONTEXT_MESSAGES = 8;
/** Passage text is grounding only — cap it to keep the prompt small. */
const MAX_PASSAGE_CHARS = 4000;

/** The responding bot's users id, or null when the demo isn't seeded. */
async function loadResponderBotId(): Promise<string | null> {
  const [row] = await db
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, BOT_RESPONDER_META_KEY));
  return row?.value ?? null;
}

/** The current plan day the bot grounds its reply in — latest starters day,
 * falling back to day 1 (a circle that has opened no reading still reads day 1). */
async function resolveCurrentDayNumber(circleId: string): Promise<number> {
  const [row] = await db
    .select({ dayNumber: messages.dayNumber })
    .from(messages)
    .where(and(eq(messages.circleId, circleId), eq(messages.kind, "starters")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return row?.dayNumber ?? 1;
}

/** Recent member/anon posts (not system, not the bot's own), oldest first. */
async function loadRecentContext(
  circleId: string,
  botId: string,
): Promise<CircleBotContextMessage[]> {
  const rows = await db
    .select({
      authorId: messages.authorId,
      authorName: users.name,
      anonName: messages.anonName,
      body: messages.body,
      kind: messages.kind,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(
      and(
        eq(messages.circleId, circleId),
        // Member- or anon-authored posts only (skip Round's system cards).
        or(isNotNull(messages.authorId), isNotNull(messages.anonName)),
        // Ordinary conversation and reflections, never the bot's own words.
        or(ne(messages.authorId, botId), isNotNull(messages.anonName)),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(MAX_CONTEXT_MESSAGES);

  return rows
    .reverse()
    .map((row) => ({
      authorDisplayName: row.authorName ?? row.anonName ?? "Reader",
      text: row.body,
    }));
}

export type CircleBotOutcome =
  | { posted: true; messageId: string }
  | {
      posted: false;
      reason:
        | "not_seeded"
        | "not_bot_circle"
        | "own_or_bot_trigger"
        | "cooldown"
        | "silent_crisis"
        | "trigger_missing"
        | "error";
      detail?: string;
    };

/**
 * Consider replying to `triggerMessageId` as the circle's bot member. Never
 * throws — it is best-effort background work. Returns an outcome for logging.
 */
export async function maybeBotReply(
  circleId: string,
  triggerMessageId: string,
): Promise<CircleBotOutcome> {
  try {
    const botId = await loadResponderBotId();
    if (!botId) return { posted: false, reason: "not_seeded" };

    // The bot only acts in the circle it is a member of.
    const [botMembership] = await db
      .select({ userId: circleMembers.userId })
      .from(circleMembers)
      .where(
        and(
          eq(circleMembers.circleId, circleId),
          eq(circleMembers.userId, botId),
        ),
      )
      .limit(1);
    if (!botMembership) return { posted: false, reason: "not_bot_circle" };

    // Resolve the bot's own identity (name + language).
    const [bot] = await db
      .select({ name: users.name, language: users.language, isBot: users.isBot })
      .from(users)
      .where(eq(users.id, botId));
    if (!bot?.isBot) return { posted: false, reason: "not_seeded" };

    // The triggering message: who wrote it, and what.
    const [trigger] = await db
      .select({
        authorId: messages.authorId,
        anonName: messages.anonName,
        body: messages.body,
        kind: messages.kind,
      })
      .from(messages)
      .where(and(eq(messages.id, triggerMessageId), eq(messages.circleId, circleId)));
    if (!trigger) return { posted: false, reason: "trigger_missing" };

    // Never reply to the bot's own post, or to another bot (the persona seed
    // reflections are bot-authored) — that is how a self-reply loop is avoided.
    if (trigger.authorId) {
      const [author] = await db
        .select({ isBot: users.isBot })
        .from(users)
        .where(eq(users.id, trigger.authorId));
      if (author?.isBot) {
        return { posted: false, reason: "own_or_bot_trigger" };
      }
    }

    // Rate-limit: one bot reply per cooldown window per circle.
    const [recentBotMessage] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.circleId, circleId),
          eq(messages.authorId, botId),
          gte(messages.createdAt, new Date(Date.now() - BOT_COOLDOWN_MS)),
        ),
      )
      .limit(1);
    if (recentBotMessage) return { posted: false, reason: "cooldown" };

    // Escalation FIRST — screen the message the bot is about to answer. A flag
    // and the bot stays silent (screenReflection writes the reference-only audit
    // row). Reflections were already screened at submission, but re-screening the
    // trigger text here is cheap and keeps the "never reply onto a crisis" rule
    // absolute regardless of the trigger's kind.
    const { verdict } = await screenReflection({
      reflectionId: triggerMessageId,
      text: trigger.body,
    });
    if (verdict.flagged) {
      return { posted: false, reason: "silent_crisis" };
    }

    // Ground the reply in the current day's passage (YouVersion, never Gloo).
    const language = bot.language ?? "en";
    const dayNumber = await resolveCurrentDayNumber(circleId);
    const planDay = await loadCirclePlanDay(circleId, dayNumber);
    let passageText = "";
    if (planDay) {
      const passage = await fetchPassage(
        planDay.reference,
        effectiveVersionId(language, null),
        { format: "text" },
      );
      passageText = passage.content.slice(0, MAX_PASSAGE_CHARS);
    }

    const recentMessages = await loadRecentContext(circleId, botId);
    const triggerAuthorDisplayName = trigger.anonName ?? "a reader";

    const { output } = await generateCircleBotReply({
      botName: bot.name ?? "a fellow reader",
      passageReference: planDay?.reference ?? "",
      passageText,
      dayLabel: planDay?.label ?? "today's reading",
      recentMessages,
      triggerAuthorDisplayName,
      triggerText: trigger.body,
      language,
    });

    // Member-authored: real authorId, so it renders as an ordinary member post
    // and translates like any member message (Step 27).
    const [message] = await db
      .insert(messages)
      .values({
        circleId,
        authorId: botId,
        body: output.reply,
        sourceLanguage: language,
        kind: "message",
      })
      .returning({ id: messages.id });

    // Translate for other member languages, same as any member post.
    await translateNewMessage(message.id);

    return { posted: true, messageId: message.id };
  } catch (error) {
    return {
      posted: false,
      reason: "error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
