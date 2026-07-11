// Server-side YouVersion Platform API client.
//
// This module is the only place in the app that talks to YouVersion. The app
// key is attached server-side on every request and must never reach the
// client bundle (the env var is deliberately not NEXT_PUBLIC_-prefixed).
//
// API notes (developers.youversion.com):
// - Auth: `X-YVP-App-Key` header on every request.
// - Passage: GET /v1/bibles/{versionId}/passages/{reference}
//   Reference is USFM format, e.g. "JHN.3.16" or "PSA.23". Content is HTML
//   by default; `format=text` returns plain text.
// - Versions: GET /v1/bibles?language_ranges[]={iso639-3}
//   The language filter is mandatory (422 without it). By default only
//   versions enabled for the app key are listed; `all_available=true` shows
//   the full catalogue.

const BASE_URL = "https://api.youversion.com/v1";

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
  /** USFM reference the passage was requested with, e.g. "JHN.3.16". */
  reference: string;
  /** Passage text (plain text or HTML depending on the requested format). */
  content: string;
  /** Numeric YouVersion version ID the text came from. */
  versionId: number;
  /** Version abbreviation, e.g. "NIV" — shown next to every passage. */
  versionAbbreviation: string;
  /** Copyright/attribution text when the API provides one. */
  copyright?: string;
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

function appKey(): string {
  const key = process.env.YOUVERSION_API_KEY;
  if (!key) {
    throw new Error("YOUVERSION_API_KEY is not set — see .env.example");
  }
  return key;
}

async function yvFetch(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "X-YVP-App-Key": appKey(), Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    throw new YouVersionApiError(
      `YouVersion request failed before a response was received: ${
        error instanceof Error ? error.message : String(error)
      }`,
      0,
      path,
    );
  }

  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 500);
    throw new YouVersionApiError(
      `YouVersion responded ${response.status} for ${path}`,
      response.status,
      path,
      body,
    );
  }

  return response.json();
}

function asRecord(value: unknown, endpoint: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new YouVersionApiError(
      `Unexpected YouVersion response shape (expected object)`,
      502,
      endpoint,
      JSON.stringify(value)?.slice(0, 500),
    );
  }
  return value as Record<string, unknown>;
}

/**
 * Fetch a passage in a specific version. `reference` is USFM, e.g.
 * "JHN.3.16", "PSA.23", "MRK.1.1-MRK.1.8".
 */
export async function fetchPassage(
  reference: string,
  versionId: number,
  options: { format?: "text" | "html" } = {},
): Promise<Passage> {
  const format = options.format ?? "text";
  const endpoint = `/bibles/${versionId}/passages/${encodeURIComponent(
    reference,
  )}?format=${format}`;
  const data = asRecord(await yvFetch(endpoint), endpoint);

  const content = data.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new YouVersionApiError(
      `Passage response for ${reference} contained no content`,
      502,
      endpoint,
      JSON.stringify(data).slice(0, 500),
    );
  }

  // The passage payload may not embed version metadata; fetch the version
  // record for its abbreviation, which the UI must always display.
  const version = await fetchVersion(versionId);

  return {
    reference: typeof data.reference === "string" ? data.reference : reference,
    content,
    versionId,
    versionAbbreviation: version.abbreviation,
    copyright: typeof data.copyright === "string" ? data.copyright : undefined,
  };
}

function parseVersion(value: unknown, endpoint: string): BibleVersion {
  const v = asRecord(value, endpoint);
  const id = typeof v.id === "number" ? v.id : Number(v.id);
  if (!Number.isFinite(id)) {
    throw new YouVersionApiError(
      "Bible version record missing numeric id",
      502,
      endpoint,
      JSON.stringify(v).slice(0, 500),
    );
  }
  const abbreviation =
    (typeof v.abbreviation === "string" && v.abbreviation) ||
    (typeof v.localized_abbreviation === "string" &&
      v.localized_abbreviation) ||
    "";
  const title =
    (typeof v.title === "string" && v.title) ||
    (typeof v.localized_title === "string" && v.localized_title) ||
    abbreviation;
  const language = typeof v.language_tag === "string" ? v.language_tag : "";

  return { id, abbreviation, title, language };
}

/** Fetch a single Bible version record by its numeric ID. */
export async function fetchVersion(versionId: number): Promise<BibleVersion> {
  const endpoint = `/bibles/${versionId}`;
  return parseVersion(await yvFetch(endpoint), endpoint);
}

/**
 * List Bible versions for a language. Accepts ISO 639-1 (en/es/pt) or
 * ISO 639-3 (eng/spa/por) codes.
 */
export async function listBibleVersions(
  language: string,
): Promise<BibleVersion[]> {
  const range = toLanguageRange(language);
  const endpoint = `/bibles?language_ranges[]=${encodeURIComponent(range)}&all_available=true&page_size=99`;
  const data = asRecord(await yvFetch(endpoint), endpoint);

  const list = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.bibles)
      ? data.bibles
      : null;
  if (!list) {
    throw new YouVersionApiError(
      "Versions response contained no version list",
      502,
      endpoint,
      JSON.stringify(data).slice(0, 500),
    );
  }

  return list.map((item) => parseVersion(item, endpoint));
}
