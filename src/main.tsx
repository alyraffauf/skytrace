import { router } from './routes/router'
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from './data/queryClient'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-5 py-12" aria-label="Loading page">
          <div className="skeleton h-20 w-full" />
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  </QueryClientProvider>,
)
