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
/** Grounded Completions (RAG) is a separate path, not a flag on the above. */
const GROUNDED_COMPLETIONS_URL = `${COMPLETIONS_URL}/grounded`;

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

/**
 * Gloo's content guardrail refused the request before any model saw it.
 *
 * The response is a 200 in the normal completion shape, but it carries a
 * canned refusal as the content and NO routing metadata: `model` comes back
 * empty and the Gloo-only fields (provider, model_family, routing_mechanism,
 * trace_id) are absent — the tell that no model was routed to. Without this
 * detection a refusal reads as a perfectly good completion and lands in
 * agent_logs as "ok".
 *
 * It is not transient: retrying the same text is refused identically every
 * time (verified), so callers must change the request or give up rather than
 * spend another call. The guardrail is also demonstrably over-eager on benign
 * devotional input — the phrasing of an instruction, not its subject, can be
 * enough to trip it — so an agent seeing this has done nothing wrong.
 */
export class GlooGuardrailError extends Error {
  constructor(public readonly refusal: string) {
    super(`Gloo guardrail refused the request: ${refusal.slice(0, 200)}`);
    this.name = "GlooGuardrailError";
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
  /**
   * Gloo faith-tradition steering. Omit to leave it to Gloo — there is no
   * client-side default, and "not_faith_specific" specifically cannot be
   * combined with auto-routing (see completionBody).
   */
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

/** One retrieved source behind a grounded completion, as Gloo reports it. */
export interface GlooCitation {
  /**
   * The Content Library item the retrieved chunk belongs to. Chunks are the
   * retrieval unit but attribution is item-level, which is why the corpus is
   * ingested one item per Psalm: this title is the only signal a caller has
   * for which passage the grounding actually came from.
   */
  itemTitle: string;
  itemUrl?: string;
  author?: string[];
  publisher?: string;
  publicationDate?: string;
  /** The retrieved excerpts themselves. */
  snippets: string[];
}

export interface GlooGroundedCompletionOptions extends GlooCompletionOptions {
  /**
   * Publisher NAME (case-sensitive) whose corpus grounds the call — note this
   * is the display name, not the publisher UUID used for ingestion. Defaults
   * to GLOO_RAG_PUBLISHER.
   */
  ragPublisher?: string;
  /** Sources to retrieve, 1–10. Gloo's own default is 3. */
  sourcesLimit?: number;
}

export interface GlooGroundedCompletion extends GlooCompletion {
  /** False when retrieval found nothing relevant — the "no grounding" signal. */
  sourcesReturned: boolean;
  /** Populated because the client always sends include_citations: true. */
  citations: GlooCitation[];
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

/**
 * The request body shared by both endpoints. Exactly one routing choice may be
 * sent (auto_routing / model / model_family), hence the either/or below.
 */
function completionBody(options: GlooCompletionOptions): Record<string, unknown> {
  // Verified on both endpoints: Gloo rejects tradition "not_faith_specific"
  // unless an explicit model is named — "Model is required when tradition is
  // set to not_faith_specific" (422). Every other tradition works with
  // auto-routing. Caught here so the contradiction fails locally, with the
  // reason, instead of as an opaque upstream validation error.
  if (options.tradition === "not_faith_specific" && !options.model) {
    throw new Error(
      'Gloo requires an explicit model when tradition is "not_faith_specific" — ' +
        "pass a model, choose another tradition, or omit tradition entirely",
    );
  }

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
  return body;
}

/** The response fields both endpoints share; grounded adds two more. */
interface GlooCompletionResponse {
  model: string;
  choices?: Array<{ message?: { role?: string; content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  sources_returned?: boolean;
  citations?: Array<{
    item_title?: string;
    item_url?: string;
    author?: string[];
    publisher?: string;
    publication_date?: string;
    snippets?: string[];
  }>;
}

async function postCompletion(
  url: string,
  body: Record<string, unknown>,
): Promise<{ raw: GlooCompletionResponse; content: string }> {
  const accessToken = await getAccessToken();

  const response = await fetch(url, {
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

  const completion = (await response.json()) as GlooCompletionResponse;

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new GlooApiError(
      "Gloo completion response contained no content",
      502,
      JSON.stringify(completion).slice(0, 500),
    );
  }

  // A guardrail refusal: 200 and well-formed, but no model was routed to.
  if (!completion.model) {
    throw new GlooGuardrailError(content);
  }

  return { raw: completion, content };
}

async function requestCompletion(
  options: GlooCompletionOptions,
): Promise<GlooCompletion> {
  const { raw, content } = await postCompletion(
    COMPLETIONS_URL,
    completionBody(options),
  );
  return {
    content,
    model: raw.model,
    promptTokens: raw.usage?.prompt_tokens,
    completionTokens: raw.usage?.completion_tokens,
  };
}

async function requestGroundedCompletion(
  options: GlooGroundedCompletionOptions,
): Promise<GlooGroundedCompletion> {
  const ragPublisher = options.ragPublisher ?? process.env.GLOO_RAG_PUBLISHER;
  if (!ragPublisher) {
    throw new Error(
      "GLOO_RAG_PUBLISHER is not set and no ragPublisher was passed — see .env.example",
    );
  }
  if (
    options.sourcesLimit !== undefined &&
    (!Number.isInteger(options.sourcesLimit) ||
      options.sourcesLimit < 1 ||
      options.sourcesLimit > 10)
  ) {
    throw new Error(
      `sourcesLimit must be an integer between 1 and 10, got ${options.sourcesLimit}`,
    );
  }

  const { raw, content } = await postCompletion(GROUNDED_COMPLETIONS_URL, {
    ...completionBody(options),
    rag_publisher: ragPublisher,
    sources_limit: options.sourcesLimit,
    // Gloo defaults this to false, which would drop the citations the Context
    // Agent needs both for its scope guard and for source attribution.
    include_citations: true,
  });

  return {
    content,
    model: raw.model,
    promptTokens: raw.usage?.prompt_tokens,
    completionTokens: raw.usage?.completion_tokens,
    sourcesReturned: raw.sources_returned === true,
    citations: (raw.citations ?? []).map((citation) => ({
      itemTitle: citation.item_title ?? "",
      itemUrl: citation.item_url,
      author: citation.author,
      publisher: citation.publisher,
      publicationDate: citation.publication_date,
      snippets: citation.snippets ?? [],
    })),
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
 * Retry a Gloo completion call on transient errors (429, 5xx, network) and
 * write an agent_logs row for it — one row per logical call, recording the
 * final outcome, not one per retry attempt. Shared by the plain and the
 * grounded endpoints so both are logged identically.
 */
async function completionWithRetryAndLog<T extends GlooCompletion>(
  options: GlooCompletionOptions,
  request: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const completion = await request();
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

  // A guardrail block is logged as its own status, never as "ok" (it is not a
  // completion) and never as "error" (nothing failed) — the audit trail should
  // show plainly how often Gloo refuses, and on what.
  await writeAgentLog({
    agentName: options.agentName,
    model: options.model ?? null,
    status: lastError instanceof GlooGuardrailError ? "blocked" : "error",
    error:
      lastError instanceof Error ? lastError.message : String(lastError),
    latencyMs: Date.now() - startedAt,
  });
  throw lastError;
}

/** Run a Completions V2 call through Gloo, logged and retried. */
export async function chatCompletion(
  options: GlooCompletionOptions,
): Promise<GlooCompletion> {
  return completionWithRetryAndLog(options, () => requestCompletion(options));
}

/**
 * Grounded Completions — retrieval and generation in ONE call against the
 * publisher-scoped corpus, logged and retried exactly like chatCompletion.
 *
 * Retrieval is scoped only by publisher: there is no metadata filter and no
 * relevance score. Callers must therefore treat `sourcesReturned` as the
 * "did retrieval find anything" gate and check `citations[].itemTitle` against
 * the passage they asked about before trusting the grounding.
 *
 * Two failure modes worth telling apart (both verified against the live API):
 * a publisher name that Gloo does not recognise is a hard 403
 * ("Forbidden - insufficient permissions"), NOT an ungrounded answer — so a
 * misconfigured GLOO_RAG_PUBLISHER surfaces as GlooApiError, never as silently
 * missing grounding. Omitting rag_publisher entirely, by contrast, returns a
 * perfectly ordinary 200 with no sources at all, which is precisely why this
 * client refuses to send the call without one.
 */
export async function groundedCompletion(
  options: GlooGroundedCompletionOptions,
): Promise<GlooGroundedCompletion> {
  return completionWithRetryAndLog(options, () =>
    requestGroundedCompletion(options),
  );
}

/** One text delta yielded by chatCompletionStream while the model generates. */
export interface GlooStreamChunk {
  /** The incremental text since the last chunk. */
  delta: string;
}

/**
 * Streaming Completions V2 (SSE) — added in Step 26 for the Prayer tab's
 * "thinking effect", where the prayer streams in word by word as Gloo writes
 * it. Yields text deltas as they arrive, then writes ONE agent_logs row on
 * completion — the same discipline as chatCompletion(), just deferred to the
 * end of the stream when the full text and model are known.
 *
 * Unlike chatCompletion(), a broken stream is NOT retried here: once bytes
 * have started flowing a retry would double-emit. Callers that need a fallback
 * do a single non-streamed chatCompletion() retry instead (see the Prayer
 * route). A guardrail refusal mid-stream surfaces the same way as the
 * non-streamed path: an empty model with canned content throws GlooGuardrailError.
 */
export async function* chatCompletionStream(
  options: GlooCompletionOptions,
): AsyncGenerator<GlooStreamChunk, void, unknown> {
  const startedAt = Date.now();
  const accessToken = await getAccessToken();

  const body: Record<string, unknown> = {
    messages: options.messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    tradition: options.tradition,
    stream: true,
  };
  if (options.model) {
    body.model = options.model;
  } else {
    body.auto_routing = true;
  }

  let model = "";
  let full = "";
  try {
    const response = await fetch(COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const responseBody = response.ok ? "" : await response.text();
      if (response.status === 401) cachedToken = null;
      throw new GlooApiError(
        `Gloo streaming completion failed (${response.status})`,
        response.status,
        responseBody,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; keep the trailing partial.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          done = true;
          break;
        }
        let parsed: {
          model?: string;
          choices?: Array<{ delta?: { content?: string } }>;
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue; // ignore keep-alive comments / malformed frames
        }
        if (parsed.model) model = parsed.model;
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          yield { delta };
        }
      }
    }

    // Same guardrail tell as the non-streamed path: content but no model routed.
    if (!model && full) {
      throw new GlooGuardrailError(full);
    }

    await writeAgentLog({
      agentName: options.agentName,
      model: model || null,
      status: "ok",
      outputPreview: full.slice(0, OUTPUT_PREVIEW_CHARS),
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    await writeAgentLog({
      agentName: options.agentName,
      model: model || (options.model ?? null),
      status: error instanceof GlooGuardrailError ? "blocked" : "error",
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    });
    throw error;
  }
}
