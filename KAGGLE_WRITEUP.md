# Round — AI-facilitated Scripture reading circles

**Reading the Bible alone is easy to start and easy to abandon. Round is the
facilitation layer that keeps a small group reading together — the same
relationship Strava has to running.**

| | |
|---|---|
| **Live project** | https://yv-gloo-chalange.vercel.app — no account needed, tap **Instant Access** |
| **Code** | https://github.com/radoslawkrolikowski/YVGlooChalange |
| **Video** | _<!-- TODO: public YouTube link -->_ |

Round is not a Bible reader. YouVersion already built the best one. Round is
what surrounds the reading: a circle of three to five people on the same plan,
facilitated by a team of specialised AI agents that open the conversation,
synthesise what the group noticed, translate across languages, keep a quiet
thread alive, and quietly get help to someone who needs it.

---

## The problem

Group Bible studies fail in two specific, boring ways.

**Cold start.** A new group opens on a blank thread and the prompt "say hi."
Nobody does. The group dies before it reads anything.

**Silence.** Someone posts a reflection. Nobody answers for two days. They stop
posting. Then everyone does.

Both are facilitation problems, not content problems. A good human facilitator
fixes them by remembering what each person said and connecting it to what
someone else said. That is exactly the shape of work a language model is good
at — and exactly the work that needs values-aligned, pastorally careful
generation rather than a general-purpose chatbot.

---

## Try it in 60 seconds

Instant Access is a full product experience, not a screenshot tour. Every AI
call is live. Every passage is fetched live. No account, no form.

1. Open the link and tap **Instant Access**.
2. Pick a language and version — try **Spanish / RVES**. The passage arrives in
   Spanish *from YouVersion*, not translated into it.
3. Open the reading. **Pre-reading prompts** are generated for you first.
4. Read, highlight a phrase, finish. **Conversation starters** are generated
   from the passage and what you highlighted.
5. Post a reflection in the public demo circle. The **Escalation Agent** screens
   it before anything else touches it. A seeded AI circle member replies.
6. Open the **Prayer** tab and generate a prayer grounded in your own reading.

Sign in with YouVersion instead for persistence, highlight import, AI circle
matching, custom generated plans, and reminders.

---

## How the two APIs are used

Two hard architectural rules govern the codebase. Both are verifiable in one
command.

### Gloo is the only model gateway

Every model call goes through one module, `src/lib/gloo.ts`. It handles OAuth2
client-credentials token exchange, retry, guardrail and refusal detection, and
writes an `agent_logs` row for every call — success or failure — *before*
returning. An agent cannot produce output without producing a log row. The
brief's "all agent outputs are logged" rule holds by construction, not by
discipline.

```
$ grep -rniE "\b(openai|anthropic|@ai-sdk|mistral|cohere)\b" src package.json
src/lib/gloo.ts:13:// - Completions V2 is OpenAI-shaped (messages/choices/usage) plus Gloo-only
src/lib/gloo.ts:15://   the response. Plain fetch is used rather than the OpenAI SDK so those
src/lib/gloo.ts:134:   * Specific Gloo model, e.g. "gloo-openai-gpt-4o". When omitted the client
```

Three hits, all comments inside the Gloo client. No provider SDK is installed.
Plain `fetch` is used rather than the OpenAI SDK precisely so Gloo-only fields
(`auto_routing`, `model_family`, `tradition`, routing metadata) stay first-class
and no other provider's package enters the repository.

Gloo surfaces used: **Completions V2** (every agent), **Data Engine Search**
(corpus retrieval), **Grounded Completions**, and **streaming completions** for
the prayer path.

### YouVersion is the only source of Bible text

All Scripture goes through `src/lib/youversion.ts`. No translation is embedded,
hardcoded, or cached as text anywhere in the repository. Passage text is
routinely *given* to Gloo as grounding — that is what makes a pre-reading prompt
or a lesson summary about the actual text rather than about the reference — but
two things never happen:

- **Gloo never produces Scripture.** Every verse a user reads was fetched from
  YouVersion for the version they chose. No model output is ever displayed as
  Bible text.
- **Gloo never translates Scripture.** Language is carried by the YouVersion
  *version ID*, which encodes both language and translation, so a Spanish reader
  gets a Spanish translation directly. Any code path that fetched a passage in
  one language and translated it into another would be wrong, and none exists.

Used: Passages (every view), Passages again for *validation* (every AI-generated
plan day is checked against the real API before it is saved, failures
regenerated), Bible Versions (language-driven picker), Bible index, User
Highlights (opt-in import), Sign In with YouVersion (OAuth 2.0 PKCE), deep links
("Open in Bible App" on every passage), and version copyright attribution
rendered wherever text appears.

The Translation Agent enforces the second rule from the other side: it only ever
receives user-generated circle content, never passage text, and its prompt
instructs it to leave Scripture references as written rather than re-translating
or re-versing them.

---

## The agents

Sixteen agents in one registry, one shape, each with its own trigger, system
prompt, and output contract.

| Agent | Trigger | Responsibility |
|---|---|---|
| PlanBuilder | Onboarding | Day-by-day plan from stated goals; every reference validated against YouVersion before saving |
| PreReading | Opening a passage | 2–3 personal prompts from the passage, goals, and imported highlights |
| PostReading | Finishing a reading | 2–3 circle-facing starters grounded in the passage and that reader's highlights |
| Matching | "Match me" | Compares onboarding profile against open circles; returns best fit with an explanation shown before joining |
| Icebreaker | Circle reaches minimum size | One opening message referencing what two members actually wrote |
| Facilitator | Daily, per circle | Digest: collective synthesis, overlap callout naming who landed on the same theme, one grounded question |
| Summary | With the digest | Plain-language summary of the passage's main teaching |
| Companion | Stalled circles | One short warm turn picking up something a member said |
| Prayer | On request | Daily, custom, or circle-grounded prayer; private by default |
| Reminder | Daily, per user | Nudge when 2+ days behind, or a summary of unread messages |
| **Escalation** | **Every reflection, first** | Crisis-signal detection; private support card to that user only |
| Translation | Every new user message | Per-reader-language translation, cached, original never overwritten |
| Context | Before Facilitator, Psalms | Retrieves commentary from the RAG corpus as extra grounding |
| CircleBot | Demo circle | A seeded AI *member* — so an anonymous visitor who posts is answered |

Health, Flashcard (Tier 2) and Memory (Tier 3) ship as **stubs** implementing
the full agent interface. That was a design constraint from day one, not a
retrofit — adding their bodies requires no structural change. We are not
claiming them as delivered.

**Nothing double-fires.** Scheduled agents claim an idempotency slot in
`agent_runs` keyed by (agent, target, period), so re-running a sweep on the same
input is a no-op. Running a cadence via the combined dispatcher *and*
individually cannot produce duplicate output.

---

## Engineering that took real work

Three problems that only appear against the live API.

### 1. Two different shapes of refusal

Gloo can decline in two ways, and they need different handling. **Shape one** is
the pre-routing guardrail: a `200` in normal completion shape carrying a canned
refusal, with `model` empty and every Gloo-only field absent — the tell that no
model was routed to. **Shape two** is a refusal written *by* a routed model,
which arrives with full routing metadata and looks like a real answer.

The second is genuinely hard, because the fix must not misfire. The detector is
a deliberately narrow marker list applied only to the first 400 characters —
weak markers like "I can't help with that" are **excluded on purpose**, because
a circle member could write that sentence and the Translation Agent would then
refuse to carry their words. A 1,200-character prayer containing a matching
phrase deep in its body is not a refusal.

### 2. Reasoning models spend your token budget thinking

A Psalm 1 lesson summary came back as `"Psalm 1 vividly contrasts two ways of
life, inviting us"` — a fragment stored as if it were a summary. The Summary
agent was not at fault. Gloo's auto-routing serves the same call from a
reasoning model or a plain one, and a reasoning model spends its thinking tokens
out of the caller's `max_tokens`. At a 320-token budget, thinking consumed
nearly all of it. The answer was neither empty nor malformed, so every
agent-level guard passed it through.

The fix: completions now carry `truncated` (`finish_reason === "length"`), the
client re-asks once at 3× budget when set, and Summary and Facilitator treat a
still-truncated answer as a failed attempt — a cut-off summary must never reach
the digest card and cut-off JSON must not be parsed. Raising a budget costs
nothing on its own since billing is on tokens produced, so the retry only fires
on a call that was already unusable. Translation's language detection was the
sharpest case: an 8-token budget left a reasoning model no room to answer at
all, silently demoting *every* detection to the fallback language.

### 3. Retrieval scoping without metadata filters

The Psalms commentary corpus is ingested into Gloo's Data Engine. Gloo's chunker
cannot be disabled or tuned — it cuts on paragraph boundaries and attributes
every chunk to its **parent item**. A single monolithic upload would return
every citation titled "Treasury of David" with nothing distinguishing Psalm 22
from Psalm 23, and that item title is the only scope signal available.

So the corpus is split into **one Markdown file per Psalm** (149 files — the
abridged source carries no Psalm 119 section), each opening with its canonical
reference as a heading so the reference lives in the retrievable chunk text
itself, not only in metadata.

Retrieval then uses **Search + Completions V2 rather than one-call Grounded
Completions**, deliberately: Search returns chunk-level hits carrying the parent
item's identity, which lets the Context Agent scope retrieval to exactly one
corpus file instead of hoping semantic similarity stays on the right Psalm.
Grounded Completions offers no metadata filtering. Retrieved commentary — often
archaic — is restated in plain modern language before it reaches the
Facilitator, and the digest card renders a source attribution line whenever
retrieval was used.

---

## Safety and product constraints

- **The Escalation Agent runs first on every reflection**, before any other
  processing, enforced in one module that *fails safe* when no verdict can be
  produced. Crisis resources are hardcoded (988 in the US, Samaritans 116 123 in
  the UK). Flagged content never reaches the circle; only the reflection
  reference is logged for audit. The agent never counsels.
- **No pace or streak comparison between members.** No leaderboard, no visible
  progress bars, no days-read counts. Visible comparison creates stress, not
  motivation.
- **Original messages are never modified.** Translations are additive rows keyed
  by (message, target language) and cached, so nothing is re-translated twice.
  AI-authored messages are *generated* per language rather than translated after
  the fact.
- **Highlight import is opt-in**, behind a dedicated consent screen.
- **Anonymous sessions persist nothing beyond the session** and are pruned on a
  daily sweep.

---

## Stack and delivery

Next.js 16 (App Router) · React 19 · Tailwind 4 · Vercel · Neon Postgres ·
Drizzle ORM (31 committed migrations, applied automatically in the production
build) · NextAuth v5 with the YouVersion OAuth provider · Vercel Cron.

Built as ~35 sequential, reviewed steps across ~150 commits, each one a feature
branch and pull request with the reasoning recorded in the commit body. The full
requirements document and the stepwise implementation plan — including the
architectural decisions and why alternatives were rejected — are committed in
the repository.

**Known limitation, stated plainly:** a YouVersion app key can only fetch
translations licensed to it. On this deployment that is BSB (English), RVES
(Spanish), and BLT (Portuguese). Unlicensed versions appear in the picker
disabled rather than hidden, and the resolver always falls back to a version
that will actually fetch — so a reader always gets Scripture in their own
language, and granting a licence later is a one-flag change.

## What comes next

Health and Flashcard agents have their interfaces and stubs in place. The Memory
Agent — "Echoes", surfacing a highlight you made two years ago when it becomes
relevant to what your circle is reading today — is the Tier 3 direction the
architecture was built to accommodate.
