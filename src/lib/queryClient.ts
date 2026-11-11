import { QueryClient } from '@tanstack/react-query'

/** Shared query client. Realtime-backed data (scores, now-pitching) invalidates itself,
 * so queries don't need to be aggressive about refetching on their own. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
