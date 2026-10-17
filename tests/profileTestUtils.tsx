import { did, profile } from './actorFixtures'
import { render } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { PublicDataService } from '../src/data/publicData'
import { queryKeys } from '../src/data/queryKeys'
import type { ActorProfile } from '../src/types'
import { createTestQueryClient } from './testUtils'

export function renderWithRouter(element: React.ReactNode, queryClient = createTestQueryClient()) {
  queryClient.setQueryData(queryKeys.profileView(did), profile)
  return render(element, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

export function renderProfileTab(element: React.ReactElement, selectedProfile: ActorProfile) {
  const queryClient = createTestQueryClient()
  const service = new PublicDataService(queryClient)
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={{ profile: selectedProfile, service }} />}>
            <Route index element={element} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return view
}
