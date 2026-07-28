// Prayer requests — the core of Step 35A.
//
// A prayer request is a shared circle object, deliberately distinct from the
// Step 26 Prayer tab's private personal prayer: the author writes it for
// themselves first, may put it in front of their circle by an explicit
// per-request action, and members respond with one silent tap.
//
// Everything this module enforces comes from the plan's Decisions entry:
//
//   * ESCALATION FIRST. createPrayerRequest() runs the Escalation Agent before
//     a single row exists — the same pipeline position reflections have
//     (brief §5.11, constraint #2). A flagged request is stored private to its
//     author, is never shareable (share() refuses it), and only its ID reaches
//     escalation_audit, never its words. If the gate cannot produce a verdict
//     the call throws and NOTHING is written — a request is never accepted
//     while the gate is unresolved.
//   * PRIVATE BY DEFAULT, SHARED PER ITEM. Creation always writes
//     visibility = "private". share() is the only path to "circle", and it is
//     driven by an explicit user action with its own confirmation.
//   * COUNT, NEVER NAMES. pray() writes an act row; nothing in this module
//     ever returns who prayed. The only thing that leaves here is an integer.
//   * AUTHOR-OWNED ANSWERED. markAnswered() checks ownership; a member's
//     prayer acts never change a request's status.
//
// Both session paths run the same code: `SessionOwner` (Step 30A) carries
// either a users id or an anonymous session id, so a Path B visitor creates
// requests and prays for others' without a users row ever existing — their
// rows are session-scoped and pruned on the Step 31 rail.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, prayerActs, prayerRequests } from "@/db/schema";
import { screenReflection } from "@/lib/escalation";
import { ownerColumns, ownerWhere, type SessionOwner } from "@/lib/session-owner";
import type { CrisisResource } from "@/config/crisis-resources";

/** Request statuses. "archived" is reserved by the Decisions entry, unused here. */
export type PrayerRequestStatus = "active" | "answered" | "archived";
export type PrayerRequestVisibility = "private" | "circle";

/** One of the author's own requests, as the Prayer tab lists it. */
export interface PrayerRequestSummary {
  id: string;
  /** The author's original words — immutable. */
  body: string;
  status: PrayerRequestStatus;
  visibility: PrayerRequestVisibility;
  /** True when the Escalation Agent flagged it: private forever, never shared. */
  flagged: boolean;
  /** The circle it was shared with; null while private. */
  circleId: string | null;
  /** How many people have prayed for it — a count only, never names. */
  prayedCount: number;
  sharedAt: string | null;
  answeredAt: string | null;
  createdAt: string;
}

export interface CreatePrayerRequestInput {
  owner: SessionOwner;
  /** "Reader #n" for an anonymous author; null for members (their users row
   * carries the name). Stamped on the row so a shared card can name them
   * without a users join. */
  anonName?: string | null;
  /** Best-effort source language from the session — Step 27 refines it. */
  sourceLanguage: string | null;
  /** The author's original words. */
  body: string;
  /** Region for crisis-resource resolution; null → combined US + UK default. */
  region?: string | null;
}

export interface CreatePrayerRequestResult {
  /** True when the Escalation Agent flagged it — the author sees the support
   * card, the request is saved private, and it can never be shared. */
  flagged: boolean;
  /** Crisis resources for the private support card; empty when unflagged. */
  resources: CrisisResource[];
  /** The stored request (flagged or not) — the author always keeps their words. */
  request: PrayerRequestSummary;
}

function toSummary(row: {
  id: string;
  body: string;
  status: string;
  visibility: string;
  flagged: boolean;
  circleId: string | null;
  sharedAt: Date | null;
  answeredAt: Date | null;
  createdAt: Date;
}, prayedCount = 0): PrayerRequestSummary {
  return {
    id: row.id,
    body: row.body,
    status: row.status as PrayerRequestStatus,
    visibility: row.visibility as PrayerRequestVisibility,
    flagged: row.flagged,
    circleId: row.circleId,
    prayedCount,
    sharedAt: row.sharedAt?.toISOString() ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Screen one request through the Escalation gate and store it — private to its
 * author either way. Throws when screening is unusable, leaving nothing written.
 */
export async function createPrayerRequest(
  input: CreatePrayerRequestInput,
): Promise<CreatePrayerRequestResult> {
  // The id is fixed up front so the audit reference (written by
  // screenReflection when flagged) matches the row we then insert — the ID is
  // the ONLY thing that is ever audited.
  const requestId = crypto.randomUUID();

  // Gate FIRST — before any row exists.
  const screen = await screenReflection({
    reflectionId: requestId,
    text: input.body,
    region: input.region ?? null,
  });

  // The owner column here is `author_id`, not the `user_id` ownerColumns()
  // names, so it is mapped explicitly rather than spread.
  const owner = ownerColumns(input.owner);
  const [row] = await db
    .insert(prayerRequests)
    .values({
      id: requestId,
      authorId: owner.userId,
      anonSessionId: owner.anonSessionId,
      anonName: input.anonName ?? null,
      body: input.body,
      sourceLanguage: input.sourceLanguage,
      flagged: screen.verdict.flagged,
    })
    .returning();

  return {
    flagged: screen.verdict.flagged,
    resources: screen.resources,
    request: toSummary(row),
  };
}

/** Prayed counts for a set of requests — integers only, never identities. */
async function prayedCounts(
  requestIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (requestIds.length === 0) return counts;
  const rows = await db
    .select({
      requestId: prayerActs.requestId,
      count: sql<number>`count(*)::int`,
    })
    .from(prayerActs)
    .where(inArray(prayerActs.requestId, requestIds))
    .groupBy(prayerActs.requestId);
  for (const row of rows) counts.set(row.requestId, row.count);
  return counts;
}

/** Which of these requests this owner has already prayed for (their own tap). */
async function ownActs(
  requestIds: string[],
  owner: SessionOwner,
): Promise<Set<string>> {
  if (requestIds.length === 0) return new Set();
  const rows = await db
    .select({ requestId: prayerActs.requestId })
    .from(prayerActs)
    .where(
      and(
        inArray(prayerActs.requestId, requestIds),
        ownerWhere(prayerActs.userId, prayerActs.anonSessionId, owner),
      ),
    );
  return new Set(rows.map((row) => row.requestId));
}

/**
 * The owner's own requests, newest first — flagged ones included, because a
 * flagged request is still the author's own and they keep their words; it is
 * only the circle that never sees it. Path A reads a user's rows, Path B that
 * browser session's rows, through the same query.
 */
export async function listOwnRequests(
  owner: SessionOwner,
): Promise<PrayerRequestSummary[]> {
  const rows = await db
    .select()
    .from(prayerRequests)
    .where(
      ownerWhere(prayerRequests.authorId, prayerRequests.anonSessionId, owner),
    )
    .orderBy(desc(prayerRequests.createdAt));

  const counts = await prayedCounts(rows.map((row) => row.id));
  return rows.map((row) => toSummary(row, counts.get(row.id) ?? 0));
}

/** Load one request and confirm this owner authored it. Null when neither. */
async function loadOwnRequest(requestId: string, owner: SessionOwner) {
  const [row] = await db
    .select()
    .from(prayerRequests)
    .where(
      and(
        eq(prayerRequests.id, requestId),
        ownerWhere(prayerRequests.authorId, prayerRequests.anonSessionId, owner),
      ),
    );
  return row ?? null;
}

export type ShareRequestResult =
  | { ok: true; request: PrayerRequestSummary; messageId: string }
  | { ok: false; reason: "not_found" | "flagged" | "already_shared" };

/**
 * Share one of the owner's own requests with a circle: post it as a
 * member-authored thread card (kind "prayer_request") and flip the request to
 * circle visibility. The caller triggers the Translation Agent on the returned
 * message id, exactly as it does for any member message (Step 27) — the card is
 * member-authored, so translation covers it with no special case.
 *
 * A FLAGGED request can never take this path: the Escalation Agent's verdict is
 * permanent, and the refusal lives here (server-side) rather than only in the
 * UI that hides the button.
 */
export async function shareRequest(
  requestId: string,
  owner: SessionOwner,
  circle: { id: string },
): Promise<ShareRequestResult> {
  const row = await loadOwnRequest(requestId, owner);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.flagged) return { ok: false, reason: "flagged" };
  if (row.visibility === "circle") return { ok: false, reason: "already_shared" };

  const [message] = await db
    .insert(messages)
    .values({
      circleId: circle.id,
      authorId: row.authorId,
      anonSessionId: row.anonSessionId,
      anonName: row.anonName,
      // The author's exact words are posted — never edited, never re-written.
      body: row.body,
      sourceLanguage: row.sourceLanguage,
      kind: "prayer_request",
    })
    .returning({ id: messages.id });

  const [updated] = await db
    .update(prayerRequests)
    .set({
      visibility: "circle",
      circleId: circle.id,
      messageId: message.id,
      sharedAt: new Date(),
    })
    .where(eq(prayerRequests.id, requestId))
    .returning();

  const counts = await prayedCounts([requestId]);
  return {
    ok: true,
    request: toSummary(updated, counts.get(requestId) ?? 0),
    messageId: message.id,
  };
}

export type PrayResult =
  | { ok: true; prayedCount: number; alreadyPrayed: boolean }
  | { ok: false; reason: "not_found" | "own_request" };

/**
 * Record one "I prayed" tap. Idempotent by construction: the partial unique
 * indexes on prayer_acts make a second tap from the same member (or the same
 * anonymous session) a no-op rather than a second count. Only shared requests
 * are prayable, and never one's own — praying for yourself is not what the
 * button means, and the author's card shows the count instead.
 */
export async function prayForRequest(
  requestId: string,
  owner: SessionOwner,
): Promise<PrayResult> {
  const [row] = await db
    .select({
      id: prayerRequests.id,
      authorId: prayerRequests.authorId,
      anonSessionId: prayerRequests.anonSessionId,
      visibility: prayerRequests.visibility,
      flagged: prayerRequests.flagged,
    })
    .from(prayerRequests)
    .where(eq(prayerRequests.id, requestId));

  // A private or flagged request is not visible to anyone but its author, so
  // there is nothing here to pray for — same answer as a missing row, which
  // also means the endpoint leaks nothing about requests you cannot see.
  if (!row || row.flagged || row.visibility !== "circle") {
    return { ok: false, reason: "not_found" };
  }

  const isAuthor =
    owner.kind === "user"
      ? row.authorId === owner.userId
      : row.anonSessionId === owner.sessionId;
  if (isAuthor) return { ok: false, reason: "own_request" };

  const alreadyPrayed = (await ownActs([requestId], owner)).has(requestId);
  if (!alreadyPrayed) {
    await db
      .insert(prayerActs)
      .values({ requestId, ...ownerColumns(owner) })
      // A concurrent double-tap loses the race harmlessly.
      .onConflictDoNothing();
  }

  const counts = await prayedCounts([requestId]);
  return {
    ok: true,
    prayedCount: counts.get(requestId) ?? 0,
    alreadyPrayed,
  };
}

export type AnswerRequestResult =
  | { ok: true; request: PrayerRequestSummary }
  | { ok: false; reason: "not_found" | "already_answered" };

/**
 * Mark a request answered. AUTHOR ONLY — the ownership check is the whole
 * point: answering is testimony about your own request, so no other member (and
 * no accumulation of prayer acts) can move a request's status. Works on private
 * and shared requests alike.
 */
export async function markRequestAnswered(
  requestId: string,
  owner: SessionOwner,
): Promise<AnswerRequestResult> {
  const row = await loadOwnRequest(requestId, owner);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "answered") return { ok: false, reason: "already_answered" };

  const [updated] = await db
    .update(prayerRequests)
    .set({ status: "answered", answeredAt: new Date() })
    .where(eq(prayerRequests.id, requestId))
    .returning();

  const counts = await prayedCounts([requestId]);
  return { ok: true, request: toSummary(updated, counts.get(requestId) ?? 0) };
}

/** The prayer-request state a thread card renders — count only, never names. */
export interface ThreadPrayerRequest {
  id: string;
  status: PrayerRequestStatus;
  /** How many people have prayed for it. No identities accompany this number. */
  prayedCount: number;
  /** True when the VIEWER has already prayed — their own tap, nobody else's. */
  viewerHasPrayed: boolean;
  /** True when the viewer is the author: they get "Mark as answered", not
   * "I prayed". Resolved server-side so a Path B card works the same way. */
  viewerIsAuthor: boolean;
  answeredAt: string | null;
}

/**
 * The prayer-request state for a set of thread messages, keyed by message id.
 * Used by loadThreadMessages to attach the card's count/answered state and the
 * viewer's own relationship to it (author? already prayed?). The viewer's own
 * act is the only per-person fact that ever leaves this module, and it is only
 * ever about the viewer themselves.
 */
export async function loadThreadPrayerRequests(
  messageIds: string[],
  viewer: SessionOwner | null,
): Promise<Map<string, ThreadPrayerRequest>> {
  const byMessage = new Map<string, ThreadPrayerRequest>();
  if (messageIds.length === 0) return byMessage;

  const rows = await db
    .select({
      id: prayerRequests.id,
      messageId: prayerRequests.messageId,
      authorId: prayerRequests.authorId,
      anonSessionId: prayerRequests.anonSessionId,
      status: prayerRequests.status,
      answeredAt: prayerRequests.answeredAt,
    })
    .from(prayerRequests)
    .where(inArray(prayerRequests.messageId, messageIds));
  if (rows.length === 0) return byMessage;

  const requestIds = rows.map((row) => row.id);
  const [counts, own] = await Promise.all([
    prayedCounts(requestIds),
    viewer ? ownActs(requestIds, viewer) : Promise.resolve(new Set<string>()),
  ]);

  for (const row of rows) {
    if (!row.messageId) continue;
    const viewerIsAuthor = viewer
      ? viewer.kind === "user"
        ? row.authorId === viewer.userId
        : row.anonSessionId === viewer.sessionId
      : false;
    byMessage.set(row.messageId, {
      id: row.id,
      status: row.status as PrayerRequestStatus,
      prayedCount: counts.get(row.id) ?? 0,
      viewerHasPrayed: own.has(row.id),
      viewerIsAuthor,
      answeredAt: row.answeredAt?.toISOString() ?? null,
    });
  }
  return byMessage;
}
