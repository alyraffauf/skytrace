import type { ActorProfile } from '../../types'
import type { PublicDataService } from '../../data/publicData'

export type ProfileOutletContext = {
  profile: ActorProfile
  service: PublicDataService
}
