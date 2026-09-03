import { QueryClient } from '@tanstack/react-query'
import { retryDelay, shouldRetry } from './http'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: (failureCount, error) => shouldRetry(failureCount, error),
      retryDelay: (attempt, error) => retryDelay(attempt, error),
      refetchOnWindowFocus: false,
    },
  },
})
