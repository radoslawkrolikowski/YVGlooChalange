import {
  integer,
  pgSequence,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Atomic counter behind Instant Access "Reader #n" display names (Step 8).
// A sequence rather than a table row: anonymous visitors must never get a
// database row of their own (brief §7), and nextval() is atomic by nature.
export const anonReaderCounter = pgSequence("anon_reader_counter");

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per Gloo call, written by the shared Gloo client for every call —
// success or failure — so no agent can bypass logging. The brief requires
// agent name, timestamp, and model for all agent outputs; outputPreview is a
// truncated reference to the output, never the full text (and never logged
// for the Escalation agent's flagged content — content-free by construction
// since only a preview of the *model output*, not user input, is stored).
export const agentLogs = pgTable("agent_logs", {
  id: serial("id").primaryKey(),
  /** Agent that made the call, e.g. "facilitator"; "dev" for dev routes. */
  agentName: text("agent_name").notNull(),
  /** Model that actually served the call, as reported by Gloo. */
  model: text("model"),
  /** "ok" or "error". */
  status: text("status").notNull(),
  /** First 500 chars of the completion text. */
  outputPreview: text("output_preview"),
  /** Error message when status = "error". */
  error: text("error"),
  latencyMs: integer("latency_ms"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
