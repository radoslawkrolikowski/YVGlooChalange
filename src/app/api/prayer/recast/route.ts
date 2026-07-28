import { NextResponse } from "next/server";
import { generatePrayer, type PrayerInput } from "@/agents/prayer";
import { GlooGuardrailError } from "@/lib/gloo";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 26 — recast a personal prayer into an intercessory form that names the
// author, for the optional "share with circle" flow. Returns the rewritten text
// for a preview; nothing is posted until the user confirms (see /api/prayer/share).
// "I pray for a good interview" → "I pray that {name} will have a good interview".
//
// GUARDRAIL FALLBACK. Gloo's safety layer refuses some devotional text outright
// — measured on a prayer quoting Colossians 3:5, where the vice list reads as
// toxicity to a content classifier. The recast is a nicety, not the feature: the
// prayer is already written and the author already chose to share it, so a
// refusal falls back to their OWN text unchanged (`recast: false`) rather than
// blocking the share. Two things must never happen and now cannot: the refusal
// prose is never shown as a preview, and it is never posted to a circle as
// someone's prayer.

const MAX_PRAYER_LENGTH = 4000;

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No valid session" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const prayerText = typeof body.prayer === "string" ? body.prayer.trim() : "";
  if (prayerText.length === 0) {
    return NextResponse.json({ ok: false, error: "A prayer is required" }, { status: 400 });
  }
  if (prayerText.length > MAX_PRAYER_LENGTH) {
    return NextResponse.json({ ok: false, error: "That prayer is too long" }, { status: 400 });
  }

  const input: PrayerInput = {
    mode: "recast",
    language: session.language ?? "en",
    originalPrayer: prayerText,
    authorName: session.displayName,
  };

  try {
    const { text } = await generatePrayer(input);
    return NextResponse.json({ ok: true, text, recast: true });
  } catch (error) {
    // Refused by Gloo (either guardrail shape): share the author's own words.
    if (error instanceof GlooGuardrailError) {
      return NextResponse.json({ ok: true, text: prayerText, recast: false });
    }
    return NextResponse.json(
      { ok: false, error: "The prayer could not be prepared for sharing. Please try again." },
      { status: 502 },
    );
  }
}
