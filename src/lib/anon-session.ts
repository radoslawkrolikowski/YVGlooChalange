// Instant Access (Path B) anonymous sessions — Step 8.
//
// An anonymous session is a signed, self-contained token held only in the
// visitor's browser sessionStorage. There is deliberately no database row and
// no server-side session store: closing the browser ends the session, exactly
// as the brief requires ("no data persisted between sessions"). The HMAC
// signature stops anyone minting or altering a token — e.g. claiming another
// Reader number — without the server secret.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { DEFAULT_VERSION_BY_LANGUAGE } from "@/config/bible-versions";

export interface AnonSession {
  kind: "anonymous";
  /** Random ID; later steps tag anonymous reflections with it (Step 30). */
  sessionId: string;
  /** From the atomic anon_reader_counter sequence. */
  readerNumber: number;
  /** "Reader #n" — the name shown on any circle message they post. */
  displayName: string;
  /** Default until changed in onboarding (Step 9): English. */
  language: string;
  /** Default until changed in onboarding (Step 9): NIV. */
  bibleVersionId: number;
  /** Reading plan placeholder — real plan selection arrives in Step 11. */
  planId: null;
  issuedAt: number;
}

function getSecret(): string {
  const secret = process.env.ANON_SESSION_SECRET;
  if (!secret) {
    throw new Error("ANON_SESSION_SECRET is not set — see .env.example");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function mintAnonSession(readerNumber: number): {
  token: string;
  session: AnonSession;
} {
  const session: AnonSession = {
    kind: "anonymous",
    sessionId: randomUUID(),
    readerNumber,
    displayName: `Reader #${readerNumber}`,
    language: "en",
    bibleVersionId: DEFAULT_VERSION_BY_LANGUAGE.en,
    planId: null,
    issuedAt: Date.now(),
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, session };
}

/** Returns the session when the token is authentic, null otherwise. */
export function verifyAnonSessionToken(token: string): AnonSession | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AnonSession;
    return session.kind === "anonymous" ? session : null;
  } catch {
    return null;
  }
}
