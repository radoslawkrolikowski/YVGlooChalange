// Corpus ingestion (Step 32) — a standalone ops script, run by hand. Nothing in
// the running app imports it.
//
// It uploads the per-Psalm Markdown written by split-psalms-commentary.mts into
// the Gloo Content Library as one item per Psalm, under a single publisher, in
// three phases:
//
//   1. upload   POST  /ingestion/v2/files?producer_id=…   (one file per call —
//               Gloo ignores producer_id on multi-file uploads, and the stable
//               producer_id is what makes a re-run deduplicate instead of
//               creating copies)
//   2. metadata PATCH /engine/v2/item                     (item_title, summary,
//               author, tags — these are NOT accepted by the upload endpoint,
//               so titling is always a second call, keyed by producer_id)
//   3. verify   GET   /engine/v2/publisher/{id}/items      (ingestion is async:
//               "the upload response means your file is queued, not
//               searchable". Items pass through STARTED/QUEUED/FETCHING/
//               CHUNKING/EMBEDDING and end in COMPLETED or FAILED.)
//
// Phase 3 polls the publisher's item LISTING, not GET /engine/v2/items/{id}.
// Verified against the live API: the single-item document keeps reporting
// QUEUED after ingestion has finished — its status goes stale as soon as phase
// 2 patches metadata (the document's updated_at moves to the PATCH time) —
// while the listing reports COMPLETED, agreeing with what Studio shows. The
// listing is also one request per poll round instead of one per item.
//
// The phases are separated rather than run per-file because chunking and
// embedding take minutes per item; polling each upload to completion before
// starting the next would turn a few minutes into hours.
//
// The OAuth token exchange below duplicates the one in src/lib/gloo.ts on
// purpose. That module is the app's LLM gateway and logs every call it makes to
// agent_logs; a file upload is not a completion and has nothing to log, and
// importing it would pull @/db and a Postgres connection into an ops script.
//
// Usage:
//   npm run corpus:upload
//   npm run corpus:upload -- --dry-run        list what would be sent
//   npm run corpus:upload -- --only=23,24     a subset, for a cheap first test

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const HOST = "https://platform.ai.gloo.com";
const TOKEN_URL = `${HOST}/oauth2/token`;
const CORPUS_DIR = "corpus/psalms";
const MANIFEST = join(CORPUS_DIR, "manifest.json");

/** Parallel HTTP calls in the upload and metadata phases. */
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 45 * 60 * 1000;

/** Where the commentary came from — surfaced in citations via item_url. */
const SOURCE_URL = "https://www.spurgeon.org";
const AUTHORS = ["Charles Spurgeon"];
const BASE_TAGS = [
  "psalms",
  "commentary",
  "public-domain",
  "spurgeon",
  "treasury-of-david",
];

interface ManifestEntry {
  psalm: number;
  file: string;
  title: string;
  producerId: string;
  verseRange: string | null;
  chars: number;
}

interface Manifest {
  source: string;
  pdf: string;
  items: ManifestEntry[];
}

interface UploadResponse {
  success: boolean;
  message: string;
  ingesting?: string[];
  duplicates?: string[];
}

interface PublisherItemsResponse {
  items: Array<{
    item_id: string;
    producer_id?: string | null;
    item_title?: string | null;
    status: string;
  }>;
  total_pages?: number;
}

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set — see .env.example`);
    process.exit(1);
  }
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class GlooRequestError extends Error {
  // Declared and assigned separately: Node runs this file by stripping types
  // only, and constructor parameter properties are not erasable syntax.
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GlooRequestError";
    this.status = status;
  }
}

let cachedToken: { accessToken: string; refreshAfter: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (cachedToken && now < cachedToken.refreshAfter) return cachedToken.accessToken;

  const clientId = requireEnv("GLOO_CLIENT_ID");
  const clientSecret = requireEnv("GLOO_CLIENT_SECRET");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials&scope=api/access",
  });
  if (!response.ok) {
    throw new GlooRequestError(
      `Token request failed (${response.status}): ${await response.text()}`,
      response.status,
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

/** Retry transient failures (429, 5xx, network) with linear backoff. */
async function withRetry<T>(label: string, call: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      const transient =
        error instanceof TypeError ||
        (error instanceof GlooRequestError &&
          (error.status === 429 || error.status >= 500));
      if (error instanceof GlooRequestError && error.status === 401) {
        cachedToken = null; // token revoked early — re-authenticate on retry
      }
      if (!transient || attempt === MAX_ATTEMPTS) break;
      await sleep(RETRY_BASE_DELAY_MS * attempt);
      console.log(`  retrying ${label} (attempt ${attempt + 1})`);
    }
  }
  throw lastError;
}

async function glooFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${HOST}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new GlooRequestError(
      `${init.method ?? "GET"} ${path} failed (${response.status}): ${(
        await response.text()
      ).slice(0, 300)}`,
      response.status,
    );
  }
  return response;
}

/** Run `call` over `entries` with a bounded number of parallel requests. */
async function mapLimited<T, R>(
  entries: T[],
  limit: number,
  call: (entry: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(entries.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, entries.length) }, async () => {
    while (next < entries.length) {
      const index = next++;
      results[index] = await call(entries[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function uploadFile(
  publisherId: string,
  entry: ManifestEntry,
): Promise<string | null> {
  const content = await readFile(join(CORPUS_DIR, entry.file));
  const form = new FormData();
  form.set("publisher_id", publisherId);
  form.set("files", new File([content], entry.file, { type: "text/markdown" }));

  const response = await withRetry(entry.file, () =>
    glooFetch(
      `/ingestion/v2/files?producer_id=${encodeURIComponent(entry.producerId)}`,
      { method: "POST", body: form },
    ),
  );
  const body = (await response.json()) as UploadResponse;
  const itemId = body.ingesting?.[0] ?? body.duplicates?.[0] ?? null;
  const wasDuplicate = (body.ingesting?.length ?? 0) === 0;
  console.log(
    `  Psalm ${entry.psalm}: ${wasDuplicate ? "already ingested" : "queued"}` +
      `${itemId ? ` (${itemId})` : ` — ${body.message}`}`,
  );
  return itemId;
}

async function patchMetadata(
  publisherId: string,
  entry: ManifestEntry,
): Promise<void> {
  const reference = entry.verseRange
    ? `Psalm ${entry.psalm}:${entry.verseRange}`
    : `Psalm ${entry.psalm}`;
  await withRetry(`metadata ${entry.file}`, () =>
    glooFetch("/engine/v2/item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Keyed by producer_id rather than item_id so this phase does not depend
      // on the upload response having returned an id.
      body: JSON.stringify({
        publisher_id: publisherId,
        producer_id: entry.producerId,
        item_title: entry.title,
        item_summary:
          `Charles Spurgeon's verse-by-verse commentary on ${reference}, ` +
          "from The Treasury of David (Abridged). Public domain.",
        item_url: SOURCE_URL,
        author: AUTHORS,
        item_tags: [...BASE_TAGS, `psalm-${entry.psalm}`],
      }),
    }),
  );
}

const PAGE_SIZE = 1000;

/** producer_id → live ingestion status for every item the publisher owns. */
async function fetchItemStatuses(
  publisherId: string,
): Promise<Map<string, string>> {
  const statuses = new Map<string, string>();
  for (let page = 1; ; page++) {
    const response = await withRetry(`publisher items page ${page}`, () =>
      glooFetch(
        `/engine/v2/publisher/${publisherId}/items?page=${page}&page_size=${PAGE_SIZE}`,
        { method: "GET" },
      ),
    );
    const body = (await response.json()) as PublisherItemsResponse;
    for (const item of body.items) {
      if (item.producer_id) statuses.set(item.producer_id, item.status);
    }
    // total_pages is not always populated, so page on the item count instead.
    if (body.items.length < PAGE_SIZE) break;
  }
  return statuses;
}

// --- run -------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyArg = args.find((arg) => arg.startsWith("--only="));
const only = onlyArg
  ? new Set(
      onlyArg
        .slice("--only=".length)
        .split(",")
        .map((value) => Number(value.trim())),
    )
  : null;

const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as Manifest;
const entries = manifest.items.filter((entry) => !only || only.has(entry.psalm));

if (entries.length === 0) {
  console.error(
    `Nothing to upload — ${MANIFEST} has ${manifest.items.length} items and none matched --only.`,
  );
  process.exit(1);
}

console.log(
  `${entries.length} item(s) from ${MANIFEST} (source: ${manifest.source})`,
);

if (dryRun) {
  for (const entry of entries) {
    console.log(`  ${entry.producerId}  "${entry.title}"  ${entry.chars} chars`);
  }
  console.log("Dry run — nothing sent.");
  process.exit(0);
}

const publisherId = requireEnv("GLOO_PUBLISHER_ID");

console.log("\nPhase 1/3 — uploading files");
await mapLimited(entries, CONCURRENCY, (entry) => uploadFile(publisherId, entry));

console.log("\nPhase 2/3 — writing item metadata");
await mapLimited(entries, CONCURRENCY, (entry) => patchMetadata(publisherId, entry));
console.log(`  titled ${entries.length} item(s)`);

const pending = new Set(entries.map((entry) => entry.producerId));
console.log(`\nPhase 3/3 — waiting for ${pending.size} item(s) to reach COMPLETED`);
const finalStatus = new Map<string, string>();
const deadline = Date.now() + POLL_TIMEOUT_MS;

while (pending.size > 0 && Date.now() < deadline) {
  const statuses = await fetchItemStatuses(publisherId);
  const counts: Record<string, number> = {};

  for (const producerId of [...pending]) {
    // Absent from the listing means the upload has not been registered yet.
    const status = statuses.get(producerId) ?? "PENDING";
    counts[status] = (counts[status] ?? 0) + 1;
    if (TERMINAL_STATUSES.has(status)) {
      finalStatus.set(producerId, status);
      pending.delete(producerId);
    }
  }

  console.log(
    `  ${finalStatus.size} done, ${pending.size} in progress ` +
      `(${Object.entries(counts)
        .map(([status, count]) => `${status}:${count}`)
        .join(" ")})`,
  );
  if (pending.size > 0) await sleep(POLL_INTERVAL_MS);
}

const failed = [...finalStatus.entries()].filter(([, status]) => status !== "COMPLETED");
const completed = finalStatus.size - failed.length;

console.log(`\nCOMPLETED: ${completed}/${entries.length}`);
if (failed.length > 0) {
  console.error(
    `FAILED: ${failed.map(([producerId, status]) => `${producerId} (${status})`).join(", ")}`,
  );
}
if (pending.size > 0) {
  console.error(
    `Still in progress after ${POLL_TIMEOUT_MS / 60_000} minutes: ${[...pending].join(", ")}`,
  );
}
if (failed.length > 0 || pending.size > 0) process.exit(1);
console.log("Corpus is live in the Content Library.");
