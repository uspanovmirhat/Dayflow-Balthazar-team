import { getFirebaseServices } from '../config/firebase'
import { createProfileIfMissing, readUserProfile } from '../repositories/user.repository'
import { localDateInTimeZone } from '../utils/dates'
import { supportedTimezoneOrUtc } from '../utils/schedules'
import { assertAuthenticated, toBackendError } from '../utils/errors'

export async function runBackendOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toBackendError(error)
  }
}

export function currentUserId(): string {
  const userId = getFirebaseServices().auth.currentUser?.uid
  assertAuthenticated(userId)
  return userId
}

export async function currentUserContext() {
  const { auth } = getFirebaseServices()
  const user = auth.currentUser
  assertAuthenticated(user?.uid)
  let profile = await readUserProfile(user.uid)
  if (!profile) {
    const timezone = supportedTimezoneOrUtc(Intl.DateTimeFormat().resolvedOptions().timeZone)
    profile = await createProfileIfMissing(user, timezone)
  }
  return { uid: user.uid, user, profile, today: localDateInTimeZone(new Date(), profile.timezone) }
}
