import type { UserProfile } from '../types'
import { BackendError } from '../utils/errors'
import { asRecord, requireStoredString, requireStoredTimestamp, requireStoredTimezone } from './common.schema'

export function parseUserProfile(value: unknown, expectedUid: string): UserProfile {
  const data = asRecord(value, 'user profile')
  const uid = requireStoredString(data.uid, 'profile.uid', 128)
  if (uid !== expectedUid) throw new BackendError('failed-precondition', 'Profile UID does not match its document path.')
  const email = requireStoredString(data.email, 'profile.email', 320, true)
  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BackendError('failed-precondition', 'Stored profile email is invalid.')
  const displayName = requireStoredString(data.displayName, 'profile.displayName', 120, true)
  return {
    uid,
    email,
    displayName,
    timezone: requireStoredTimezone(data.timezone),
    createdAt: requireStoredTimestamp(data.createdAt, 'profile.createdAt'),
    updatedAt: requireStoredTimestamp(data.updatedAt, 'profile.updatedAt'),
  }
}
