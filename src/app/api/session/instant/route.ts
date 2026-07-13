import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { mintAnonSession } from "@/lib/anon-session";

export const dynamic = "force-dynamic";

// Step 8: mints an Instant Access session. The only database touch is
// nextval() on the reader-number sequence — no user row is ever created.
export async function POST() {
  try {
    const result = await db.execute<{ n: number }>(
      sql`select nextval('anon_reader_counter')::int as n`,
    );
    const readerNumber = result.rows[0].n;
    const { token, session } = mintAnonSession(readerNumber);
    return NextResponse.json({ ok: true, token, session });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
