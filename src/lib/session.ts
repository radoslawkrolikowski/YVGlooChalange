// Unified session resolver — Step 8.
//
// Every server route resolves "who is making this request" through this one
// function, which returns either an authenticated user (Path A) or an
// anonymous Instant Access session (Path B). All features from Step 8 onward
// are built against this union, so Instant Access is first-class by
// construction, never bolted on.

import { verifyAnonSessionToken, type AnonSession } from "./anon-session";

export type { AnonSession };

/** Path A session shape — populated by NextAuth from Step 6 onward. */
export interface AuthenticatedSession {
  kind: "user";
  userId: string;
  displayName: string;
  /** Nullable until onboarding (Step 9) sets them. */
  language: string | null;
  bibleVersionId: number | null;
}

export type Session = AuthenticatedSession | AnonSession;

/** Header carrying the Instant Access token from sessionStorage. */
export const ANON_SESSION_HEADER = "x-round-session";

/**
 * Resolves the request's session: an authenticated user, an anonymous
 * session, or null (no session at all).
 *
 * The authenticated branch is wired up in Step 6 (NextAuth, currently
 * deferred); until then only anonymous sessions resolve, but callers already
 * handle the full union so no route changes when Step 6 lands.
 */
export async function resolveSession(
  request: Request,
): Promise<Session | null> {
  // Step 6: check the NextAuth cookie session here first (Path A).

  const token = request.headers.get(ANON_SESSION_HEADER);
  if (token) {
    return verifyAnonSessionToken(token);
  }
  return null;
}
