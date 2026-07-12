// Server-side Gloo AI Studio client — the app's only LLM gateway.
//
// Every agent calls Gloo exclusively through chatCompletion() below, which
// logs each call (success or failure) to agent_logs before returning, so the
// brief's "all agent outputs are logged" rule holds by construction. No other
// module may talk to any model provider.
//
// API notes:
// - Auth is OAuth2 client credentials: GLOO_CLIENT_ID/GLOO_CLIENT_SECRET are
//   exchanged at the token endpoint for a bearer JWT that expires after one
//   hour. The token is cached in module scope and refreshed 60s early; a
//   serverless instance therefore re-authenticates at most once per hour.
// - Completions V2 is OpenAI-shaped (messages/choices/usage) plus Gloo-only
//   fields: auto_routing, model_family, tradition, and routing metadata on
//   the response. Plain fetch is used rather than the OpenAI SDK so those
//   fields are first-class and no other provider's package enters the repo.

import { db } from "@/db";
import { agentLogs } from "@/db/schema";

const TOKEN_URL = "https://platform.ai.gloo.com/oauth2/token";
const COMPLETIONS_URL = "https://platform.ai.gloo.com/ai/v2/chat/completions";

/** Stored in agent_logs.output_preview — a reference, never the full text. */
const OUTPUT_PREVIEW_CHARS = 500;

const MAX_ATTEMPTS = 3; // 1 initial + 2 retries on transient errors
const RETRY_BASE_DELAY_MS = 500;

export class GlooApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "GlooApiError";
  }
}

export interface GlooMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GlooCompletionOptions {
  /** Agent making the call — recorded on every agent_logs row. */
  agentName: string;
  messages: GlooMessage[];
  /**
   * Specific Gloo model, e.g. "gloo-openai-gpt-4o". When omitted the client
   * uses Gloo auto-routing and the response reports which model served it.
   */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Gloo faith-tradition steering, e.g. "not_faith_specific" (default). */
  tradition?: "evangelical" | "catholic" | "mainline" | "not_faith_specific";
}

export interface GlooCompletion {
  /** Completion text from the first choice. */
  content: string;
  /** Model that actually served the call, as reported by Gloo. */
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}

interface CachedToken {
  accessToken: string;
  /** Epoch seconds after which the token must not be reused. */
  refreshAfter: number;
}

let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (cachedToken && now < cachedToken.refreshAfter) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.GLOO_CLIENT_ID;
  const clientSecret = process.env.GLOO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GLOO_CLIENT_ID / GLOO_CLIENT_SECRET are not set — see .env.example",
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials&scope=api/access",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new GlooApiError(
      `Gloo token request failed (${response.status})`,
      response.status,
      body,
    );
  }

  const token = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    accessToken: token.access_token,
    refreshAfter: now + token.expires_in - 60,
  };
  return token.access_token;
}

function isTransient(error: unknown): boolean {
  if (error instanceof GlooApiError) {
    return error.status === 429 || error.status >= 500;
  }
  // fetch network failures (DNS, reset, timeout) surface as TypeError
  return error instanceof TypeError;
}

async function requestCompletion(
  options: GlooCompletionOptions,
): Promise<GlooCompletion> {
  const accessToken = await getAccessToken();

  const body: Record<string, unknown> = {
    messages: options.messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    tradition: options.tradition,
  };
  if (options.model) {
    body.model = options.model;
  } else {
    body.auto_routing = true;
  }

  const response = await fetch(COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    // A 401 means the cached token was revoked early; drop it so the retry
    // path re-authenticates instead of failing three times on a dead token.
    if (response.status === 401) cachedToken = null;
    throw new GlooApiError(
      `Gloo completion failed (${response.status})`,
      response.status,
      responseBody,
    );
  }

  const completion = (await response.json()) as {
    model: string;
    choices: Array<{ message: { role: string; content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new GlooApiError(
      "Gloo completion response contained no content",
      502,
      JSON.stringify(completion).slice(0, 500),
    );
  }

  return {
    content,
    model: completion.model,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens,
  };
}

async function writeAgentLog(row: typeof agentLogs.$inferInsert): Promise<void> {
  try {
    await db.insert(agentLogs).values(row);
  } catch (error) {
    // Logging must never turn a delivered completion into a user-facing
    // failure; surface the problem loudly in server logs instead.
    console.error("agent_logs write failed", error);
  }
}

/**
 * Run a Completions V2 call through Gloo with retry on transient errors
 * (429, 5xx, network) and write an agent_logs row for the call — one row per
 * logical call, recording the final outcome, not one per retry attempt.
 */
export async function chatCompletion(
  options: GlooCompletionOptions,
): Promise<GlooCompletion> {
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const completion = await requestCompletion(options);
      await writeAgentLog({
        agentName: options.agentName,
        model: completion.model,
        status: "ok",
        outputPreview: completion.content.slice(0, OUTPUT_PREVIEW_CHARS),
        latencyMs: Date.now() - startedAt,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
      });
      return completion;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS && isTransient(error)) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)),
        );
        continue;
      }
      break;
    }
  }

  await writeAgentLog({
    agentName: options.agentName,
    model: options.model ?? null,
    status: "error",
    error:
      lastError instanceof Error ? lastError.message : String(lastError),
    latencyMs: Date.now() - startedAt,
  });
  throw lastError;
}

/**
 * Grounded Completions (RAG over the Psalms commentary corpus) — placeholder
 * until Step 32 uploads the corpus and completes this method. Kept here so
 * the Context agent stub (Step 5) already binds to its permanent home.
 */
export async function groundedCompletion(): Promise<never> {
  throw new GlooApiError(
    "Grounded Completions is not implemented until Step 32 (RAG corpus upload)",
    501,
  );
}
