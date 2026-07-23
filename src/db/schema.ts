import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
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
  // Highlight-import consent (Step 7). Null = never asked (the consent screen
  // is shown once, right after OAuth); "granted" / "declined" / "revoked"
  // record the explicit answer. Import runs only on "granted" — the brief's
  // opt-in constraint lives in this column.
  highlightsConsent: text("highlights_consent"),
  highlightsConsentAt: timestamp("highlights_consent_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Highlights (Steps 7 and 14) ------------------------------------------
//
// Two sources share this table, distinguished by `source`:
//
// "imported" (Step 7): one row per imported YouVersion highlight verse,
// written only after explicit consent on the post-OAuth consent screen. The
// Highlights API returns only (version_id, passage_id, color) per verse —
// the snippet and human-readable label are fetched from the Passages API at
// import time (YouVersion stays the only source of Bible text), and the API
// exposes no creation date, so importedAt records when Round imported it.
//
// "in_app" (Step 14): a phrase the user selected while reading in Round —
// `snippet` holds the selected text exactly as rendered, `versionId` is the
// version the passage was displayed in when the selection was made (the
// brief's "stored with the version they were made in"), and `reference` is
// the plan day's passage reference. Path A only — anonymous sessions keep
// in-app highlights in browser sessionStorage, never in this table.
//
// Never joined into any circle-facing view: highlights are private to their
// owner unless explicitly shared per-item by the user (brief §8.8 — sharing
// is a later step; nothing here exposes them).
export const highlights = pgTable(
  "highlights",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** USFM passage reference the highlight covers, e.g. "PSA.23.1". */
    reference: text("reference").notNull(),
    /** Human-readable reference from the Passages API, e.g. "Psalm 23:1". */
    label: text("label"),
    /** Numeric YouVersion version ID the highlight was made in. */
    versionId: integer("version_id").notNull(),
    /** Version abbreviation at import time, e.g. "NIV" — for display. */
    versionAbbreviation: text("version_abbreviation"),
    /** Short passage-text snippet (truncated), null if the fetch failed. */
    snippet: text("snippet"),
    /** Version ID the snippet text was actually fetched from — differs from
     * versionId when that version is unlicensed and the snippet fell back to
     * the language's licensed version. Drives the copyright attribution,
     * which must match the displayed text. Null on pre-7A rows (derived
     * heuristically at read time) and when the snippet fetch failed. */
    snippetVersionId: integer("snippet_version_id"),
    /** Highlight colour as returned by the API (hex without #). */
    color: text("color"),
    /** "imported" (Step 7 YouVersion import) or "in_app" (Step 14). */
    source: text("source").notNull().default("imported"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Re-running an import can never duplicate a highlight. Partial: in-app
    // highlights may legitimately repeat a (version, reference) pair — a
    // reader can mark several phrases in the same passage.
    uniqueIndex("highlights_user_version_reference_idx")
      .on(table.userId, table.versionId, table.reference)
      .where(sql`${table.source} = 'imported'`),
    index("highlights_user_idx").on(table.userId),
  ],
);

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
// the signed anonymous token, no database row). One row per (user, plan):
// exactly one row is active at a time (partial unique index below) — Home
// and the plan view still assume a single active plan — but selecting a new
// plan pauses the previous row instead of overwriting it, so completed_days
// survives and a paused plan resumes where it left off (Step 12A). Never
// joined into any circle-facing view — the brief's no-comparison constraint
// means progress is visible to its owner only.
export const userPlanProgress = pgTable(
  "user_plan_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    /** The active-plan pointer: true on at most one row per user. */
    isActive: boolean("is_active").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Day numbers completed via "Finished reading" (Step 14 writes these). */
    completedDays: integer("completed_days").array().notNull().default([]),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.planId] }),
    uniqueIndex("user_plan_progress_one_active_idx")
      .on(table.userId)
      .where(sql`${table.isActive}`),
  ],
);

// --- Pre-reading prompt cache (Step 15) -----------------------------------
//
// The PreReading agent generates 2–3 short personal prompts when a signed-in
// user opens today's passage; this table caches them per (user, passage
// reference) so reopening the same passage never re-calls Gloo (brief §5.5,
// "generated once per user per day" — each plan day is a distinct passage).
// Prompts are private to their owner and never shared with the circle. Path B
// (Instant Access) has no row here: anonymous prompts are generated live and
// cached in browser sessionStorage only, mirroring in-app highlights (no
// database row, per the brief). `language` is stored so the row is
// regenerated in place when the user's preferred language changes.
export const preReadingPrompts = pgTable(
  "pre_reading_prompts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** USFM passage reference the prompts were generated for, e.g. "PSA.23". */
    reference: text("reference").notNull(),
    /** Language the prompts were generated in — regenerate on a mismatch. */
    language: text("language").notNull(),
    /** The 2–3 generated prompt strings, in the user's language. */
    prompts: text("prompts").array().notNull(),
    /** Model that served the generation, as reported by Gloo. */
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One cache row per user per passage — the idempotency fence behind
    // "generated once per user per day".
    uniqueIndex("pre_reading_prompts_user_reference_idx").on(
      table.userId,
      table.reference,
    ),
  ],
);

// --- Circles (Step 16) ----------------------------------------------------
//
// A circle is a small group (min 2, max 5) reading one attached plan
// together. State moves forming → active → stalled → archived: Step 16 drives
// forming↔active only (a circle flips to `active` the moment it reaches two
// members); stalled/archived are the Health Agent's job (Step 34). The
// attached `planId` is the plan every member reads — joining aligns the
// member's active plan to it (Step 12A pause), so everything downstream
// (digests, starters, reminders) can assume members share one plan.
export const circles = pgTable("circles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  /** The plan every member reads — references a plans row (Step 11/12). */
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  /** forming / active / stalled / archived — see the table comment. */
  state: text("state").notNull().default("forming"),
  /** The founding member; kept for attribution, membership lives below. */
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Cold-start icebreaker fence (Step 22). Null until the circle reaches two
  // members and flips to `active`, when it is claimed atomically (set from null
  // in one UPDATE … WHERE icebreaker_at IS NULL) BEFORE the Gloo call — the
  // "idempotency key on circle" that makes the icebreaker fire exactly once.
  // A successful post leaves it set forever, so removing and re-adding a member
  // (dev) never yields a second icebreaker; a failed generation resets it to
  // null so a later join can retry. Records when Round opened the conversation.
  icebreakerAt: timestamp("icebreaker_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per (circle, member). No progress, pace, or completion is ever
// stored here or joined into any circle-facing view — the brief's
// no-comparison constraint means the members list exposes display names only.
// A user belongs to at most one circle at a time in Step 16 (Home assumes a
// single active circle; the shared-plan rule makes two memberships
// incoherent) — enforced by the partial unique index below.
export const circleMembers = pgTable(
  "circle_members",
  {
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.circleId, table.userId] }),
    // At most one circle per user in Step 16.
    uniqueIndex("circle_members_one_per_user_idx").on(table.userId),
    index("circle_members_circle_idx").on(table.circleId),
  ],
);

// --- Circle thread (Step 17) ----------------------------------------------
//
// Members post text messages into their circle's thread; the thread is the
// surface every later feature (reflections, starters, digests, translations —
// Steps 19–28) extends. Two rules from the brief shape the schema:
//
//   * The original is immutable (brief §5.12, constraint #6): `body` and
//     `sourceLanguage` are written once at post time and never modified. All
//     translation is additive, in the separate table below.
//   * `sourceLanguage` is the message's own language, needed by the Translation
//     Agent (Step 19+) to decide which readers need a translation. Step 17
//     fills it best-effort from the author's profile language (no detection
//     call yet); nullable when the author has not set a language.
export const messages = pgTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    /** The member who posted — Path A only in Step 17 (no anon circle rows).
     * NULL on system-attributed posts (Step 20): starters, and later the
     * icebreaker (22), digest (24), and summary (25) are authored by "Round",
     * not by any member, so they have no users row to point at. */
    authorId: text("author_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    /** The author's original words, immutable — never overwritten. */
    body: text("body").notNull(),
    /** ISO 639-1 code of the original's language; null when unknown. */
    sourceLanguage: text("source_language"),
    // Message-type groundwork (Step 19). "message" is an ordinary member post;
    // "reflection" is a day-tagged reflection that passed the Escalation gate
    // (Step 19); "starters" is Round's system-attributed conversation-starter
    // card (Step 20, authorId null); "icebreaker" is Round's cold-start opening
    // message posted when the circle activates (Step 22, authorId null). Kept as
    // free text with a default so the remaining system kinds (digest 24,
    // summary 25) need no migration.
    kind: text("kind").notNull().default("message"),
    // Set on reflection posts (kind = "reflection") and starter posts
    // (kind = "starters"): the plan day the post is tied to and the
    // human-readable passage label the thread card shows ("Psalm 23"). Null on
    // ordinary messages.
    dayNumber: integer("day_number"),
    dayLabel: text("day_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The thread is always read as "this circle's messages, oldest first".
    index("messages_circle_created_idx").on(table.circleId, table.createdAt),
  ],
);

// Additive, per-target-language translations of a message (brief §5.12).
// Created here as an empty shell — the Translation Agent (Step 19+) writes
// rows; nothing in Step 17 does. One row per (message, target language): a
// message is never re-translated for the same language, and the original is
// never touched. The polling thread built in Step 17 later delivers these
// swaps for free (Decisions → translation timing: asynchronous).
export const messageTranslations = pgTable(
  "message_translations",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    /** Target reader language, ISO 639-1, e.g. "es". */
    targetLanguage: text("target_language").notNull(),
    /** Translated text — additive; the original message.body is untouched. */
    body: text("body").notNull(),
    /** Model that produced the translation, as reported by Gloo. */
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.targetLanguage] }),
  ],
);

// --- Reflections (Step 19) ------------------------------------------------
//
// The canonical record of every daily reflection — flagged AND unflagged. A
// reflection is a distinct submission type, not an ordinary message: it always
// passes the Escalation Agent synchronously first (brief §5.11, constraint #2),
// carries the plan day it responds to, and only then, if UNFLAGGED, is posted
// to the circle thread as a `messages` row (kind = "reflection"), linked back
// through `messageId`.
//
// FLAGGED reflections are saved here with `flagged = true` and NO message row
// (messageId stays null): private to their author, never posted to the thread,
// and excluded from Facilitator digest input (plan → Decisions → escalation
// handling; Step 24 reads `where flagged = false`). Only the reflection's id
// (never its text) reaches escalation_audit.
export const reflections = pgTable(
  "reflections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 1-based plan day this reflection responds to. */
    dayNumber: integer("day_number").notNull(),
    /** USFM passage reference of that day, e.g. "PSA.23". */
    reference: text("reference").notNull(),
    /** Human-readable label for the day, e.g. "Psalm 23". */
    label: text("label").notNull(),
    /** The author's original words, immutable — never overwritten. */
    body: text("body").notNull(),
    /** ISO 639-1 code of the original's language; null when unknown. */
    sourceLanguage: text("source_language"),
    /** True when the Escalation Agent flagged a crisis signal — kept private. */
    flagged: boolean("flagged").notNull().default(false),
    /** The thread message this reflection was posted as; null when flagged. */
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The Facilitator (Step 24) reads a circle's reflections for one plan day.
    index("reflections_circle_day_idx").on(table.circleId, table.dayNumber),
  ],
);

// --- Conversation starters (Step 20) --------------------------------------
//
// The PostReading agent's output: 2–3 discussion questions generated when a
// member finishes a day's reading, grounded in that passage, the highlights
// they made during the session, and the pre-reading prompts they were shown.
// Posted to the circle thread as a system message attributed to "Round"
// (messages.kind = "starters", authorId null) — the questions themselves live
// here as an array so the thread can render each one as an individually
// replyable line rather than a wall of text.
//
// The unique index IS the idempotency fence: ONE card per circle per PLAN day.
// The row is claimed with an empty `questions` array BEFORE the Gloo call, so
// the second, third and fourth member to finish the same day all hit the
// conflict and exit without calling Gloo — the thread gets one starter card,
// not one per reader. A failed generation deletes its own claim row so the next
// member to finish can retry. This is the same discipline Step 23's
// `agent_runs` table generalises; the output-table constraint here is the
// second fence that plan step describes, landing early because starters ship
// before the scheduling backbone.
//
// `userId` is kept as *who triggered it* — the first member to finish that day,
// whose session highlights and pre-reading prompts ground the questions. It is
// attribution and debugging context, never shown in the thread, and no longer
// part of the key.
export const conversationStarters = pgTable(
  "conversation_starters",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    /** The first member to finish this day — their highlights and prompts
     * ground the questions. Attribution only; never shown in the thread and
     * not part of the idempotency key. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 1-based plan day the reading belongs to — part of the idempotency key. */
    dayNumber: integer("day_number").notNull(),
    /** USFM reference of that day, e.g. "PSA.23". */
    reference: text("reference").notNull(),
    /** Human-readable label of that day, e.g. "Psalm 23". */
    label: text("label").notNull(),
    /** The 2–3 generated questions. Empty while the row is only a claim. */
    questions: text("questions").array().notNull().default([]),
    /** Language they were generated in — Round writes directly, never after. */
    language: text("language").notNull(),
    /** Model that served the generation, as reported by Gloo. */
    model: text("model"),
    /** The thread message they were posted as; null until the post lands. */
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("conversation_starters_circle_day_idx").on(
      table.circleId,
      table.dayNumber,
    ),
  ],
);

// --- Daily digest (Step 24) -----------------------------------------------
//
// The Facilitator agent's output: one digest per circle per plan day, produced
// on the daily sweep when at least 50% of a circle's members (minimum 2),
// counted as DISTINCT AUTHORS, have submitted unflagged reflections for the
// circle's current plan day. Posted to the thread as a system message
// attributed to "Round" (messages.kind = "digest", authorId null) — the
// structured parts (synthesis, overlap callout, discussion question) live here
// so the thread can render the callout with the named members' avatar chips and
// set the question apart as a quote block.
//
// The unique index on (circle, day) IS the second idempotency fence the plan
// describes ("agent_runs PLUS a unique constraint on the digest itself"): the
// row is CLAIMED (synthesis/question null) BEFORE the Gloo call, so a re-run —
// or a later day's sweep still sitting on the same plan day — loses the race
// and spends no Gloo call. A generation or post failure deletes its own claim
// so the next sweep can retry. Flagged reflections never reach this table's
// input (src/lib/digest.ts reads `where flagged = false`).
export const digests = pgTable(
  "digests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    /** 1-based plan day this digest covers — part of the idempotency key. */
    dayNumber: integer("day_number").notNull(),
    /** USFM reference of that day, e.g. "PSA.23". */
    reference: text("reference").notNull(),
    /** Human-readable label of that day, e.g. "Psalm 23". */
    label: text("label").notNull(),
    /** 2–3 sentence collective synthesis. Null while the row is only a claim. */
    synthesis: text("synthesis"),
    /** Display names of the members who landed on the shared theme/line —
     * validated against the day's actual reflection authors before storing, so
     * the avatar chips can never name a member the model hallucinated. Empty
     * when no genuine overlap was found. */
    overlapMembers: text("overlap_members").array().notNull().default([]),
    /** The shared theme or line the overlap members converged on. */
    overlapTheme: text("overlap_theme"),
    /** One discussion question grounded in the passage and the circle's words. */
    question: text("question"),
    /** 3–5 sentence plain-language lesson summary of the passage's main
     * teaching (Step 25). Generated by the Summary agent alongside this digest,
     * in the same sweep and under this row's (circle, day) fence — so it is
     * always 1:1 with the digest. Null while the row is only a claim; the digest
     * and its summary are written together, so a posted digest never has a null
     * summary. Rendered as a collapsible card inside the digest in the thread. */
    summary: text("summary"),
    /** Language it was generated in — Round writes directly, never translated. */
    language: text("language").notNull(),
    /** Model that served the generation, as reported by Gloo. */
    model: text("model"),
    /** The thread message it was posted as; null until the post lands. */
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("digests_circle_day_idx").on(table.circleId, table.dayNumber),
  ],
);

// --- Escalation audit (Step 18) -------------------------------------------
//
// The Escalation Agent's reference-only audit trail (brief §5.11, plan →
// Decisions → escalation handling). One row per FLAGGED reflection recording
// ONLY the reflection reference and a timestamp — never the reflection text,
// never a snippet, never the detected category, never who wrote it. The
// content-free guarantee is structural: this table has no column that could
// hold user words. Written by src/lib/escalation.ts when a reflection flags;
// unflagged reflections write nothing here.
export const escalationAudit = pgTable(
  "escalation_audit",
  {
    id: serial("id").primaryKey(),
    /** Reference to the flagged reflection — the only identifier ever stored. */
    reflectionRef: text("reflection_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("escalation_audit_ref_idx").on(table.reflectionRef)],
);

// --- Private per-passage notes (Step 19A) ---------------------------------
//
// One free-text note a reader keeps against a passage they are reading —
// distinct from highlights (a selected phrase) and reflections (circle-facing).
// Keyed by the plan day's PASSAGE REFERENCE, not the version ID: a note is
// about the passage, not the exact rendered translation, so switching versions
// shows the same note. Saved as the user types (debounced autosave); never
// posted, shared, or fed to any agent — owner's eyes only, never joined into
// any circle-facing view. `label` is the human-readable passage label captured
// at write time so the profile "My notes" list renders without a passage fetch.
//
// App-managed, NOT the YouVersion Notes API (brief §85 forbids implementing
// that API): no Scripture text is ever stored here — only the reference the
// note hangs on. Path A only — anonymous sessions keep notes in browser
// sessionStorage, never in this table (brief §7, "no database row").
export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** USFM passage reference the note hangs on, e.g. "PSA.23" — the key. */
    reference: text("reference").notNull(),
    /** Human-readable passage label, e.g. "Psalm 23" — for the My notes list. */
    label: text("label"),
    /** The reader's free text. An emptied note is deleted, not stored blank. */
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Last-edited time — drives the reverse-chronological My notes order. */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Exactly one note per reader per passage — the upsert target behind
    // debounced autosave.
    uniqueIndex("notes_user_reference_idx").on(table.userId, table.reference),
    index("notes_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

// --- Scheduled agent runs (Step 23) ---------------------------------------
//
// The idempotency rail every scheduled agent rides (plan → Decisions → Agent
// Scheduling). One row per (agent, target, period): a sweep's FIRST action for
// each eligible target is an INSERT here; a unique-violation means that
// period's work was already done, and the sweep exits for that target without
// calling Gloo or writing anything else. Re-running any cron endpoint any
// number of times can therefore never double-fire an agent. Output tables
// carry their own matching unique constraints as a second fence (e.g.
// conversation_starters per circle+day; digests per circle+day in Step 24).
//
// period_key shapes: daily sweeps use "2026-07-23"; the 12-hourly Health
// sweep uses "2026-07-23-am" / "-pm" (the Step 24A convention). target_id is
// a circle id (facilitator/health), user id (reminder), or a fixed sentinel
// for singleton jobs (demo refresh, Step 31).
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: serial("id").primaryKey(),
    /** Scheduled job that ran, e.g. "facilitator", "reminder", "health". */
    agentName: text("agent_name").notNull(),
    /** What it ran against: circle id, user id, or a singleton sentinel. */
    targetId: text("target_id").notNull(),
    /** The cadence period this run covers — see shapes above. */
    periodKey: text("period_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // THE constraint. Claiming a run is inserting into this index.
    uniqueIndex("agent_runs_agent_target_period_idx").on(
      table.agentName,
      table.targetId,
      table.periodKey,
    ),
  ],
);

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
