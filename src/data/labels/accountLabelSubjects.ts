// Profile-record labels also describe the account and belong in its label history.
export function accountLabelSubjects(did: string): string[] {
  return [did, `at://${did}/app.bsky.actor.profile/self`]
}
