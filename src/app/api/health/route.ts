import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { appMeta } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select({ key: appMeta.key, now: sql<string>`now()` })
      .from(appMeta);

    return NextResponse.json({
      ok: true,
      db: {
        now: rows[0]?.now ?? null,
        appMetaRows: rows.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 503 },
    );
  }
}
