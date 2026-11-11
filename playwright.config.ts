import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against the local Supabase stack. Before running `npm run test:e2e`,
 * have running in two other terminals:
 *   - `supabase start`            (Postgres, Auth, Realtime, Studio)
 *   - `supabase functions serve`  (juror-link, admin-users, import-event)
 *
 * Both are left as documented preconditions rather than a second `webServer` entry: every
 * edge function answers a GET (the readiness probe Playwright would use) with 405, which
 * Playwright treats as "not available" (it only accepts 200-403), so it would always spawn
 * a redundant second `functions serve` alongside one already running instead of reusing it.
 *
 * `supabase/config.toml`'s `[edge_runtime] policy` is `oneshot`, not the default
 * `per_worker`: `per_worker`'s hot-reload worker pool recycles workers on its own
 * wall-clock schedule (logged as "early termination has been triggered"), which can drop
 * a juror-link request that lands mid-recycle. `oneshot` gives every request its own
 * fresh isolate and was reliable across repeated full runs; `per_worker` is only worth it
 * for hot-reloading a function's own code while editing it, which this suite never does.
 *
 * `e2e/seed.ts` (this config's `globalSetup`) seeds an admin, two jurors and an open event
 * directly against the local DB before any test runs, and writes their ids/tokens to
 * `e2e/.cache/seed.json` for the specs to read via `readSeed()`.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/seed.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // One retry for generic shared-machine flakiness (a slow resize/layout settle, a
  // moment of CPU contention) rather than anything specific to this app or stack.
  retries: process.env.CI ? 2 : 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5183',
    trace: 'retain-on-failure',
  },
  webServer: {
    // A fixed, uncommon port: 5173 is Vite's default and this machine may already have an
    // unrelated project's dev server bound to it (the whole suite would otherwise silently
    // run against someone else's app).
    command: 'npm run dev -- --port 5183 --strictPort',
    url: 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
