// Private grounding for the Prayer agent (Step 26).
//
// Assembles a compact, privacy-safe summary of a Path A user's OWN material —
// onboarding answers, their recent reflections, imported/in-app highlights,
// and today's reading — for the "daily" and "custom" prayer modes. Everything
// here is the user's own data, shown only back to them; nothing is shared with
// any circle. Anonymous (Path B) sessions have no server-side history, so the
// route builds a minimal context for them (language only) and the prayer is a
// general one.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reflections } from "@/db/schema";
import { loadHighlightSummary } from "@/lib/highlights";
import { loadUserPlanState } from "@/lib/plans";
import { loadUserProfileAnswers } from "@/lib/profile";

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

/** The user's most recent unflagged reflections, newest first. */
async function recentReflections(userId: string): Promise<string[]> {
  const rows = await db
    .select({ body: reflections.body })
    .from(reflections)
    .where(and(eq(reflections.authorId, userId), eq(reflections.flagged, false)))
    .orderBy(desc(reflections.createdAt))
    .limit(MAX_REFLECTIONS);
  return rows.map((row) => truncate(row.body, SNIPPET_CHARS)).filter(Boolean);
}

/** Build the private context for a signed-in (Path A) user. */
export async function buildUserPrayerContext(
  userId: string,
): Promise<PrayerContext> {
  const [answers, highlights, planState, reflectionSnippets] = await Promise.all([
    loadUserProfileAnswers(userId),
    loadHighlightSummary(userId),
    loadUserPlanState(userId),
    recentReflections(userId),
  ]);

  const parts: string[] = [];

  if (answers.goals.trim()) parts.push(`Goals: ${truncate(answers.goals, SNIPPET_CHARS)}`);
  if (answers.lifeSeason) parts.push(`Life season: ${answers.lifeSeason}`);
  const topics = [...answers.topics, answers.topicsOther].filter(Boolean);
  if (topics.length > 0) parts.push(`Cares about: ${topics.join(", ")}`);

  if (reflectionSnippets.length > 0) {
    parts.push(`Recently reflected: ${reflectionSnippets.join(" | ")}`);
  }

  const highlightSnippets = highlights.sample
    .map((entry) => entry.snippet ?? entry.label)
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_HIGHLIGHTS);
  if (highlightSnippets.length > 0) {
    parts.push(`Has highlighted: ${highlightSnippets.join(" | ")}`);
  }

  return {
    text: parts.join(". "),
    readingReference: planState?.today.reference ?? null,
    readingLabel: planState?.today.label ?? null,
  };
}
