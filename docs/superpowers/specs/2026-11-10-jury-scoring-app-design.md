# Shortlist — Hackathon Jury Scoring App — Design

Date: 2026-11-10
Status: Approved 2026-11-10
Delivery: no hard deadline; build the full scope in one go (confirmed by the user).

## 1. Intent

The organizer of the Astra Hack hackathon currently runs jury scoring in a shared Google Sheet: one tab per team, jurors typing scores into cells on their laptops while teams pitch on stage in front of an audience. It works, but entering scores this way feels clumsy and unprofessional — easy to type into the wrong cell or tab, no sense of who has finished, and everyone can see everyone's numbers.

Shortlist replaces the sheet with a private, modern scoring app for **the jury and the organizer only**. Teams and the audience never see it. The only output that leaves the tool is the announcement of 1st, 2nd and 3rd place.

Success looks like: during a pitch, each juror scores the team on whatever device they brought (phone or laptop) in a focused, fast, good-looking flow; the organizer watches progress live; at the end the podium is ready, the math matches what the sheet would have produced, and full reports/exports exist for the record.

## 2. Goals, non-goals, anti-goals

**Goals**
- Fast, focused, polished juror scoring flow that works equally on phone, tablet and desktop.
- Organizer manages events, teams/projects, themes, criteria and weights, jurors, users and roles.
- Event lifecycle with start/end dates and locks.
- Weight changes after scoring has started are possible, gated by a confirmation, and rankings recalculate.
- Rich reporting plus Excel/PDF/CSV exports.
- Romanian/English switch; dark/light mode.
- Import Astra Hack from the existing spreadsheet as the first event, and reproduce its scores exactly.

**Non-goals**
- Anything public-facing: no audience view, no team-facing results, no live leaderboard on a projector.
- Team self-registration or project submission by teams.
- A UI for creating arbitrary custom roles (see §6).

**Anti-goals** (would be a failure even if it technically works)
- Scoring that is slower or fiddlier than the sheet for a juror mid-pitch.
- Losing a juror's entered scores (phone locks, flaky wifi).
- Jurors seeing each other's scores or the ranking.
- Final scores that differ from the spreadsheet's formula.
- A generic, templated-looking admin UI. It must look and feel modern.

## 3. Tech stack (decided by the user)

- React + TypeScript, Vite.
- Tailwind CSS.
- Zustand for client state.
- Zod for validation (forms, API payloads, import parsing).
- Supabase as backend: Postgres, Auth, Row Level Security, Realtime.
- Deployed on Vercel.

Builder's call within this: component primitives (e.g. Radix/shadcn-style), router, charting lib, i18n lib, Excel/PDF export libs, test tooling.

## 4. Domain model and scoring rules (from the spreadsheet)

The spreadsheet `Evaluare Hackathon Astra Hack.xlsx` is the reference. Source: `/Users/stefan/Downloads/Evaluare Hackathon Astra Hack.xlsx`. Copy it into the repo as a test fixture (e.g. `fixtures/astra-hack.xlsx`) for the importer and parity test.

Formulas, verbatim: per criterion row `J = SUM(D:I)*C / COUNTIF(D:I,"<>")`; per juror `=AVERAGE(D2:D10)`; final `J11 = SUM(J2:J10) / SUM(C2:C10)`. `Rezultate Partiale` pulls `B13`, `B16`, `J11` from each team sheet and is sorted by score descending, unrounded (E10 sits at the top only because `#DIV/0!` sorts first — an artifact, not a rank).

**Structure observed**
- `Tematica` sheet: list of themes — Artificial Intelligence, Cybersecurity, Sustainability.
- One sheet per team (`E1`…`E20`): rows = 9 criteria with a weight (`Pondere`), columns = 6 jurors; cells = score.
- Team sheet metadata: team name (B13), project name (B16), theme (B19), GitHub repo (B22).
- `Rezultate Partiale`: ranking — team number, team, project, project description (some), final score.
- Rules note on each sheet: scores 1–5 in 0.5 steps; a no-show team gets 1 point by default; each team has 7 minutes (5 pitch + 2 Q&A).

**Criteria and weights (Astra Hack)**

| # | Criterion | Weight |
|---|-----------|--------|
| 1 | Încadrarea în cadrul temei alese din listă | 20 |
| 2 | Originalitate și Utilitate | 90 |
| 3 | Potențial de business - include sustenabilitate, impact | 25 |
| 4 | Potențial/Impact social | 25 |
| 5 | Procent implementare din funcționalitatea propusă ca idee | 100 |
| 6 | Calitatea soluției propuse, optimizări | 80 |
| 7 | Deciziile arhitecturale, complexitatea conceptelor, tehnologiilor și a algoritmilor folosiți | 70 |
| 8 | Nice to have: UX, UI, scalabilitate, clean code, surprise element | 20 |
| 9 | Prezentare: capacitate sinteză idei și implementare, demo | 100 |

Weights are relative points (not percentages; they sum to 530). Criteria are editable per event (add/remove/rename/reorder/reweight).

**Scoring formula (must match the sheet exactly)**
- Criterion score for a team: `weight × average(non-empty juror scores for that criterion)` — empty cells are excluded from the average, not counted as zero (`SUM/COUNTIF "<>"`).
- Team final score: `Σ criterion scores / Σ weights` → a number on the 1–5 scale.
- Criteria where no juror scored are excluded from both numerator and denominator. *(Builder's call; the sheet yields #DIV/0! here. A team with zero scores has no final score and is shown as "not scored".)*
- Per-juror average for a team (sheet row 11): plain average of that juror's scores across criteria — shown in reports.
- Scores are recomputed from raw scores and current weights; never store derived totals as source of truth.

**No-show:** organizer can mark a team as no-show. Its final score is 1.00 and it is ranked accordingly; juror scoring for it is disabled.

**Ties (my call):** if teams tie in the top 3, break by the highest-weight criterion score, then the next highest, and so on; if still tied, flag it for the organizer to decide manually (organizer can set a manual order for tied teams).

**Data observations for import**
- Jury changed mid-event: sheets E1–E17 use juror *Mirela GROZA*; E18–E20 and E10 use *Ovdia CABA* in that column. The other five jurors are constant. So a juror need not score every team — the model must support that.
- E10 (Four the Win / Clearpath) has no scores (#DIV/0!). **It was a no-show (confirmed by the user):** import it with the no-show flag → final score 1.00, ranked last. E5 and E14 have one blank cell each.
- E17 (Polynomial Matrix) has no project name.
- Some descriptions exist only in `Rezultate Partiale` column D.
- Juror names in headers are "First\nLAST".

## 5. Event lifecycle

Each event has its own themes, criteria+weights, teams/projects, and assigned jurors. Multiple events over time.

States derived from dates plus manual overrides:
- **Setup** (before start date): admin edits everything. Jurors can see teams but cannot score.
- **Open** (between start and end): jurors score. Criteria/weights are locked; admin may override a weight via a confirmation dialog ("this will recalculate all scores"), and rankings recompute immediately.
- **Locked** (after end date): scores frozen. Admin can manually unlock (with confirmation) to let a juror fix something, and re-lock.

Admin can also manually open/close scoring regardless of dates (e.g. pitches run late). Dates and lock state must be enforced server-side (RLS / DB functions), not just in the UI.

**Unlock scope (my call):** unlock is event-wide (the existing state flag), not per juror or per team.

**Offline scores vs. the lock (my call):** each queued score carries the client time it was tapped. The server accepts a score that arrives after closing if it reaches the server within a 15-minute grace window. Anything later is rejected; the client keeps it, tells the juror, and the admin sees a "late scores pending" notice and can accept it by unlocking.

New events can be created by copying criteria and weights (and themes) from a previous event. *(My guess, not confirmed.)*

All weight overrides and lock/unlock actions are recorded in an audit log (who, when, old → new). *(My call.)*

## 6. Users, roles, permissions

Two roles today (the user confirmed nobody else logs in):
- **Admin** (organizer): everything — users, events, teams, projects, themes, criteria, weights, juror assignment, reports, exports, imports.
- **Juror**: sees events they're assigned to, sees teams/projects in those events, enters and edits **only their own** scores while the event is open. Never sees other jurors' scores, totals, or rankings.

Admins never also judge (confirmed by the user): one role per user.

Roles are stored as data (role table / enum mapped to permissions) so a third role (e.g. read-only "viewer") can be added later without a rewrite. No custom-role builder UI. User management screen: invite, change role, deactivate, see which events a user judges.

**Juror login (decided by the user):** the admin generates a personal login link per juror, shown as a URL and a QR code, to hand out or send. Opening it logs the juror in with a session that lasts at least the whole event — no email or password needed on the day. The admin can revoke and regenerate a juror's link (e.g. if it leaks). Juror email is optional. Implementation is the builder's call within Supabase Auth.

**Admin login (my call):** email + password or magic link via Supabase Auth. The first admin is bootstrapped via a seed/CLI step.

## 7. Juror experience

Validated with mockups (layout only; final visual design is the builder's).

- After login the juror sees their active event and the list of teams in pitch order, each with status (not started / in progress / complete). The team currently up is highlighted; default selection follows pitch order but the juror can pick any team.
- **"Now pitching" (decided by the user):** the admin sets which team is pitching now (a control on the organizer dashboard, broadcast via Supabase Realtime). Each juror's screen prompts with a confirmation dialog ("Team X is now pitching — switch?") and switches on confirm. Jurors can always go back to a previous team they haven't finished, and the team list shows unfinished teams clearly.
- Team header: team name, project name, theme, position (e.g. "Team 7 / 20"), and an informational 7-minute countdown the juror can start (does not lock anything). *(Timer behavior is my guess.)*
- **Phone:** one criterion at a time on a large focused card (criterion name, weight, big current value, 1–5 in 0.5-step buttons). A horizontal strip of criterion tiles at the top shows each criterion number and the score given; tapping a tile jumps to it; swiping the card moves prev/next. Tapping a score auto-advances to the next criterion.
- **Laptop/tablet:** criteria list on the left with scores; focused card on the right. Keyboard: 1–5 to score (with a way to enter halves), ↑/↓ to move between criteria.
- Every tap saves immediately (optimistic UI). Scores survive screen lock, reloads and brief connectivity loss — queue locally and sync when back online, with a clear but unobtrusive sync indicator.
- Juror can revisit and change scores for any team until the event is locked.
- A juror may leave a criterion blank; it is excluded from averages (matches sheet).
- Optional free-text private note per team for the juror's own memory. *(My call; small, useful, not in the sheet — builder may drop if costly.)*

## 8. Organizer experience

- **Dashboard** for the active event: state, dates, progress board (jurors × teams completion grid), live ranking (Supabase Realtime).
- **Events:** CRUD, dates, lock/unlock, copy from previous.
- **Themes:** per-event list.
- **Criteria:** per-event CRUD, reorder, weights; post-start weight edits require confirmation and recalc.
- **Teams & projects:** CRUD; team name, members (names, optional), pitch order; project name, description, theme, GitHub repo; no-show toggle.
- **Jurors:** assign users to events; a juror can be removed/added mid-event (supports the Mirela→Ovdia swap).
- **Users & roles:** as §6.
- **Import:** upload the Astra Hack .xlsx (see §10).

## 9. Reporting and exports

Admin only.
- **Live (during event):** progress board; live ranking.
- **Podium:** 1st/2nd/3rd, presentation-ready (still private — it's for the organizer to read out).
- **Full ranking** with final scores, tie flags.
- **Team breakdown:** grid like the sheet (criteria × jurors, weighted criterion score, per-juror average) plus a chart.
- **Criteria analysis:** which criteria separated teams; field-wide averages per criterion.
- **Juror analysis:** per-juror mean and spread, outlier flags (scores far from the jury consensus), lenient/harsh indicators.
- **Exports:** Excel workbook mirroring the current sheet layout (ranking tab + one tab per team); PDF results report; CSV of raw scores.

## 10. Spreadsheet import (Astra Hack as first event)

- Creates event "Astra Hack" with the 3 themes, 9 criteria and weights, 20 teams/projects (with repo, theme, and description where present in `Rezultate Partiale`), the 7 jurors (as juror users — placeholder emails to be filled in by the admin, since the sheet has none), and all scores, attributed to the correct juror per team (handling the column-1 juror change).
- Team number from the sheet name (E1…E20) becomes pitch order.
- Imported event starts in **Locked** state.
- **Verification:** after import, computed final scores must match the sheet's `J11` values for all 19 scored teams (to floating-point tolerance), and the ranking of those 19 must match `Rezultate Partiale`; E10 is a no-show at 1.00, ranked last. This is an automated test.
- The importer can be a one-off script/seed or an admin UI upload; builder's call. The parsing should be tolerant to the same layout from future events.

## 11. Cross-cutting

- Responsive: phone, tablet, desktop are all first-class.
- i18n: Romanian and English, switchable; default from browser. Criteria/team names are user content and not translated.
- Theme: dark and light, switchable; default from OS.
- Modern UI/UX: distinctive, polished, smooth transitions, good empty/loading/error states. Not a stock admin template.
- Security: all access rules enforced via Supabase RLS; jurors cannot read others' scores via the API either.
- Accessibility: keyboard navigable, adequate contrast and touch targets.

## 12. Left to the builder

Visual design system, component library, routing, file/folder structure, Supabase schema details and migrations, offline-sync mechanism, chart and export libraries, test strategy (with the import-parity test as a must-have), Vercel/Supabase environment setup.
