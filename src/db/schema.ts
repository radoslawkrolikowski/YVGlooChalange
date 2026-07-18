import {
  index,
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
  // Onboarding profile answers (Step 10) — all nullable/defaulted until the
  // user answers; chip values come from src/config/profile.ts (the controlled
  // vocabulary shared with circle matching and the PlanBuilder fallback pool).
  /** Free text: what the user wants to learn — PlanBuilder's `goals` input. */
  goals: text("goals"),
  /** Why they want to read the Bible — MOTIVATION_OPTIONS value. */
  motivation: text("motivation"),
  /** FAMILIARITY_OPTIONS value: brand_new / read_some / read_regularly. */
  bibleFamiliarity: text("bible_familiarity"),
  /** LIFE_SEASON_OPTIONS value. */
  lifeSeason: text("life_season"),
  /** Reading time per day in minutes: 5 / 10 / 15 / 30. */
  timePerDayMinutes: integer("time_per_day_minutes"),
  /** TOPIC_OPTIONS values. */
  topics: text("topics").array(),
  /** Free-text "other" topic. */
  topicsOther: text("topics_other"),
  /** CIRCLE_HOPE_OPTIONS values — circle matching only, never PlanBuilder. */
  circleHopes: text("circle_hopes").array(),
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

// --- Bible version catalogue cache (Step 9) ------------------------------
//
// Per-language snapshot of the YouVersion Bible Versions API, refreshed
// lazily when a language's rows are older than 24 hours. This cache only
// VALIDATES and ENRICHES the curated SUPPORTED_VERSIONS config — it never
// expands what the picker offers (Decisions: config is the source of truth;
// unlicensed versions 403 on passage fetch).
export const bibleVersions = pgTable(
  "bible_versions",
  {
    /** Numeric YouVersion version ID. */
    id: integer("id").primaryKey(),
    /** App language code the catalogue was fetched for, ISO 639-1 (en/es/pt). */
    language: text("language").notNull(),
    abbreviation: text("abbreviation").notNull(),
    /** Version title as returned by the live API. */
    title: text("title").notNull(),
    copyright: text("copyright"),
    /** "Open in Bible App" deep link when the API provides one. */
    deepLink: text("deep_link"),
    /** When this language's catalogue snapshot was fetched — drives the TTL. */
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("bible_versions_language_idx").on(table.language)],
);

// --- Reading plans (Step 11) ----------------------------------------------
//
// A plan is a structured list of day-by-day passage references — references
// only, never Bible text (brief §8.4: YouVersion is the only source of
// Scripture). Pre-defined plans are inserted by a seed migration; Step 12's
// AI-generated plans land in these same tables so everything downstream
// works identically for both origins.

export const plans = pgTable("plans", {
  /** Slug for seeded plans ("psalms-30"); UUID for generated ones (Step 12). */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** One-line description shown on the plan library card. */
  description: text("description").notNull(),
  lengthDays: integer("length_days").notNull(),
  /** "predefined" (seeded) or "generated" (Step 12, PlanBuilder). */
  source: text("source").notNull().default("predefined"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const planDays = pgTable(
  "plan_days",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    /** 1-based day number within the plan. */
    dayNumber: integer("day_number").notNull(),
    /** USFM passage reference, e.g. "PSA.23" — the shape fetchPassage takes. */
    reference: text("reference").notNull(),
    /** Human-readable label for the reference chip, e.g. "Psalm 23". */
    label: text("label").notNull(),
  },
  (table) => [primaryKey({ columns: [table.planId, table.dayNumber] })],
);

// Private per-user progress (Path A only — Instant Access progress lives in
// the signed anonymous token, no database row). One row per user: Home and
// the plan view assume a single active plan, so selecting a new plan
// replaces the row. Never joined into any circle-facing view — the brief's
// no-comparison constraint means progress is visible to its owner only.
export const userPlanProgress = pgTable("user_plan_progress", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Day numbers completed via "Finished reading" (Step 14 writes these). */
  completedDays: integer("completed_days").array().notNull().default([]),
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
