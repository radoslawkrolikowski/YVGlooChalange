// PreReading prompts — orchestration (Step 15).
//
// Ties together the per-user-per-day cache, the passage-text fetch (from
// YouVersion, the only source of Bible text), the user's goals and imported
// highlights, and the PreReading agent. Both session paths resolve through
// resolvePreReadingPrompts:
//
//   Path A (signed in): a cache row in pre_reading_prompts short-circuits
//     before any Gloo or YouVersion call — reopening the same passage returns
//     identical prompts and writes no new agent_logs row. A cache miss (or a
//     language change) generates and upserts.
//   Path B (Instant Access): no database row (per the brief) — prompts are
//     generated live from session defaults every call; the client caches them
//     in sessionStorage for the browser session, mirroring in-app highlights.

import { and, desc, eq } from "drizzle-orm";
import { generatePreReadingPrompts } from "@/agents/pre-reading";
import { effectiveVersionId } from "@/config/bible-versions";
import { db } from "@/db";
import { highlights, preReadingPrompts, users } from "@/db/schema";
import type { Session } from "@/lib/session";
import { fetchPassage } from "@/lib/youversion";

/** Recent imported highlight snippets passed to the agent as personalisation. */
const MAX_HIGHLIGHTS = 5;
/** Passage text is context only — cap it to keep the Gloo prompt small. */
const MAX_PASSAGE_CHARS = 4000;

/** The signed-in user's onboarding goals, or "" when unset. */
async function loadUserGoals(userId: string): Promise<string> {
  const [row] = await db
    .select({ goals: users.goals })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.goals ?? "";
}

/** The user's most recent imported highlight snippets — loose personalisation
 * context (relevance ranking is the Tier 3 Memory agent's job, not this). */
async function loadImportedHighlightSnippets(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ snippet: highlights.snippet })
    .from(highlights)
    .where(
      and(eq(highlights.userId, userId), eq(highlights.source, "imported")),
    )
    .orderBy(desc(highlights.importedAt))
    .limit(MAX_HIGHLIGHTS);
  return rows
    .map((row) => row.snippet)
    .filter((snippet): snippet is string => Boolean(snippet && snippet.trim()));
}

/** Passage text for context, from YouVersion. Null when the fetch fails —
 * the caller then hides the card, never blocking the reading screen. */
async function loadPassageText(
  reference: string,
  language: string,
  bibleVersionId: number | null,
): Promise<string | null> {
  try {
    const versionId = effectiveVersionId(language, bibleVersionId);
    const passage = await fetchPassage(reference, versionId, { format: "text" });
    return passage.content.slice(0, MAX_PASSAGE_CHARS);
  } catch {
    return null;
  }
}

/**
 * The 2–3 pre-reading prompts for this session and passage, or null when they
 * can't be produced (passage or generation failure) — the card stays hidden,
 * the reading experience never blocks.
 */
export async function resolvePreReadingPrompts(
  session: Session,
  reference: string,
): Promise<string[] | null> {
  const language = session.language ?? "en";

  // Path A cache hit: no Gloo call, no YouVersion call, no agent_logs row.
  if (session.kind === "user") {
    const [cached] = await db
      .select({
        language: preReadingPrompts.language,
        prompts: preReadingPrompts.prompts,
      })
      .from(preReadingPrompts)
      .where(
        and(
          eq(preReadingPrompts.userId, session.userId),
          eq(preReadingPrompts.reference, reference),
        ),
      )
      .limit(1);
    if (cached && cached.language === language) return cached.prompts;
  }

  const passageText = await loadPassageText(
    reference,
    language,
    session.bibleVersionId,
  );
  if (!passageText) return null;

  const goals =
    session.kind === "user"
      ? await loadUserGoals(session.userId)
      : (session.profile?.goals ?? "");
  const highlightSnippets =
    session.kind === "user"
      ? await loadImportedHighlightSnippets(session.userId)
      : [];

  const { prompts, model } = await generatePreReadingPrompts({
    passageReference: reference,
    passageText,
    goals,
    highlights: highlightSnippets,
    language,
  });

  // Cache for Path A only. Upsert so a language change regenerates in place.
  if (session.kind === "user") {
    await db
      .insert(preReadingPrompts)
      .values({ userId: session.userId, reference, language, prompts, model })
      .onConflictDoUpdate({
        target: [preReadingPrompts.userId, preReadingPrompts.reference],
        set: { language, prompts, model, createdAt: new Date() },
      });
  }

  return prompts;
}
