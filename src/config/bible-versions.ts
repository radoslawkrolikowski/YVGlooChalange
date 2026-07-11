// Supported Bible translations — the app's curated version catalogue.
//
// YouVersion identifies every translation by a numeric version ID; the ID
// encodes both language and translation. This file is the single place to
// configure which versions Round supports per language, which version is the
// language default, and which are the curated picker short-lists (rendered
// instantly before the live Bible Versions API catalogue loads — Step 9).
//
// Licensing: an app key can only FETCH versions whose license is enabled for
// it at platform.youversion.com (Bible Version Licensing). Versions listed
// here with `licensed: false` were verified present in the API catalogue for
// this app key but return 403 on passage fetch until their license is
// granted — request them in the YouVersion platform dashboard, then flip the
// flag. All IDs below were verified live against the Bible Versions API.
//
// Not in the catalogue at all for this app key (cannot be requested, do not
// add): ESV, NLT, MSG (English), RVR1960 (Spanish), ARC (Portuguese) — the
// closest licensed-or-requestable alternatives are included instead.

export interface SupportedVersion {
  /** Numeric YouVersion version ID — passed on every passage fetch. */
  id: number;
  /** Abbreviation shown next to every passage reference, e.g. "NIV". */
  abbreviation: string;
  title: string;
  /** BCP-47 language tag, e.g. "en", "es", "pt". */
  language: string;
  /** Whether the app key's license for this version is already enabled. */
  licensed: boolean;
}

export const SUPPORTED_VERSIONS: SupportedVersion[] = [
  // --- English ---
  { id: 111, abbreviation: "NIV", title: "New International Version 2011", language: "en", licensed: false },
  { id: 1, abbreviation: "KJV", title: "King James Version", language: "en", licensed: false },
  { id: 2692, abbreviation: "NASB2020", title: "New American Standard Bible 2020", language: "en", licensed: false },
  { id: 1588, abbreviation: "AMP", title: "Amplified Bible", language: "en", licensed: false },
  { id: 3034, abbreviation: "BSB", title: "Berean Standard Bible", language: "en", licensed: true },

  // --- Spanish ---
  { id: 128, abbreviation: "NVI", title: "Nueva Versión Internacional 2025", language: "es", licensed: false },
  { id: 89, abbreviation: "LBLA", title: "La Biblia de las Américas", language: "es", licensed: false },
  { id: 147, abbreviation: "RVES", title: "Reina-Valera Antigua", language: "es", licensed: true },

  // --- Portuguese ---
  { id: 129, abbreviation: "NVI-PT", title: "Nova Versão Internacional - Português", language: "pt", licensed: false },
  { id: 3254, abbreviation: "BLT", title: "Biblia Livre Para Todos", language: "pt", licensed: true },
];

// Default version per language when the user has not chosen yet
// (plan Decisions: English→NIV, Spanish→NVI, Portuguese→NVI-PT).
export const DEFAULT_VERSION_BY_LANGUAGE: Record<string, number> = {
  en: 111,
  es: 128,
  pt: 129,
};

// Until the licenses above are granted, these already-licensed versions are
// the working fallbacks per language (passage fetches succeed today).
export const LICENSED_FALLBACK_BY_LANGUAGE: Record<string, number> = {
  en: 3034, // BSB
  es: 147, // RVES
  pt: 3254, // BLT
};

export function versionsForLanguage(language: string): SupportedVersion[] {
  return SUPPORTED_VERSIONS.filter((v) => v.language === language);
}

export function findSupportedVersion(id: number): SupportedVersion | undefined {
  return SUPPORTED_VERSIONS.find((v) => v.id === id);
}
