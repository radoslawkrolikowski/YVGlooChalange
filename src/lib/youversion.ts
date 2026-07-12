// Server-side YouVersion client — a thin adapter over the official
// @youversion/platform-core SDK.
//
// This module is the only place in the app that touches the SDK; the rest of
// the app consumes the stable Passage/BibleVersion/YouVersionApiError surface
// below, so SDK churn stays contained here. The app key is attached
// server-side on every request and must never reach the client bundle (the
// env var is deliberately not NEXT_PUBLIC_-prefixed).
//
// API notes:
// - References are USFM format, e.g. "JHN.3.16", "PSA.23", "JHN.3.1-5".
// - The versions endpoint requires a language filter; by default it lists
//   only versions license-enabled for the app key, `all_available` shows the
//   full catalogue (fetching a non-enabled version still returns 403 — see
//   src/config/bible-versions.ts for the licensing story).

import {
  ApiClient,
  BibleClient,
  type BibleVersion as SdkBibleVersion,
} from "@youversion/platform-core";

export class YouVersionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "YouVersionApiError";
  }
}

export interface Passage {
  /** Human-readable reference, e.g. "John 3:16". */
  reference: string;
  /** Passage text (plain text or HTML depending on the requested format). */
  content: string;
  /** Numeric YouVersion version ID the text came from. */
  versionId: number;
  /** Version abbreviation, e.g. "NIV" — shown next to every passage. */
  versionAbbreviation: string;
}

export interface BibleVersion {
  /** Numeric YouVersion version ID — passed on every passage fetch. */
  id: number;
  /** e.g. "NVI" */
  abbreviation: string;
  /** Version title in its own language. */
  title: string;
  /** BCP-47 language tag as returned by the API, e.g. "es". */
  language: string;
  /** Short copyright text when the API provides one. */
  copyright?: string;
  /** "Open in Bible App" deep link for this version. */
  deepLink?: string;
}

export interface BibleIndexChapter {
  /** Passage ID to fetch this chapter with, e.g. "JHN.3". */
  passageId: string;
  /** Chapter title, usually the chapter number, e.g. "3". */
  title: string;
  verseCount: number;
}

export interface BibleIndexBook {
  /** USFM book ID, e.g. "JHN". */
  id: string;
  /** Short book title, e.g. "John". */
  title: string;
  fullTitle: string;
  abbreviation: string;
  /** Canonical section, e.g. "old_testament", "new_testament". */
  canon: string;
  chapters: BibleIndexChapter[];
}

export interface BibleIndex {
  versionId: number;
  /** Text direction, "ltr" or "rtl". */
  textDirection: string;
  books: BibleIndexBook[];
}

// The versions endpoint takes ISO 639-3 language ranges; the app speaks
// ISO 639-1 (en/es/pt) everywhere else. Two-letter codes are mapped, and
// three-letter codes pass through so any 639-3 tag works directly.
const ISO_639_1_TO_3: Record<string, string> = {
  en: "eng",
  es: "spa",
  pt: "por",
  fr: "fra",
  de: "deu",
  zh: "zho",
  ar: "ara",
  hi: "hin",
  ru: "rus",
  ko: "kor",
  ja: "jpn",
};

export function toLanguageRange(language: string): string {
  const tag = language.trim().toLowerCase();
  if (tag.length === 2) {
    const mapped = ISO_639_1_TO_3[tag];
    if (!mapped) {
      throw new YouVersionApiError(
        `Unsupported two-letter language code "${language}" — pass an ISO 639-3 code instead`,
        400,
        "toLanguageRange",
      );
    }
    return mapped;
  }
  return tag;
}

let cachedBibleClient: BibleClient | null = null;

function bibleClient(): BibleClient {
  if (!cachedBibleClient) {
    const appKey = process.env.YOUVERSION_API_KEY;
    if (!appKey) {
      throw new Error("YOUVERSION_API_KEY is not set — see .env.example");
    }
    cachedBibleClient = new BibleClient(new ApiClient({ appKey }));
  }
  return cachedBibleClient;
}

// The SDK throws plain Errors with a numeric `status` property attached for
// HTTP failures; normalise everything to YouVersionApiError.
async function callSdk<T>(endpoint: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof YouVersionApiError) throw error;
    const status =
      error !== null &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 0;
    throw new YouVersionApiError(
      `YouVersion ${endpoint} failed${status ? ` (${status})` : ""}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      status,
      endpoint,
    );
  }
}

function toBibleVersion(v: SdkBibleVersion): BibleVersion {
  return {
    id: v.id,
    abbreviation: v.abbreviation || v.localized_abbreviation,
    title: v.title || v.localized_title,
    language: v.language_tag,
    copyright: v.copyright ?? undefined,
    deepLink: v.youversion_deep_link,
  };
}

/**
 * Fetch a passage in a specific version. `reference` is USFM, e.g.
 * "JHN.3.16", "PSA.23", "JHN.3.1-5".
 */
export async function fetchPassage(
  reference: string,
  versionId: number,
  options: { format?: "text" | "html" } = {},
): Promise<Passage> {
  const endpoint = `passage ${reference} in version ${versionId}`;
  const passage = await callSdk(endpoint, () =>
    bibleClient().getPassage(versionId, reference, options.format ?? "text"),
  );

  if (!passage.content) {
    throw new YouVersionApiError(
      `Passage response for ${reference} contained no content`,
      502,
      endpoint,
    );
  }

  // The passage payload does not embed version metadata; fetch the version
  // record for its abbreviation, which the UI must always display.
  const version = await fetchVersion(versionId);

  return {
    reference: passage.reference || reference,
    content: passage.content,
    versionId,
    versionAbbreviation: version.abbreviation,
  };
}

/** Fetch a single Bible version record by its numeric ID. */
export async function fetchVersion(versionId: number): Promise<BibleVersion> {
  const endpoint = `version ${versionId}`;
  return toBibleVersion(
    await callSdk(endpoint, () => bibleClient().getVersion(versionId)),
  );
}

/**
 * Fetch the book/chapter structure of a Bible version — drives the book and
 * chapter pickers. The SDK's full index also carries every verse of every
 * chapter; it is slimmed here to per-chapter passage IDs and verse counts,
 * which is what navigation needs and what is worth caching.
 */
export async function fetchBibleIndex(versionId: number): Promise<BibleIndex> {
  const endpoint = `index for version ${versionId}`;
  const index = await callSdk(endpoint, () =>
    bibleClient().getIndex(versionId),
  );

  return {
    versionId,
    textDirection: index.text_direction,
    books: index.books.map((book) => ({
      id: book.id,
      title: book.title,
      fullTitle: book.full_title,
      abbreviation: book.abbreviation,
      canon: book.canon,
      chapters: book.chapters.map((chapter) => ({
        passageId: chapter.passage_id,
        title: chapter.title,
        verseCount: chapter.verses.length,
      })),
    })),
  };
}

/**
 * List Bible versions for a language. Accepts ISO 639-1 (en/es/pt) or
 * ISO 639-3 (eng/spa/por) codes. Includes the full catalogue, not just
 * versions already license-enabled for the app key.
 */
export async function listBibleVersions(
  language: string,
): Promise<BibleVersion[]> {
  const range = toLanguageRange(language);
  const endpoint = `versions for language ${range}`;
  const collection = await callSdk(endpoint, () =>
    bibleClient().getVersions(range, undefined, {
      all_available: true,
      page_size: 99,
    }),
  );
  return collection.data.map(toBibleVersion);
}
