# Round — Project Requirements and Description

*AI-facilitated Scripture reading circles*
*Competition: Scripture in New Frontiers — Gloo AI + YouVersion on Kaggle, July 6–31, 2026*

---

## 1. What Round Is

Round is a mobile-first web app that puts small groups of people through the same Bible reading plan together, facilitated by a team of specialised AI agents. It is not a Bible reader. It is the social and facilitation layer that sits on top of reading — the same relationship Strava has to running.

The two APIs at the core are **YouVersion Platform API** (Bible text in any language and version, user highlights via OAuth) and **Gloo AI Studio API** (all agent reasoning, values-aligned completions, RAG-grounded commentary). Use each API where it genuinely adds value. Not every feature requires both — what matters is that no feature using one of these APIs could have been built just as well without it.

---

## 2. Core User Flow

Round has two distinct entry paths. Both must be functional for the demo.

### Path A — Sign In with YouVersion (full experience)

```
Sign in with YouVersion OAuth
→ App requests permission to import highlights → stored for personalisation
→ Onboarding: what do you want to learn? why do you want to read the Bible?
→ Select preferred language + Bible version (e.g. Spanish / NVI)
→ Create a custom AI-generated reading plan OR pick a pre-defined plan
→ Create a new study group OR browse and join an existing one
  OR get AI-matched to a group based on onboarding profile
→ Pre-reading: AI generates prompts to think about before reading
→ Read passage — fetched from YouVersion in the user's chosen language and version
→ Post-reading: AI generates circle conversation starters
  informed by highlights from this session and onboarding context
→ Circle thread: reflections, digest, discussion question, prayer, summary
  Members write in any language — Gloo translates each message into
  each reader's preferred language automatically
→ Email reminders if reading falls behind; message notifications if email provided
→ Echoes available (requires highlight import permission)
```

### Path B — Instant Access (no sign-up)

```
One-tap entry — no form, no account required
→ Brief optional prompt: pick a language, Bible version, and reading plan
  or proceed immediately with sensible defaults
→ All AI features fully available — Gloo and YouVersion calls are live, not mocked:
   - Pre-reading prompts before opening the passage
   - Passage displayed via YouVersion in the chosen language and version
   - Post-reading AI conversation starters
   - Prayer generation
   - Lesson summary
   - Flashcards (if implemented)
   - RAG-grounded digest (if implemented)
→ Join the pre-seeded demo circle:
   - Read the existing digest and prior reflections
   - Submit a reflection — Escalation Agent runs as normal
   - Circle messages appear with an auto-assigned anonymous name ("Reader #[n]")
→ No account means no data persisted between sessions
→ No email reminders, no Echoes, no circle matching
→ Upgrade prompt available at any point: "Save your progress — sign in with YouVersion"
```

**Key principle:** Instant Access is a fully functional product experience, not a tour of static screenshots. Every AI call is real. Every passage is fetched live. The only things missing are persistence and highlight history.

---

## 3. External API Integrations

### 3.1 YouVersion Platform API

| Capability | Used For | Priority |
|---|---|---|
| Passages API | Fetch Bible text using a specific version ID — always in the user's chosen language and translation, never in English first | Tier 1 |
| Bible Versions API | Fetch available Bible versions by language to populate the version picker | Tier 1 |
| Sign-In with YouVersion (OAuth 2.0) | Authenticate user; gate highlight import behind explicit permission | Tier 1 |
| User Highlights API | Import existing highlights at sign-in for personalisation of AI prompts | Tier 1 |
| Deep Links | Every passage includes an "Open in Bible App" button | Tier 1 |
| Verse of the Day | Optional daily touchpoint on the home screen | Tier 3 |

**How YouVersion versions and languages work:**

YouVersion identifies each Bible translation by a numeric version ID. Every Passages API call must include a version ID — the version already encodes both language and translation (e.g. NIV English and NVI Spanish are different version IDs). The user's language selection determines which versions are available in the picker; their version choice is passed on every passage fetch. Bible text is always fetched in the user's chosen version directly from YouVersion. **Gloo never touches Bible text — it is never fetched in one language and then translated.**

**What does not exist in the YouVersion API — do not implement:**
- Reading Plans API — plans are app-managed or AI-generated
- User Bookmarks API
- User Notes API

---

### 3.2 Gloo AI Studio API

All AI reasoning runs through Gloo. Do not call OpenAI, Anthropic, or any other model provider directly.

| Gloo Capability | Used For |
|---|---|
| Completions V2 | Reading plan generation from onboarding answers |
| Completions V2 | Pre-reading prompts |
| Completions V2 | Post-reading conversation starters |
| Completions V2 | Reflection synthesis, overlap detection, digest and discussion question |
| Completions V2 | Lesson summary generation |
| Completions V2 | Prayer generation |
| Completions V2 | Personalised reminder messages |
| Completions V2 | Crisis signal detection in reflections (Escalation Agent) |
| Completions V2 | Real-time translation of circle messages into each user's language |
| Grounded Completions (RAG) | Commentary retrieval from the Psalms PDF corpus (Tier 2) |
| Completions V2 | Circle health scoring and merge/split decisions (Tier 2) |
| Completions V2 | Flashcard generation (Tier 2) |

---

## 4. Reading Plan Architecture

YouVersion does not expose a Reading Plans API. Plans are managed entirely within the app.

### Pre-Defined Plans
A starter library of plans is seeded at launch (e.g. Psalms in 30 days, the Gospel of Mark, the book of Ruth). Each plan is stored as a structured list of day-by-day passage references. Passages are always fetched live from YouVersion using the reference stored in the plan.

### AI-Generated Plans
During onboarding, if the user selects "create my own plan," Gloo generates a structured day-by-day plan from the user's stated goals, available time per day, and topics of interest. Every generated reference is validated against the YouVersion Passages API before being saved — if a reference fails, it is regenerated. AI-generated plans are stored in the same structure as pre-defined plans so all downstream features work identically.

---

## 5. Feature Requirements

### Tier 1 — Must Build

#### 5.1 Circle Formation
Users create a new study group, browse and join an existing open group, or get AI-matched to a group based on their onboarding profile (life season, reading plan topic, stated goals). Matching is done via Gloo: the user's onboarding answers are compared against open groups and Gloo returns the best match with a short explanation shown to the user. Circle size is minimum 3, maximum 5. Circles move through states: forming → active → stalled → archived.

#### 5.2 AI Cold-Start Icebreaker
When a new circle reaches minimum size, Gloo generates a personalised opening message that references something specific from two members' real onboarding answers. It is posted as a system message attributed to "Round," not to any member. There is no blank "say hi" prompt.

#### 5.3 Bible Version and Language Selection
Users select a preferred language and a Bible version during onboarding. The language setting determines which versions are available in the picker (populated from the YouVersion Bible Versions API). The selected version ID is passed on every passage fetch. Both settings can be changed at any time. A curated short-list of popular versions per language is available as defaults before the API call returns:
- English: NIV, KJV, ESV, NLT, MSG
- Spanish: NVI, RVR1960, LBLA
- Portuguese: NVI-PT, ARC

#### 5.4 YouVersion Passage Display
Every passage is fetched live from YouVersion using the user's chosen version ID. The version abbreviation is shown persistently next to the passage reference. Users can switch version in one tap. If a passage is unavailable in the chosen version, the app falls back to the most common version in the same language and shows a notice. Highlights made during reading are stored with the version they were made in. An "Open in Bible App" deep-link button is present on every passage view. Bible text must never come from any source other than YouVersion and must never be translated by Gloo or any other service.

#### 5.5 AI Pre-Reading Prompts
Before a user begins reading, Gloo generates 2–3 short prompts — things to notice, questions to hold while reading, a word or phrase to pay attention to — informed by the passage text, the user's onboarding goals, and any relevant highlights from their history. These are personal and not shared with the circle. They are displayed above the passage, collapsible, and non-intrusive.

#### 5.6 AI Post-Reading Conversation Starters
When a user finishes reading, Gloo generates 2–3 discussion questions grounded in the specific passage and what this user noticed (session highlights, pre-reading prompts shown). These are posted to the circle thread as a suggested starting point, attributed to "Round." Circle members can respond to them directly.

#### 5.7 Facilitator Agent — Daily Digest
Once per day per circle, after a minimum share of members have submitted reflections, the Facilitator Agent synthesises the day's reflections into a short digest containing: a 2–3 sentence synthesis of what the circle noticed collectively, an overlap callout naming which members landed on the same theme or line, and one discussion question grounded in the actual passage and the circle's own words. The digest is displayed in the circle thread.

#### 5.8 Lesson Summary
Alongside the daily digest, Gloo generates a 3–5 sentence plain-language summary of the passage's main teaching, informed by the passage text and the themes the circle raised. It is displayed as a collapsible card — available to read, not forced.

#### 5.9 Prayer Generation
On demand, when a user taps "Generate a prayer," Gloo generates a short prayer (5–8 sentences) in first-person plural, grounded in what the circle discussed that day. It is attributed to "Round — based on today's reading." Users can copy or save it; it is not automatically broadcast to the circle.

#### 5.10 AI Reminders
Two reminder types, both generated by Gloo:
- **Reading reminder:** if a user is 2+ days behind on their plan, a personalised nudge referencing the missed passage and what their circle has been discussing
- **Message notification:** if a user has unread circle messages older than 24 hours, a short summary of what they missed

Delivery is via in-app notification always, and email if the user provided an address. Emails are plain text with no tracking pixels — pastoral messages, not marketing.

#### 5.11 Escalation Agent
On every reflection submission, Gloo checks the text for crisis signals: suicidal ideation, self-harm, acute crisis language, complete hopelessness. If flagged, a quiet, non-alarming in-app card is shown to that user only, offering to connect them with a trusted person or crisis resource. A hardcoded list of crisis resources is provided (988 in the US, Samaritans 116 123 in the UK) as a minimum. The flagged content is never shared with the circle. The escalation is never surfaced to other members. Only the reflection reference (not its content) is logged for audit.

#### 5.12 Multilingual Circle Communication
Circle members can write in any language. Every message is automatically translated by Gloo into each reading member's preferred language. The original is always preserved and never modified.

- Language preference is set during onboarding and drives both the YouVersion version selection and the translation target for incoming messages
- Translation is triggered on any new user-generated message posted to the circle thread
- If a member's language matches the message's source language, no translation is made
- Translations are cached — the same message is never re-translated for the same target language
- Each message displays in the reader's language by default, with a "Show original" toggle and a "Translated by Round" label
- AI-generated messages (digest, summary, prayer, icebreaker) are generated directly in each user's language — they are not translated after the fact
- Gloo's faith-context language models handle theological terms, pastoral tone, and scriptural references with appropriate care — this is the specific reason Gloo is used for translation rather than a generic translation service
- **Scripture is never an input to the Translation Agent.** YouVersion delivers Bible text natively in the user's chosen version. Gloo translation applies only to user-generated content.

---

### Tier 2 — Build If Possible

All Tier 2 features should be designed so they plug into the existing agent infrastructure without requiring structural changes. Define their interfaces and responsibilities during Tier 1 development even if implementation comes later.

#### 5.13 Context Agent — Gloo RAG
The developer will provide a Psalms commentary corpus as a PDF file. This corpus is processed, chunked by Psalm, and uploaded to Gloo's Grounded Completions dataset. Before the Facilitator Agent generates its daily digest for a Psalms passage, the Context Agent retrieves relevant commentary chunks — historical context, word notes, theological observations — and passes them to the Facilitator as additional grounding. The digest UI shows a source attribution line when RAG retrieval was used (e.g. "Historical context from [source], public domain"). Commentary language may be archaic and must be restated in plain modern language before being passed to the Facilitator.

#### 5.14 Health Agent — Autonomous Circle Management
The Health Agent monitors engagement across all circles and acts autonomously — without being prompted — when a circle is at risk. Based on engagement signals (days since last reflection, response rate, members who have gone silent), it classifies each circle as healthy, at-risk, or stalled and chooses one of: sending a nudge to quiet members, offering a catch-up bridge summary to a returning member, or proposing a merge with a compatible stalled circle. Every decision is logged with full reasoning. Users affected by a merge receive a human-readable notification — no silent changes.

#### 5.15 Flashcards
On demand after completing a reading, a user can generate a deck of 3–5 flashcards from the passage. Each card has a front (a key verse or concept) and a back (a short explanation or question), and is linked to the passage reference. Users can mark each card as "know it" or "review again."


---

## 6. Agent Responsibilities

Each agent is a distinct component with its own trigger and responsibility. They share one Gloo API client but have separate system prompts and outputs. All agent outputs are logged with the agent name, timestamp, and model used.

| Agent | When It Runs | Responsibility |
|---|---|---|
| PlanBuilder | Onboarding, on request | Generates a day-by-day reading plan from the user's goals; validates every reference against YouVersion before saving |
| PreReading | User opens a passage | Generates 2–3 personal reading prompts informed by the passage and the user's history |
| PostReading | User finishes reading | Generates 2–3 circle-facing discussion starters grounded in the passage and session highlights |
| Facilitator | Daily, per circle | Synthesises reflections into a digest with overlap callout and discussion question |
| Summary | Alongside Facilitator | Generates a plain-language lesson summary from the passage and reflection themes |
| Prayer | On user request | Generates a short first-person-plural prayer grounded in the day's discussion |
| Reminder | On a schedule, per user | Generates personalised reading reminders and message summaries for delivery via in-app notification and email |
| Escalation | Every reflection, immediately | Detects crisis signals; shows a private support card to the affected user only; never counsels directly; logs reference only |
| Translation | Every new user message | Translates into each unique target language needed; caches results; never translates Bible text |
| Context *(Tier 2)* | Before Facilitator, Psalms only | Retrieves commentary from the RAG corpus and passes it to the Facilitator as grounding |
| Health *(Tier 2)* | On a schedule, per circle | Autonomously classifies circle health and acts: nudge, bridge, or merge |
| Flashcard *(Tier 2)* | On user request | Generates a flashcard deck from the passage |
| Memory *(Tier 3)* | Periodically, per user | Scores old highlights for relevance to current circle activity; surfaces an Echo to the user |

**Shared rules for all agents:**
- Gloo is the only model gateway — no direct calls to any other provider
- No agent communicates with the user directly — all output is mediated through the UI layer
- The Escalation Agent always runs first on any reflection, before any other agent processes it
- Tier 2 agent modules must be created as stubs during Tier 1 development so adding their implementation later requires no structural changes

---

## 7. Recommended Tech Stack

These are starting-point recommendations. The implementation approach is left to the planning agent.

| Layer | Recommendation |
|---|---|
| Framework | Next.js — SSR, API routes, and deployment in one framework |
| Database | Vercel Postgres (production) / PostgreSQL in Docker (local development) |
| Auth | NextAuth.js with YouVersion OAuth provider |
| Email | Resend or equivalent transactional email service |
| Hosting | Vercel |

**Local vs production:** The local development database should match the production engine (PostgreSQL) so schema and query behaviour are identical across environments. Instant Access users have no database row — their session state lives in browser session storage only.

---

## 8. Design Constraints

1. **No pace or streak comparison between members.** Never show a leaderboard, per-member progress bar visible to others, or days-read count next to names. Visible comparison creates stress, not motivation.

2. **The Escalation Agent is non-negotiable.** It must run on every reflection before any other processing. The product should not demo without it working. Provide a hardcoded crisis resource list covering at minimum the US and UK.

3. **Gloo is the only LLM gateway.** No direct calls to OpenAI, Anthropic, or any other provider. Judges will check the codebase.

4. **YouVersion is the only source of Bible text.** Never embed or hardcode any Bible translation. Always fetch via the YouVersion Passages API using the user's version ID.

5. **Bible text is never translated by Gloo.** The version ID is the mechanism for delivering Scripture in the right language. Any code path that fetches a passage in one language and translates it into another is wrong.

6. **Original message content is never modified.** Translations are always additive and stored separately. The author's original words in their original language are never overwritten.

7. **Instant Access is a real product experience.** Every AI call must be live. Every passage must be fetched live. Pre-seed the demo circle with enough realistic content that it feels active immediately.

8. **Highlight import is opt-in and clearly explained.** The OAuth permission screen must explain what is being imported and why. Highlights are never shared to the circle without explicit per-item user action.

9. **Health Agent decisions are transparent.** Every autonomous decision is logged with full reasoning. Users affected by a circle merge receive a human-readable explanation — never a silent change.

10. **Tier 2 agent stubs are created during Tier 1.** Empty modules with the correct interfaces for Context, Health, Flashcard, and Memory agents must exist from the start so their implementation can be added without structural refactoring.

---

## 9. Open Questions

- **Agent scheduling:** Several agents need to run on a defined schedule (Facilitator, Reminder, Health, Memory). The mechanism (queues, webhooks, polling, background jobs, or other) is not prescribed here — the planning agent should evaluate options and define the approach, including idempotency so re-running an agent on the same input never produces duplicate outputs.

- **Circle matching fallback:** If no open circle matches a new user's life season and plan, should the app (a) queue the user and notify when a match forms, (b) create a new circle immediately and let it fill over time, or (c) offer the closest available match with an explanation? Choose one and enforce consistently.

- **Real-time vs polling:** Should the circle thread update in real time or on refresh/polling? Real-time is better UX; polling is simpler to build.

- **Reading plan reference validation:** When Gloo generates a plan, each reference must be validated against YouVersion before saving. Define the retry strategy and what happens if a reference cannot be resolved after retries.

- **YouVersion version ID catalogue:** Version IDs should be fetched from the Bible Versions API and cached rather than hardcoded beyond the short curated defaults. Define the fallback version per language when the user has not yet made a selection, and how to handle a version ID that becomes unavailable.

- **Language detection:** Source language detection on incoming messages can be done via a Gloo call (accurate, uses the same gateway) or a lightweight local library (fast, less accurate on short text). Define the approach and the fallback when confidence is low.

- **Translation call timing:** Should translations appear synchronously before the message is shown to the reader (no flicker, slight delay) or asynchronously after posting (message appears immediately in the original, then swaps)? Define the approach and the loading state.

- **Escalation resource coverage:** The hardcoded crisis resource list must cover at minimum the US and UK for the demo. Define where this list is maintained and how it is updated.

- **Instant Access demo circle freshness:** The pre-seeded demo circle must feel active and current. Decide whether demo data is static (seeded once) or refreshed periodically so digests and reflections always appear recent.

---

*End of requirements document.*
*Competition window: July 6–31, 2026.*
*Tier 1 and Tier 2 features must be complete and demonstrable. Tier 3 features should be described in the technical writeup as named future directions.*
