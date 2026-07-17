# Round — Implementation Plan

## Context

Round is an AI-facilitated Scripture reading circle app built for the "Scripture in New Frontiers" competition (Gloo AI + YouVersion, July 6–31, 2026). This plan turns the requirements in `round-implementation-brief.md` into an ordered, testable build sequence. Every step adds one observable piece of functionality, ends in a verifiable state, and builds only on earlier steps. The repo currently contains only a README and the brief — this is a greenfield build.

Non-negotiable constraints threaded through every step: all AI calls go through Gloo (never OpenAI/Anthropic directly); Bible text comes only from YouVersion via version ID and is never translated; original message content is never overwritten (translations are additive); the Escalation Agent runs on every reflection before any other processing; no pace/streak comparison between members; Health Agent decisions are logged and explained; Tier 2 agent stubs exist from the start.

---

# Decisions

## Infrastructure

**Hosting: Vercel — confirmed.** First-party Next.js support, preview deploys per PR, built-in Cron, environment-variable management per environment. Nothing in the requirements needs long-lived processes, so serverless is the lowest-friction fit for a 3.5-week competition build.

**Production database: Vercel Postgres (Neon) — confirmed.** Provisioned from the Vercel dashboard, connection string injected automatically into the Vercel environment, serverless-friendly HTTP driver, and it is plain PostgreSQL so local parity is trivial.

**Local database: PostgreSQL in Docker — confirmed.** Run the same PostgreSQL major version Neon uses (16) via a `docker-compose.yml`, so schema and query behaviour are identical across environments. One command (`docker compose up`) brings up the full local dependency set (Postgres + Mailpit, below).

**Framework: Next.js (App Router) — confirmed.** SSR for the mobile-first UI, API route handlers for all agent endpoints and cron targets, one deployable unit on Vercel.

**Auth: NextAuth.js (Auth.js v5) with a custom YouVersion OAuth 2.0 provider — confirmed.** YouVersion is not a built-in provider, but NextAuth supports custom OAuth provider definitions cleanly; it handles session cookies, token storage, and CSRF for free. Instant Access deliberately does **not** go through NextAuth — it is a signed anonymous session token held in browser `sessionStorage` with no database user row (see Decisions → Instant Access below), matching the brief's "no database row" requirement.

**Email: Resend — committed.** Simple HTTP API, plain-text email support (the brief requires plain text, no tracking pixels), generous free tier, first-class Vercel integration.

**ORM: Drizzle ORM with drizzle-kit migrations — chosen.** Reasons over Prisma: SQL-first schema that maps directly onto Postgres features (unique constraints drive our idempotency strategy), no heavyweight generated client (faster serverless cold starts on Vercel), and native support for Neon's serverless HTTP driver. Raw SQL was rejected because the schema has ~15 related tables and typed query building will prevent whole classes of bugs under time pressure.

**Local email testing: Mailpit (in Docker Compose).** The email layer is a thin abstraction with two drivers: Resend (production, selected via env var) and SMTP via nodemailer pointed at Mailpit (local). Developers open the Mailpit web UI at `localhost:8025` to inspect every outgoing message. No real email can ever be sent from local dev.

**Deployment pipeline: GitHub → Vercel, trunk-based.** Repo hosted on GitHub. Feature branches → pull request → every PR gets an automatic Vercel preview deploy (pointing at a Neon branch database, not production). Merge to `main` triggers the production deploy. No manual deploy steps; `main` is always deployable.

**Migration strategy: committed SQL migrations, applied during the production build step.** drizzle-kit generates versioned SQL migration files that are committed with the code that needs them. The Vercel build command runs `drizzle-kit migrate` against the production database *before* the new build is promoted to serve traffic. To keep the brief old-code/new-schema overlap window safe, migrations follow expand/contract discipline: additive changes (new tables/columns, nullable first) ship with the feature; destructive changes (drops, renames) ship only in a later release after no code references the old shape. Locally, the same command runs against the Docker Postgres.

## Agent Scheduling

**Mechanism: Vercel Cron invoking secured Next.js API routes.** Each scheduled agent (Facilitator+Summary daily per circle, Reminder daily per user, Health every 12 hours per circle, demo-circle refresh daily, Memory weekly — stub only) is an ordinary HTTP route handler. `vercel.json` declares the cron schedule; Vercel calls the route with an `Authorization: Bearer ${CRON_SECRET}` header which the handler verifies. No external queue or worker infrastructure — every agent run fits comfortably inside a serverless function invocation, and judges can read the entire scheduling story in one config file.

**Local development:** Vercel Cron does not run locally, so the same routes are triggered manually from a dev-only "Agent Console" page (gated to non-production environments) with a button per scheduled agent, plus they can be hit with `curl`. Because the cron target is the identical route handler, local testing exercises exactly the production code path.

**Idempotency:** an `agent_runs` table with a **unique constraint on `(agent_name, target_id, period_key)`** — e.g. `(facilitator, circle_42, 2026-07-12)` or `(reminder, user_7, 2026-07-12)`. Every scheduled agent's first action is an `INSERT` of its run row; a unique-violation means the work was already done and the agent exits without calling Gloo. Output tables carry matching unique constraints as a second fence (digests unique per circle+day, reminders unique per user+type+day). Re-running any cron endpoint any number of times can never produce duplicate digests, reminders, or notifications — verified explicitly in Step 23.

## Product and UX

**Circle matching fallback: closest available match with explanation; if no open circle exists at all, create a new one immediately.** Gloo compares the user's onboarding profile against all open (forming/active, size < 5) circles and returns the best match plus a short explanation shown to the user — even when the match is imperfect, the explanation frames it honestly ("closest fit: this circle is also reading Psalms, though in a different life season"). Only when there are zero joinable circles does the app create a fresh circle in `forming` state and tell the user they're a founding member. Queuing (option a) was rejected: a user left waiting is a dead end in a demo and in real life.

**Real-time vs polling: polling.** The circle thread refetches every **10 seconds** while visible, pauses when the tab is hidden (Page Visibility API), and refetches immediately after the user posts. Reading circles are a slow, reflective medium — sub-second delivery adds no product value, and WebSockets don't fit Vercel serverless without adding a third-party service. Polling also doubles as the delivery mechanism for asynchronously completed translations (below).

**Reading plan reference validation: 2 regeneration retries per failed reference, then substitution from a curated fallback pool.** Every Gloo-generated reference is validated by fetching it from the YouVersion Passages API before the plan is saved. On failure, Gloo is asked to regenerate *only the failing day*, with the invalid reference and the error included in the prompt — up to 2 retries. If still invalid, the day is filled from a small curated pool of always-valid passages tagged by topic, and the plan preview marks that day as "adjusted." If generation fails wholesale (Gloo error, majority of references invalid), the user sees a friendly failure message and is offered the pre-defined plan library — they are never left without a path forward.

**YouVersion version ID catalogue: `src/config/bible-versions.ts` is the single source of truth for which versions the app offers.** The brief's original short-lists (NIV/KJV/ESV/NLT/MSG; NVI/RVR1960/LBLA; NVI-PT/ARC) were checked live against the Bible Versions API for this app key: ESV, NLT, MSG, RVR1960 and ARC are not in the catalogue at all and cannot be requested, so `SUPPORTED_VERSIONS` in that config file replaces the brief's lists with verified alternatives. The version picker offers **only** `SUPPORTED_VERSIONS` for the chosen language — the live Bible Versions API catalogue (cached in a database table with a 24-hour TTL, lazily revalidated) is used to validate and enrich those entries (titles, continued availability), never to expand the user's choices, because any version outside the app key's licenses returns 403 on passage fetch. Versions with `licensed: false` render disabled with a "coming soon" state until their license is granted in the YouVersion dashboard and the flag is flipped. Defaults when the user hasn't chosen come from `DEFAULT_VERSION_BY_LANGUAGE` (English → NIV, Spanish → NVI, Portuguese → NVI-PT); while a default is still unlicensed, the effective selection falls back to `LICENSED_FALLBACK_BY_LANGUAGE` (BSB/RVES/BLT). Languages with no entries in `SUPPORTED_VERSIONS` fall back to the English licensed fallback until curated support is added. If a stored version ID stops resolving, the passage fetch falls back to the language's licensed fallback, shows the notice required by the brief, and does *not* silently overwrite the user's saved preference.

**Language detection: a single lightweight Gloo Completions call per message, with the author's profile language as fallback.** The call returns an ISO language code and a confidence level. On low confidence or call failure, the author's own preferred language is assumed as the source. The failure mode is safe by design: the translation prompt instructs Gloo to return the text unchanged if it is already in the target language, so a wrong detection can cost one wasted call but never a wrong display. Gloo is chosen over a local library because short devotional messages defeat n-gram detectors, and it keeps every AI touch inside the one permitted gateway.

**Translation timing: asynchronous.** The author's message is stored and appears in the thread immediately. Translation for each distinct reader language runs right after the post is persisted (in the same request lifecycle via `waitUntil`, so the author isn't blocked). Readers whose language differs from the source see the original text with a small "Translating…" badge; the next 10-second poll (or sooner) swaps in the cached translation with the "Translated by Round" label and the "Show original" toggle. Rationale: never block or lose a user's message because an AI call is slow, and the polling infrastructure already delivers the swap for free.

**Escalation resource list: a version-controlled config file in the repo** (a typed TS/JSON module), keyed by region with a default fallback, containing at minimum US 988 Suicide & Crisis Lifeline and UK Samaritans 116 123. A config file rather than a database table because: it must work identically for Instant Access users and even if the database hiccups, changes go through PR review (appropriate gravity for crisis resources), and it deploys atomically with the code that renders it.

**Escalation handling of flagged reflections (interpretation decision):** per the brief, "the flagged content is never shared with the circle." A flagged reflection is therefore saved as private to its author, is **not** posted to the circle thread, and is **excluded from Facilitator digest input**. The author sees their reflection normally plus the quiet support card; other members see nothing at all. Only the reflection's ID (never its content) is written to the audit log.

**Visual identity: the landing page's warm editorial style is the canonical design language for the whole product — decided after Step 8A shipped, superseding 8A's teal palette.** The landing redesign (parchment/ivory surfaces, deep forest green as the primary brand colour, gold and sage accents, charcoal ink, Lora serif for display headings, Inter for body text, Caveat for rare handwritten accents, pill-shaped primary buttons) is the look the product leads with, and the app interior must feel like the same brand. Concretely: the design tokens in `globals.css` are re-pointed so the *brand* tokens (`--color-primary`, surfaces, etc.) resolve to the editorial palette (forest primary on parchment/ivory surfaces, gold accent) instead of teal `#1B6B6B`; the Step 8A component library keeps its component inventory and prop APIs but is re-skinned through those tokens. The teal palette is retired everywhere. Step 8B (below) performs the retrofit on all screens built before this decision; every step after 8B builds against the editorial tokens automatically because it composes from the same library. The token *names* stay stable so no downstream step's markup changes — only token values and component internals do.

**Home information principle and responsive shell — decided after Step 8B (executed by Step 8C).** The home screen is organised around the user's journey, not the app's features. Every element on Home must fit one of three categories: *what should I read?* (private — today's reading), *what conversations happened?* (shared — the circle's published thread activity), or *where do I go next?* (navigation). Everything else — settings, configuration, even the circle's member roster — lives elsewhere (Profile). Two hard rules follow from the brief: the reading card is completely private (no shared "circle position", no streak language — members read at their own pace), and the circle card shows only **intentional contributions** (reflections posted, Round's digests and prompts, messages) — never member reading status, completion, or pace, which constraint #1 forbids. The circle card derives from posted thread items only, which structurally excludes Escalation-flagged reflections (they are never posted). Home assumes a **single active circle** per user; if a later step introduces multiple memberships, Home shows the most recently active circle. The layout shell becomes responsive: on desktop (≥768px) navigation moves into the top header bar (logo left; Home/My Plan/Circles/Profile links, avatar menu right) and the content column widens; on mobile the bottom tab bar remains. This supersedes 8A's fixed 512px column at all widths.

**Instant Access demo circle freshness: dynamically refreshed daily.** A daily cron job re-dates the demo circle's seeded reflections to look current and regenerates the digest, lesson summary, and conversation starters via **real Gloo calls** — so the demo circle always shows today's date and doubles as a standing live integration test of the agent pipeline. Anonymous visitors' reflections are stored as rows tagged with their anonymous session ID (necessary so they appear in the thread and pass through the Escalation Agent) and are pruned by the same daily job — honouring "no data persisted between sessions" while keeping the current session fully functional.

---

# Step-by-Step Plan

## Phase 0 — Infrastructure Foundation

### Step 1 — Scaffold and production deploy pipeline
- **What gets built:** A new Next.js (App Router) project pushed to a GitHub repo, connected to a Vercel project. A minimal home page ("Round" placeholder). Branch protection on `main`; PR preview deploys enabled. Environment variable placeholders created in Vercel (Gloo API key, YouVersion API key, OAuth client credentials, `CRON_SECRET`, database URL, Resend key) and a documented `.env.example` locally.
- **Why this step comes here:** Nothing else can be verified end-to-end until code reaches production automatically. Proving the pipeline first means every later step can be tested in the real environment, not just locally.
- **Touches:** Repo, Vercel project, CI/deploy configuration.
- **How to test it:** Push a trivial change to a feature branch, open a PR, confirm a preview URL is generated and renders the page. Merge to `main`, then open the production URL in a browser and see the placeholder page with the change.
- **Definition of done:** A merge to `main` automatically produces a working production deployment at the public URL with no manual steps.

### Step 2 — Databases in both environments, ORM, and migrations
- **What gets built:** Vercel Postgres (Neon) provisioned and linked to the Vercel project. Local `docker-compose.yml` running PostgreSQL 16 and Mailpit. Drizzle ORM configured with the Neon HTTP driver (production) and node-postgres (local). A first drizzle-kit migration creating a minimal `app_meta` table, applied in both environments; the production build command now runs migrations before promotion. A `/api/health` route that performs a database round-trip and reports status.
- **Why this step comes here:** Every feature depends on the database, and the migration path must be proven before the schema grows. Depends on Step 1's deploy pipeline.
- **Touches:** Database (local + production), ORM configuration, build pipeline, one API route.
- **How to test it:** Locally: `docker compose up`, run migrations, `curl localhost:3000/api/health` returns `{ ok: true }` with a database timestamp. Then merge and `curl` the production `/api/health` — same result, proving production migrations ran during the build.
- **Definition of done:** `/api/health` returns a successful database round-trip in both local dev and production, with the schema applied via committed migrations in both.

## Phase 1 — Live API Clients and Agent Backbone

### Step 3 — YouVersion API client with a live passage fetch
- **What gets built:** A server-side YouVersion client module handling authentication headers, the Passages API (fetch by reference + version ID), and the Bible Versions API (list versions by language), with typed responses and clear error surfaces. Two dev-only test routes: one fetching a known passage (e.g. John 3:16, NIV version ID) live, one listing Spanish Bible versions live.
- **Why this step comes here:** The brief demands real API calls from step one — any credential, quota, or response-shape surprise must surface now, before features are built on assumptions. Depends on Step 1 (env vars in place).
- **Touches:** YouVersion Passages API, YouVersion Bible Versions API, server module, dev API routes.
- **How to test it:** `curl` the dev passage route locally and in production: response contains the actual verse text and the version abbreviation. `curl` the versions route with `language=es`: response lists real Spanish versions including NVI with numeric version IDs.
- **Definition of done:** Live YouVersion passage text and a live version catalogue are returned through the app's own client in both environments using real credentials.

### Step 4 — Gloo API client with a live completion and agent output logging
- **What gets built:** A server-side Gloo AI Studio client module for Completions V2 (and a placeholder method for Grounded Completions), with retry-on-transient-error handling. An `agent_logs` table recording agent name, timestamp, model used, and a truncated output reference for **every** Gloo call — the brief requires all agent outputs logged. A dev-only route that sends a fixed prompt through the client and returns the completion.
- **Why this step comes here:** Every agent in the system flows through this client; its logging discipline must exist before the first agent does. Depends on Steps 1–2.
- **Touches:** Gloo Completions V2 API, server module, database (`agent_logs`), dev API route.
- **How to test it:** `curl` the dev route locally and in production; receive a real Gloo completion. Query `agent_logs` (or view via the dev console added in Step 5) and see a row with agent name, timestamp, and model for that call.
- **Definition of done:** A live Gloo completion round-trips through the shared client in both environments, and the call is recorded in `agent_logs`.

### Step 5 — Agent framework and Tier 2/3 stubs
- **What gets built:** A thin agent framework: each agent is a module with a name, its own system prompt, a typed input/output contract, and a `run()` entry point that calls the shared Gloo client (which logs automatically). Registered agents: PlanBuilder, PreReading, PostReading, Facilitator, Summary, Prayer, Reminder, Escalation, Translation — as empty shells for now — plus **functioning no-op stubs for Context, Health, Flashcard, and Memory** that accept their defined inputs and return an explicit "not implemented" result. A dev-only "Agent Console" page (non-production only) listing all agents with a trigger button each — this page later becomes the local stand-in for Vercel Cron.
- **Why this step comes here:** The brief mandates Tier 2 stubs exist from the start so later implementation needs no structural change. Creating the framework before any real agent guarantees every agent is built to one shape. Depends on Step 4.
- **Touches:** Agent modules (all 13), Gloo client, dev UI page.
- **How to test it:** Open the Agent Console locally; all 13 agents are listed. Trigger the Health stub: it returns a structured "not implemented" response and an `agent_logs` row is written. Trigger a shell agent (e.g. Prayer with a dummy input): a real Gloo call executes and returns text.
- **Definition of done:** All 13 agent modules exist with defined interfaces, the four Tier 2/3 stubs run as confirmed no-ops, and every invocation is logged.

## Phase 2 — Sessions: OAuth and Instant Access

### Step 6 — Sign In with YouVersion (OAuth)
- **What gets built:** NextAuth.js with a custom YouVersion OAuth 2.0 provider. Successful sign-in creates or finds a `users` row and establishes a session. A minimal signed-in home state showing the user's YouVersion display name and a sign-out action. The `users` table is created with language and Bible-version columns already present (nullable until onboarding) — multilingual is in the data layer from day one.
- **UI:** (Step 8A now exists — build against it, not placeholders.) The "Sign in with YouVersion" CTA on the landing page is the primary button from the library; the OAuth redirect shows a loading state; sign-in failure surfaces an error banner, never a raw error page. The signed-in home uses the 8A home layout with the user's display name in the avatar chip and a styled sign-out action on the profile screen.
- **Why this step comes here:** Path A's entire experience hangs off this identity; onboarding, highlights, and circles all need a user row. Depends on Steps 1–2.
- **Touches:** NextAuth configuration, YouVersion OAuth, database (`users`, auth tables), sign-in UI.
- **How to test it:** Click "Sign in with YouVersion" locally, complete the real OAuth flow against YouVersion, land back in the app showing your YouVersion name. Verify a `users` row exists. Sign out, sign back in — same row, no duplicate. Repeat once on production.
- **Definition of done:** A real YouVersion account can sign in and out in both environments, producing exactly one persistent user row.

### Step 7 — Highlight import (opt-in)
- **What gets built:** During/after OAuth, a clearly worded permission step explaining exactly what is imported (existing highlights) and why (personalising reading prompts) — per the brief's opt-in constraint. On consent, the User Highlights API is called and highlights are stored (reference, version ID, text snippet, date) linked to the user. A profile screen section shows imported highlight count and lets the user revoke/delete them.
- **UI:** Implement against the exact consent and profile screens already designed in Step 8A: card-based consent explanation with primary "Allow" / secondary "Skip" (no dark patterns), import progress/loading state, profile section showing highlight count with sample entries as list rows, revoke behind a styled confirmation dialog, and an empty state when no highlights exist.
- **Why this step comes here:** PreReading (Step 15) and PostReading (Step 20) prompts are personalised with highlight history; importing now means those agents get real data. Depends on Step 6.
- **Touches:** YouVersion User Highlights API, OAuth scopes/consent UI, database (`highlights`), profile UI.
- **How to test it:** Sign in with a YouVersion account that has highlights, grant permission on the consent screen, then open the profile and see the imported highlight count and sample entries. Sign in with permission declined: no highlights stored, app fully usable.
- **Definition of done:** Highlights import only after explicit informed consent, are stored per user, and declining leaves the app fully functional.

### Step 8 — Instant Access session (Path B entry)
- **What gets built:** A one-tap "Try Round instantly" entry on the landing page. It mints a signed anonymous session token (no database user row) stored in browser `sessionStorage`, assigns an anonymous display name ("Reader #n" from an atomic counter), and applies defaults: English, NIV, and a default reading plan placeholder. All server routes gain a unified session resolver that returns either an authenticated user or an anonymous session — every subsequent feature is built against this abstraction so Instant Access is first-class, not bolted on. An "Upgrade" affordance ("Save your progress — sign in with YouVersion") appears persistently for anonymous sessions.
- **Why this step comes here:** The brief insists Path B is not an afterthought. Building the anonymous session abstraction *before* the feature steps means every feature from here on is implemented once for both paths. Depends on Steps 1–2; parallel to Step 6's session model.
- **Touches:** Session middleware/resolver, landing page UI, `sessionStorage`, anonymous naming.
- **How to test it:** Open the production URL in a private/incognito window, tap "Try Round instantly" — land inside the app with no form, seeing an assigned "Reader #n" identity and default language/version. Close the window, reopen: session gone, fresh entry works again. Verify no `users` row was created.
- **Definition of done:** A visitor reaches the app interior in one tap with no account, holds a working anonymous session for the browser session only, and no database user row exists for them.

### Step 8A — Design system and production-ready UI for Steps 1–8

- **What gets built:** Round's complete design system and a polish pass
  on every screen built so far. This step produces no new features —
  it makes the existing ones look and feel like a real product.

  *(Historical note: 8A shipped as specified below. Its teal palette was
  later superseded by the landing page's editorial style — see the
  visual-identity decision in the Decisions section and Step 8B, which
  re-points these tokens. The component inventory and structure below
  remain accurate.)*

  Design tokens (configured in Tailwind):
  - Primary: teal #1B6B6B with light (#E8F5F5) and dark (#134F4F)
    variants
  - Neutral greys for body text, borders, backgrounds, and disabled
    states
  - Typography: font family, size scale (xs through 2xl), weights
    (normal, medium, semibold, bold), and line heights
  - Border radius, shadow, and spacing scale consistent across all
    components

  Core reusable component library (used by all future steps):
  - Primary button, secondary button, ghost button, destructive button
  - Text input and textarea with label, helper text, error state
  - Card container (flat and elevated variants)
  - Avatar chip (shows initials or display name in a circle)
  - Badge (status indicator: forming, active, stalled)
  - Notification banner (info, success, warning, error)
  - Loading skeleton (block and text variants)
  - Empty state (icon + heading + subtext + optional CTA)
  - Divider and section header

  Mobile-first layout shell:
  - Page wrapper with safe-area insets for iOS
  - Top header bar (logo left, action right)
  - Scrollable content area
  - Bottom navigation bar (placeholder tabs for: Home, My Plan,
    Circles, Profile)

  Screens polished to production quality:
  - Landing page: Round wordmark and tagline, brief one-line value
    proposition, "Sign in with YouVersion" as primary CTA, "Try
    instantly" as secondary CTA, clean background — looks like a
    product someone would want to use
  - Signed-in home: warm welcome with the user's display name, clear
    next action ("Start reading" placeholder pointing to today's plan)
  - Anonymous home: same layout as signed-in home, "Reader #n"
    displayed clearly, upgrade prompt banner persistent at the top
  - Highlight import consent screen: readable explanation of exactly
    what is imported and why, primary "Allow" and secondary "Skip"
    actions, no dark patterns
  - Profile screen: clean layout showing imported highlights count,
    revoke/delete option with a confirmation step, sign-out action

- **Why this step comes here:** Steps 9–36 all build new screens. If
  the design system does not exist before they start, every step will
  make its own styling decisions and the result will be incoherent. All
  subsequent steps must use the component library built here — they
  make no independent colour or typography decisions.

- **Touches:** Tailwind config, global CSS, component library, layout
  shell, landing page, home screens, consent screen, profile screen.

- **How to test it:** Open the production URL on a real mobile device
  (or Chrome DevTools at 390px width). The landing page loads with the
  Round wordmark, teal brand colour, and both CTAs visible without
  scrolling. Sign in: the home screen feels warm and oriented. Open
  the profile: layout is readable, actions are clearly labelled. Open
  an incognito window and tap "Try instantly": the anonymous home
  displays the upgrade banner and "Reader #n" identity clearly. Resize
  to desktop: nothing breaks.

- **Definition of done:** Every screen from Steps 1–8 is visually
  consistent with the design system. A new developer can build the
  next feature by importing a component from the library without
  writing any new CSS. The app looks credible on a mobile device.

### Step 8B — Unify the app interior with the landing page's editorial style

- **What gets built:** The retrofit that executes the Decisions section's
  visual-identity decision. This step produces no new features — it makes
  every existing app-interior screen look like the same product as the
  landing page.

  Token re-point (in `globals.css` / Tailwind theme — the single source of
  styling truth):
  - `--color-primary` family: teal #1B6B6B → deep forest green
    (`--color-forest` #16302A, dark variant #0F221E, with a light
    parchment-tinted variant for soft backgrounds)
  - Surfaces: white/`#f5f7fa` → ivory #FDFBF5 (cards) on parchment
    #F6F1E7 (page background)
  - Accent: gold #B8935A (with soft variant #ECDFC8) for highlights,
    dividers, and selected states; sage #9AA88F / #E7EBE2 for calm
    secondary fills
  - Ink: charcoal-warm text colours replacing the cool grey ink scale
  - Typography: Lora (serif) for screen titles and display headings,
    Inter stays for body/UI text, Caveat reserved for rare devotional
    accents (e.g. pull-quote verse treatments) — added to the type scale
    as first-class tokens
  - Buttons: primary becomes the landing's pill-shaped forest button
    (rounded-full, hover lift); secondary/ghost/destructive re-skinned to
    match. Radius/shadow tokens warmed to the landing's softer values.

  Component library re-skin: every component in `src/components/ui`
  (buttons, inputs, cards, avatar chip, badges, banners, skeletons, empty
  states, dividers) and the layout shell (header, bottom nav) re-skinned
  through the new token values. Component APIs, prop names, and the
  component inventory do not change — downstream steps' markup is
  untouched by design.

  Screens retrofitted and verified: signed-in home, anonymous home,
  profile (both variants), consent placeholder, plan placeholder, circles
  placeholder, upgrade banner, sign-out affordances, and the dev Agent
  Console. The landing page itself does not change — it is the reference.

- **Why this step comes here:** The visual-identity decision was made
  after 8A shipped with a teal palette the landing page then outgrew.
  Retrofitting must happen before Phase 3 multiplies the screen count
  (Steps 9–36 add ~28 screens); doing it at the token level now means
  later steps inherit the editorial style for free, and no per-screen
  cleanup step is ever needed.

- **Touches:** `globals.css` tokens, Tailwind theme, `src/components/ui`
  library, layout shell, all existing app-interior screens.

- **How to test it:** Open the landing page and then sign in: the
  transition from landing to home feels like moving deeper into the same
  product, not switching apps — same palette, same button shapes, serif
  headings. Walk every existing screen (home, profile, plan, circles,
  consent, agent console) at 390px and desktop: no teal remains anywhere
  (grep for `#1b6b6b` and the old teal token values returns nothing),
  contrast on all text passes WCAG AA against the parchment/ivory
  surfaces, and both session paths (signed-in and Instant Access) render
  correctly.

- **Definition of done:** Every existing screen renders in the landing
  page's editorial style via re-pointed tokens, zero teal references
  survive in code, and a new screen built from the component library
  comes out editorial-styled with no extra styling decisions.

### Step 8C — Home and profile redesign: today-centred home, responsive shell

- **What gets built:** The redesign that executes the Decisions section's
  home-information-principle decision. No new features — the home and
  profile screens are recomposed around the user's journey (read today →
  see the conversation → adjust profile), and the layout shell becomes
  responsive. All styling stays on the Step 8B editorial tokens — no new
  colours, no new type sizes; the landing page and 8B palette are the
  reference throughout.

  Responsive layout shell (affects every app-interior screen):
  - Mobile (<768px): unchanged — top header (wordmark left, actions
    right), bottom tab bar, single column.
  - Desktop (≥768px): bottom tab bar hidden; the four nav links (Home,
    My Plan, Circles, Profile) render inline in the top header bar with
    a clear active state; content column widens from `max-w-lg` to
    `max-w-3xl` with the same card composition. Nothing breaks at any
    width between.
  - Header right side: an avatar menu (initials avatar + chevron) —
    a new library component (menu/popover, editorial-styled) — containing
    "Profile" and "Sign out" (Path A) or "End session" (Path B). It
    replaces the plain sign-out text button in the home header. The
    header reserves a slot where Step 29's notification bell will land;
    no bell renders until Step 29.

  Home screen, recomposed top-to-bottom:
  - Greeting: time-of-day salutation ("Good morning / afternoon /
    evening,") with the display name on its own line in the serif
    display face — "Radoslaw" (Path A) or "Reader #4" (Path B). Replaces
    "Welcome, {name}".
  - **Today card (primary, the page's one hero):** elevated ivory card.
    Label row: small icon chip + "TODAY" section label. Content: day
    number and passage reference in the serif face at display size, a
    short gold hairline divider, one line of helper text ("Continue
    your reading."), and a full-width primary pill button "Start
    reading" (book icon) — the page's single primary action. A
    decorative watercolour landscape asset fades in behind the card's
    right side via a CSS gradient mask (same technique as the landing
    hero image; `aria-hidden`, never behind text at mobile widths).
    Until Step 11 lands there is no plan, so the card ships rendering
    its **empty state as the default**: same card frame and label, copy
    "You're almost ready. Your first reading plan will appear here."
    (replacing the "Plan coming soon" badge + roadmap copy), with the
    disabled "Start reading" primary button retained so the card still
    previews its action. The populated layout above is implemented and
    takes over automatically when Step 11/13 wire real plan data. No
    reading time estimate, no streaks, no circle position — the card is
    entirely private.
  - **Circle card (secondary):** flat ivory card. Label row: icon chip +
    "CIRCLE" section label. Ships rendering its **empty state as the
    default** (no circles exist until Step 16): "Your circle will gather
    here. Reading circles arrive soon — you'll see reflections and
    discussion prompts from your group." The populated design is
    implemented as the spec for Steps 16–24 to fill: a short serif
    sub-heading, 2–3 activity rows (initials avatar or the Round system
    avatar, one-line contribution text, relative timestamp), and a
    full-width secondary pill button "Open Circle". Activity rows show
    **only published thread contributions** (reflections, Round's
    prompts/digests, messages) — never member reading status or pace.
    The "Round" system avatar (forest circle, white mark) is built as a
    library component now; Step 20 reuses it for system messages. No
    unread counts and no "new since your last visit" until a later step
    defines the last-seen mechanism.
  - Settings footer: one centred, muted line — "Reading in {language} ·
    Bible: {version}" — linking to Profile, with the anonymous
    "(default)" annotation carried over. Rendered when the session has
    values; hidden when both are unset (the null "choose during
    onboarding" state then lives on the Profile reading-settings card,
    so the information is never lost). The old "Your settings" card
    moves off Home — same data, now footer + Profile.
  - Loading: skeleton greeting + two skeleton cards while the session
    resolves. Anonymous variant keeps the persistent upgrade banner
    above the header, unchanged.

  Profile screen, recomposed in the same register:
  - Identity header: initials avatar, name in the serif display face,
    account badge (YouVersion account / Anonymous session) — unchanged
    content, restyled hierarchy.
  - New "Reading settings" card: language and Bible version as list
    rows (the data moved from Home), preserving every state the old
    home card rendered — real values, the anonymous "(default)"
    annotation, and the null "Choose during onboarding — coming soon"
    state. Read-only rows with a disabled "Change" affordance until
    Step 9 builds the settings flow; Step 9's settings screen becomes
    the tap target.
  - Existing cards restyled, not restructured: imported highlights
    (count, revoke-with-confirmation, Step 7 wiring later) and
    account/session (sign out / end session) keep their content and
    behaviour, gaining the icon-chip section label treatment and serif
    card headings for visual parity with Home.
  - Both variants (signed-in and anonymous) updated; anonymous keeps
    the upgrade banner.

  **Element inventory — nothing implemented is removed.** Every element
  currently in code survives this step, redesigned or relocated, never
  deleted:
  - Home: avatar (moves from the greeting row into the header avatar
    menu), welcome heading (becomes the time-of-day greeting), Today's
    reading card incl. its disabled "Start reading" button (restyled
    hero card + empty state), language/version display incl.
    "(default)" and null states (becomes footer line + Profile card),
    sign-out action (moves into the avatar menu), anonymous upgrade
    banner (unchanged), loading skeletons (restyled to the new layout).
  - Profile: identity header with avatar/name/badge, imported-highlights
    card with count, explanation, revoke flow (warning banner +
    confirm/cancel pair), account/session card with sign-out /
    end-session — all kept with identical behaviour, restyled only.

  Explicitly out of scope (shown in the reference mock but not planned
  or not yet implemented): reading-time estimate (~9 min), unread
  counts, "new since your last visit" / last-seen tracking, notification
  bell and badge (Step 29), photo avatars (initials only — no avatar
  images exist in the data model), member reading status of any kind.

  **Scope boundary:** the redesign applies to the home and profile
  screens only. The landing page is not touched in any way — it remains
  the visual reference (as in 8B). The `/plan`, `/circles`, and consent
  screens are not redesigned; the first two inherit the responsive
  shell automatically (they render inside it) and are verified in both
  nav modes, nothing more.

- **Why this step comes here:** The 8A home was organised around
  features (reading card + settings card) and reads like a settings
  dashboard; the product thesis is social. Recomposing Home before
  Phase 3 means Steps 9–36 land their pieces (onboarding values, plan
  day, circle activity, bell) into slots this layout already defines,
  and the responsive shell fixes the desktop single-narrow-column
  problem for every screen at once — later steps inherit both for free.

- **Touches:** Layout shell (`app-shell.tsx` — responsive nav, avatar
  menu, bell slot), new library components (menu/popover, icon-chip
  section label, activity row, Round system avatar), home screen (both
  variants), profile screen (both variants), watercolour card asset,
  no token changes.

- **How to test it:** At 390px: Home shows greeting, Today card (empty
  state), Circle card (empty state), no settings card, bottom nav
  intact; profile shows the reading-settings rows. At desktop width:
  bottom nav disappears, Home/My Plan/Circles/Profile render in the
  header with the active link marked, content column widens, nothing
  overlaps at any width between. Avatar menu opens with Profile +
  Sign out (signed in) / End session (anonymous); both actions work.
  Anonymous path still shows "Reader #n" in the greeting and the
  upgrade banner. Grep confirms no new colour or type values outside
  the token file; every visible element traces to one of the three
  home categories (read / conversation / navigation).

- **Definition of done:** Home is organised as greeting → Today card →
  Circle card → settings footer with exactly one primary action, both
  cards ship with designed empty states as their defaults, Profile owns
  the reading settings, the shell is responsive with desktop top-nav,
  and both session paths render correctly in the editorial style with
  zero member-progress information anywhere. Every element in the
  element inventory above is still present and functional — redesigned,
  never removed.

### UI standard for all steps after 8B

Step 8A delivered the component library and layout shell; Step 8B re-pointed its design tokens to the landing page's **editorial style** (parchment/ivory surfaces, forest-green primary, gold/sage accents, Lora serif display headings, pill primary buttons), which is the product's canonical design language per the Decisions section. Every subsequent step that adds or changes a screen ships that screen at **production visual quality in the same step** — there is no later "polish pass." Concretely, for every step below:

- All UI is composed from the component library and the editorial design tokens; no step introduces its own colours, type sizes, or spacing values, and **no step reintroduces the retired teal palette**. New reusable patterns (e.g. bottom sheet, toast) are added *to the library* in the editorial style, then used.
- Every app-interior screen renders inside the Step 8C responsive shell and follows its screen register: icon-chip section labels, serif card headings, one clear primary action per screen, elevated hero card for the screen's main object with flat cards for secondary content. The home and profile screens are the visual reference for every interior screen — a `/plan` or `/circles` screen must look like a sibling of Home, not a different app.
- Screen titles and display headings use the serif display face; body and UI text stay on the sans face — matching the landing page's typographic register.
- Every screen ships with its non-happy-path states designed: loading (skeletons), empty (empty-state component), and error (banner) — never unstyled placeholders or raw JSON.
- Everything is verified mobile-first (390px) and must not break at desktop widths. Step 8C makes the shell responsive (desktop top-nav, wider column) — screens compose identically for both; new screens must be checked in both nav modes.
- Steps that add home-screen elements (Step 11/13 plan data, Steps 16–24 circle activity, Step 29 bell) fill the slots Step 8C defines — they do not restructure Home, and everything added to Home must fit one of its three information categories (private reading / shared conversation / navigation) per the Decisions section.
- Each step's **UI** bullet below is part of its definition of done: the step is not complete until its screens look like part of the same product as the landing page and the Step 8B screens. Where a step's UI bullet below says "8A", read it as the 8B-retrofitted library — same components, editorial skin.

## Phase 3 — Onboarding and Reading Plans

### Step 9 — Language and Bible version selection
- **What gets built:** The onboarding screen (and a settings screen for later changes) for choosing preferred language and Bible version. A `bible_versions` catalogue table populated from the Bible Versions API per language, cached with a 24-hour TTL and lazy revalidation. The picker offers **only** the versions in `SUPPORTED_VERSIONS` (`src/config/bible-versions.ts`) for the chosen language — rendered instantly from the config, then validated/enriched against the cached live catalogue (per the Decisions section, the live list never expands the choices; unlicensed versions would 403 on passage fetch). Entries with `licensed: false` render disabled with a "coming soon" state. Selection is stored on the `users` row for Path A and in the anonymous session for Path B. Defaults applied when unset come from `DEFAULT_VERSION_BY_LANGUAGE`, with `LICENSED_FALLBACK_BY_LANGUAGE` as the effective selection while a default is unlicensed; languages without curated entries fall back to the English licensed fallback.
- **UI:** Onboarding runs inside the 8A layout shell with a stepped progress indicator (added to the library, reused by Steps 10–12). Language and version options render as tappable selection cards with a clear selected state; the supported-version list appears instantly from the config (licensed versions selectable, unlicensed ones disabled with a "coming soon" tag) while catalogue validation happens in the background. The settings screen matches the profile screen's visual language.
- **Why this step comes here:** Language + version ID drive every passage fetch and every translation target downstream — the brief requires this in the data layer before any dependent feature. Depends on Steps 3, 6, 8.
- **Touches:** YouVersion Bible Versions API, database (`bible_versions`, `users`), onboarding UI, settings UI, anonymous session state.
- **How to test it:** In onboarding, choose Spanish: the picker shows exactly NVI/LBLA/RVES (no RVR1960 — not in this app key's catalogue) with unlicensed entries disabled. Select a licensed version, finish, reload — the choice persists (database row for signed-in; sessionStorage for anonymous). Change language to Portuguese in settings: version list swaps to NVI-PT/BLT. Verify every selectable version yields a successful passage fetch (no 403).
- **Definition of done:** Both session types can select and persist a language and version ID; the picker never offers a version outside `SUPPORTED_VERSIONS`, and every selectable version fetches passages successfully.

### Step 10 — Onboarding goals and profile questions
- **What gets built:** The remaining onboarding questions, six in total, only one free-text:
  1. **What do you want to learn?** — free text; the primary `goals` input to PlanBuilder, where free-form nuance ("forgive people who hurt me") carries the most value.
  2. **Why do you want to read the Bible?** — choice chips (grow closer to God, understand the basics, find comfort, build a habit, study deeper); feeds motivation/tone, circle matching, and the icebreaker.
  3. **Bible familiarity** — choice chips (brand new / read some / read regularly); steers passage difficulty in PlanBuilder (a newcomer gets Mark and short Psalms, an experienced reader can handle Romans or the prophets) and circle matching (e.g. new-believer circles, Step 21).
  4. **Life season** — choice chips (new to faith, parenting, student, busy career, grief or loss, big transition); serves matching, the icebreaker, and tone (a grief season steers toward lament Psalms).
  5. **Available time per day** — choice chips (5 / 10 / 15 / 30 minutes); direct passage-length control for PlanBuilder.
  6. **Topics of interest** — multi-select chips from a controlled vocabulary (forgiveness, grace, anxiety & peace, relationships, purpose, prayer, wisdom, faith basics) plus an "other" free field. Controlled values are required by three consumers: circle matching compares topics across users (Step 21), the Step 12 fallback pool is tagged with these same topic values, and profile editing renders them as chips.
  7. **What are you hoping for from your circle?** — multi-select chips (encouragement, honest discussion, accountability, prayer support, learning together); the strongest social-compatibility signal for circle matching (Step 21 — distinguishes an accountability-seeker from a comfort-seeker where topics alone cannot), and feeds the icebreaker (Step 22) and Facilitator tone (Step 24). Not used by PlanBuilder.

  Timezone and demographic questions are deliberately omitted: circles are async by design (polling threads, daily digests), and life season captures circumstance without collecting demographics. Plan duration is **not** asked here — it is plan-specific, not profile, and is collected in the Step 12 "create my own plan" form. Answers stored on the user profile (Path A) or session (Path B, optional/skippable with defaults per the brief: 10 minutes, "read some", general topics). A profile screen displays and allows editing of the answers.
- **UI:** Continues the Step 9 onboarding flow and progress indicator — one question (or small group) per screen using library inputs and selects, with skip actions clearly visible for Path B. Profile editing reuses the same field components with inline save confirmation (success banner), so onboarding and profile feel like one system.
- **Why this step comes here:** These answers feed PlanBuilder (Step 12), circle matching (Step 21), the icebreaker (Step 22), and prompt personalisation — they must exist before any of those. Depends on Step 9 (single onboarding flow).
- **Touches:** Database (`users`/profile), onboarding UI, profile UI.
- **How to test it:** Complete onboarding as a signed-in user with distinctive answers; open the profile page and see them verbatim; edit one and see it persist after reload. As an anonymous user, skip the questions entirely and still land in the app with defaults.
- **Definition of done:** Onboarding answers persist and are editable for signed-in users, and are optional-with-defaults for Instant Access users.

### Step 11 — Pre-defined reading plans, selection, and plan view
- **What gets built:** The reading plan schema: a plan is a structured list of day-by-day passage references (no Bible text ever stored — references only). A seed migration inserts the starter library (Psalms in 30 days, Gospel of Mark, Ruth). Onboarding's plan step lets the user browse and select a plan; a plan view shows the day list with the user's current day and per-day references. User plan progress (current day, days completed) is stored privately — never exposed to other members, per the no-comparison constraint.
- **UI:** Plan library renders as elevated cards (plan name, length, one-line description) with a clear selected state. The plan view is a scrollable day list with the current day visually highlighted, completed days check-marked, and per-day references as chips — built from library badges, cards, and dividers, with skeleton loading and an empty state. This day-list component is reused by Steps 12 and 14. The `/plan` tab screen is composed in the Step 8C register — same responsive shell as Home, icon-chip "MY PLAN" section label, serif headings, the current day as the screen's hero card with "Continue reading" as the single primary action — so it reads as a sibling of the home screen, replacing the 8A placeholder empty state.
- **Why this step comes here:** The plan is the spine of the daily loop — passage view, prompts, digests, and reminders all key off "today's reference." Pre-defined plans are pure data, so they land before AI generation. Depends on Steps 2, 9–10.
- **Touches:** Database (`plans`, `plan_days`, `user_plan_progress`), seed migration, onboarding UI, plan view UI.
- **How to test it:** In onboarding, pick "Psalms in 30 days"; the plan view shows 30 days with correct Psalm references and Day 1 marked current. Verify by database inspection that only references are stored, never passage text. Anonymous user selects a plan and sees the same view.
- **Definition of done:** A user on either path can select a seeded plan and see their day-by-day reference list with private progress tracking.

### Step 12 — PlanBuilder Agent: AI-generated plans with YouVersion validation
- **What gets built:** The "create my own plan" onboarding path. PlanBuilder sends onboarding goals, time per day, and topics to Gloo and receives a structured day-by-day plan. **Every reference is validated by a live YouVersion Passages fetch before saving.** Failed references trigger up to 2 single-day regenerations (with the failure fed back to Gloo), then substitution from a curated topic-tagged fallback pool with the day marked "adjusted" in the preview. Generated plans are saved in the identical structure as seeded plans. Total generation failure offers the pre-defined library instead.
- **UI:** Goal input as a friendly library form, pre-filled from the Step 10 profile answers and including the **plan duration** question (choice chips: 1 week / 2 weeks / 30 days) — duration is asked here, not in onboarding, because it is per-plan rather than per-profile; generation shows a warm, branded waiting state ("Building your plan…" with skeleton day rows), never a spinner on a blank page. The preview reuses Step 11's day-list component with "adjusted" days marked by a badge and a one-line explanation. Wholesale failure renders the empty-state component with a clear CTA into the pre-defined library. All screens in the Step 8C register (responsive shell, serif headings, one primary action), matching the Step 11 plan screens exactly.
- **Why this step comes here:** Requires the plan schema (Step 11), Gloo client (Step 4), and YouVersion client (Step 3). Landing it now means everything downstream works identically for both plan origins.
- **Touches:** PlanBuilder agent, Gloo Completions V2, YouVersion Passages API (validation), database (same plan tables), onboarding UI.
- **How to test it:** Choose "create my own plan" with goals like "learn about forgiveness, 10 minutes a day, 2 weeks"; receive a 14-day plan preview; spot-check three generated references by opening them in the passage view (Step 13, or via the Step 3 dev route) — all resolve. Check `agent_logs` for the PlanBuilder run. Force a validation failure (temporarily inject a bogus reference in dev) and observe the retry-then-fallback path produce a valid plan.
- **Definition of done:** An AI-generated plan saves only after every reference has passed live YouVersion validation, using the same schema as pre-defined plans.

## Phase 4 — The Reading Experience

### Step 13 — Passage view
- **What gets built:** The core reading screen for "today's passage": text fetched live from the YouVersion Passages API using the session's version ID; the version abbreviation shown persistently next to the reference; a one-tap version switcher (fed by Step 9's catalogue); the fallback behaviour — if the passage is unavailable in the chosen version, fetch the language-default version and show a notice without overwriting the user's preference; and an "Open in Bible App" deep-link button on every passage view.
- **UI:** The reading screen is the app's flagship surface — designed for comfortable long-form reading: generous line height and reading-size type from the scale, sticky reference header, version abbreviation as a tappable chip opening a bottom-sheet version switcher (bottom sheet added to the library), "Open in Bible App" as a secondary button, fallback notice via the info banner, and a text skeleton while the passage loads.
- **Why this step comes here:** First screen where a user actually reads Scripture; everything before it exists to parameterise this fetch. Depends on Steps 3, 9, 11.
- **Touches:** YouVersion Passages API, YouVersion Deep Links, passage UI, version picker component.
- **How to test it:** As a Spanish/NVI user, open Day 1: the passage renders in Spanish with "NVI" beside the reference. Tap the version badge, switch to RVES: text re-fetches in one tap. Tap "Open in Bible App": the deep link opens the correct passage in YouVersion. Point a test user at a version lacking the passage: the language-default version renders with the fallback notice.
- **Definition of done:** Any user on either path reads today's live-fetched passage in their chosen version, can switch versions in one tap, and can deep-link to the Bible App.

### Step 14 — In-app highlighting and reading completion
- **What gets built:** Text selection in the passage view creates a session highlight, stored with the reference and **the version ID it was made in** (per the brief). A "Finished reading" action marks the plan day complete and advances private progress. Signed-in users' highlights persist; anonymous users' highlights live in session storage only. No progress or highlight information is ever visible to other members.
- **UI:** Highlights render in the light teal token with a small selection toolbar/tooltip on select. "Finished reading" is a prominent primary button at the end of the passage with a satisfying completed state (filled/checked, brief affirmation — no streak or comparison language), and completion is reflected in the plan view's day list from Step 11.
- **Why this step comes here:** Session highlights feed PostReading starters (Step 20); completion state feeds the Reminder Agent (Step 29) and gates post-reading UI. Depends on Step 13.
- **Touches:** Passage UI, database (`highlights`, `user_plan_progress`), anonymous session state.
- **How to test it:** Highlight a phrase in NVI, then switch the passage to RVES and highlight another; inspect stored highlights — each carries its own version ID. Tap "Finished reading": the plan view shows Day 1 complete and Day 2 current. Confirm nothing about this progress appears anywhere another user could see.
- **Definition of done:** Highlights persist with their version ID, day completion advances private progress, and both work on both session paths.

### Step 15 — PreReading Agent: pre-reading prompts
- **What gets built:** When a user opens today's passage, the PreReading agent generates 2–3 short personal prompts via Gloo, informed by the passage text (fetched from YouVersion and passed as context), the user's onboarding goals, and relevant imported highlights. Displayed in a collapsible card above the passage, clearly personal (never shared). Generated in the user's preferred language directly. Cached per user+day so reopening doesn't re-call Gloo.
- **UI:** Prompts live in a collapsible card (library card + disclosure header) above the passage, visually marked as personal ("Just for you" treatment), with a skeleton while generating and a silent hidden state on failure — the reading experience never blocks on this card.
- **Why this step comes here:** First personalised AI feature in the reading loop; needs passage view (13), goals (10), and highlights (7). Its output is also referenced by PostReading later.
- **Touches:** PreReading agent, Gloo Completions V2, YouVersion Passages API (context), passage UI, cache table.
- **How to test it:** As a signed-in user whose goal mentions "forgiveness," open a passage: 2–3 prompts appear above the text, in the user's language, plausibly connected to both the passage and the stated goal. Collapse them; reload — prompts reappear identically (cache hit, confirmed by no new `agent_logs` row). As an anonymous user, prompts still generate live using session defaults.
- **Definition of done:** Personalised pre-reading prompts render collapsibly above the passage for both paths, generated once per user per day.

## Phase 5 — Circles

### Step 16 — Circle creation, browsing, and joining
- **What gets built:** Circle entity with states (forming → active → stalled → archived), size limits (min 3, max 5), and an attached reading plan. Users can create a circle (choosing a plan), browse open circles (name, plan, member count — never member progress), and join one. A circle becomes `active` at 3 members; joining is blocked at 5. Members list shows display names only.
- **UI:** Circle browse as a card list: circle name, plan badge, member count shown as stacked avatar chips, and the forming/active state badge. Create-circle is a short library form; joining confirms with clear feedback; a full circle communicates refusal with a friendly banner, not an error. Empty state ("No open circles yet — start one") with a create CTA. The Circles tab goes live here (bottom nav on mobile, header nav on desktop), replacing the 8A placeholder. The `/circles` screen is composed in the Step 8C register — same responsive shell as Home, icon-chip "CIRCLES" section label, serif headings, the user's own circle as the hero card (once joined) with browse results as flat cards beneath — a sibling of the home screen. Joining a circle also lights up Home's circle card (the Step 8C slot) with the circle name and "Open Circle" action.
- **Why this step comes here:** The social container for everything in Phases 5–6. Depends on plans (Step 11) and sessions (Steps 6/8).
- **Touches:** Database (`circles`, `circle_members`), circle browse/create/join UI.
- **How to test it:** With three test accounts: account A creates a circle on the Mark plan (state `forming`); accounts B and C browse, find it, join; on C's join the state flips to `active`. Add two more members, then a sixth attempt is refused with a clear message. Confirm the browse view exposes no per-member progress anywhere.
- **Definition of done:** Circles can be created, discovered, and joined with size and state rules enforced, showing no inter-member comparison data.

### Step 17 — Circle thread with polling
- **What gets built:** The circle thread: members post text messages, rendered chronologically with author display names and timestamps. The thread refetches every 10 seconds while visible, pauses when the tab is hidden, and refetches immediately after posting. Message schema is designed for what's coming: an immutable original body + source-language field, with a separate additive `message_translations` table (empty for now) — originals are never modified, per the brief.
- **UI:** The thread is styled as a modern messaging surface within the design system: message rows with avatar chips, author name and relative timestamp, own-vs-others visual distinction, date separators, and a composer pinned above the bottom nav on mobile and at the content column's bottom on desktop (library textarea + send button, disabled-while-sending state). Auto-scroll on new messages, skeleton rows on first load, and an empty state before the first message. Renders inside the Step 8C responsive shell with the editorial register (serif circle-name header, ivory message surfaces on parchment); Round's system messages will use the Step 8C Round system avatar. This thread rendering is the base every later thread feature (Steps 19–28) extends.
- **Why this step comes here:** The thread is the surface for reflections, starters, digests, and translations. The polling mechanism built here also delivers async translation swaps later. Depends on Step 16.
- **Touches:** Database (`messages`, `message_translations` shell), thread UI, polling logic.
- **How to test it:** Open the same circle in two browsers as two members. Post from one; within 10 seconds it appears in the other without a manual refresh. Background the second tab and verify (network inspector) polling stops; foreground it and polling resumes.
- **Definition of done:** Circle members exchange messages that propagate to other open sessions within one polling interval, with originals stored immutably.

### Step 18 — Escalation Agent (standalone, before any reflection intake exists)
- **What gets built:** The complete Escalation Agent: a Gloo call with a dedicated system prompt that classifies text for crisis signals (suicidal ideation, self-harm, acute crisis, complete hopelessness); the version-controlled crisis resource config file (US 988, UK Samaritans 116 123 minimum, region-keyed with default); the quiet, non-alarming support card UI component shown only to the affected user, offering connection to a trusted person or the listed resources; and the audit log that records **only the reflection reference, never content**. A dev-only test route (non-production) allows submitting arbitrary text to the classifier to verify behaviour.
- **UI:** The support card gets the most careful visual treatment in the app: calm, quiet styling (soft neutral/light-teal, no alarm reds or warning iconography), warm plain language, resources as large tappable rows with `tel:` links, and a gentle dismiss — consistent with the design system but deliberately softer than standard banners.
- **Why this step comes here:** The brief is absolute: the product must not accept user reflections without this running first. Building and testing it standalone *before* Step 19 makes that ordering structurally guaranteed. Depends on Steps 4–5.
- **Touches:** Escalation agent, Gloo Completions V2, crisis resource config file, support card component, audit log table, dev test route.
- **How to test it:** Via the dev route: submit a benign reflection — no flag. Submit test text with clear crisis language — flagged, and the support card component renders with correct US/UK resources. Inspect the audit log: contains a reference ID and timestamp only, no message content anywhere.
- **Definition of done:** The Escalation Agent correctly classifies test inputs, renders the private support card with the hardcoded resources, and logs references only.

### Step 19 — Reflection submission through the Escalation gate
- **What gets built:** The daily reflection flow: after reading, a member writes a reflection for the circle. The submission pipeline is hard-wired so the **Escalation Agent runs first, synchronously, before any other processing** — before the reflection is posted to the thread, before translation, before anything. Unflagged reflections post to the thread as a distinct "reflection" message type tied to the plan day. Flagged reflections are saved privately to the author (never posted, excluded from future digest input, per the Decisions section), and the author sees the support card.
- **UI:** The reflection composer is a distinct, inviting surface (not the plain message box): today's reference shown above a prompted textarea, submitting shows a pending state. Reflections render in the thread as visually distinct reflection cards tagged with the plan day, clearly different from ordinary messages.
- **Why this step comes here:** Inseparable from Step 18 by requirement — reflections may not exist before the gate does. Depends on Steps 17–18.
- **Touches:** Reflection UI, submission pipeline, Escalation agent, database (`reflections`, messages), thread UI.
- **How to test it:** Submit a normal reflection: it appears in the circle thread tagged to today's passage, and `agent_logs` shows the Escalation run *preceding* the post. Submit a reflection containing the crisis test phrasing: the support card appears to the author; a second member's view of the thread shows **no trace** of that reflection or any escalation signal.
- **Definition of done:** Every reflection passes through the Escalation Agent before any other processing, flagged content stays private to its author, and unflagged reflections appear in the thread.

### Step 20 — PostReading Agent: conversation starters in the thread
- **What gets built:** When a user finishes reading (Step 14's completion action), the PostReading agent generates 2–3 discussion questions via Gloo, grounded in the specific passage, the user's session highlights, and the pre-reading prompts they were shown. Posted to the circle thread attributed to **"Round"** as a system message type (visually distinct from member messages); members can reply to them. Idempotent per user+day.
- **UI:** System "Round" messages get their own visual identity, defined here and reused by Steps 22, 24, 25: a distinct background tint, a Round mark/avatar chip in place of a member avatar, and starters laid out as a card with each question individually replyable — unmistakably not a member message.
- **Why this step comes here:** Needs completion (14), pre-reading prompts (15), and the thread (17). Depends on Step 19's message-type groundwork for system-attributed posts.
- **Touches:** PostReading agent, Gloo Completions V2, thread UI (system message rendering), database.
- **How to test it:** Highlight a striking phrase, tap "Finished reading": within moments 2–3 questions attributed to "Round" appear in the circle thread, at least one visibly connected to the highlighted phrase. Another member replies to one. Complete the same day again — no duplicate starters.
- **Definition of done:** Finishing a reading posts passage-grounded, highlight-aware starters to the thread as "Round," exactly once per user per day.

### Step 21 — AI circle matching with fallback
- **What gets built:** The third onboarding path into a circle: "match me." Gloo receives the user's onboarding profile (life season, plan topic, goals, Bible familiarity, and what they hope for from a circle — the Step 10 answers) and summaries of all open circles, and returns the best match with a short explanation displayed to the user before they confirm joining. Fallback per the Decisions section: an imperfect match is still offered with an honest explanation; zero open circles triggers immediate creation of a new `forming` circle with the user as founding member.
- **UI:** Match proposal as a dedicated screen: the proposed circle as an elevated card (plan badge, member avatar chips) with the Gloo explanation styled as a highlighted quote; primary "Join this circle" and secondary "Browse circles instead" actions; a branded waiting state while matching runs. The founding-member path gets a warm, celebratory treatment ("You're starting something new") rather than an empty screen.
- **Why this step comes here:** Needs circles (16), onboarding profiles (10), and Gloo (4). Placed after the core thread loop so matched users land in a functioning circle.
- **Touches:** Matching flow UI, Gloo Completions V2, circles database.
- **How to test it:** Seed two open circles with distinct topics (Psalms/grief-season vs Mark/new-believer). Onboard a new user whose goals say "learning the basics of Jesus' life": the match proposes the Mark circle with an explanation referencing that goal; confirm and land in its thread. Archive all open circles and repeat: a new `forming` circle is created immediately with a founding-member message.
- **Definition of done:** A new user is matched to the most fitting open circle with a shown explanation, and never hits a dead end when no circle exists.

### Step 22 — Cold-start icebreaker
- **What gets built:** When a circle reaches minimum size (3) and flips to `active`, Gloo generates a personalised opening message referencing something specific from **two members' real onboarding answers**, posted to the thread as a system message attributed to "Round." Fires exactly once per circle (idempotency key on circle). There is no blank "say hi" state — the icebreaker is the first thread content in every new circle.
- **UI:** No new components — the icebreaker renders with Step 20's system-message identity. Verify the `forming` state before activation shows a designed waiting state ("Waiting for 1 more reader") rather than an empty thread.
- **Why this step comes here:** Needs the activation transition (16), the thread with system messages (17/20), and onboarding answers (10).
- **Touches:** Icebreaker generation (Gloo Completions V2), circle state transition hook, thread, database.
- **How to test it:** Create a fresh circle with member A (goal: "understand the Psalms in hard times"), join B (goal: "build a morning routine"), then C. On C's join, an icebreaker from "Round" appears that identifiably references A's and B's actual answers. Remove and re-add a member in dev: no second icebreaker.
- **Definition of done:** Every circle reaching three members receives exactly one personalised icebreaker referencing two members' real onboarding answers.

## Phase 6 — Scheduled Agents and the Daily Loop

### Step 23 — Scheduling backbone: Vercel Cron, idempotency, dev triggers
- **What gets built:** The `agent_runs` table with its unique `(agent_name, target_id, period_key)` constraint. Secured cron API routes (verifying `CRON_SECRET`) for each scheduled cadence: daily Facilitator+Summary sweep (per circle), daily Reminder sweep (per user), 12-hourly Health sweep (stub for now), daily demo refresh (activated in Step 31). `vercel.json` cron definitions. The Step 5 Agent Console gains buttons that hit these exact routes locally.
- **UI:** Dev-only, but still built from the library (it appears in demos and screenshots): each cron route as a card with a trigger button, last-run status badge, and the run result shown inline — no raw JSON dumps or unstyled buttons.
- **Why this step comes here:** Facilitator, Reminder, Health, and the demo refresh all need this rail; building it once with idempotency proven means none of them can ever double-fire. Depends on Steps 2, 5.
- **Touches:** Database (`agent_runs`), cron API routes, `vercel.json`, Agent Console.
- **How to test it:** Hit the Facilitator cron route locally twice in a row via the Agent Console: the first creates `agent_runs` rows for eligible circles, the second reports "already ran" for every one and writes nothing. Call the route without the bearer secret: 401. After deploy, confirm in the Vercel dashboard that the cron jobs are registered and their scheduled invocations return 200.
- **Definition of done:** Scheduled routes are live in production via Vercel Cron, locally triggerable via the console, and provably idempotent on double execution.

### Step 24 — Facilitator Agent: daily digest
- **What gets built:** On the daily sweep, for each circle where at least 50% of members (minimum 2) submitted reflections for the current plan day, the Facilitator synthesises them via Gloo into a digest: 2–3 sentence collective synthesis, an overlap callout naming which members landed on the same theme or line, and one discussion question grounded in the passage and the circle's own words. Posted to the thread as a "Round" digest card. Flagged reflections (Step 19) are excluded from input. One digest per circle per day, enforced by `agent_runs` plus a unique constraint on the digest itself.
- **UI:** The digest is the thread's daily centrepiece and looks it: a distinguished card on Step 20's system-message identity with a date header and "Round" attribution, the synthesis as readable prose, the overlap callout visually highlighted with the named members' avatar chips, and the discussion question set apart as a quote-style block inviting replies.
- **Why this step comes here:** The centrepiece daily AI moment; needs reflections (19) and the cron rail (23).
- **Touches:** Facilitator agent, Gloo Completions V2, cron route, database (`digests`), thread UI.
- **How to test it:** Have 2 of 3 members submit reflections that deliberately share a theme (both mention "still waters"). Trigger the Facilitator sweep from the Agent Console: a digest appears in the thread whose overlap callout names both members and the shared phrase, plus a discussion question echoing the circle's own words. Trigger the sweep again: no second digest. Run with only 1 of 3 reflections: no digest generated for that circle.
- **Definition of done:** Circles meeting the reflection threshold receive exactly one daily digest with synthesis, named overlap callout, and a grounded discussion question.

### Step 25 — Summary Agent: lesson summary
- **What gets built:** Alongside each digest, the Summary agent generates a 3–5 sentence plain-language summary of the passage's main teaching, informed by the passage text and the themes the circle raised. Rendered as a collapsible card attached to the digest — available, never forced open. Runs in the same sweep, same idempotency period key.
- **UI:** "Lesson summary" as a collapsible section inside the digest card using the library disclosure pattern — collapsed by default with a clear expand affordance, matching Step 15's collapsible treatment so disclosures feel consistent app-wide.
- **Why this step comes here:** The brief couples it to the digest ("alongside the daily digest"); it reuses Step 24's trigger and inputs directly.
- **Touches:** Summary agent, Gloo Completions V2, digest sweep, thread UI.
- **How to test it:** After the Step 24 test digest generates, the same thread shows a collapsed "Lesson summary" card; expanding it reveals 3–5 plain-language sentences consistent with the passage. Re-running the sweep produces no duplicate.
- **Definition of done:** Every generated digest is accompanied by exactly one collapsible plain-language lesson summary.

### Step 26 — Prayer Agent: on-demand prayer
- **What gets built:** A "Generate a prayer" action in the circle thread. Gloo produces a 5–8 sentence first-person-plural prayer grounded in that day's circle discussion (reflections + digest), attributed "Round — based on today's reading," generated in the requesting user's language. Shown privately to the requester with copy and save actions — **not** broadcast to the circle. Saved prayers appear on the user's profile (Path A) or last for the session (Path B).
- **UI:** The prayer opens in a focused bottom sheet/modal with generous typography and the attribution line styled subtly beneath; copy and save give clear success feedback (toast added to the library); a warm loading state while generating. Saved prayers list on the profile as cards with reference and date.
- **Why this step comes here:** Needs the day's discussion content (19/24). On-demand, so no cron dependency.
- **Touches:** Prayer agent, Gloo Completions V2, thread UI action, database (`saved_prayers`).
- **How to test it:** After a day with reflections and a digest, tap "Generate a prayer": a first-person-plural prayer referencing the day's themes appears with the attribution line. Copy works; save works and the prayer shows on the profile. Confirm in a second member's session that nothing was posted to the thread.
- **Definition of done:** Any member can generate, copy, and save a discussion-grounded prayer that is never auto-shared to the circle.

### Step 27 — Translation Agent: multilingual thread
- **What gets built:** On every new user-generated message or reflection post: source language detection (one Gloo call, author-profile-language fallback per the Decisions section); for each *distinct* preferred language among circle members that differs from the source, one Gloo translation call with the faith-context prompt; results written to `message_translations` (additive — originals untouched). Cache rule: a message is never re-translated for the same target language. Thread rendering: each reader sees messages in their own language by default with a "Translated by Round" label and a "Show original" toggle; pending translations show the original with a "Translating…" badge until the next poll swaps them. **Scripture references inside messages pass through as-is; Bible text is never an input to this agent.** Runs post-persist via `waitUntil` so posting is never blocked.
- **UI:** Translation states designed into the message row: "Translating…" as a subtle inline badge, "Translated by Round" label with the "Show original" toggle styled unobtrusively beneath the message, and the poll swap happening without layout jump. The toggle animates nothing — instant, quiet, readable.
- **Why this step comes here:** Tier 1 core loop, not polish — placed immediately after the thread content types it must cover (messages, reflections) are all in place. Depends on Steps 9, 17, 19.
- **Touches:** Translation agent, Gloo Completions V2 (detect + translate), database (`message_translations`), thread UI, polling.
- **How to test it:** Circle with a Spanish-preference member and an English-preference member. English member posts "This verse about mercy stopped me today." Spanish member's thread shows it in Spanish with the "Translated by Round" label within one poll cycle; the "Show original" toggle reveals the exact English original. Spanish member replies in Spanish; English member sees English. A second English member joining sees the cached translation with **no** new Gloo call (verify via `agent_logs`). Two same-language members: verify no translation call at all. Database check: original message bodies byte-identical to what was typed.
- **Definition of done:** Cross-language members each read the full thread in their own language with originals preserved, toggleable, cached, and never re-translated per target language.

### Step 28 — AI messages generated per-language (not translated)
- **What gets built:** Digest, lesson summary, icebreaker, and conversation starters are generated by Gloo **directly in each distinct member language** present in the circle (one generation per language, stored as language variants of the AI message), per the brief's rule that AI content is never translated after the fact. The thread renders the variant matching the reader's language. Prayer (Step 26) already generates in the requester's language.
- **UI:** No new surfaces — the reader's language variant renders through the existing system-message components, with no "Translated by Round" label (these are native generations). Verify no visual regression in the digest/summary/starter cards.
- **Why this step comes here:** Modifies the agents built in Steps 20/22/24/25, and needs the multilingual rendering from Step 27. Isolated here so those steps stayed single-language-testable.
- **Touches:** Facilitator, Summary, PostReading, icebreaker generation; digest/thread rendering; database (language-variant storage).
- **How to test it:** In the mixed English/Spanish circle, trigger the Facilitator sweep: the English member reads the digest in English, the Spanish member in Spanish, and **neither shows a "Translated by Round" label** (they are native generations, not translations). `agent_logs` shows one Facilitator generation per language, and no Translation agent run for the digest.
- **Definition of done:** All recurring AI thread content renders natively in each member's language with no post-hoc translation involved.

### Step 29 — Reminder Agent, in-app notifications, and email
- **What gets built:** An in-app notification model (bell + list, fed by polling). The daily Reminder sweep (on the Step 23 rail) generates via Gloo: a **reading reminder** for any user 2+ days behind their plan (referencing the missed passage and what their circle discussed) and a **message notification** for unread circle messages older than 24 hours (short summary of what was missed). Delivery: in-app always; email additionally if an address is on file — plain text, no tracking pixels, via the email abstraction (Resend in production, Mailpit locally). Idempotent per user+type+day. Instant Access users receive neither (no address, no persistence), per the brief.
- **UI:** Notification bell in the top header bar with an unread-count badge; the notification list as card rows with a type icon, short text, relative time, and unread state, plus an empty state ("You're all caught up"). Emails are plain text but still carefully written: clear subject, warm greeting, the personalised body, simple sign-off — no HTML, no tracking, but never sloppy.
- **Why this step comes here:** Needs plan progress (14), thread activity (17+), digests for context (24), and the cron rail (23).
- **Touches:** Reminder agent, Gloo Completions V2, cron route, database (`notifications`), Resend/Mailpit, notification UI.
- **How to test it:** Locally: set a test user's progress 3 days behind, trigger the Reminder sweep from the Agent Console — an in-app notification appears naming the missed passage, and the email is visible in the Mailpit UI as plain text with no HTML tracking. Trigger the sweep again: no duplicates in-app or in Mailpit. In production with a real address: receive the actual Resend email once.
- **Definition of done:** Behind-schedule users get personalised reminders and inactive readers get message summaries, in-app always and by plain-text email when available, exactly once per day.

## Phase 7 — Instant Access End-to-End

### Step 30 — Demo circle and full anonymous participation
- **What gets built:** A seed script creates the system-owned demo circle: realistic member personas, prior reflections, a digest, a lesson summary, and starters (generated via real Gloo calls at seed time). Instant Access users land with the demo circle joinable in one tap: they read the digest and prior reflections, and can submit their own reflection — which runs through the Escalation Agent exactly as normal and appears in the thread under their "Reader #n" name. Anonymous reflections are stored tagged with the anonymous session ID (pruned in Step 31). The upgrade prompt ("Save your progress — sign in with YouVersion") is reachable from every screen and completes into a real Path A account. Confirmed absent for anonymous users: email reminders, Echoes, circle matching.
- **UI:** This is the judge-facing showcase — a full visual dress rehearsal of every surface: seeded demo content must read naturally inside the Step 17–25 thread UI (realistic names, varied message lengths, believable digest), each screen offers one obvious next action so a first-time visitor never stalls, and the upgrade banner stays persistent but unobtrusive with the OAuth handoff styled as a proper flow, not a bare redirect. Fix any visual seams found during the rehearsal as part of this step.
- **Why this step comes here:** Every capability it stitches together (passage, prompts, reflections, escalation, digest, prayer, summary) now exists; the session abstraction from Step 8 means this step is composition plus seed data, not new feature code.
- **Touches:** Seed script, demo circle data, anonymous session flows, Escalation pipeline, upgrade prompt UI, OAuth handoff.
- **How to test it:** Full dress rehearsal in an incognito window on **production**: one tap in → optional language pick → pre-reading prompts → live passage → finish reading → starters → open demo circle → read digest and reflections → submit a reflection (appears as "Reader #n") → generate a prayer → tap upgrade and complete YouVersion sign-in. Separately, submit a crisis-phrased reflection anonymously: the support card appears, nothing surfaces in the thread. Every AI response along the way is live (verify `agent_logs` timestamps).
- **Definition of done:** A brand-new visitor completes the entire read-reflect-discuss loop in the demo circle with zero sign-up, all AI calls live, and can upgrade to a full account at any point.

### Step 31 — Demo freshness and anonymous data pruning
- **What gets built:** The daily demo-refresh cron job (rail from Step 23): re-dates seeded demo content to appear current, regenerates the demo digest/summary/starters via real Gloo calls so wording varies day to day, and prunes anonymous-session reflections older than the previous refresh. The demo circle therefore always looks alive *today*, and no anonymous data outlives its session in spirit or letter.
- **Why this step comes here:** Extends Step 30's seed into an ongoing guarantee; uses the Step 23 rail.
- **Touches:** Demo refresh cron route, demo data, Gloo Completions V2, pruning logic.
- **How to test it:** Trigger the refresh from the Agent Console: demo timestamps update to today and the digest text changes (new Gloo generation). Submit an anonymous reflection, trigger the refresh again: the anonymous reflection is gone, seeded content remains. Verify the production cron is registered in the Vercel dashboard and its runs are idempotent within a day.
- **Definition of done:** The demo circle always displays current-dated, freshly generated content, and anonymous reflections are pruned daily.

## Phase 8 — Tier 2 Implementations (into the existing stubs)

### Step 32 — RAG corpus: Psalms commentary upload
- **What gets built:** A processing script that takes the provided Psalms commentary PDF, chunks it **by Psalm**, and uploads the chunks to a Gloo Grounded Completions dataset with per-chunk metadata (Psalm number, source, licence). The Gloo client's Grounded Completions method (placeholder since Step 4) is completed. A dev-only route queries the dataset for a given Psalm and returns retrieved chunks.
- **Why this step comes here:** The Context Agent (33) is only as good as its corpus; retrieval must be proven independently before it feeds the Facilitator. Depends on Step 4.
- **Touches:** Processing script, Gloo Grounded Completions dataset, Gloo client, dev route.
- **How to test it:** Run the script against the PDF; confirm upload success in Gloo AI Studio. `curl` the dev retrieval route for "Psalm 23": returned chunks are demonstrably about Psalm 23 (shepherd imagery, historical notes), not adjacent Psalms.
- **Definition of done:** The chunked commentary corpus is live in Gloo and returns relevant, correctly-scoped chunks for a queried Psalm.

### Step 33 — Context Agent (implementing the Step 5 stub)
- **What gets built:** The Context stub becomes real: when the Facilitator sweep processes a circle whose current passage is a Psalm, the Context Agent first retrieves relevant commentary chunks via Grounded Completions, **restates archaic commentary language in plain modern language** (a Gloo pass), and hands the result to the Facilitator as additional grounding. The digest card gains a source attribution line when RAG was used (e.g. "Historical context from [source], public domain"). Non-Psalms passages skip Context entirely — the stub's no-op path remains for them. No interface changes to the Facilitator beyond consuming the optional grounding — proving the stub architecture worked.
- **UI:** The source attribution renders as a subtle footer line inside the digest card (small text, muted colour) — present when RAG was used, absent otherwise, never competing with the digest content.
- **Why this step comes here:** Slots between corpus (32) and the long-established Facilitator (24). Explicitly the brief's "before Facilitator, Psalms only" trigger.
- **Touches:** Context agent, Gloo Grounded Completions, Facilitator input, digest UI (attribution line).
- **How to test it:** Run the Facilitator sweep for a circle on a Psalms plan day: the digest includes commentary-informed context in modern language and shows the source attribution line; `agent_logs` shows Context running before Facilitator. Run it for a circle reading Mark: no Context retrieval occurs and no attribution line appears.
- **Definition of done:** Psalms digests are RAG-grounded with visible source attribution and modernised commentary language, while non-Psalms digests are untouched.

### Step 34 — Health Agent (implementing the Step 5 stub)
- **What gets built:** The Health stub becomes real on its 12-hourly sweep: per circle, engagement signals (days since last reflection, response rate, silent members) are gathered and Gloo classifies the circle healthy / at-risk / stalled and selects one action — nudge quiet members (via the Step 29 notification path), offer a returning member a catch-up bridge summary, or propose a merge with a compatible stalled circle. **Every decision is logged with full reasoning** in a decision log. Merges require the transparency flow: every affected user receives a human-readable notification explaining what happened and why — no silent changes. Circle state transitions (active→stalled, stalled→archived) are driven from here.
- **UI:** Nudges and merge explanations arrive through Step 29's notification UI; the merge notification renders as a readable explanation card (what happened, why, what changes for you). Stalled/archived states surface via the existing state badge in circle browse and thread headers, with a gentle in-thread banner for stalled circles ("It's been quiet here…").
- **Why this step comes here:** Needs mature engagement data (reflections, threads, notifications) and the cron rail; it composes them rather than adding new primitives.
- **Touches:** Health agent, Gloo Completions V2, cron route, decision log table, notifications, circle states.
- **How to test it:** In dev, back-date one circle's activity to simulate 5 quiet days. Trigger the Health sweep: the circle is classified at-risk/stalled, the decision log shows the classification with written reasoning, and quiet members receive a nudge notification. Simulate two compatible stalled circles and trigger a merge proposal: every member of both circles receives a plain-language explanation notification, and the log records the full rationale. Re-trigger the sweep: no duplicate actions within the period.
- **Definition of done:** The Health Agent autonomously classifies and acts on circle health with every decision logged with reasoning and every affected user explicitly notified.

### Step 35 — Flashcard Agent (implementing the Step 5 stub)
- **What gets built:** The Flashcard stub becomes real: after completing a reading, a "Generate flashcards" action has Gloo produce a 3–5 card deck from the passage — front (key verse or concept), back (short explanation or question) — each card linked to the passage reference. Users mark cards "know it" / "review again"; marks persist for signed-in users and last the session for Instant Access. A simple deck review UI cycles the cards.
- **UI:** A polished card-flip deck: full-width flip card with front/back faces styled from the design tokens, tap to flip, "card x of y" progress indicator, paired "Know it" / "Review again" actions with a clear pressed state, an end-of-deck completion screen, and a generating skeleton state — this is a showcase interaction, not a plain list.
- **Why this step comes here:** Self-contained, depends only on completion (14) and the agent framework (5); last because nothing else depends on it.
- **Touches:** Flashcard agent, Gloo Completions V2, deck UI, database (`flashcards`, review marks).
- **How to test it:** Complete a reading, tap "Generate flashcards": 3–5 cards appear, fronts drawn from the actual passage; flip a card, mark "review again," leave and return — the mark persisted and the deck links back to the correct reference. As an anonymous user, generate a deck: fully functional for the session.
- **Definition of done:** Users on both paths can generate, flip, and mark a passage-linked flashcard deck after reading.

## Phase 9 — Tier 3 Scoping and Final Audit

### Step 36 — Tier 3 future-directions writeup and constraint audit
- **What gets built:** Documentation, not features. The technical writeup names and scopes the Tier 3 directions: **Echoes** (Memory Agent scoring old highlights against current circle activity to resurface a relevant past highlight — the Memory stub from Step 5 remains its landing point), **Bridge Agent** (extended catch-up experiences beyond the Health Agent's bridge summary), **Retrospective** (end-of-plan circle journey recap), and **Verse of the Day** (home-screen touchpoint). Alongside it, a final constraint audit of the codebase: grep-verified absence of any direct OpenAI/Anthropic/other-provider calls (judges will check); no hardcoded Bible text anywhere; no code path feeding Bible text into the Translation agent; Escalation ordering intact in the reflection pipeline; Tier 2/3 stubs and implementations consistent with the Step 5 interfaces; no UI surface exposing inter-member pace or streaks. The audit also includes a UI consistency sweep: every screen composes from the Step 8A library and tokens (no one-off colours/type/spacing introduced by later steps), and every screen has designed loading, empty, and error states per the post-8A UI standard.
- **Why this step comes here:** The competition requires Tier 3 as named future directions in the writeup, and the audit belongs after all code is in.
- **Touches:** Technical writeup document, codebase-wide audit.
- **How to test it:** Run the audit checklist: dependency and source grep for other AI providers returns nothing; grep for embedded Scripture strings returns nothing; a traced reflection submission shows Escalation first in the pipeline; the Memory stub still returns its structured no-op. The writeup names all Tier 3 features with scope notes.
- **Definition of done:** The writeup documents Tier 3 directions and the audit confirms every design constraint holds in the shipped codebase.

---

## Verification (end-to-end, after Step 36)

Two dress rehearsals on **production**:
1. **Path A:** YouVersion OAuth sign-in with highlight consent → onboarding (Spanish/NVI, goals) → AI-generated plan (validated refs) → AI match into a circle → pre-reading prompts → live NVI passage + highlight → finish → starters in thread → reflection (Escalation-gated) → next-day digest + summary via cron → prayer → cross-language thread with a second English-preference account (translations cached, originals toggleable) → fall 2 days behind → reminder email arrives (Resend, plain text).
2. **Path B:** Incognito, one tap → defaults → full read-reflect loop in the demo circle as "Reader #n" → flashcards → upgrade to Path A mid-session.

Plus the idempotency drill: trigger every cron route twice back-to-back from the Agent Console and confirm zero duplicate digests, summaries, reminders, icebreakers, or Health actions.
