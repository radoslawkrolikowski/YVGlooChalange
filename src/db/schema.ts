import {
  integer,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

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
// --- Path A identity (Step 6) -------------------------------------------
//
// NextAuth (Auth.js v5) tables in the shape the Drizzle adapter expects.
// The adapter's unique key on (provider, providerAccountId) is what makes
// repeat sign-ins find the same user row instead of creating duplicates.
// Instant Access (Path B) deliberately has no row in any of these tables.

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** YouVersion display name from the ID token; shown in the avatar chip. */
  name: text("name"),
  email: text("email"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  /** YouVersion avatar URL template. */
  image: text("image"),
  // Multilingual is in the data layer from day one (brief §5.3): both are
  // nullable until onboarding (Step 9) sets them.
  /** Preferred language, ISO 639-1, e.g. "es". */
  language: text("language"),
  /** Preferred YouVersion Bible version ID, e.g. NVI's numeric ID. */
  bibleVersionId: integer("bible_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

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
