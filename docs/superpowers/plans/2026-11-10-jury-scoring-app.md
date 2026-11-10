# Shortlist — Jury Scoring App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, responsive jury-scoring web app for hackathons (organizer + jurors), replacing the Astra Hack Google Sheet, with event/team/criteria/user management, offline-safe scoring, reports, exports and an importer that reproduces the sheet's scores exactly.

**Architecture:** Vite + React SPA on Vercel talking directly to Supabase (Postgres + RLS + Realtime + Auth). All access rules and the event lock live in Postgres (RLS policies and `security definer` RPCs); three Supabase Edge Functions handle the actions that need the service role (juror login links, user creation, import). All scoring math lives in one pure TypeScript module (`src/domain/scoring.ts`) used by reports, the live ranking, exports and the parity test, so there is exactly one implementation of the sheet formula.

**Tech Stack:** Node 22, Vite, React 19, TypeScript (strict), Tailwind CSS v4, Zustand 5 (client state, persisted offline queue and preferences), Zod 4 (forms, RPC payloads, import), TanStack Query 5 (server state), React Router 7, Supabase (supabase-js v2, Supabase CLI, pgTAP), i18next + react-i18next + i18next-browser-languagedetector, Radix UI primitives, motion, lucide-react, sonner, @dnd-kit (reordering), recharts, exceljs, @react-pdf/renderer, qrcode.react, Vitest + Testing Library, Playwright. Install latest stable of each.

**Spec:** `docs/superpowers/specs/2026-11-10-jury-scoring-app-design.md` (read it before any task).

## Global Constraints

- Scores: 1–5 inclusive in steps of 0.5. Enforced in Zod and as a DB check (`value between 1 and 5 and value * 2 = floor(value * 2)`).
- Criterion weight: numeric > 0 (relative points, not percentages).
- Formula (verbatim from the sheet): criterion score = `weight × average(non-empty juror scores)`; final = `Σ criterion scores / Σ weights` over criteria with ≥1 score; zero scores ⇒ final `null` ("not scored"); no-show ⇒ final `1.00`.
- Grace window for late offline scores: 15 minutes after closing.
- Default pitch duration: 7 minutes (5 pitch + 2 Q&A).
- Roles: `admin`, `juror`, one role per user, stored as data with a role→permission mapping. Admins never judge.
- Jurors never see other jurors' scores, totals or rankings — enforced by RLS, not just UI.
- UI languages: `ro` and `en`, switchable, default from browser; theme `light`/`dark`/`system`, default system. User content (team, criterion names) is never translated.
- Phone (≥360px), tablet and desktop are first-class; no horizontal scroll at 360px.
- Every UI task invokes the `frontend-design:frontend-design` skill before writing components. Direction: modern, distinctive, not a stock admin template; the validated layouts are in spec §7.
- No analytics/tracking scripts.
- Commit after every task; conventional commit messages ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Local dev requires Docker running (`supabase start`).

## Review Focus

1. **Stale in-flight save** — a juror taps 3 then quickly 4 while offline/slow; when the first save returns it must not remove or overwrite the newer queued 4. Test in Task 13.
2. **Wrong device clock** — a juror's phone clock is hours off; `tapped_at` in the future must not let a score slip past the lock. Server clamps `tapped_at` to `now()`. Test in Task 5.
3. **Juror removed or deactivated mid-event** (the Mirela → Ovdia swap) — their existing scores still count in results; they can no longer save new scores; a deactivated juror's link stops working. Tests in Task 5 and Task 6.
4. **Weight edge values** — 0, negative, empty or non-numeric weights are rejected; an event with no criteria yields `null` finals rather than NaN. Tests in Task 2 and Task 4.
5. **Malformed or non-matching workbook** — a non-xlsx file or a workbook without team sheets fails with a readable error, not a crash; missing project name / empty juror column are tolerated. Test in Task 3.

## File Structure

```
src/
  main.tsx                      app bootstrap
  app/App.tsx, app/router.tsx, app/providers.tsx, app/guards.tsx
  lib/supabase.ts               typed client
  lib/database.types.ts         generated: `supabase gen types typescript --local`
  lib/queryClient.ts
  lib/i18n.ts
  locales/en.json, locales/ro.json
  domain/types.ts               plain domain types shared by domain + features
  domain/scoring.ts             formula, ranking, tie-breaks
  domain/analytics.ts           criteria + juror analysis
  domain/eventPhase.ts          TS mirror of SQL event_phase
  domain/schemas.ts             Zod schemas for all editable entities
  stores/preferences.ts         theme + language (persisted)
  stores/session.ts             auth session + profile
  stores/scoreQueue.ts          offline score queue (persisted)
  components/ui/*               primitives (Button, Card, Dialog, ConfirmDialog, Sheet, Input, Textarea,
                                Select, Tabs, Badge, Skeleton, EmptyState, DateTimeField, SortableList)
  components/layout/AppShell.tsx, AdminNav.tsx, PreferencesMenu.tsx
  features/auth/*               LoginPage, RedeemJurorLinkPage
  features/events/*             api.ts, EventsPage, EventSettingsPage, EventPhaseBadge
  features/criteria/*           api.ts, CriteriaPage, ThemesPanel
  features/teams/*              api.ts, TeamsPage, TeamForm
  features/users/*              api.ts, UsersPage, JurorLinkDialog, EventJurorsPage
  features/scoring/*            api.ts, JurorHomePage, ScoringPage, CriterionCard, CriterionStrip,
                                CriterionList, NowPitchingDialog, PitchTimer, useScoringKeys.ts
  features/dashboard/*          DashboardPage, ProgressBoard, LiveRanking, LateScoresNotice
  features/reports/*            useEventResults.ts, PodiumPage, RankingPage, TeamBreakdownPage,
                                CriteriaReportPage, JurorReportPage
  features/export/*             csv.ts, workbook.ts, ResultsPdf.tsx, ExportMenu.tsx
  features/import/*             parseWorkbook.ts, ImportPage
supabase/
  config.toml
  migrations/0001_schema.sql, 0002_security.sql, 0003_rpc.sql
  tests/*.test.sql              pgTAP
  functions/_shared/admin.ts    service client + caller-is-admin check
  functions/juror-link/index.ts
  functions/admin-users/index.ts
  functions/import-event/index.ts
tests/integration/*.test.ts     vitest against local Supabase
e2e/*.spec.ts                   Playwright
fixtures/astra-hack.xlsx        copy of the user's sheet
scripts/create-admin.ts
vercel.json, .env.example, README.md
```

Routes: `/login`, `/j/:token`, `/score` (juror home), `/score/:eventId/:teamId`, `/admin` (dashboard of active event), `/admin/events`, `/admin/events/:eventId/{settings,teams,criteria,jurors}`, `/admin/events/:eventId/reports/{podium,ranking,criteria,jurors}`, `/admin/events/:eventId/reports/teams/:teamId`, `/admin/users`, `/admin/import`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/app/App.tsx`, `src/index.css`, `eslint.config.js`, `.prettierrc`, `vitest.setup.ts`, `.env.example`, `src/app/App.test.tsx`
- Modify: `.gitignore`, `README.md`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `typecheck`, `lint`, `test` (vitest run, jsdom, excludes `tests/integration` and `e2e`), `test:integration`, `test:db` (`supabase test db`), `test:e2e`, `gen:types`. Path alias `@/` → `src/`.

- [ ] **Step 1:** `npm create vite@latest . -- --template react-ts`, add Tailwind v4 (`@tailwindcss/vite`), Vitest + jsdom + Testing Library, ESLint + Prettier, alias `@/`. `.env.example` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`.
- [ ] **Step 2: Write test** `src/app/App.test.tsx`: renders `<App />` and expects text `Shortlist`.
- [ ] **Step 3:** Run `npm test` — PASS. Run `npm run build && npm run typecheck && npm run lint` — all exit 0.
- [ ] **Step 4: Commit** `chore: scaffold vite react app`.

---

### Task 2: Scoring domain (formula, ranking, ties)

**Files:**
- Create: `src/domain/types.ts`, `src/domain/scoring.ts`, `src/domain/scoring.test.ts`

**Interfaces:**
- Produces:
```ts
// types.ts
export type Id = string
export interface Criterion { id: Id; name: string; weight: number; position: number }
export interface Team { id: Id; name: string; pitchOrder: number; noShow: boolean; manualTiebreak: number | null }
export interface Score { teamId: Id; criterionId: Id; jurorId: Id; value: number }
// scoring.ts
export interface CriterionResult { criterionId: Id; average: number | null; weighted: number | null; count: number }
export interface JurorAverage { jurorId: Id; average: number }
export interface TeamResult { teamId: Id; final: number | null; criteria: CriterionResult[]; jurors: JurorAverage[] }
export interface RankedTeam extends TeamResult { rank: number | null; tiedWith: Id[]; tieUnresolved: boolean }
export function computeTeamResult(team: Team, criteria: Criterion[], scores: Score[]): TeamResult
export function rankTeams(teams: Team[], criteria: Criterion[], scores: Score[]): RankedTeam[]
export const SCORE_EPSILON = 1e-9
```

- [ ] **Step 1: Write failing tests** in `scoring.test.ts`:
  - `computes the sheet formula with blanks excluded`: weights `[20, 90]`, criterion A scores `[3, 2, 1.5]`, criterion B scores `[4, 3]` → A.average `6.5/3`, A.weighted `20*6.5/3`, final `(20*6.5/3 + 90*3.5) / 110` (toBeCloseTo, 9 digits).
  - `excludes criteria nobody scored from numerator and denominator`: B has no scores → final equals A.average.
  - `returns null final when no scores` and `returns null final when there are no criteria`.
  - `no-show scores exactly 1 regardless of scores`.
  - `juror averages are plain averages across criteria` (sheet row 11).
  - `ranks descending with null finals last and competition ranks` (finals 4, 3.5, 3.5, null → ranks 1, 2, 2, null).
  - `breaks ties on highest-weight criterion average then next`: two teams with equal finals; weights 100 and 20; team X higher on the 100-weight criterion → X rank 1, Y rank 2, `tieUnresolved` false.
  - `equal weights break by position ascending`.
  - `fully tied in top 3 is flagged unresolved and shares rank`; `manualTiebreak` (lower first) resolves it.
  - `full tie outside top 3 shares rank but is not flagged`.
- [ ] **Step 2:** `npx vitest run src/domain/scoring.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** in `scoring.ts`. Finals compared with `SCORE_EPSILON`. Tie-break order: criteria sorted by weight desc, then position asc; compare `average` (null treated as lowest); then `manualTiebreak` asc when both set. Teams still equal share the rank of the first; `tiedWith` lists the others; `tieUnresolved = rank !== null && rank <= 3 && tiedWith.length > 0`.
- [ ] **Step 4:** Run tests — PASS.
- [ ] **Step 5: Commit** `feat(domain): scoring formula and ranking`.

---

### Task 3: Workbook parser + sheet parity test

**Files:**
- Create: `fixtures/astra-hack.xlsx` (copy of `/Users/stefan/Downloads/Evaluare Hackathon Astra Hack.xlsx`), `src/features/import/parseWorkbook.ts`, `src/features/import/parseWorkbook.test.ts`

**Interfaces:**
- Consumes: `computeTeamResult`, `rankTeams` (Task 2).
- Produces:
```ts
export interface ParsedJuror { key: string; displayName: string }          // key = lowercased, whitespace-collapsed name
export interface ParsedTeam {
  sheet: string; pitchOrder: number; name: string; projectName: string | null; theme: string | null
  repoUrl: string | null; description: string | null; noShow: boolean
  scores: { criterionPosition: number; jurorKey: string; value: number }[]
}
export interface ParsedEvent {
  themes: string[]; criteria: { name: string; weight: number; position: number }[]
  jurors: ParsedJuror[]; teams: ParsedTeam[]; expectedFinals: Record<string, number | null> // from cached J11
}
export class WorkbookFormatError extends Error { code: 'not_xlsx' | 'no_team_sheets' | 'no_criteria' }
export async function parseWorkbook(data: ArrayBuffer): Promise<ParsedEvent>
export function toDomain(p: ParsedEvent): { criteria: Criterion[]; teams: Team[]; scores: Score[] } // ids = sheet / position / juror key
```

Layout rules (tolerant, by label not fixed row where possible):
- Team sheets: names matching `/^E(\d+)$/`; `pitchOrder` = the number.
- Criteria: first team sheet, rows from 2 while column A is numeric; name = column B, weight = column C, position = column A.
- Juror columns: row 1 from column D until the header starting with `Scor`; display name = header with newlines → single space, trimmed.
- Metadata: in column B find `Echipa:`, `Numele Proiect:`, `Tema Proiect:`, `Repo GitHub:`; value is the next non-empty cell below in column B (empty → null).
- Themes: sheet `Tematica`, column B from row 2, non-empty.
- Description: sheet `Rezultate Partiale`, row whose column A equals the team number → column D (trimmed, empty → null).
- `noShow` = team has zero scores (confirmed by the user for E10). Cached `J11` result: number, or null when error/empty.

- [ ] **Step 1: Write failing tests** (read fixture with `fs.readFileSync`):
  - `parses 3 themes, 9 criteria with weights [20,90,25,25,100,80,70,20,100]`.
  - `parses 20 teams with pitch order from sheet name`; E13 → name `Dev.exe`, project `AiVee`, theme `Artificial Intelligence`, repo `https://github.com/mariusbuharu-gsd/aivee`, description starts with `AiVee transformă`.
  - `E17 has null project name`; `E10 is a no-show with no scores`.
  - `identifies 7 distinct jurors and attributes column D to Mirela GROZA on E1 and Ovdia CABA on E18`.
  - `PARITY: computed finals match cached J11 for all 19 scored teams` (`toBeCloseTo(expected, 9)`), spot values E13 `4.008647799`, E4 `3.695754717`, E5 `2.932861635`, E17 `2.687893082`.
  - `PARITY: ranking order of scored teams matches Rezultate Partiale` (E13, E4, E6, E8, E19, E12, E2, E18, E11, then E15 and E9 (equal finals — assert the order our tie-break produces), E7, E16, E3, E14, E20, E1, E5, E17) and E10 ranks last with final 1.
  - `rejects non-xlsx bytes with WorkbookFormatError not_xlsx`; `rejects workbook without E-sheets with no_team_sheets` (build one in-test with exceljs).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement** with exceljs (`workbook.xlsx.load`); formula cells: use `cell.result`; wrap load errors as `not_xlsx`.
- [ ] **Step 4:** Run — PASS. The sheet's E15-before-E9 order is arbitrary (equal scores); the test asserts our tie-break's order and says so in its name.
- [ ] **Step 5: Commit** `feat(import): parse astra workbook with parity test`.

---

### Task 4: Analytics, event phase, Zod schemas

**Files:**
- Create: `src/domain/analytics.ts`, `src/domain/eventPhase.ts`, `src/domain/schemas.ts`, and a `.test.ts` beside each.

**Interfaces:**
- Consumes: domain types (Task 2).
- Produces:
```ts
// analytics.ts
export interface CriterionStat { criterionId: Id; mean: number | null; spread: number | null } // spread = population stdev of team averages
export function criterionStats(criteria: Criterion[], scores: Score[]): CriterionStat[]       // sorted by spread desc, nulls last
export interface Outlier { teamId: Id; criterionId: Id; value: number; othersMean: number }
export interface JurorStat { jurorId: Id; count: number; mean: number; spread: number; bias: number; tendency: 'lenient' | 'harsh' | 'neutral'; outliers: Outlier[] }
export function jurorStats(scores: Score[]): JurorStat[]
export const OUTLIER_DELTA = 1.5, TENDENCY_DELTA = 0.5
// eventPhase.ts
export type EventPhase = 'setup' | 'open' | 'locked'
export type StatusOverride = 'auto' | 'open' | 'locked'
export interface EventTiming { startsAt: string; endsAt: string; statusOverride: StatusOverride; lockedAt: string | null }
export function eventPhase(e: EventTiming, now: Date): EventPhase
export function closedAt(e: EventTiming): Date        // lockedAt when override=locked, else endsAt
export const GRACE_MINUTES = 15
// schemas.ts
export const scoreValueSchema, criterionInputSchema, themeInputSchema, teamInputSchema, eventInputSchema, userInputSchema
```
  - `bias` = mean over the juror's scores of (value − mean of other jurors on the same team+criterion), skipping cells no other juror scored. Outlier when |value − othersMean| ≥ `OUTLIER_DELTA`. tendency by `bias ≥ +0.5` / `≤ −0.5`.
  - `eventPhase`: override `open` → open; override `locked` → locked; now < startsAt → setup; now ≤ endsAt → open; else locked.
  - `criterionInputSchema`: name trimmed 1–300 chars, weight number > 0 ≤ 1000, position int ≥ 1. `eventInputSchema`: name 1–120, `endsAt > startsAt`, pitchMinutes int 1–60 default 7. `teamInputSchema`: name 1–120, members string[], pitchOrder int ≥ 1, project { name nullable, description nullable ≤ 5000, themeId nullable uuid, repoUrl nullable URL }. `userInputSchema`: displayName 1–120, email optional email, role `admin|juror`.

- [ ] **Step 1: Write failing tests:** analytics (`flags a 5 among 2s as outlier`, `lenient juror bias ≥ 0.5`, `criterion spread ranks a discriminating criterion first`, `single juror cell is not an outlier`); phase (each branch incl. override precedence, boundary `now == endsAt` is open); schemas (`weight 0, -1, '' and 'abc' rejected`, `score 3.25 and 5.5 rejected, 4.5 accepted`, `endsAt before startsAt rejected`).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** `feat(domain): analytics, event phase and schemas`.

---

### Task 5: Database schema, RLS, RPCs (pgTAP)

**Files:**
- Create: `supabase/config.toml` (`supabase init`), `supabase/migrations/0001_schema.sql`, `0002_security.sql`, `0003_rpc.sql`, `supabase/tests/schema.test.sql`, `supabase/tests/rls.test.sql`, `supabase/tests/rpc.test.sql`, `src/lib/database.types.ts` (generated)

**Interfaces:**
- Produces (tables, all `id uuid pk default gen_random_uuid()` unless noted, `created_at timestamptz default now()`):
  - `roles(key text pk)`, `permissions(key text pk)`, `role_permissions(role text fk, permission text fk, pk(role,permission))`. Seed roles `admin`, `juror`; permissions `events.manage`, `users.manage`, `reports.view`, `scores.write`; admin → first three, juror → `scores.write`.
  - `profiles(id uuid pk fk auth.users on delete cascade, display_name text not null, email text, role text fk roles default 'juror', active bool default true)`; trigger on `auth.users` insert creates the profile from `raw_user_meta_data` (`display_name`, `role`).
  - `events(name, starts_at, ends_at check > starts_at, status_override text check in ('auto','open','locked') default 'auto', locked_at timestamptz, pitch_minutes int default 7, now_pitching_team_id uuid fk teams null on delete set null, now_pitching_since timestamptz)`.
  - `themes(event_id fk cascade, name, position int)`; `criteria(event_id fk cascade, name, weight numeric check (weight > 0), position int)`.
  - `teams(event_id fk cascade, name, members text[] default '{}', pitch_order int, no_show bool default false, manual_tiebreak int)`; `projects(team_id uuid unique fk cascade, name text, description text, theme_id fk themes on delete set null, repo_url text)`.
  - `event_jurors(event_id fk cascade, juror_id fk profiles cascade, pk(event_id,juror_id))`.
  - `scores(event_id, team_id fk cascade, criterion_id fk cascade, juror_id fk profiles, value numeric check (value between 1 and 5 and value*2 = floor(value*2)), tapped_at timestamptz, updated_at timestamptz default now(), unique(team_id,criterion_id,juror_id))`.
  - `juror_notes(team_id, juror_id, body text, pk(team_id,juror_id))`.
  - `late_score_attempts(event_id, team_id, criterion_id, juror_id, value numeric null, tapped_at, received_at default now())`.
  - `audit_log(actor uuid, action text, entity text, entity_id uuid, old jsonb, new jsonb, at timestamptz default now())`; triggers log `criteria.weight` changes (`weight_changed`) and `events.status_override` changes (`status_changed`).
  - `juror_tokens(juror_id fk profiles cascade, token_hash text unique, revoked_at timestamptz)`.
  - SQL functions: `has_permission(p text) returns bool` (security definer, stable; active profile's role has p); `event_phase(e events) returns text` and `event_closed_at(e events) returns timestamptz` (same rules as `eventPhase`/`closedAt` in Task 4); `is_event_juror(event uuid) returns bool`.
  - RPCs: `upsert_score(p_team uuid, p_criterion uuid, p_value numeric /* null = clear */, p_tapped_at timestamptz) returns text` → `'saved' | 'not_open' | 'locked' | 'not_assigned'`. `p_tapped_at` is clamped to `least(p_tapped_at, now())`. Saved when phase = open, or phase = locked and `tapped_at ≤ closed_at` and `now() ≤ closed_at + interval '15 minutes'`. On `locked` (outside grace) inserts a `late_score_attempts` row. Team must not be `no_show` (→ `not_open`).
  - `set_event_status(p_event uuid, p_override text)` (admin; sets `locked_at = now()` when → locked); `set_now_pitching(p_event uuid, p_team uuid)` (admin; sets `now_pitching_since = now()`); `copy_event_setup(p_source uuid, p_name text, p_starts timestamptz, p_ends timestamptz) returns uuid` (copies themes + criteria); `import_event(p jsonb) returns uuid` (service role only; inserts event with `status_override='locked'`, themes, criteria, teams, projects, event_jurors, scores in one transaction; payload shape = Task 6 `ImportPayload`).
  - RLS: everything readable/writable by `has_permission('events.manage')` (scores/notes: admin read-only). Juror: select events/themes/criteria/teams/projects where `is_event_juror`; select own `scores` and own `juror_notes`; insert/update/delete own notes; no direct writes to `scores` (only via `upsert_score`); select own profile. `profiles` and `event_jurors` writes: `users.manage`. Realtime publication on `events` and `scores`.

- [ ] **Step 1: Write failing pgTAP tests** (use `tests.create_supabase_user`/`authenticate_as` helpers from `basejump-supabase_test_helpers`, or hand-rolled `set local role authenticated; set local request.jwt.claims`):
  - schema: `score 3.25 rejected`, `weight 0 rejected`, `ends_at before starts_at rejected`, `profile created with role from metadata`.
  - rls: `juror A cannot select juror B's scores`, `juror cannot see events they are not assigned to`, `juror cannot insert into scores directly`, `juror cannot update criteria`, `admin sees all scores`, `removed juror's scores still visible to admin after event_jurors delete`.
  - rpc: `upsert_score saved when open`; `not_open in setup`; `not_assigned after juror removed from event`; `saved within grace: tapped before close, received 10 min after`; `locked after grace records late_score_attempts`; `future tapped_at is clamped so a post-close tap is rejected`; `null value deletes the score`; `no_show team rejects`; `weight update writes audit_log`; `set_event_status locked sets locked_at`; `copy_event_setup copies 9 criteria with weights`.
- [ ] **Step 2:** `supabase start && npm run test:db` — FAIL.
- [ ] **Step 3: Implement** the three migrations. Grace tests control time by setting `ends_at`/`locked_at` relative to `now()`.
- [ ] **Step 4:** `supabase db reset && npm run test:db` — all PASS. Run `npm run gen:types`.
- [ ] **Step 5: Commit** `feat(db): schema, rls and scoring rpcs`.

---

### Task 6: Edge functions — juror links, users, import

**Files:**
- Create: `supabase/functions/_shared/admin.ts`, `supabase/functions/juror-link/index.ts`, `supabase/functions/admin-users/index.ts`, `supabase/functions/import-event/index.ts`, `scripts/create-admin.ts`, `tests/integration/helpers.ts`, `tests/integration/functions.test.ts`

**Interfaces:**
- Consumes: tables/RPCs (Task 5); `ParsedEvent` (Task 3).
- Produces (all POST JSON, CORS enabled; admin actions require caller with `users.manage`):
  - `juror-link`: `{action:'issue', jurorId}` → `{token}` (32 random bytes base64url; stores sha256 hex; revokes previous) · `{action:'revoke', jurorId}` → `{ok:true}` · `{action:'redeem', token}` (no auth) → `{tokenHash}` from `auth.admin.generateLink({type:'magiclink', email})`; errors `invalid_token` (unknown/revoked) and `inactive` (profile inactive) as HTTP 400 `{error}`.
  - `admin-users`: `{action:'create', displayName, email?, role}` → `{id}` (`auth.admin.createUser` with `email_confirm:true`; missing email → `juror-<uuid>@jurors.shortlist.invalid`; metadata carries display_name/role) · `{action:'set_active', userId, active}` (also bans/unbans auth user) · `{action:'set_email', userId, email}`.
  - `import-event`: body `ImportPayload = ParsedEvent & { eventName: string }` (validated with a Zod schema copied into the function) → creates one juror user per `ParsedJuror` (placeholder email), maps juror keys to ids, calls `import_event` → `{eventId}`.
  - Client helper later: `redeemJurorToken(token) → supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`.
  - `scripts/create-admin.ts <email> <password> <displayName>` using `SUPABASE_SERVICE_ROLE_KEY`; npm script `create-admin`.

- [ ] **Step 1: Write failing integration tests** (`supabase functions serve` running; helpers sign in as a seeded admin):
  - `issue then redeem yields a session for the juror` (verifyOtp returns session whose user id = juror).
  - `reissue revokes the old token` (old → `invalid_token`).
  - `deactivated juror cannot redeem` (→ `inactive`).
  - `juror caller cannot issue links` (403).
  - `import-event on the fixture creates 20 teams, 7 jurors, locked event, and results match expectedFinals` (fetch scores via admin client → `rankTeams` → compare).
- [ ] **Step 2:** `npm run test:integration` — FAIL.
- [ ] **Step 3: Implement** the functions (Deno, `npm:@supabase/supabase-js@2`, `npm:zod`).
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** `feat(functions): juror links, user admin and import`.

---

### Task 7: App shell, design system, theme, i18n

**Files:**
- Create: `src/stores/preferences.ts`, `src/lib/i18n.ts`, `src/locales/{en,ro}.json`, `src/components/ui/*`, `src/components/layout/{AppShell,AdminNav,PreferencesMenu}.tsx`, `src/app/{providers,router}.tsx`, tests `src/stores/preferences.test.ts`, `src/locales/locales.test.ts`, `src/components/ui/ConfirmDialog.test.tsx`

**Interfaces:**
- Produces:
```ts
export type ThemePref = 'light' | 'dark' | 'system'; export type Lang = 'ro' | 'en'
export const usePreferences: UseBoundStore<{ theme: ThemePref; lang: Lang | null; setTheme(t: ThemePref): void; setLang(l: Lang): void }>
// persisted under 'shortlist.prefs'; effect applies `dark` class on <html> (system → matchMedia) and i18n.changeLanguage
<ConfirmDialog open title description confirmLabel tone?: 'default'|'danger' onConfirm onOpenChange />
<AppShell> — desktop: left sidebar nav; mobile: top bar + bottom nav; PreferencesMenu (theme + language) in both
```
  - Translation keys namespaced by feature (`nav.*`, `events.*`, `scoring.*`, `reports.*`, `common.*`); all UI strings from i18n from here on.

- [ ] **Step 1:** Invoke `frontend-design:frontend-design`; settle tokens (color, type, radius, motion) as CSS variables in `src/index.css` with light/dark sets, Tailwind v4 `@theme`.
- [ ] **Step 2: Write failing tests:** `system theme follows matchMedia`, `explicit dark sets html.dark`, `language defaults to browser ro-RO → ro`, `en.json and ro.json have identical key sets` (recursive), `ConfirmDialog calls onConfirm only on confirm click`.
- [ ] **Step 3:** Run — FAIL. **Step 4:** Implement primitives (Radix-based), shell, router with placeholder pages. **Step 5:** Run — PASS; `npm run build`.
- [ ] **Step 6: Commit** `feat(ui): design system, shell, theme and i18n`.

---

### Task 8: Auth, session and route guards

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/queryClient.ts`, `src/stores/session.ts`, `src/app/guards.tsx`, `src/features/auth/{LoginPage,RedeemJurorLinkPage}.tsx`, tests `src/app/guards.test.tsx`, `src/features/auth/RedeemJurorLinkPage.test.tsx`

**Interfaces:**
- Produces:
```ts
export const supabase: SupabaseClient<Database> // persistSession, autoRefreshToken
export interface Profile { id: Id; displayName: string; email: string | null; role: 'admin' | 'juror'; active: boolean }
export const useSession: UseBoundStore<{ status: 'loading' | 'signedOut' | 'signedIn'; profile: Profile | null; signOut(): Promise<void> }>
<RequireRole role="admin" | "juror"> — signedOut → /login; wrong role → that role's home (/admin or /score)
```
  - `LoginPage`: email + password, and "email me a link" (OTP). `RedeemJurorLinkPage` (`/j/:token`): invokes `juror-link` redeem → `verifyOtp` → `/score`; error states for `invalid_token` and `inactive` with friendly copy.

- [ ] **Step 1: Write failing tests** (mock supabase module): guard redirects (signedOut → /login, juror on /admin → /score, admin on /score → /admin); redeem page success navigates to `/score`; `invalid_token` shows the revoked-link message.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(auth): login, juror link redemption, guards`.

---

### Task 9: Events management

**Files:**
- Create: `src/features/events/{api.ts,EventsPage.tsx,EventSettingsPage.tsx,EventPhaseBadge.tsx}`, test `src/features/events/EventSettingsPage.test.tsx`

**Interfaces:**
- Consumes: `eventInputSchema`, `eventPhase` (Task 4); RPCs `set_event_status`, `copy_event_setup`, `set_now_pitching` (Task 5).
- Produces:
```ts
export interface EventRow extends EventTiming { id: Id; name: string; pitchMinutes: number; nowPitchingTeamId: Id | null; nowPitchingSince: string | null }
useEvents(): UseQueryResult<EventRow[]>; useEvent(id: Id): UseQueryResult<EventRow>
useSaveEvent(): mutation(EventInput & { id?: Id }) → EventRow
useSetEventStatus(): mutation({ eventId, override: StatusOverride })
useCopyEvent(): mutation({ sourceId, name, startsAt, endsAt }) → Id
useSetNowPitching(): mutation({ eventId, teamId: Id | null })
useActiveEvent(): EventRow | null  // open event, else next upcoming, else most recent
```
  - Events list as cards with phase badge; create (blank or "copy setup from…"); settings page: name, dates, pitch minutes, status control (Auto / Open now / Lock now). Locking, unlocking and reverting to auto each go through `ConfirmDialog`.

- [ ] **Step 1: Write failing tests:** `ends before start shows validation error and does not submit`; `Lock now asks for confirmation before calling set_event_status`; `copy form calls copy_event_setup with source id`.
- [ ] **Step 2–4:** FAIL → implement (invoke frontend-design) → PASS.
- [ ] **Step 5: Commit** `feat(events): event management and lifecycle controls`.

---

### Task 10: Themes and criteria management

**Files:**
- Create: `src/features/criteria/{api.ts,CriteriaPage.tsx,ThemesPanel.tsx}`, `src/components/ui/SortableList.tsx`, test `src/features/criteria/CriteriaPage.test.tsx`

**Interfaces:**
- Consumes: `criterionInputSchema`, `themeInputSchema`, `useEvent`, `eventPhase`.
- Produces: `useCriteria(eventId) → Criterion[]` (by position), `useSaveCriterion()`, `useDeleteCriterion()`, `useReorderCriteria(eventId, orderedIds)`, `useThemes(eventId) → {id,name,position}[]`, `useSaveTheme()`, `useDeleteTheme()`, `useReorderThemes()`.
  - Criteria list with inline weight editing and share-of-total shown as a percentage bar (`weight / Σ weights`). When phase ≠ `setup`, any change to weight, add or delete opens `ConfirmDialog` ("Scores will be recalculated"); renaming/reordering does not.

- [ ] **Step 1: Write failing tests:** `weight edit in setup saves without confirm`; `weight edit when open requires confirm and cancel reverts the field`; `weight 0 shows error`; `share bar shows 90/530 ≈ 17%`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(criteria): themes and weighted criteria management`.

---

### Task 11: Teams and projects management

**Files:**
- Create: `src/features/teams/{api.ts,TeamsPage.tsx,TeamForm.tsx}`, test `src/features/teams/TeamsPage.test.tsx`

**Interfaces:**
- Consumes: `teamInputSchema`, `useThemes`, `SortableList`.
- Produces:
```ts
export interface TeamWithProject extends Team { members: string[]; project: { name: string | null; description: string | null; themeId: Id | null; repoUrl: string | null } }
useTeams(eventId): UseQueryResult<TeamWithProject[]>  // by pitchOrder
useSaveTeam(), useDeleteTeam(), useReorderTeams(eventId, orderedIds), useSetNoShow({ teamId, noShow })
```
  - List in pitch order (drag to reorder, renumbers 1..n), search, theme filter; form in a Sheet on mobile / side panel on desktop; no-show toggle with confirm.

- [ ] **Step 1: Write failing tests:** `reorder renumbers pitch order 1..n`; `invalid repo URL shows error`; `no-show toggle asks for confirmation`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(teams): teams and projects management`.

---

### Task 12: Users, roles and event jurors

**Files:**
- Create: `src/features/users/{api.ts,UsersPage.tsx,JurorLinkDialog.tsx,EventJurorsPage.tsx}`, test `src/features/users/JurorLinkDialog.test.tsx`, `src/features/users/UsersPage.test.tsx`

**Interfaces:**
- Consumes: `admin-users`, `juror-link` functions (Task 6); `userInputSchema`.
- Produces: `useProfiles()`, `useCreateUser()`, `useSetUserRole({userId, role})` (direct `profiles` update), `useSetUserActive()`, `useSetUserEmail()`, `useEventJurors(eventId) → Profile[]`, `useAssignJuror({eventId, jurorId})`, `useUnassignJuror()`, `useIssueJurorLink(jurorId) → { url: string }` (`${VITE_APP_URL}/j/${token}`), `useRevokeJurorLink()`.
  - Users page: list with role, status and events judged; create; change role; deactivate (confirm). Juror link dialog: URL + copy button + QR (`qrcode.react`), "Regenerate" (confirm: old link stops working). Event jurors page: assigned list, add/remove (removing warns that existing scores stay counted).

- [ ] **Step 1: Write failing tests:** `issue link shows URL with /j/ and a QR`; `regenerate asks confirmation and calls issue again`; `deactivate requires confirmation`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(users): user, role and juror management with login links`.

---

### Task 13: Offline score queue

**Files:**
- Create: `src/stores/scoreQueue.ts`, `src/stores/scoreQueue.test.ts`, `src/features/scoring/api.ts`

**Interfaces:**
- Consumes: `upsert_score` RPC.
- Produces:
```ts
export type SaveResult = 'saved' | 'not_open' | 'locked' | 'not_assigned'
export interface QueuedScore { key: string /* `${teamId}:${criterionId}` */; eventId: Id; teamId: Id; criterionId: Id; value: number | null; tappedAt: string; status: 'pending' | 'rejected'; reason?: SaveResult }
export type SendScore = (q: QueuedScore) => Promise<SaveResult> // throws on network error
export const useScoreQueue: UseBoundStore<{
  items: Record<string, QueuedScore>
  enqueue(input: Omit<QueuedScore, 'key' | 'status' | 'tappedAt'>, now?: Date): void // latest per key wins
  flush(send: SendScore): Promise<void>      // sequential; stops at first network error
  retryRejected(eventId: Id): void           // rejected → pending
}> // persisted 'shortlist.scoreQueue'
export const sendScore: SendScore           // in features/scoring/api.ts, calls supabase.rpc('upsert_score')
export function useMyScores(eventId: Id): Record<string /* key */, number>  // server scores overlaid with queue (queue wins; null removes)
export function useScoreSync(eventId: Id): { pending: number; rejected: number; online: boolean } // flush on enqueue, 'online', visibilitychange, every 10 s; retryRejected when event phase becomes open
```
  - On `'saved'` remove the item only if its `tappedAt` is unchanged since the send started; on `not_open`/`locked`/`not_assigned` mark `rejected` with reason.

- [ ] **Step 1: Write failing tests:** `enqueue replaces value for same key`; `saved removes item`; **`stale in-flight save does not remove newer value`** (send for value 3 resolves after enqueue of 4 → item with 4 remains pending); `network error keeps item pending and stops flush`; `locked marks rejected with reason`; `retryRejected only affects that event`; `state survives store rehydration from localStorage`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(scoring): persisted offline score queue`.

---

### Task 14: Juror scoring experience

**Files:**
- Create: `src/features/scoring/{JurorHomePage,ScoringPage,CriterionCard,CriterionStrip,CriterionList,NowPitchingDialog,PitchTimer}.tsx`, `src/features/scoring/useScoringKeys.ts`, tests `ScoringPage.test.tsx`, `useScoringKeys.test.ts`, `NowPitchingDialog.test.tsx`

**Interfaces:**
- Consumes: `useMyScores`, `useScoreSync`, `useScoreQueue` (Task 13); `useActiveEvent`, `useTeams`, `useCriteria`; Realtime channel on `events` row for `now_pitching_team_id`.
- Produces: `useMyNote(teamId) / useSaveNote()` (debounced 600 ms) on `juror_notes`; `useScoringKeys({ onSet(v: number), onHalf(), onClear(), onPrev(), onNext() })`.
  - Behaviour (spec §7): Juror home = team list in pitch order with status (not started / in progress n/9 / complete / no-show), "now pitching" highlighted. Phone (< 768px): `CriterionStrip` + `CriterionCard` with 9 value buttons 1…5; tap → enqueue then auto-advance after 250 ms; swipe (motion `drag="x"`) prev/next. ≥ 768px: `CriterionList` left + card right. Keys: `1`–`5` set value (no auto-advance), `.` adds 0.5 (5 stays 5), `Backspace` clears, `↑`/`↓` move, `Enter` next. Header: team, project, theme, "Team n / N", `PitchTimer` counting down from `now_pitching_since + pitch_minutes` when this team is pitching, otherwise a juror-started local timer; never blocks. Sync indicator (synced / n pending / offline / rejected with explanation). `NowPitchingDialog`: when `now_pitching_team_id` changes to a team ≠ current, ask "Team X is now pitching — switch?"; Switch navigates, Stay dismisses for that change only. Inputs disabled with explanation when phase is `setup`, or `locked` and nothing pending. Private note textarea collapsed under the card. No other juror data rendered anywhere.

- [ ] **Step 1:** Invoke `frontend-design:frontend-design`; build from the validated mockup v2 (`.superpowers/brainstorm/*/content/scoring-screen-v2.html`).
- [ ] **Step 2: Write failing tests:** `tap 3.5 enqueues and advances to next criterion`; `strip tile jumps to criterion`; `keys: 3 then . sets 3.5; Backspace clears; ArrowDown moves`; `5 then . stays 5`; `now-pitching change shows dialog; Stay keeps current team; Switch navigates`; `locked phase disables scoring buttons`; `progress shows 2/9 after two scores`.
- [ ] **Step 3–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(scoring): juror scoring screen`.

---

### Task 15: Organizer dashboard (live)

**Files:**
- Create: `src/features/reports/useEventResults.ts`, `src/features/dashboard/{DashboardPage,ProgressBoard,LiveRanking,LateScoresNotice}.tsx`, tests `useEventResults.test.ts`, `ProgressBoard.test.tsx`

**Interfaces:**
- Consumes: `rankTeams`, `criterionStats`, `jurorStats`; `useTeams`, `useCriteria`, `useEventJurors`, `useSetNowPitching`.
- Produces:
```ts
useEventScores(eventId): UseQueryResult<(Score & { updatedAt: string })[]> // admin; Realtime on scores filtered by event_id invalidates
useEventResults(eventId): { ranked: RankedTeam[]; criteria: Criterion[]; teams: TeamWithProject[]; jurors: Profile[]; scores: Score[]; criterionStats: CriterionStat[]; jurorStats: JurorStat[]; isLoading: boolean }
useLateAttempts(eventId): UseQueryResult<{ jurorId: Id; teamId: Id; count: number }[]>
```
  - Dashboard: phase + dates, "Now pitching" control (select team / next / clear), `ProgressBoard` (jurors × teams grid, cell = n/criteria with complete/partial/empty states, no-show column greyed), `LiveRanking` (animated reorder), `LateScoresNotice` with an Unlock action (confirm).

- [ ] **Step 1: Write failing tests:** `useEventResults recomputes when a criterion weight changes` (mock data → change weight → different order); `ProgressBoard shows 9/9 complete and 4/9 partial`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(dashboard): live progress and ranking`.

---

### Task 16: Reports

**Files:**
- Create: `src/features/reports/{PodiumPage,RankingPage,TeamBreakdownPage,CriteriaReportPage,JurorReportPage}.tsx`, test `src/features/reports/reports.test.tsx`

**Interfaces:**
- Consumes: `useEventResults` (Task 15).
- Produces: pages at the report routes. Podium: 1st/2nd/3rd presentation-style with reveal animation, tie warning linking to manual tie-break (sets `teams.manual_tiebreak`). Ranking: table (rank, team, project, theme, final 3 decimals, tie badge, no-show/not-scored badges). Team breakdown: sheet-style grid (criteria × jurors, weight, average, weighted, juror averages row, final) + recharts bar chart of criterion averages. Criteria: criterionStats table + chart. Jurors: jurorStats with tendency badge and outlier list (team, criterion, value vs others).

- [ ] **Step 1: Write failing tests** with fixture-derived data (use `parseWorkbook` + `toDomain` on the fixture): `podium shows Dev.exe, MergeConflict, Hardcoded`; `ranking shows Four the Win as no-show last`; `team breakdown for Codero shows final 2.962`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(reports): podium, ranking, team, criteria and juror reports`.

---

### Task 17: Exports (CSV, Excel, PDF)

**Files:**
- Create: `src/features/export/{csv.ts,workbook.ts,ResultsPdf.tsx,ExportMenu.tsx}`, tests `csv.test.ts`, `workbook.test.ts`

**Interfaces:**
- Consumes: `useEventResults` output type; `parseWorkbook` (for round-trip test).
- Produces:
```ts
export interface ExportData { eventName: string; themes: string[]; criteria: Criterion[]; teams: TeamWithProject[]; themeNames: Record<Id, string>; jurors: Profile[]; scores: Score[]; ranked: RankedTeam[] }
export function buildScoresCsv(d: ExportData): string   // header: team,project,juror,criterion,weight,value ; RFC 4180 quoting; UTF-8 BOM
export async function buildWorkbook(d: ExportData): Promise<Blob> // same layout as the source sheet, live formulas
export function ResultsPdf(props: { data: ExportData; lang: Lang }): JSX.Element // @react-pdf: podium, ranking, per-team summary
<ExportMenu eventId />   // on ranking + dashboard pages; triggers downloads
```
  - Workbook layout: sheet `Tematica` (A1 `Nr.`, B1 `Tematici posibile`), sheet `Rezultate Partiale` (A `Nr.`, B `Echipa`, C `Nume Proiect`, D description, E `Punctaj` = `='E{n}'!J$11`, sorted by our rank), one sheet `E{pitchOrder}` per team with the source cell map: A1 `Nr.`, B1 `Criteriu Jurizare`, C1 `Pondere`, jurors from D1 (`First\nLAST`) then `Scor`; rows 2.. criteria; J = `=SUM(D2:I2)*C2 / COUNTIF(D2:I2, "<>")`; row 11 juror `=AVERAGE(...)`, J11 `=SUM(J2:J10) / SUM(C2:C10)` (ranges sized to actual criteria/jurors); B12/B13 `Echipa:`/name, B15/B16 project, B18/B19 theme, B21/B22 repo; rules text as in the source B24. Columns: all jurors who scored that team. Cached `result` set on formula cells so the parser can read them.

- [ ] **Step 1: Write failing tests:** `csv quotes commas and quotes, starts with BOM, one row per score`; **`workbook round-trip: parseWorkbook(buildWorkbook(fixtureData)) yields the same scores and expectedFinals`** (no-show team exported with no scores, parsed back as no-show).
- [ ] **Step 2–4:** FAIL → implement → PASS. Manually open the exported .xlsx in a spreadsheet app once and confirm formulas compute.
- [ ] **Step 5: Commit** `feat(export): csv, excel and pdf exports`.

---

### Task 18: Import UI

**Files:**
- Create: `src/features/import/ImportPage.tsx`, test `src/features/import/ImportPage.test.tsx`

**Interfaces:**
- Consumes: `parseWorkbook`, `toDomain`, `rankTeams`, `import-event` function.
- Produces: `/admin/import`: drop zone → parse in browser → preview (event name field defaulting to `Astra Hack`, counts of themes/criteria/teams/jurors/scores, ranking preview with a "matches sheet" check per team comparing computed finals to `expectedFinals`, warnings for no-shows and missing project names) → Import → navigate to the event dashboard. `WorkbookFormatError` codes map to translated messages.

- [ ] **Step 1: Write failing tests:** `fixture shows 20 teams and all parity checks green`; `non-xlsx shows not_xlsx message`; `import calls import-event with eventName and parsed payload`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(import): admin spreadsheet import`.

---

### Task 19: End-to-end tests, deployment config, docs

**Files:**
- Create: `playwright.config.ts`, `e2e/juror-scoring.spec.ts`, `e2e/admin-flow.spec.ts`, `e2e/seed.ts`, `vercel.json`
- Modify: `README.md`, `.env.example`

**Interfaces:**
- Consumes: everything.
- Produces: `vercel.json` with SPA rewrite (`{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`) and security headers (`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` — the `/j/:token` URL must not leak via Referer). README: local setup (`supabase start`, `npm run create-admin`, `supabase functions serve`, `npm run dev`), cloud setup (create Supabase project, `supabase link`, `supabase db push`, `supabase functions deploy`, set secrets `APP_URL`; Vercel env vars), running each test suite.

- [ ] **Step 1: Write e2e specs** (local stack seeded by `e2e/seed.ts`: admin, 2 jurors, open event with 3 criteria, 2 teams):
  - `juror on 390x844 scores a team via link`: open `/j/<token>` → tap scores for all criteria → progress 3/3 → reload → values persist.
  - `offline taps sync when back online` (`context.setOffline(true)`, tap, indicator shows pending, `setOffline(false)`, indicator shows synced, admin sees score).
  - `now pitching prompts juror` (admin sets team 2 → juror dialog → Switch).
  - `admin: weight change while open asks confirmation and ranking changes`.
  - `juror cannot open /admin` and `no horizontal scroll at 360px on scoring and dashboard pages, in ro and en`.
- [ ] **Step 2:** `npm run test:e2e` — fix failures until PASS. Run full suite: `npm test && npm run test:db && npm run test:integration && npm run test:e2e && npm run build`.
- [ ] **Step 3: Commit** `test(e2e): juror and admin flows; chore: vercel config and docs`.
- [ ] **Step 4: Deployment (needs the user):** ask the user to create/link the Supabase cloud project and Vercel project (or provide access), then `supabase db push`, `supabase functions deploy juror-link admin-users import-event`, set Vercel env vars, `vercel --prod`, create the first admin, import the fixture, and smoke-test a juror link on a phone.
