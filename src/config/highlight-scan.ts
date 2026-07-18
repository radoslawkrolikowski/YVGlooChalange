// Chapters scanned during the Step 7 highlight import.
//
// The YouVersion Highlights API only answers single-chapter queries — there
// is no "all my highlights" endpoint — so the consent-time import scans this
// bounded, curated list of the most-read chapters for an instant seed, and
// every chapter the user later opens in the app is synced on read
// (syncChapterHighlights in src/lib/highlights.ts). The list favours where
// real-world highlights cluster: the complete Gospels, the best-known
// Psalms, and the most-highlighted teaching chapters.

const psalms = [
  1, 8, 16, 19, 22, 23, 27, 34, 37, 40, 42, 46, 51, 63, 73, 84, 90, 91, 100,
  103, 107, 110, 116, 118, 119, 121, 127, 130, 139, 145, 146, 150,
].map((chapter) => `PSA.${chapter}`);

const gospels = [
  ...Array.from({ length: 28 }, (_, i) => `MAT.${i + 1}`),
  ...Array.from({ length: 16 }, (_, i) => `MRK.${i + 1}`),
  ...Array.from({ length: 24 }, (_, i) => `LUK.${i + 1}`),
  ...Array.from({ length: 21 }, (_, i) => `JHN.${i + 1}`),
];

const teaching = [
  "GEN.1",
  "EXO.20",
  "DEU.6",
  "JOS.1",
  "PRO.3",
  "ISA.40",
  "ISA.53",
  "JER.29",
  "ACT.2",
  "ROM.5",
  "ROM.8",
  "ROM.12",
  "1CO.13",
  "1CO.15",
  "GAL.5",
  "EPH.2",
  "EPH.4",
  "EPH.6",
  "PHP.2",
  "PHP.4",
  "COL.3",
  "HEB.11",
  "HEB.12",
  "JAS.1",
  "1PE.1",
  "1JN.4",
  "REV.21",
];

/** Chapter USFM ids scanned at consent time (~148 single-chapter calls). */
export const HIGHLIGHT_SCAN_CHAPTERS: readonly string[] = [
  ...psalms,
  ...gospels,
  ...teaching,
];
