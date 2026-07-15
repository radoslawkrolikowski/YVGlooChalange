// Unified session resolver — Step 8.
//
// Every server route resolves "who is making this request" through this one
// function, which returns either an authenticated user (Path A) or an
// anonymous Instant Access session (Path B). All features from Step 8 onward
// are built against this union, so Instant Access is first-class by
// construction, never bolted on.

import { auth } from "./auth";
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
 * Path A (NextAuth cookie session) is checked first; a signed-in user with a
 * stale anonymous token in the browser is still the signed-in user.
 */
export async function resolveSession(
  request: Request,
): Promise<Session | null> {
  const nextAuthSession = await auth();
  if (nextAuthSession?.user) {
    const { user } = nextAuthSession;
    return {
      kind: "user",
      userId: user.id,
      displayName: user.name ?? "YouVersion reader",
      language: user.language,
      bibleVersionId: user.bibleVersionId,
    };
  }

  const token = request.headers.get(ANON_SESSION_HEADER);
  if (token) {
    return verifyAnonSessionToken(token);
  }
  return null;
}
