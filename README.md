# Round

AI-facilitated Scripture reading circles, built on the YouVersion Platform API
and the Gloo AI Studio API.

- Requirements: [round-implementation-brief.md](round-implementation-brief.md)
- Implementation plan: [round-implementation-plan.md](round-implementation-plan.md)

## Stack

Next.js (App Router) · Vercel · Vercel Postgres (Neon) · Drizzle ORM ·
NextAuth.js (YouVersion OAuth) · Resend

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values as steps require them
npm run dev                  # http://localhost:3000
```

## Deployment pipeline

Trunk-based, GitHub → Vercel:

1. Work on a feature branch, open a pull request.
2. Vercel builds an automatic preview deployment for every PR.
3. Merge to `main` — Vercel deploys to production automatically. No manual
   deploy steps; `main` is always deployable.

Environment variables are documented in [.env.example](.env.example) and must
be set in the Vercel project for the Production and Preview environments.
