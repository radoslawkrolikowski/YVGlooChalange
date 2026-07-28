// "Ask about this passage" — grounded Q&A over the commentary corpus (Step 33A).
//
// Same Search + Completions V2 path as the Context Agent (Step 33) and the same
// passage→filename mapping (src/lib/corpus.ts), with one difference that matters:
// the search query is the READER'S QUESTION, not a fixed passage label. That is
// exactly where the filename filter earns its keep. Measured on the live corpus,
// "why does the psalmist call God a shepherd?" drags semantic retrieval across
// the whole Psalter — 1 of 6 grounded-path citations stayed on-chapter, the rest
// drifted into Psalms 80/100/54/50/113 where shepherd language also lives.
// Filtering on item identity removes that failure mode instead of mitigating it:
// a weak or wandering question can cost recall, never correctness.
//
// Coverage is therefore a fact, not a guess. Zero surviving chunks — an
// uncovered book (Mark), or an uncovered chapter inside a covered book
// (Psalm 119) — returns the no-coverage state, and NO completion call is made.
// The model is never given the chance to answer from general knowledge.
//
// Nothing here is persisted: no table, no history. The agent_logs rows written
// by the Gloo client (plus the retrieval note below) are the whole audit trail,
// identical for signed-in and anonymous readers.

import {
  chunksForPassage,
  corpusChapterLabel,
  corpusFileForPassage,
} from "@/lib/corpus";
import {
  chatCompletion,
  logAgentNote,
  searchCorpus,
  type GlooSearchChunk,
} from "@/lib/gloo";

/** Agent name on every agent_logs row this feature writes. Distinct from the
 * digest's "context" rows so question-driven retrieval can be read on its own. */
export const QA_AGENT_NAME = "context-qa";

/**
 * Chunks handed to the answering call. Measured: a verse-level question returns
 * ~15 targeted chunks (~6.8k chars) from the right item — enough to answer from
 * without paying for the whole commentary. Logged per question (see below) so
 * this can be tuned against real questions rather than guessed.
 */
const CHUNK_BUDGET = 15;

/** Longest question accepted — the input is a single line, not an essay. */
export const MAX_QUESTION_LENGTH = 300;

const SYSTEM_PROMPT =
  "You are answering a reader's question about a Bible passage for Round, an app for small-group Bible reading. " +
  "You are given excerpts from a public-domain Bible commentary on that passage, written in archaic English. " +
  "Answer ONLY from those excerpts. " +
  "You have no other knowledge: do not use anything you know about the Bible, history, theology, or the passage from any other source, " +
  "and do not fill gaps with plausible detail. " +
  "If the excerpts do not address the question, say so plainly in one sentence and stop — never substitute a general answer. " +
  "When they do address it, answer in 2 to 5 sentences of plain, modern, everyday language for a reader with no theological training, " +
  "restating the archaic wording rather than quoting it at length. " +
  "Do not add a title, headings, markdown, or a closing exhortation. " +
  "Write directly in the requested language. Respond with the answer only.";

export interface PassageQuestionInput {
  /**
   * The plan day's HUMAN label, e.g. "Psalm 23" or "Psalm 139:1–18". Retrieval
   * is semantic over chunk text where USFM matches nothing, and the label is
   * what the corpus mapping parses; any verse span is ignored, since commentary
   * is filed per chapter.
   */
  passageLabel: string;
  /** The reader's question, already screened by the Escalation gate. */
  question: string;
  /** Language the answer is written in (ISO 639-1). */
  language: string;
}

export type PassageAnswer =
  | {
      status: "answered";
      answer: string;
      /** Source footer line, from the chunks' own item_title. */
      attribution: string | null;
      /** Chunks that survived the filename filter and entered the prompt. */
      chunksUsed: number;
    }
  /** The corpus does not cover this passage at all. No completion call was made. */
  | { status: "no-coverage" }
  /**
   * The corpus DOES cover this passage, but nothing in its commentary matched
   * the question. Kept distinct from no-coverage because the two are different
   * facts and the reader is told the true one; no completion call is made for
   * either, so neither can be answered from general knowledge.
   */
  | { status: "off-topic" };

/**
 * "Treasury of David — Psalm 23, public domain", built from the chunks' own
 * `item_title` rather than a hardcoded source, so the footer names the item the
 * answer actually came from. Every surviving chunk shares one filename and
 * therefore one item, so the first title present is that item's title. "Public
 * domain" is a constant: the corpus admits public-domain commentary only
 * (Step 32).
 */
function buildAttribution(chunks: GlooSearchChunk[]): string | null {
  const title = chunks.find((chunk) => chunk.itemTitle)?.itemTitle?.trim();
  return title ? `${title}, public domain` : null;
}

/** Everything up to the last sentence-ending punctuation, or the text unchanged
 * when it holds no complete sentence at all. */
function trimToLastSentence(text: string): string {
  const lastEnd = Math.max(
    text.lastIndexOf("."),
    text.lastIndexOf("!"),
    text.lastIndexOf("?"),
  );
  return lastEnd === -1 ? text : text.slice(0, lastEnd + 1);
}

/**
 * Does the corpus hold this passage's item at all?
 *
 * Asked only when the question's own retrieval kept nothing, to tell two very
 * different facts apart: "Round has no commentary on Mark 4" and "the
 * commentary on Psalm 23 doesn't touch on that". It re-asks with the Step 33
 * query form — the passage named plainly, which is what the item's own text is
 * about — so a hit means the file exists and simply had nothing for the reader's
 * question. One extra search, never a completion, and never on the answered
 * path. A search failure here is treated as "covered": the vaguer message is
 * the safer one to be wrong with.
 */
async function passageIsCovered(passageLabel: string): Promise<boolean> {
  const query = corpusChapterLabel(passageLabel);
  if (!query) return false;
  try {
    const hits = await searchCorpus({
      agentName: QA_AGENT_NAME,
      query: `${query} commentary`,
    });
    return chunksForPassage(hits, passageLabel).length > 0;
  } catch {
    return true;
  }
}

/**
 * Answer one question about one passage from the commentary corpus.
 *
 * Throws only when Gloo itself fails (the client has already logged the error
 * row); "the corpus has nothing for this" is a normal, non-error outcome.
 */
export async function answerPassageQuestion(
  input: PassageQuestionInput,
): Promise<PassageAnswer> {
  const file = corpusFileForPassage(input.passageLabel);
  // Nothing in the corpus can cover this passage (any book but Psalms today).
  // No search, no completion — there is nothing to look through.
  if (!file) {
    await logAgentNote(
      QA_AGENT_NAME,
      `question "${input.question}" — ${input.passageLabel} maps to no corpus file; 0 chunks`,
    );
    return { status: "no-coverage" };
  }

  // The question itself is the query: it retrieves far more targeted chunks
  // than the passage label would. Over-fetch wide (the client's defaults:
  // limit 100, certainty 0) because server-side filtering does not exist.
  const hits = await searchCorpus({
    agentName: QA_AGENT_NAME,
    query: input.question,
  });

  // Identity, not similarity: every chunk from another Psalm's item is dropped
  // here, before one of them can reach a prompt.
  const chunks = chunksForPassage(hits, input.passageLabel, CHUNK_BUDGET);
  await logAgentNote(
    QA_AGENT_NAME,
    `question "${input.question}" — ${hits.length} chunks retrieved, ${chunks.length} kept from ${file}`,
  );
  if (chunks.length === 0) {
    // An uncovered chapter inside a covered book (Psalm 119) lands here, and so
    // does a question whose retrieval found nothing on-item. Both get an honest
    // answer and neither gets a completion call — but they are not the same
    // fact, so one cheap probe decides which one the reader is told.
    return (await passageIsCovered(input.passageLabel))
      ? { status: "off-topic" }
      : { status: "no-coverage" };
  }

  const commentary = chunks.map((chunk) => chunk.snippet).join("\n\n");
  const completion = await chatCompletion({
    agentName: QA_AGENT_NAME,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          `Passage: ${input.passageLabel}`,
          "",
          "Commentary excerpts, in reading order:",
          "",
          commentary,
          "",
          `Reader's question: ${input.question}`,
          "",
          `Write the answer in this language (ISO 639-1): ${input.language}`,
        ].join("\n"),
      },
    ],
    // Sized for reasoning models: Gloo routes some calls to models whose
    // thinking tokens are spent from this same budget, so a budget measuring
    // only the prose comes back as a fragment (see src/agents/summary.ts).
    maxTokens: 900,
  });

  // The client already re-asks once with a bigger budget; if it is STILL cut
  // off, trim back to the last complete sentence rather than show the reader a
  // dangling clause or spend a third call.
  const answer = completion.truncated
    ? trimToLastSentence(completion.content.trim())
    : completion.content.trim();
  if (!answer) return { status: "no-coverage" };

  return {
    status: "answered",
    answer,
    attribution: buildAttribution(chunks),
    chunksUsed: chunks.length,
  };
}
