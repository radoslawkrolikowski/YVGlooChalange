// Private grounding for the Prayer agent (Step 26; both paths since Step 30A).
//
// Assembles a compact, privacy-safe summary of the reader's OWN material —
// onboarding answers, their recent reflections, highlights, and today's
// reading — for the "daily" and "custom" prayer modes. Everything here is the
// reader's own data, shown only back to them; nothing is shared with any circle.
//
// Step 30A gives the anonymous path the same grounding rather than an empty
// context: an Instant Access session's answers and plan live in its signed
// token, and its reflections and highlights are now session-scoped rows tagged
// with the session id — so the prayer is drawn from what the visitor actually
// did this session, exactly as a member's is. Nothing here reads or writes a
// users row for Path B.

import { and, desc, eq, isNull } from "drizzle-orm";
import { PROFILE_DEFAULTS, type ProfileAnswers } from "@/config/profile";
import { db } from "@/db";
import { reflections } from "@/db/schema";
import {
  loadHighlightSummary,
  loadSessionHighlightList,
} from "@/lib/highlights";
import { loadAnonPlanState, loadUserPlanState } from "@/lib/plans";
import { loadUserProfileAnswers } from "@/lib/profile";
import type { Session } from "@/lib/session";
import { type SessionOwner } from "@/lib/session-owner";

export interface PrayerContext {
  /** Compact one-paragraph summary, or "" when nothing is on file. */
  text: string;
  /** USFM reference of today's reading, or null when no active plan. */
  readingReference: string | null;
  /** Human-readable label of today's reading, or null. */
  readingLabel: string | null;
}

/** Keep the context short — a prayer is grounded, not exhaustive. */
const MAX_REFLECTIONS = 3;
const MAX_HIGHLIGHTS = 3;
const SNIPPET_CHARS = 160;

function truncate(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** The owner's most recent unflagged reflections, newest first. */
async function recentReflections(owner: SessionOwner): Promise<string[]> {
  const rows = await db
    .select({ body: reflections.body })
    .from(reflections)
    .where(
      and(
        owner.kind === "user"
          ? eq(reflections.authorId, owner.userId)
          : and(
              eq(reflections.anonSessionId, owner.sessionId),
              isNull(reflections.authorId),
            ),
        eq(reflections.flagged, false),
      ),
    )
    .orderBy(desc(reflections.createdAt))
    .limit(MAX_REFLECTIONS);
  return rows.map((row) => truncate(row.body, SNIPPET_CHARS)).filter(Boolean);
}

/**
 * Highlight snippets worth praying from. Path A prefers the imported
 * YouVersion history (the reader's long-standing marks); an anonymous session
 * has no import path at all, so its in-app highlights from this session are the
 * only — and the right — material.
 */
async function highlightSnippets(owner: SessionOwner): Promise<string[]> {
  if (owner.kind === "user") {
    const summary = await loadHighlightSummary(owner.userId);
    return summary.sample
      .map((entry) => entry.snippet ?? entry.label)
      .filter((value): value is string => Boolean(value))
      .slice(0, MAX_HIGHLIGHTS);
  }
  const entries = await loadSessionHighlightList(owner);
  return entries
    .map((entry) => entry.text)
    .filter(Boolean)
    .slice(0, MAX_HIGHLIGHTS);
}

/** Builds the private context for whoever is asking, on either path. */
export async function buildPrayerContext(
  session: Session,
): Promise<PrayerContext> {
  const owner: SessionOwner =
    session.kind === "user"
      ? { kind: "user", userId: session.userId }
      : { kind: "anonymous", sessionId: session.sessionId };

  const [answers, highlights, planState, reflectionSnippets] =
    await Promise.all([
      session.kind === "user"
        ? loadUserProfileAnswers(session.userId)
        : Promise.resolve<ProfileAnswers>(session.profile ?? PROFILE_DEFAULTS),
      highlightSnippets(owner),
      session.kind === "user"
        ? loadUserPlanState(session.userId)
        : loadAnonPlanState(session.plan),
      recentReflections(owner),
    ]);

  const parts: string[] = [];

  if (answers.goals.trim()) parts.push(`Goals: ${truncate(answers.goals, SNIPPET_CHARS)}`);
  if (answers.lifeSeason) parts.push(`Life season: ${answers.lifeSeason}`);
  const topics = [...answers.topics, answers.topicsOther].filter(Boolean);
  if (topics.length > 0) parts.push(`Cares about: ${topics.join(", ")}`);

  if (reflectionSnippets.length > 0) {
    parts.push(`Recently reflected: ${reflectionSnippets.join(" | ")}`);
  }

  if (highlights.length > 0) {
    parts.push(`Has highlighted: ${highlights.join(" | ")}`);
  }

  return {
    text: parts.join(". "),
    readingReference: planState?.today.reference ?? null,
    readingLabel: planState?.today.label ?? null,
  };
}
