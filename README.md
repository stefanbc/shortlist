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

## Local setup

Requires the [Supabase CLI](https://supabase.com/docs/guides/local-development) and
Docker.

```bash
npm install
supabase start                # Postgres, Auth, Realtime, Studio (local)
cp .env.example .env.local    # fill in the values `supabase status -o env` prints
npm run dev                   # http://localhost:5173
```

In a second terminal, keep the edge functions served (juror links, user admin, import —
anything the app calls via `supabase.functions.invoke`):

```bash
supabase functions serve
```

Create your own admin account to sign in with:

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status -o env`> \
npm run create-admin -- you@example.com a-strong-password "Your Name"
```

Then sign in at `/login`. From there: `/admin/import` imports an event straight from the
organizer's spreadsheet export (see "Importing the Astra Hack sheet" below), or `/admin/events`
creates one by hand. Either way, assign jurors on the event's Jurors tab and hand each one
their personal `/j/<token>` link (shown with a QR code) — that's how jurors sign in, never
with a password.

### Importing the Astra Hack sheet

`/admin/import` accepts the organizer's `.xlsx` export: upload it, review the parsed
themes/criteria/teams/jurors/scores and the ranking-preview parity check against the
sheet's own cached results, fix anything the page flags (an invalid criterion weight blocks
import), then import. Jurors come in with placeholder `@jurors.shortlist.invalid` addresses;
give them real ones from `/admin/users` once you have them. The fixture used by this repo's
own tests (`fixtures/astra-hack.xlsx`) is private and git-ignored — supply your own workbook
in the same shape to try this locally.

## Running the tests

- `npm test` — unit tests (Vitest + jsdom + Testing Library); no services needed.
- `npm run test:db` — pgTAP tests against the local database (`supabase start` first).
- `npm run test:integration` — integration tests against the local stack. Needs
  `supabase start` **and** `supabase functions serve` both running.
- `npm run test:e2e` — Playwright end-to-end tests (juror and admin flows in a real
  browser). Needs `supabase start` and `supabase functions serve` running; the first run
  also needs `npx playwright install chromium`. The suite seeds its own admin/jurors/event
  (`e2e/seed.ts`, idempotent) and starts its own Vite dev server on a dedicated port
  (5183, to avoid colliding with anything already on 5173).
- `npm run build` — type-checks the whole project (app, integration tests, and e2e tests
  are separate `tsc` project references) and builds for production.

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
- `npm run create-admin` — create a confirmed admin user directly (see above)

## Deploying

Shortlist runs on a hosted Supabase project plus Vercel. These steps are for whoever has
access to create/link those — they are not run as part of this repository's automation.

### 1. Supabase (cloud)

1. Create a new Supabase project (or reuse one reserved for this event).
2. `supabase link --project-ref <ref>` from this repo.
3. In the dashboard (Authentication → Settings), set **Allow new users to sign up** to
   **off** (`enable_signup = false`) — the app never creates accounts through sign-up; every
   user is created by an admin via `npm run create-admin` or `/admin/users`. Hosted Supabase
   doesn't read `supabase/config.toml`'s `enable_signup`, so this must be set by hand in the
   dashboard (or `supabase config push` if you manage it via `supabase/config.toml` and the
   CLI's remote config support).
4. `supabase db push` — applies `supabase/migrations/*.sql`. Do this **before** deploying a
   new frontend build, and never during a live event (a migration that changes scoring
   tables while jurors are actively tapping is exactly the outage this ordering avoids).
5. Set the `APP_URL` function secret to the production app URL (used for CORS on the
   admin-only edge function actions, and as the base of the juror link the admin shares):
   ```bash
   supabase secrets set APP_URL=https://your-app.vercel.app
   ```
6. In the dashboard (Authentication → URL Configuration), set **Site URL** to the same
   production app URL (`APP_URL`, e.g. `https://your-app.vercel.app`) and add
   `https://your-app.vercel.app/**` to **Redirect URLs**. Admin email-link sign-ins redirect
   to the app root (`VITE_APP_URL` + `/`), which must be allowed here — otherwise Supabase
   falls back to the Site URL, and with the default `http://localhost:3000` the link is
   useless. (Locally, `supabase/config.toml` already allows `http://localhost:5173` and
   `http://127.0.0.1:5173`.)
7. Deploy the edge functions:
   ```bash
   supabase functions deploy juror-link admin-users import-event
   ```
   Before deploying, it's worth running `deno check supabase/functions/**/index.ts` to
   catch a type error before it reaches production (the functions have no test environment
   of their own beyond `tests/integration`, which exercises them locally).

### 2. Vercel

1. Create a Vercel project from this repo (`vercel.json` already has the SPA rewrite and
   security headers — see below).
2. Set the environment variables (Project Settings → Environment Variables):

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | the Supabase project's API URL |
   | `VITE_SUPABASE_ANON_KEY` | the Supabase project's anon key |
   | `VITE_APP_URL` | the same URL as the Vercel deployment (must match `APP_URL` above) |

3. `vercel --prod` (or push to the branch Vercel deploys from).

### 3. First admin, import, and a phone smoke test

Once both are live:

```bash
SUPABASE_URL=<project API URL> SUPABASE_SERVICE_ROLE_KEY=<service role key> \
npm run create-admin -- you@example.com a-strong-password "Your Name"
```

Sign in at the deployed `/login`, import the event from `/admin/import`, assign jurors, and
open one juror's `/j/<token>` link on an actual phone before the event starts — the one
thing worth confirming by hand that no automated check covers.

### `vercel.json`

SPA rewrite (every path serves `index.html`, since routing is client-side) plus security
headers: `X-Frame-Options: DENY` and a matching `Content-Security-Policy: frame-ancestors
'none'` (the app is never meant to be framed), `Referrer-Policy: no-referrer` (so the
`/j/:token` URL — a bearer credential — never leaks via the `Referer` header to whatever a
juror taps next), and a `connect-src` scoped to Supabase's hosted domain (`*.supabase.co`,
including `wss:` for Realtime). The CSP was verified against a production build served
locally (`npm run build && vite preview`, with the header applied) — script/style need
`'unsafe-inline'` for `index.html`'s small inline dark-mode script and Tailwind's injected
styles. If you move to a different (self-hosted) Supabase instance, update `connect-src` in
`vercel.json` to that host.
