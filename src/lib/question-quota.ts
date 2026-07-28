// Cost bounds for "Ask about this passage" (Step 33A).
//
// Unlike the daily digest — one grounded run per circle per day, on a schedule —
// this is a paid round trip per tap: an Escalation classification, a corpus
// search, and a completion, initiated by whoever is holding the phone. Two
// bounds, both per session:
//
//   * a daily cap, so a session cannot run up an unbounded bill;
//   * single-in-flight, so a fast double-tap cannot buy two of everything.
//
// Deliberately in memory. The step specifies no new table and no history, and a
// quota row would be exactly the persistence the anonymous path is not allowed
// to have. The trade-off is honest: on serverless each instance counts its own
// share, so the effective ceiling is the cap times the number of warm instances.
// That still bounds cost to a small multiple of a small number, and the client's
// own disabled-while-pending state carries most of the double-tap load.

import type { Session } from "@/lib/session";

/** Questions per session per day. Generous for a reader, cheap for us. */
export const DAILY_QUESTION_CAP = 10;

/** Bounded so a long-lived instance cannot grow the counter map indefinitely. */
const MAX_TRACKED_SESSIONS = 500;

interface Usage {
  /** UTC day this count belongs to; a new day resets it. */
  day: string;
  used: number;
}

const usage = new Map<string, Usage>();
const inFlight = new Set<string>();

/** Identity the quota is charged to: the user for Path A, the anonymous
 * session for Path B — never an IP, which several readers can share. */
export function questionQuotaKey(session: Session): string {
  return session.kind === "user"
    ? `user:${session.userId}`
    : `anon:${session.sessionId}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export type QuotaClaim =
  | { ok: true; remaining: number }
  /** The session's daily cap is spent — communicated as a limit, not a failure. */
  | { ok: false; reason: "cap" }
  /** A question from this session is already being answered. */
  | { ok: false; reason: "in-flight" };

/**
 * Take one slot for this session, charging the cap up front — before the
 * Escalation call, which is itself a paid Gloo round trip. Callers MUST call
 * releaseQuestionSlot() when done (and refundQuestionSlot() when nothing was
 * delivered).
 */
export function claimQuestionSlot(key: string): QuotaClaim {
  if (inFlight.has(key)) return { ok: false, reason: "in-flight" };

  const day = today();
  const current = usage.get(key);
  const used = current && current.day === day ? current.used : 0;
  if (used >= DAILY_QUESTION_CAP) return { ok: false, reason: "cap" };

  // Evicting the oldest entry can only ever grant someone a fresh allowance on
  // a very busy instance — the safe direction for a cost bound to fail in.
  if (!current && usage.size >= MAX_TRACKED_SESSIONS) {
    const oldest = usage.keys().next().value;
    if (oldest !== undefined) usage.delete(oldest);
  }

  usage.set(key, { day, used: used + 1 });
  inFlight.add(key);
  return { ok: true, remaining: DAILY_QUESTION_CAP - (used + 1) };
}

/** Free the in-flight lock. Always call this, whatever the outcome. */
export function releaseQuestionSlot(key: string): void {
  inFlight.delete(key);
}

/** Give the slot back when the reader got no answer (a Gloo failure). They
 * should not pay a question's worth of allowance for our error. */
export function refundQuestionSlot(key: string): void {
  const current = usage.get(key);
  if (current && current.day === today() && current.used > 0) {
    usage.set(key, { day: current.day, used: current.used - 1 });
  }
}

/** Questions left today for this session, for the UI's friendly limit copy. */
export function remainingQuestions(key: string): number {
  const current = usage.get(key);
  if (!current || current.day !== today()) return DAILY_QUESTION_CAP;
  return Math.max(0, DAILY_QUESTION_CAP - current.used);
}
