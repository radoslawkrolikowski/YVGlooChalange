// Corpus split (Step 32) — a standalone ops script. Nothing in the running app
// imports it; it produces data, not behaviour.
//
// It turns the provided Psalms commentary PDF into ONE Markdown file per Psalm.
// Per-Psalm files rather than a single upload because Gloo's ingestion chunker
// cannot be disabled or tuned ("there is no setting to disable it, bypass it,
// or tune its size and overlap"): it cuts on paragraph boundaries, overlaps
// neighbouring chunks, and attributes every chunk to its PARENT ITEM. A single
// monolithic item would return every citation titled "Treasury of David", with
// nothing distinguishing Psalm 22 from Psalm 23 — and that item title is the
// only scope signal the Context Agent (Step 33) has, since Grounded
// Completions offers no metadata filtering. Gloo's own guidance is the remedy:
// "if your content must not be merged with a neighbor... upload each unit as
// its own item."
//
// Markdown rather than PDF slices because the chunker prefers structured text:
// "headings, paragraphs, and section breaks give the splitter good places to
// cut." Each file therefore opens with its canonical reference as a heading, so
// the reference lives in the retrievable chunk text itself and not only in the
// item metadata (whether item_title feeds the embedding is not documented, so
// scoping never rests on metadata alone).
//
// Usage: npm run corpus:split [-- path/to/commentary.pdf]
// Requires poppler's pdftotext on PATH (brew install poppler). Its -layout
// output on this PDF is clean: Psalm headings sit alone on their own line,
// pages are separated by a bare form feed, and there are no running headers or
// page numbers to strip.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const DEFAULT_PDF = "corpus/source/psalms-commentary.pdf";
const OUT_DIR = "corpus/psalms";

/** First half of the item title convention: "<Source> — Psalm <n>". */
const SOURCE_TITLE = "Treasury of David";
const ATTRIBUTION =
  "From *The Treasury of David* (Abridged) by Charles Spurgeon — public domain.";

/**
 * Provenance of the redistributed text, written to the head of manifest.json.
 *
 * This repository is public and the split Markdown is committed, so the corpus
 * carries its own chain of title rather than relying on the (gitignored) PDF.
 * `editionNotice` is the source document's own closing statement, quoted
 * verbatim from the last page — it is the only licence statement the PDF
 * carries, and it is what distinguishes the underlying work (out of copyright)
 * from this particular abridgement (compiled by a third party).
 */
const PROVENANCE = {
  work: "The Treasury of David",
  author: "Charles Spurgeon (1834–1892)",
  originalPublication: "1869–1885",
  underlyingWorkStatus:
    "Public domain. Spurgeon died in 1892 and the work was published 1869–1885, so the commentary itself is out of copyright worldwide.",
  edition: "The Treasury of David (Abridged)",
  editionNotice:
    "Obtained from www.spurgeon.org. Reformatted and abridged by Eternal Life Ministries. Additional Bible-based resources are available at www.spurgeongems.org.",
  editionNote:
    "The abridgement and reformatting are the work of Eternal Life Ministries, which distributes it free of charge; redistribution terms for this edition rest with them. The commentary text it contains is Spurgeon's and is public domain.",
  usage:
    "Chunked one file per Psalm and ingested into Gloo's Data Engine as grounding for the Context Agent (src/agents/context.ts). Retrieved commentary is restated in plain modern language before it reaches the Facilitator, and the digest UI renders a source attribution line whenever retrieval was used.",
} as const;

/** A Psalm heading: the number alone on its own line. */
const HEADING = /^Psalm (\d{1,3})$/;
/** The licence separator that ends the source document. */
const END_RULE = /^_{10,}$/;
/** Spurgeon's per-verse notes open with this, which gives us a verse range. */
const VERSE_MARKER = /^Verse (\d{1,3})/;

/** One row of corpus/psalms/manifest.json — the upload script's only input. */
export interface ManifestEntry {
  psalm: number;
  /** File name inside OUT_DIR. */
  file: string;
  /** item_title in the Content Library, per the corpus naming convention. */
  title: string;
  /** Stable producer_id so re-uploads deduplicate instead of copying. */
  producerId: string;
  /** e.g. "1–6" when the source's verse notes could be read, else null. */
  verseRange: string | null;
  chars: number;
}

function extractText(pdfPath: string): string {
  try {
    return execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error) {
    const hint =
      error instanceof Error && "code" in error && error.code === "ENOENT"
        ? "pdftotext not found — install poppler (brew install poppler)"
        : `pdftotext failed on ${pdfPath}`;
    throw new Error(hint, { cause: error });
  }
}

/**
 * Rewrap hard-wrapped PDF text into Markdown paragraphs. Form feeds are
 * dropped first: pdftotext puts one at the start of a line mid-paragraph, so
 * removing the character (rather than the line) keeps the paragraph intact.
 */
function toParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join(" "));
      current = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\f/g, "").trim();
    if (END_RULE.test(line)) break; // trailing licence block of the source
    if (line === "") flush();
    else current.push(line);
  }
  flush();
  return paragraphs;
}

function verseRangeOf(paragraphs: string[]): string | null {
  const verses = paragraphs
    .map((paragraph) => paragraph.match(VERSE_MARKER)?.[1])
    .filter((verse): verse is string => verse !== undefined)
    .map(Number);
  if (verses.length === 0) return null;
  const first = Math.min(...verses);
  const last = Math.max(...verses);
  return first === last ? `${first}` : `${first}–${last}`;
}

function renderMarkdown(
  psalm: number,
  paragraphs: string[],
  verseRange: string | null,
): string {
  const reference = verseRange ? `Psalm ${psalm}:${verseRange}` : `Psalm ${psalm}`;
  return [
    `# ${SOURCE_TITLE} — Psalm ${psalm}`,
    "",
    `Commentary on ${reference}. ${ATTRIBUTION}`,
    "",
    paragraphs.join("\n\n"),
    "",
  ].join("\n");
}

/** Remove only files this script owns, so a re-run cannot leave stale Psalms. */
function resetOutputDir(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(OUT_DIR)) {
    if (/^psalm-\d{3}\.md$/.test(file) || file === "manifest.json") {
      rmSync(join(OUT_DIR, file));
    }
  }
}

const pdfPath = process.argv[2] ?? DEFAULT_PDF;
console.log(`Reading ${pdfPath} …`);
const lines = extractText(pdfPath).split("\n");

// Collect heading positions, accepting a heading only when its number is the
// next one we have not seen yet. Line-wrapped prose in this PDF can start with
// the word "Psalm", and this ordering rule keeps such lines out.
const headings: Array<{ psalm: number; line: number }> = [];
let highestSeen = 0;
lines.forEach((rawLine, index) => {
  const match = rawLine.replace(/\f/g, "").trim().match(HEADING);
  if (!match) return;
  const psalm = Number(match[1]);
  if (psalm <= highestSeen || psalm > 150) return;
  highestSeen = psalm;
  headings.push({ psalm, line: index });
});

if (headings.length === 0) {
  console.error("No Psalm headings found — is this the expected PDF?");
  process.exit(1);
}

resetOutputDir();

const manifest: ManifestEntry[] = [];
const suspicious: number[] = [];

headings.forEach((heading, index) => {
  const end = headings[index + 1]?.line ?? lines.length;
  const paragraphs = toParagraphs(lines.slice(heading.line + 1, end));
  if (paragraphs.length === 0) {
    suspicious.push(heading.psalm);
    return;
  }

  const verseRange = verseRangeOf(paragraphs);
  const markdown = renderMarkdown(heading.psalm, paragraphs, verseRange);
  const file = `psalm-${String(heading.psalm).padStart(3, "0")}.md`;
  writeFileSync(join(OUT_DIR, file), markdown, "utf8");

  if (markdown.length < 1000) suspicious.push(heading.psalm);
  manifest.push({
    psalm: heading.psalm,
    file,
    title: `${SOURCE_TITLE} — Psalm ${heading.psalm}`,
    producerId: `psalms-commentary-psalm-${heading.psalm}`,
    verseRange,
    chars: markdown.length,
  });
});

writeFileSync(
  join(OUT_DIR, "manifest.json"),
  `${JSON.stringify(
    {
      source: SOURCE_TITLE,
      pdf: basename(pdfPath),
      provenance: PROVENANCE,
      items: manifest,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

const written = manifest.map((entry) => entry.psalm);
const missing = Array.from({ length: 150 }, (_, index) => index + 1).filter(
  (psalm) => !written.includes(psalm),
);

console.log(`Wrote ${manifest.length} files to ${OUT_DIR}/`);
console.log(
  `Total ${(manifest.reduce((sum, entry) => sum + entry.chars, 0) / 1000).toFixed(0)}k characters, ` +
    `smallest ${Math.min(...manifest.map((entry) => entry.chars))} chars, ` +
    `largest ${Math.max(...manifest.map((entry) => entry.chars))} chars`,
);
if (missing.length > 0) {
  // Expected for this PDF: the abridgement has no commentary on Psalm 119, so
  // 118 runs straight into 120. An uncovered Psalm is a legitimate corpus gap,
  // not a split bug — grounded queries for it report sources_returned: false.
  console.log(`No commentary in the source for: ${missing.join(", ")}`);
}
if (suspicious.length > 0) {
  console.log(`Unusually short — worth eyeballing: ${suspicious.join(", ")}`);
}
