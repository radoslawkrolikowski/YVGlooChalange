// Crisis resource config (Step 18) — the version-controlled source of truth
// for the Escalation Agent's support card.
//
// A config file, not a database table, by decision (plan → Decisions →
// "Escalation resource list"): it must work identically for Instant Access
// users and even if the database hiccups, changes go through PR review (the
// right gravity for crisis resources), and it deploys atomically with the
// support card that renders it.
//
// Keyed by region with a default fallback (brief §5.11 requires US and UK at
// minimum). The default deliberately lists BOTH the US and UK lines so a user
// whose region is unknown still sees valid help — the safe failure for a
// crisis surface. Region → resource-set resolution is param-driven here;
// mapping a real user to a region is a later concern and is not decided here.

/** A single crisis resource rendered as a tappable row on the support card. */
export interface CrisisResource {
  /** Display name, e.g. "988 Suicide & Crisis Lifeline". */
  name: string;
  /** Human-readable number as shown, e.g. "988" or "116 123". */
  phone: string;
  /** Digits for the `tel:` link (no spaces), e.g. "988" or "116123". */
  tel: string;
  /** One short reassuring line about the service. */
  description: string;
  /** When it is reachable, e.g. "24/7, free and confidential". */
  availability: string;
}

/** Region code (ISO 3166-1 alpha-2) used to key the resource sets. */
export type CrisisRegion = "US" | "GB";

const US_988: CrisisResource = {
  name: "988 Suicide & Crisis Lifeline",
  phone: "988",
  tel: "988",
  description: "Talk or text with someone who is there to listen.",
  availability: "24/7, free and confidential",
};

const UK_SAMARITANS: CrisisResource = {
  name: "Samaritans",
  phone: "116 123",
  tel: "116123",
  description: "A safe place to talk any time you like, in your own way.",
  availability: "24/7, free to call",
};

/**
 * Region-keyed resource sets. Each region lists the lines shown to a user
 * resolved to that region. Extend by adding a region key — the support card
 * and resolver need no change.
 */
export const CRISIS_RESOURCES: Record<CrisisRegion, CrisisResource[]> = {
  US: [US_988],
  GB: [UK_SAMARITANS],
};

/**
 * The default fallback when the user's region is unknown or unsupported.
 * Lists both the US and UK lines so help is always reachable — a crisis card
 * must never render empty.
 */
export const DEFAULT_CRISIS_RESOURCES: CrisisResource[] = [US_988, UK_SAMARITANS];

/**
 * Resolve the resources to show for a region. Unknown/absent region falls
 * back to the combined default. Case-insensitive on the region code.
 */
export function resolveCrisisResources(region?: string | null): CrisisResource[] {
  if (!region) return DEFAULT_CRISIS_RESOURCES;
  const key = region.toUpperCase() as CrisisRegion;
  return CRISIS_RESOURCES[key] ?? DEFAULT_CRISIS_RESOURCES;
}
