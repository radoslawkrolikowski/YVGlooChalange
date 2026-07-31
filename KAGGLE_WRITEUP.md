# Round — AI-facilitated Scripture reading circles

**Scripture as conversation, not broadcast.**

| Link | |
|---|---|
| **Video** | https://www.youtube.com/watch?v=YzcBW4xfzeM |
| **Live app** | https://yv-gloo-chalange.vercel.app — tap **Instant Access**, no account |
| **Code** | https://github.com/radoslawkrolikowski/YVGlooChalange |
| **Notebook** | https://www.kaggle.com/code/radoslawkrolikowski/round-live-verification-of-the-youversion-gloo |

## The idea

Round is not a Bible reader — YouVersion built the best one. Round is what
surrounds it: three to five people on the same plan, facilitated by AI agents.

Group studies fail two boring ways. **Cold start:** a blank thread says "say hi",
nobody does. **Silence:** someone posts, nobody answers, they stop. Both are
facilitation problems — remembering what each person said, connecting it to
someone else's.

## What it does — fourteen agents, one registry

**Joining.** *PlanBuilder* drafts a plan from your goals; *Matching* compares
your profile against open circles and explains the fit.

**Reading.** *PreReading* gives you personal prompts before the text loads. You
read in your own language and version, highlight, finish. *PostReading* turns
that into circle-facing starters. *Companion* answers questions from commentary.

**The circle.** *Icebreaker* opens a new circle by quoting what two members
wrote. *Facilitator* posts a daily digest: a synthesis, an overlap callout
naming who landed on the same theme, one grounded question.
*Translation* carries every message into each reader's language additively.
*CircleBot* is a seeded AI *member*, so an anonymous visitor who posts is
answered.

**Prayer, two distinct things.** A private prayer generated from your own
material — onboarding answers, reflections, highlights, today's reading. And
prayer requests: private by default, shared to the circle only by explicit
action, answered with one silent tap. Counts, never names.

**Escalation runs first** on every reflection and prayer request, before a row
exists, failing safe. Flagged content never reaches the circle, crisis lines
hardcoded.

## YouVersion Platform API

The only source of Scripture: Passages, Bible Versions, index, Highlights
(opt-in), Sign in with YouVersion, copyright attribution.

**Gloo never produces or translates Scripture.** Language rides the version ID,
so a Spanish reader gets Spanish text directly. Passages are also the *truth
oracle over the model*: every AI-generated plan day is validated against the live
API before saving.

## Gloo AI Studio API

The only model gateway — Completions V2, Data Engine Search, Grounded
Completions, streaming. One module logs every call to `agent_logs` *before*
returning, so "all outputs logged" holds by construction. The notebook runs
these calls live.

Three findings. **Refusals have two shapes** — a pre-routing guardrail, and one
written *by* the routed model that reads as a real answer, found on a prayer
quoting Colossians 3:5: scriptural vice language reads as toxicity. **Reasoning models spend `max_tokens` thinking**, so completions carry
`truncated`. **Search beats one-call RAG** — metadata filters are silently
ignored, so the corpus is one file per Psalm and retrieval scopes by identity,
not similarity: ~74% of a Psalm's commentary recovered against ~7%.

Next.js 16 · Neon Postgres · Vercel Cron.
