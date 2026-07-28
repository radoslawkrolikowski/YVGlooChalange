// Context Agent — real implementation (Step 33).
//
// Runs before the Facilitator, once per circle per day. It retrieves commentary
// for the day's passage from the Step 32 corpus and hands the Facilitator a
// plain-modern-language restatement of it as extra grounding, plus the source
// attribution line the digest card renders.
//
// The path is Search + Completions V2, not one-call Grounded Completions (see
// the plan's retrieval architecture decision). Four moves, in order:
//
//   1. resolve the day's label to exactly ONE corpus file (src/lib/corpus.ts);
//   2. one Search call, over-fetching wide (limit 100, certainty 0) because
//      server-side filtering does not exist;
//   3. keep only the chunks whose `filename` is that file, best certainty first
//      and then back into `part` (reading) order;
//   4. one Completions V2 call restating those chunks in modern language, in
//      the circle's language.
//
// Coverage is therefore a FACT, not an inference: zero surviving chunks means
// the corpus does not cover this passage, and the agent returns the stub's
// no-op result so the Facilitator runs ungrounded exactly as before. That is
// what makes an uncovered chapter inside a covered book (Psalm 119) behave
// correctly, where Grounded Completions' `sources_returned` reported `true`
// with citations from Psalms 106/118/128/149.
//
// The query is built from the PASSAGE ALONE — no reflections, no circle themes.
// Per brief §5.13 this agent's job is the passage's historical context and word
// notes (the Facilitator synthesises what members said), and a theme-laden query
// measurably drifts. One useful consequence: retrieval is a pure function of
// (passage, language), identical for every circle on that plan day, so the
// result is cached and reused across circles in a sweep instead of repeated.

import { chunksForPassage, corpusChapterLabel } from "@/lib/corpus";
import { chatCompletion, searchCorpus, type GlooSearchChunk } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

export interface ContextInput {
  /**
   * The plan day's HUMAN label, e.g. "Psalm 23" or "Psalm 139:1–18" — never the
   * USFM reference. Retrieval is semantic over chunk text, where "PSA.23"
   * matches nothing; any verse span is ignored, since commentary is filed per
   * chapter.
   */
  passageLabel: string;
  /** Language the restated commentary is written in (ISO 639-1). */
  language: string;
}

/** Retrieved-and-modernised commentary handed to the Facilitator (Step 33). */
export interface ContextOutput {
  /** Plain modern-language commentary grounding, or null when uncovered. */
  grounding: string | null;
  /** Attribution line for the digest UI when RAG was used. */
  sourceAttribution: string | null;
}

export interface ContextRetrieval extends ContextOutput {
  /** The one corpus file this passage may draw from; null when uncoverable. */
  corpusFile: string | null;
  /** Chunks that survived the filename filter and entered the prompt. */
  chunksUsed: number;
  /** Model that restated the commentary; null when nothing was retrieved. */
  model: string | null;
}

/** Chunks handed to the restatement — ~4–5k chars, not the whole item. */
const CHUNK_BUDGET = 12;

/** Cache lifetime for one passage's retrieval, shared across circles. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Bounded so a long-lived serverless instance cannot grow one indefinitely. */
const CACHE_MAX_ENTRIES = 60;

const SYSTEM_PROMPT =
  "You are the Context agent for Round, an app for small-group Bible reading. " +
  "You are given excerpts from a public-domain Bible commentary written in archaic English. " +
  "Restate them in plain, modern, everyday language for a reader with no theological training. " +
  "Keep only what genuinely helps someone understand the passage: historical and cultural background, " +
  "what specific words or images meant to the original audience, and observations about the text itself. " +
  "Write 3 to 5 sentences of continuous prose. " +
  "Use ONLY what the excerpts say — never add history, doctrine, or detail of your own, and never quote or paraphrase Bible verses at length. " +
  "Do not address the reader, do not exhort or apply, do not add a title, headings or markdown. " +
  "Write directly in the requested language. Respond with the restated prose only.";

const cache = new Map<string, { expiresAt: number; value: ContextRetrieval }>();

/** The no-op result: the Facilitator then runs exactly as it did before Step 33. */
function noCoverage(corpusFile: string | null): ContextRetrieval {
  return {
    grounding: null,
    sourceAttribution: null,
    corpusFile,
    chunksUsed: 0,
    model: null,
  };
}

/**
 * "Historical context from Treasury of David, public domain", built from the
 * chunks' own `item_title` ("Treasury of David — Psalm 23") — so the line names
 * the item the grounding actually came from rather than a hardcoded source.
 * Every surviving chunk shares one item (they share one filename), so the first
 * title present is the item's title. "Public domain" is a constant: the corpus
 * admits public-domain commentary only (Step 32).
 */
function buildSourceAttribution(chunks: GlooSearchChunk[]): string | null {
  const title = chunks.find((chunk) => chunk.itemTitle)?.itemTitle;
  if (!title) return null;
  const source = title.split(/\s+[—–-]\s+/)[0].trim() || title.trim();
  return `Historical context from ${source}, public domain`;
}

function cacheGet(key: string): ContextRetrieval | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key: string, value: ContextRetrieval): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

/**
 * Retrieve and modernise the commentary for one passage.
 *
 * Never throws. Grounding is optional by design (Tier 2, brief §5.13), so a
 * search or restatement failure degrades to the no-op result and the digest is
 * still written — an ungrounded digest is a far better outcome than no digest.
 * The failure itself is not silent: the Gloo client has already written the
 * error row to agent_logs.
 */
export async function retrieveCommentaryContext(
  input: ContextInput,
): Promise<ContextRetrieval> {
  const query = corpusChapterLabel(input.passageLabel);
  // No corpus file can cover this passage (any book but Psalms today). No Gloo
  // call is made at all — there is nothing to search for.
  if (!query) return noCoverage(null);

  const cacheKey = `${query}|${input.language}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const hits = await searchCorpus({
      agentName: "context",
      query: `${query} commentary`,
    });

    // Identity, not similarity: everything from another Psalm's item is dropped
    // here, before a single chunk can reach a prompt.
    const chunks = chunksForPassage(hits, input.passageLabel, CHUNK_BUDGET);
    if (chunks.length === 0) {
      // A covered book with an uncovered chapter lands here. Cached too: every
      // circle on this plan day would otherwise repeat the same empty search.
      const result = noCoverage(corpusChapterLabel(input.passageLabel));
      cacheSet(cacheKey, result);
      return result;
    }

    const commentary = chunks.map((chunk) => chunk.snippet).join("\n\n");
    const completion = await chatCompletion({
      agentName: "context",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Commentary excerpts for ${query}, in reading order:`,
            "",
            commentary,
            "",
            `Write the restatement in this language (ISO 639-1): ${input.language}`,
            "",
            "Restate the historical context and word notes above in 3 to 5 plain modern sentences.",
          ].join("\n"),
        },
      ],
      maxTokens: 400,
    });

    const grounding = completion.content.trim();
    if (!grounding) return noCoverage(chunks[0]?.filename ?? null);

    const result: ContextRetrieval = {
      grounding,
      sourceAttribution: buildSourceAttribution(chunks),
      corpusFile: chunks[0]?.filename ?? null,
      chunksUsed: chunks.length,
      model: completion.model,
    };
    cacheSet(cacheKey, result);
    return result;
  } catch {
    // Not cached — a transient Gloo failure must not suppress grounding for the
    // rest of the cache window.
    return noCoverage(null);
  }
}

export const context: Agent<ContextInput, ContextOutput> = {
  name: "context",
  displayName: "Context",
  description:
    "Tier 2 — runs before the Facilitator, wherever the commentary corpus covers the passage. Searches the corpus, keeps only the chunks from the passage's own item, restates them in plain modern language, and passes them as grounding.",
  tier: 2,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    passageLabel: "Psalm 23",
    language: "en",
  },
  async run(input): Promise<AgentRunOk<ContextOutput>> {
    const retrieval = await retrieveCommentaryContext(input);
    return {
      status: "ok",
      agent: "context",
      // "none" when the corpus does not cover the passage: no completion was
      // made, so there is no model to report — the run is still a success.
      model: retrieval.model ?? "none",
      output: {
        grounding: retrieval.grounding,
        sourceAttribution: retrieval.sourceAttribution,
      },
    };
  },
};
