// Owner scoping for session-scoped data — Step 30A.
//
// Three tables now hold rows that belong either to a signed-in user (Path A)
// or to an anonymous Instant Access session (Path B): `highlights`,
// `saved_prayers` and `notifications`. Both paths run the SAME query code —
// the only difference is which column carries the owner, which is exactly what
// this module encapsulates, so no feature module has to branch on session kind.
//
// The rules the shape enforces:
//   * Exactly one of (userId, anonSessionId) is ever set on a row.
//   * An anonymous owner is the session id from the signed Step 8 token —
//     never a users row, which is never created for Path B (brief §7).
//   * Anonymous rows are ephemeral by contract: they are scoped to the browser
//     session that wrote them and pruned on the Step 31 rail
//     (src/lib/anon-prune.ts).

import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Session } from "@/lib/session";

/** Who a session-scoped row belongs to. */
export type SessionOwner =
  | { kind: "user"; userId: string }
  | { kind: "anonymous"; sessionId: string };

/** The owner behind a resolved session (either path). */
export function sessionOwner(session: Session): SessionOwner {
  return session.kind === "user"
    ? { kind: "user", userId: session.userId }
    : { kind: "anonymous", sessionId: session.sessionId };
}

/** The two owner columns to stamp on an insert — one set, one null. */
export function ownerColumns(owner: SessionOwner): {
  userId: string | null;
  anonSessionId: string | null;
} {
  return owner.kind === "user"
    ? { userId: owner.userId, anonSessionId: null }
    : { userId: null, anonSessionId: owner.sessionId };
}

/**
 * The WHERE clause selecting one owner's rows. The anonymous branch also
 * asserts `user_id IS NULL` so a query can never reach across paths even if a
 * session id were ever to collide with something.
 */
export function ownerWhere(
  userIdColumn: AnyPgColumn,
  anonSessionIdColumn: AnyPgColumn,
  owner: SessionOwner,
): SQL {
  return owner.kind === "user"
    ? eq(userIdColumn, owner.userId)
    : (and(
        eq(anonSessionIdColumn, owner.sessionId),
        isNull(userIdColumn),
      ) as SQL);
}
