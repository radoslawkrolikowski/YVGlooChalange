// The name an Instant Access visitor is known by (Step 8 minted it as
// "Reader #n"; Step 30A lets them choose their own in onboarding).
//
// Shared by the client form and the server route so one set of rules decides
// what a name may be. Config, not server code — the onboarding form imports it
// directly to disable Continue before a round trip.

/** Longest chosen name — fits a thread avatar row and a prayer sentence. */
export const MAX_ANON_NAME_LENGTH = 24;

/** Names Round reserves: its own system attribution on digests and prompts. */
const RESERVED = ["round"];

/** Trim and collapse whitespace; drop control characters. */
export function normaliseAnonName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
}

/**
 * The reason a name is unusable, or null when it is fine. The name is required:
 * an empty string is an error, not a fallback — the onboarding field ships
 * prefilled with the assigned "Reader #n" so there is always something to keep.
 */
export function anonNameError(raw: string): string | null {
  const name = normaliseAnonName(raw);
  if (name.length === 0) return "Choose a name for your circle";
  if (name.length > MAX_ANON_NAME_LENGTH) {
    return `Keep it to ${MAX_ANON_NAME_LENGTH} characters or fewer`;
  }
  if (RESERVED.includes(name.toLowerCase())) {
    return "“Round” is how the app signs its own messages — pick another name";
  }
  return null;
}
