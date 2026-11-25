import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
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
import { assertValidPassword } from '../utils/passwords'

export interface RegisterInput {
  email: string
  password: string
  /** Must equal `password`; protects against typos because the password field is masked. */
  confirmPassword: string
  displayName: string
  timezone?: string
}

export interface RegisterResult {
  user: User
  /** False when the account was created but the verification email could not be sent. */
  verificationEmailSent: boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new BackendError('validation', 'Введите корректный email.')
  const email = value.trim().toLowerCase()
  if (email.length > 320 || !EMAIL_PATTERN.test(email)) throw new BackendError('validation', 'Введите корректный email.')
  return email
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') throw new BackendError('validation', 'Введите имя.')
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 120) throw new BackendError('validation', 'Имя должно содержать от 2 до 120 символов.')
  return name
}

export function register(input: RegisterInput): Promise<RegisterResult> {
  return runBackendOperation(async () => {
    if (!input || typeof input !== 'object') throw new BackendError('validation', 'Registration input must be an object.')
    const displayName = normalizeDisplayName(input.displayName)
    const email = normalizeEmail(input.email)
    assertValidPassword(input.password)
    if (input.confirmPassword !== input.password) throw new BackendError('validation', 'Пароли не совпадают.')
    const timezone = input.timezone ?? supportedTimezoneOrUtc(Intl.DateTimeFormat().resolvedOptions().timeZone)
    if (!isValidTimezone(timezone)) throw new BackendError('validation', 'timezone is not in the supported timezone list.')
    const { auth } = getFirebaseServices()
    const credential = await createUserWithEmailAndPassword(auth, email, input.password)
    await updateAuthProfile(credential.user, { displayName })
    await createProfileIfMissing(credential.user, timezone)
    let verificationEmailSent = true
    try {
      await sendEmailVerification(credential.user)
    } catch {
      // The account is already usable; the user can request the email again from the profile page.
      verificationEmailSent = false
    }
    return { user: credential.user, verificationEmailSent }
  })
}

export function resendEmailVerification(): Promise<void> {
  return runBackendOperation(async () => {
    const user = getFirebaseServices().auth.currentUser
    if (!user) throw new BackendError('unauthenticated')
    if (user.emailVerified) throw new BackendError('failed-precondition', 'Email уже подтверждён.')
    await sendEmailVerification(user)
  })
}

/** Re-reads the Firebase user so a verification completed in another tab becomes visible. */
export function reloadEmailVerificationStatus(): Promise<boolean> {
  return runBackendOperation(async () => {
    const user = getFirebaseServices().auth.currentUser
    if (!user) throw new BackendError('unauthenticated')
    await reload(user)
    return user.emailVerified
  })
}

export function login(emailValue: string, password: string): Promise<User> {
  return runBackendOperation(async () => {
    const email = normalizeEmail(emailValue)
    if (typeof password !== 'string' || password.length === 0) throw new BackendError('validation', 'Введите пароль.')
    const credential = await signInWithEmailAndPassword(getFirebaseServices().auth, email, password)
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
