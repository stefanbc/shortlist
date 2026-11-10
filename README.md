# Shortlist

A private, modern jury-scoring web app for hackathons. Jurors score teams on
their own device during pitches; organizers manage events, teams, criteria
and jurors, and get live rankings plus reports and exports. Replaces a
shared spreadsheet with a focused, fast scoring flow — teams and the
audience never see it.

Built with React, TypeScript, Vite and Tailwind CSS, backed by Supabase
(Postgres, Auth, Row Level Security, Realtime), deployed on Vercel.

See `docs/superpowers/specs/2026-11-10-jury-scoring-app-design.md` for the
full design.

## Development

```bash
npm install
cp .env.example .env   # fill in Supabase project values
npm run dev
```

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check and build for production
- `npm run typecheck` — type-check only
- `npm run lint` — run ESLint
- `npm test` — run unit tests (Vitest + jsdom + Testing Library)
- `npm run test:integration` — run integration tests against a local Supabase instance
- `npm run test:db` — run pgTAP tests against the local database
- `npm run test:e2e` — run Playwright end-to-end tests
- `npm run gen:types` — regenerate `src/lib/database.types.ts` from the local Supabase schema
