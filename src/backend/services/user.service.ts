import { updateProfile as updateAuthProfile } from 'firebase/auth'
import { getFirebaseServices } from '../config/firebase'
import { createProfileIfMissing, readUserProfile, updateUserProfile } from '../repositories/user.repository'
import { currentUserId, runBackendOperation } from './shared'
import { BackendError } from '../utils/errors'
import { validateProfileInput } from '../utils/validation'
import { supportedTimezoneOrUtc } from '../utils/schedules'
import type { UserProfile } from '../types'

export function getUserProfile(): Promise<UserProfile> {
  return runBackendOperation(async () => {
    const { auth } = getFirebaseServices()
    const user = auth.currentUser
    if (!user) throw new BackendError('unauthenticated')
    const existing = await readUserProfile(user.uid)
    if (existing) return existing
    const timezone = supportedTimezoneOrUtc(Intl.DateTimeFormat().resolvedOptions().timeZone)
    return createProfileIfMissing(user, timezone)
  })
}

export function updateUserProfileFields(input: { displayName?: string; timezone?: string }): Promise<UserProfile> {
  return runBackendOperation(async () => {
    validateProfileInput(input)
    if (Object.keys(input).length === 0) throw new BackendError('validation', 'Profile update must include at least one field.')
    const uid = currentUserId()
    const user = getFirebaseServices().auth.currentUser
    if (!user) throw new BackendError('unauthenticated')
    const initialTimezone = input.timezone ?? supportedTimezoneOrUtc(Intl.DateTimeFormat().resolvedOptions().timeZone)
    await createProfileIfMissing(user, initialTimezone)
    const fields: Partial<Pick<UserProfile, 'displayName' | 'timezone'>> = {}
    if (input.displayName !== undefined) fields.displayName = input.displayName.trim()
    if (input.timezone !== undefined) fields.timezone = input.timezone
    if (input.displayName !== undefined) await updateAuthProfile(user, { displayName: input.displayName.trim() })
    await updateUserProfile(uid, fields)
    const profile = await readUserProfile(uid)
    if (!profile) throw new BackendError('not-found', 'User profile was not found after updating.')
    return profile
  })
}

export function profileExists(): Promise<boolean> {
  return runBackendOperation(async () => Boolean(await readUserProfile(currentUserId())))
}
