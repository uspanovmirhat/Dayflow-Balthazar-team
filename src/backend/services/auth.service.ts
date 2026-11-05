import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile as updateAuthProfile,
  type User,
} from 'firebase/auth'
import { getFirebaseServices } from '../config/firebase'
import { createProfileIfMissing } from '../repositories/user.repository'
import { runBackendOperation } from './shared'
import { isValidTimezone, supportedTimezoneOrUtc } from '../utils/schedules'
import { BackendError } from '../utils/errors'
import { requireString } from '../utils/validation'

export interface RegisterInput {
  email: string
  password: string
  displayName: string
  timezone?: string
}

function normalizeEmail(value: string): string {
  if (typeof value !== 'string') throw new BackendError('validation', 'email must be a valid email address.')
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BackendError('validation', 'email must be a valid email address.')
  return email
}

export function register(input: RegisterInput): Promise<User> {
  return runBackendOperation(async () => {
    if (!input || typeof input !== 'object') throw new BackendError('validation', 'Registration input must be an object.')
    const email = normalizeEmail(input.email)
    const displayName = requireString(input.displayName, 'displayName', 120)
    if (typeof input.password !== 'string' || input.password.length < 8) throw new BackendError('validation', 'password must contain at least 8 characters.')
    const timezone = input.timezone ?? supportedTimezoneOrUtc(Intl.DateTimeFormat().resolvedOptions().timeZone)
    if (!isValidTimezone(timezone)) throw new BackendError('validation', 'timezone is not in the supported timezone list.')
    const { auth } = getFirebaseServices()
    const credential = await createUserWithEmailAndPassword(auth, email, input.password)
    await updateAuthProfile(credential.user, { displayName })
    await createProfileIfMissing(credential.user, timezone)
    return credential.user
  })
}

export function login(emailValue: string, password: string): Promise<User> {
  return runBackendOperation(async () => {
    if (typeof password !== 'string' || password.length === 0) throw new BackendError('validation', 'password is required.')
    const credential = await signInWithEmailAndPassword(getFirebaseServices().auth, normalizeEmail(emailValue), password)
    const timezone = supportedTimezoneOrUtc(Intl.DateTimeFormat().resolvedOptions().timeZone)
    await createProfileIfMissing(credential.user, timezone)
    return credential.user
  })
}

export function logout(): Promise<void> {
  return runBackendOperation(() => signOut(getFirebaseServices().auth))
}

export function getCurrentUser(): User | null {
  return getFirebaseServices().auth.currentUser
}

export function subscribeToAuthState(callback: (user: User | null) => void, onError?: (error: Error) => void): () => void {
  return onAuthStateChanged(getFirebaseServices().auth, callback, (error) => onError?.(error))
}

export function requestPasswordReset(emailValue: string): Promise<void> {
  return runBackendOperation(() => sendPasswordResetEmail(getFirebaseServices().auth, normalizeEmail(emailValue)))
}
