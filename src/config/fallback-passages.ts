// Curated fallback passage pool for PlanBuilder (Step 12).
//
// When a Gloo-generated reference still fails live YouVersion validation
// after 2 single-day regenerations, the day is filled from this pool and
// marked "adjusted" in the preview (Decisions: reading plan reference
// validation). Entries are tagged with the same topic slugs as
// src/config/profile.ts TOPIC_OPTIONS so substitution can honour the user's
// stated interests; "general" entries back every topic. References are USFM
// (the shape fetchPassage takes) and were chosen as short, always-resolvable
// passages — but the pipeline still live-validates a substituted reference
// before saving, so nothing here is trusted blindly.

export interface FallbackPassage {
  /** USFM reference, e.g. "PSA.23", "MAT.18.21-35". */
  reference: string;
  /** Human-readable label for the day chip, e.g. "Psalm 23". */
  label: string;
  /** TOPIC_OPTIONS slugs this passage serves, or ["general"]. */
  topics: string[];
}

export const FALLBACK_PASSAGES: FallbackPassage[] = [
  // Forgiveness
  { reference: "MAT.18.21-35", label: "Matthew 18:21–35", topics: ["forgiveness"] },
  { reference: "COL.3.12-17", label: "Colossians 3:12–17", topics: ["forgiveness", "relationships"] },
  { reference: "EPH.4.25-32", label: "Ephesians 4:25–32", topics: ["forgiveness", "relationships"] },
  { reference: "LUK.15.11-32", label: "Luke 15:11–32", topics: ["forgiveness", "grace"] },
  { reference: "PSA.32", label: "Psalm 32", topics: ["forgiveness"] },
  // Grace
  { reference: "EPH.2.1-10", label: "Ephesians 2:1–10", topics: ["grace", "faith_basics"] },
  { reference: "ROM.5.1-11", label: "Romans 5:1–11", topics: ["grace"] },
  { reference: "TIT.3.3-8", label: "Titus 3:3–8", topics: ["grace"] },
  { reference: "2CO.12.1-10", label: "2 Corinthians 12:1–10", topics: ["grace"] },
  // Anxiety & peace
  { reference: "PHP.4.4-9", label: "Philippians 4:4–9", topics: ["anxiety_peace", "prayer"] },
  { reference: "MAT.6.25-34", label: "Matthew 6:25–34", topics: ["anxiety_peace"] },
  { reference: "PSA.46", label: "Psalm 46", topics: ["anxiety_peace"] },
  { reference: "JHN.14.25-31", label: "John 14:25–31", topics: ["anxiety_peace"] },
  { reference: "1PE.5.6-11", label: "1 Peter 5:6–11", topics: ["anxiety_peace"] },
  // Relationships
  { reference: "1CO.13", label: "1 Corinthians 13", topics: ["relationships"] },
  { reference: "ROM.12.9-21", label: "Romans 12:9–21", topics: ["relationships", "wisdom"] },
  { reference: "EPH.4.1-6", label: "Ephesians 4:1–6", topics: ["relationships"] },
  // Purpose
  { reference: "PSA.139.1-18", label: "Psalm 139:1–18", topics: ["purpose"] },
  { reference: "ROM.8.28-39", label: "Romans 8:28–39", topics: ["purpose", "grace"] },
  { reference: "JER.29.4-14", label: "Jeremiah 29:4–14", topics: ["purpose"] },
  // Prayer
  { reference: "MAT.6.5-15", label: "Matthew 6:5–15", topics: ["prayer", "faith_basics"] },
  { reference: "LUK.11.1-13", label: "Luke 11:1–13", topics: ["prayer"] },
  { reference: "JAS.5.13-18", label: "James 5:13–18", topics: ["prayer"] },
  // Wisdom
  { reference: "PRO.3.1-12", label: "Proverbs 3:1–12", topics: ["wisdom"] },
  { reference: "JAS.1.2-8", label: "James 1:2–8", topics: ["wisdom"] },
  { reference: "PSA.1", label: "Psalm 1", topics: ["wisdom"] },
  // Faith basics
  { reference: "JHN.3.1-21", label: "John 3:1–21", topics: ["faith_basics"] },
  { reference: "MRK.1.14-20", label: "Mark 1:14–20", topics: ["faith_basics"] },
  { reference: "ROM.10.5-13", label: "Romans 10:5–13", topics: ["faith_basics"] },
  { reference: "HEB.11.1-6", label: "Hebrews 11:1–6", topics: ["faith_basics"] },
  // General — safe for any plan
  { reference: "PSA.23", label: "Psalm 23", topics: ["general"] },
  { reference: "PSA.121", label: "Psalm 121", topics: ["general"] },
  { reference: "PSA.100", label: "Psalm 100", topics: ["general"] },
  { reference: "JHN.15.1-17", label: "John 15:1–17", topics: ["general"] },
  { reference: "MRK.4.35-41", label: "Mark 4:35–41", topics: ["general"] },
];

/**
 * Pick a fallback passage for a failed day: prefer the user's topics, then
 * general entries, then anything — always skipping references already used
 * in the plan so a substitution never duplicates another day.
 */
export function pickFallbackPassage(
  topics: string[],
  usedReferences: Set<string>,
): FallbackPassage | null {
  const pools = [
    FALLBACK_PASSAGES.filter((entry) =>
      entry.topics.some((topic) => topics.includes(topic)),
    ),
    FALLBACK_PASSAGES.filter((entry) => entry.topics.includes("general")),
    FALLBACK_PASSAGES,
  ];
  for (const pool of pools) {
    const available = pool.filter(
      (entry) => !usedReferences.has(entry.reference),
    );
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
  }
  return null;
}
