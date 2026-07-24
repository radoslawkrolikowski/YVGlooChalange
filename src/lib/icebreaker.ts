// Cold-start icebreaker — orchestration (Step 22).
//
// Ties the activation transition (a circle flipping forming → active on its
// second member, Step 16) to the thread (Step 17/20): claims the per-circle
// idempotency slot, loads the two members' real onboarding answers (Step 10),
// runs the icebreaker generation, and posts the result to the thread as a
// system message attributed to "Round" (messages.kind = "icebreaker", authorId
// null — it renders through Step 20's system-message identity).
//
// Idempotency ("fires exactly once per circle") is a database fence, not a
// check-then-act: circles.icebreaker_at is claimed with an atomic
// `UPDATE … WHERE icebreaker_at IS NULL RETURNING` BEFORE the Gloo call, so a
// second activation (dev: remove and re-add a member back to two) loses the
// race and posts nothing. A successful post leaves the timestamp set forever;
// a generation or post failure clears it so a later join can retry — a
// transient Gloo error must never permanently rob a circle of its opening.
//
// Path A only — circles are membership rows against users.id, so anonymous
// Instant Access sessions never reach this module.

import { and, asc, eq, isNull } from "drizzle-orm";
import {
  generateIcebreaker,
  type IcebreakerMember,
} from "@/agents/icebreaker";
import {
  CIRCLE_HOPE_OPTIONS,
  LIFE_SEASON_OPTIONS,
  MOTIVATION_OPTIONS,
  optionLabel,
  TOPIC_OPTIONS,
  type ProfileOption,
} from "@/config/profile";
import { db } from "@/db";
import {
  circleMembers,
  circles,
  messages,
  messageVariants,
  plans,
  users,
} from "@/db/schema";
import { loadCircleMemberLanguages } from "@/lib/circles";

/** Map a slug list to its display labels, dropping anything unrecognised. */
function labels(options: ProfileOption[], values: string[] | null): string[] {
  return (values ?? [])
    .map((value) => optionLabel(options, value))
    .filter((label): label is string => label !== null);
}

/**
 * The two founding members' answers, earliest-joined first, in the label form
 * the generator reads. Returns null when fewer than two members somehow remain
 * (a race with a departure) — the caller then posts nothing.
 */
async function loadFoundingMembers(
  circleId: string,
): Promise<{ members: [IcebreakerMember, IcebreakerMember]; language: string } | null> {
  const rows = await db
    .select({
      name: users.name,
      language: users.language,
      goals: users.goals,
      motivation: users.motivation,
      lifeSeason: users.lifeSeason,
      topics: users.topics,
      circleHopes: users.circleHopes,
    })
    .from(circleMembers)
    .innerJoin(users, eq(users.id, circleMembers.userId))
    .where(eq(circleMembers.circleId, circleId))
    .orderBy(asc(circleMembers.joinedAt))
    .limit(2);
  if (rows.length < 2) return null;

  const members = rows.map((row) => ({
    name: row.name ?? "Reader",
    goals: row.goals ?? "",
    motivation: optionLabel(MOTIVATION_OPTIONS, row.motivation),
    lifeSeason: optionLabel(LIFE_SEASON_OPTIONS, row.lifeSeason),
    topics: labels(TOPIC_OPTIONS, row.topics),
    circleHopes: labels(CIRCLE_HOPE_OPTIONS, row.circleHopes),
  })) as [IcebreakerMember, IcebreakerMember];

  // The base language is the founder's (earliest member's) preferred language,
  // falling back to the second member's, then English. It sets the messages-row
  // post; every OTHER distinct member language gets its own native generation as
  // a message_variants row (Step 28). Per brief §5.12 these are never translated
  // after the fact — the Translation Agent skips authorId-null system posts.
  const language = rows[0].language ?? rows[1].language ?? "en";
  return { members, language };
}

/**
 * Generate and post a circle's cold-start icebreaker, exactly once.
 *
 * Returns the posted message id, or null when nothing was posted: the
 * icebreaker already fired for this circle (the atomic claim lost), the circle
 * or its members/plan could not be resolved, or generation/posting failed
 * (claim released for a retry). Never throws — activating a circle must succeed
 * even when Round has nothing to say, so every failure path is swallowed here.
 */
export async function postIcebreaker(circleId: string): Promise<string | null> {
  // Claim the per-circle slot atomically BEFORE any Gloo call. A concurrent or
  // repeat activation finds icebreaker_at already set and returns no row.
  const [claim] = await db
    .update(circles)
    .set({ icebreakerAt: new Date() })
    .where(and(eq(circles.id, circleId), isNull(circles.icebreakerAt)))
    .returning({ id: circles.id, planId: circles.planId });
  if (!claim) return null;

  try {
    const [founding, planRow] = await Promise.all([
      loadFoundingMembers(circleId),
      db
        .select({ name: plans.name })
        .from(plans)
        .where(eq(plans.id, claim.planId))
        .limit(1),
    ]);
    if (!founding) throw new Error("Circle has fewer than two members");

    // The generation's model is recorded in agent_logs by the shared Gloo
    // client, so it is not stored again on the message row.
    const { message } = await generateIcebreaker({
      members: founding.members,
      planName: planRow[0]?.name ?? "your reading plan",
      language: founding.language,
    });

    // The thread post: no author, so it renders with Round's system identity.
    // sourceLanguage records which language this base generation is in — it is
    // NOT a hook for the Translation Agent (system messages are never
    // translated, brief §5.12). Step 28 reads it to know the base variant and
    // adds a native generation per other member language; Step 27's Translation
    // Agent must skip authorId-null system posts, leaving them to Step 28.
    const [posted] = await db
      .insert(messages)
      .values({
        circleId,
        authorId: null,
        body: message,
        sourceLanguage: founding.language,
        kind: "icebreaker",
      })
      .returning({ id: messages.id });

    // Step 28 — one native generation per OTHER member language. At activation a
    // circle has exactly the two founders, so this is at most one extra language,
    // but it keeps the icebreaker consistent with the rest of Round's per-language
    // posts (brief §5.12: never translated after the fact). Best-effort — a
    // failure leaves that reader on the base-language welcome.
    const planName = planRow[0]?.name ?? "your reading plan";
    const languages = await loadCircleMemberLanguages(circleId);
    for (const language of languages) {
      if (language === founding.language) continue;
      try {
        const variant = await generateIcebreaker({
          members: founding.members,
          planName,
          language,
        });
        await db
          .insert(messageVariants)
          .values({
            messageId: posted.id,
            language,
            body: variant.message,
            model: variant.model,
          })
          .onConflictDoNothing({
            target: [messageVariants.messageId, messageVariants.language],
          });
      } catch {
        // Best-effort: this reader falls back to the base-language icebreaker.
      }
    }

    return posted.id;
  } catch {
    // Release the claim so a later activation of this circle can try again.
    await db
      .update(circles)
      .set({ icebreakerAt: null })
      .where(eq(circles.id, circleId))
      .catch(() => {
        // Nothing more to do — the circle keeps its claim and simply goes
        // without an icebreaker rather than crashing the join.
      });
    return null;
  }
}
