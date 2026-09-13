import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { DecorativeActorAvatar } from '../src/components/ActorIdentity'
import type { ActorProfile, ActorReference } from '../src/types'

const reference: ActorReference = { kind: 'actorReference', did: 'did:plc:ewvi7nxzyoun6zhxrhs64oiz' }
const profile: ActorProfile = {
  kind: 'actorProfile',
  identity: { kind: 'actorIdentity', did: reference.did, handle: 'atproto.com', pds: 'https://pds.example' },
  hasNoUnauthenticatedSelfLabel: false,
  avatarCid: 'bafyreicdwixhubhirckrrt7mqcoiq4u47b7quxlm24r547qcth4bc2ubq4',
}

it.each(['small', 'row'] as const)('preserves decorative %s avatars as profiles resolve', (size) => {
  const view = render(<DecorativeActorAvatar actor={reference} size={size} />)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(view.container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  expect(view.container.firstElementChild).toHaveClass(size === 'small' ? 'size-6' : 'size-8')
  view.rerender(<DecorativeActorAvatar actor={profile} size={size} />)
  const image = view.container.querySelector('img')!
  expect(image).toHaveAttribute('alt', '')
  expect(image).toHaveAttribute('loading', 'lazy')
  expect(image).toHaveAttribute(
    'src',
    `https://cdn.bsky.app/img/avatar/plain/${reference.did}/${profile.avatarCid}@jpeg`,
  )
  expect(image).toHaveClass(size === 'small' ? 'size-6' : 'size-8')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
