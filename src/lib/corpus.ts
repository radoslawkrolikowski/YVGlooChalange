// Commentary corpus scoping (Step 32).
//
// The corpus is one Data Engine item per book+chapter, each uploaded from a file
// named by strict convention (psalm-023.md). Search returns chunks carrying that
// filename, so a passage maps to exactly ONE acceptable file and every other
// chunk is discarded before it can reach a prompt.
//
// This is deliberately identity matching, not similarity matching. Semantic
// retrieval alone drifts to neighbouring Psalms — measured on the live corpus,
// a query for Psalm 23 returns Psalm 93 chunks, and a reader's question about
// shepherd imagery pulls Psalms 80/100/54/50/113 — and an uncovered chapter
// inside a covered book (Psalm 119, absent from this abridgement) comes back
// looking grounded. Filtering on filename removes both failure modes: a weak
// query costs recall, never correctness.

import type { GlooSearchChunk } from "@/lib/gloo";

/**
 * The corpus file a passage's commentary must come from, or null when the
 * corpus cannot cover it at all (any book other than Psalms today).
 *
 * Takes the human label a plan day already carries ("Psalm 23", "Psalm 139:1–18")
 * — never the USFM reference, which matches nothing in a semantic search. Any
 * verse span is ignored: commentary is filed per chapter, so a partial-chapter
 * day maps to its chapter's file.
 */
export function corpusFileForPassage(label: string): string | null {
  const chapter = psalmChapter(label);
  if (chapter === null) return null;
  return `psalm-${String(chapter).padStart(3, "0")}.md`;
}

/**
 * The chapter-level name of the passage ("Psalm 139" for "Psalm 139:1–18"), or
 * null when the corpus cannot cover it.
 *
 * This is what a search `query` should name: the corpus files one item per
 * chapter, so the verse span narrows nothing and only skews the embedding. The
 * USFM reference is never used here — `PSA.139` matches no chunk text.
 */
export function corpusChapterLabel(label: string): string | null {
  const chapter = psalmChapter(label);
  return chapter === null ? null : `Psalm ${chapter}`;
}

/** The Psalm number a plan-day label names, ignoring any verse span. */
function psalmChapter(label: string): number | null {
  // "Psalm 23", "Psalms 23", "Psalm 139:1-18", "Psalm 139:1–18" (en dash)
  const match = label.trim().match(/^psalms?\s+(\d{1,3})\b/i);
  if (!match) return null;

  const chapter = Number(match[1]);
  if (chapter < 1 || chapter > 150) return null;
  return chapter;
}

/**
 * Keep only the chunks belonging to this passage's own corpus file, in reading
 * order. An empty result means the corpus does not cover the passage — a fact,
 * not a guess, which is what callers gate their grounding on.
 *
 * When a `limit` is given the chunks are chosen by CERTAINTY and only then put
 * back into reading order. Truncating in `part` order instead would keep the
 * opening of a long commentary and throw away the passage the query was
 * actually about: for "why do the rod and staff bring comfort?" the relevant
 * notes sit at parts 20–27 of the Psalm 23 item, and a part-ordered slice cut
 * them, which made the model answer "the commentary does not address this".
 */
export function chunksForPassage(
  chunks: GlooSearchChunk[],
  label: string,
  limit?: number,
): GlooSearchChunk[] {
  const file = corpusFileForPassage(label);
  if (!file) return [];

  const scoped = chunks.filter((chunk) => chunk.filename === file);
  const selected =
    limit === undefined
      ? scoped
      : [...scoped]
          .sort((a, b) => (b.certainty ?? 0) - (a.certainty ?? 0))
          .slice(0, limit);

  return selected.sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
}
