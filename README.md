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
docker compose up -d         # PostgreSQL 16 (localhost:5433) + Mailpit (http://localhost:8025)
npm run db:migrate           # apply committed migrations to the local database
npm run dev                  # http://localhost:3000
```

Database round-trip check: `curl localhost:3000/api/health` should return
`{"ok":true,...}` with a database timestamp.

Schema changes: edit `src/db/schema.ts`, run `npm run db:generate` to produce
a SQL migration in `drizzle/`, then `npm run db:migrate` to apply it locally.
Migrations are committed and run automatically in the production build
(`npm run build` = `drizzle-kit migrate && next build`).

## Deployment pipeline

Trunk-based, GitHub → Vercel:

1. Work on a feature branch, open a pull request.
2. Vercel builds an automatic preview deployment for every PR.
3. Merge to `main` — Vercel deploys to production automatically. No manual
   deploy steps; `main` is always deployable.

Environment variables are documented in [.env.example](.env.example) and must
be set in the Vercel project for the Production and Preview environments.
