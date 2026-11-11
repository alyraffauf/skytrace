import './index.css'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Theme } from '@astryxdesign/core/theme'
import { skytraceTheme } from './theme/generated/skytrace'
import { router } from './routes/router'
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from './data/runtime/queryClient'
import { registerPreloadErrorTracking } from './routes/preloadErrors'

registerPreloadErrorTracking()

createRoot(document.getElementById('root')!).render(
  <Theme theme={skytraceTheme} mode="system">
    <QueryClientProvider client={queryClient}>
      <Suspense
        fallback={
          <div className="mx-auto max-w-3xl px-5 py-12" aria-label="Loading page">
            <Skeleton width="100%" height="5rem" />
          </div>
        }
      >
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  </Theme>,
)
