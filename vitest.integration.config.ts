import { defineConfig } from 'vitest/config'

// Integration tests run against the local Supabase stack (`supabase start`) with the
// edge functions served (`supabase functions serve`). See tests/integration/helpers.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Tests share one local stack; run files one at a time to keep auth rate limits calm.
    fileParallelism: false,
  },
})
