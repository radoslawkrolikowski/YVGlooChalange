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
import type { ProfileAnswers } from "@/config/profile";

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
  /**
   * True once the visitor explicitly chose language/version (Step 9) —
   * distinguishes a real choice from the minted defaults. Absent on tokens
   * minted before any choice.
   */
  onboarded?: boolean;
  /**
   * Onboarding profile answers (Step 10). Absent until the visitor answers —
   * readers fall back to PROFILE_DEFAULTS. Held in the token because Path B
   * has no database row.
   */
  profile?: ProfileAnswers;
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

function signSession(session: AnonSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
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
  return { token: signSession(session), session };
}

/**
 * Re-mints an existing anonymous session with new reading preferences
 * (Step 9). The session has no database row, so "updating" it means issuing
 * a replacement signed token; identity fields (sessionId, readerNumber,
 * displayName, issuedAt) carry over unchanged so the visitor stays the same
 * Reader for the whole browser session.
 */
export function remintAnonSession(
  current: AnonSession,
  preferences: { language: string; bibleVersionId: number },
): { token: string; session: AnonSession } {
  const session: AnonSession = {
    ...current,
    language: preferences.language,
    bibleVersionId: preferences.bibleVersionId,
    onboarded: true,
  };
  return { token: signSession(session), session };
}

/**
 * Re-mints an existing anonymous session with onboarding profile answers
 * (Step 10) — same replacement-token mechanism as remintAnonSession, same
 * carried-over identity.
 */
export function remintAnonProfile(
  current: AnonSession,
  profile: ProfileAnswers,
): { token: string; session: AnonSession } {
  const session: AnonSession = { ...current, profile };
  return { token: signSession(session), session };
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
