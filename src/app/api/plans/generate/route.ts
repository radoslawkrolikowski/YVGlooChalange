import type { PlanBuilderInput } from "@/agents/plan-builder";
import { effectiveVersionId } from "@/config/bible-versions";
import { isPlanDurationDays } from "@/config/plan-durations";
import { PROFILE_DEFAULTS, TIME_PER_DAY_OPTIONS, TOPIC_OPTIONS } from "@/config/profile";
import { devToolingEnabled } from "@/lib/dev-gate";
import { loadUserProfileAnswers } from "@/lib/profile";
import {
  generateAndSavePlan,
  PlanGenerationError,
  type PlanGenerationProgress,
} from "@/lib/plan-generation";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";
// Draft generation + up to ~40 live validation fetches + per-day retries.
export const maxDuration = 300;

// Step 12: PlanBuilder generation endpoint. Streams newline-delimited JSON
// events so the AgentThinking UI can show REAL validation progress
// ("Checking day 4 of 14…") driven by the actual per-reference loop, not a
// fake timer. Events: {type:"generating"} → {type:"validating",day,total} /
// {type:"regenerating",day,total} → {type:"done",plan} | {type:"failed",...}.
// The plan is saved (same tables as seeded plans) before "done" is emitted;
// the client then activates it through the existing POST /api/session/plan.

interface GenerateBody {
  goals: string;
  timePerDayMinutes: number;
  topics: string[];
  durationDays: number;
  /** Dev-only (404s in production): force this day's reference invalid. */
  devForceInvalidDay?: number;
}

function parseBody(raw: unknown): GenerateBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const goals = typeof body.goals === "string" ? body.goals.slice(0, 500) : "";
  const timePerDayMinutes = (TIME_PER_DAY_OPTIONS as readonly number[]).includes(
    body.timePerDayMinutes as number,
  )
    ? (body.timePerDayMinutes as number)
    : PROFILE_DEFAULTS.timePerDayMinutes!;
  if (!isPlanDurationDays(body.durationDays)) return null;
  const topics = Array.isArray(body.topics)
    ? body.topics.filter(
        (topic): topic is string =>
          typeof topic === "string" &&
          TOPIC_OPTIONS.some((option) => option.value === topic),
      )
    : [];
  const devForceInvalidDay =
    devToolingEnabled() && typeof body.devForceInvalidDay === "number"
      ? body.devForceInvalidDay
      : undefined;
  return {
    goals,
    timePerDayMinutes,
    topics,
    durationDays: body.durationDays,
    devForceInvalidDay,
  };
}

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return Response.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const body = parseBody(raw);
  if (!body) {
    return Response.json(
      { ok: false, error: "durationDays must be 7, 14, or 30" },
      { status: 400 },
    );
  }

  const language = session.language ?? "en";
  const bibleFamiliarity =
    session.kind === "user"
      ? (await loadUserProfileAnswers(session.userId)).bibleFamiliarity
      : (session.profile?.bibleFamiliarity ?? PROFILE_DEFAULTS.bibleFamiliarity);
  const versionId = effectiveVersionId(language, session.bibleVersionId);

  const input: PlanBuilderInput = {
    goals: body.goals,
    timePerDayMinutes: body.timePerDayMinutes,
    topics: body.topics,
    durationDays: body.durationDays,
    language,
    bibleFamiliarity,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: object) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const plan = await generateAndSavePlan(
          input,
          versionId,
          (event: PlanGenerationProgress) => emit(event),
          body.devForceInvalidDay,
        );
        emit({ type: "done", plan });
      } catch (error) {
        console.error("plan generation failed", error);
        emit({
          type: "failed",
          error:
            error instanceof PlanGenerationError
              ? error.message
              : "Plan generation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
