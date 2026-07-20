import { NextResponse } from "next/server";
import { screenReflection } from "@/lib/escalation";
import { GlooApiError } from "@/lib/gloo";
import { devToolingEnabled } from "@/lib/dev-gate";

export const dynamic = "force-dynamic";

// Step 18 dev-only test route: submit arbitrary text to the Escalation
// classifier and see the verdict, the resolved crisis resources (when
// flagged), and whether an audit row was written. 404s in production. Backs
// the dev page at /dev/escalation and is the curl-able equivalent.
//
// Body: { "text": string, "region"?: "US" | "GB", "reflectionId"?: string }
export async function POST(request: Request) {
  if (!devToolingEnabled()) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  let body: { text?: unknown; region?: unknown; reflectionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "`text` is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const region = typeof body.region === "string" ? body.region : undefined;
  // A dev-generated reference so the route mimics Step 19 without any real
  // reflection row existing yet — this is the only identifier that can reach
  // the audit log.
  const reflectionId =
    typeof body.reflectionId === "string" && body.reflectionId.trim()
      ? body.reflectionId
      : `dev-${crypto.randomUUID()}`;

  try {
    const result = await screenReflection({
      reflectionId,
      text: body.text,
      region,
    });
    return NextResponse.json({
      ok: true,
      reflectionId,
      flagged: result.verdict.flagged,
      signals: result.verdict.signals,
      model: result.model,
      // Present only when flagged — the support card renders iff non-empty.
      resources: result.resources,
      audited: result.verdict.flagged,
    });
  } catch (error) {
    if (error instanceof GlooApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          upstreamStatus: error.status,
          upstreamBody: error.body,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
