export type BackendErrorCode =
  | 'configuration'
  | 'validation'
  | 'unauthenticated'
  | 'permission-denied'
  | 'not-found'
  | 'already-exists'
  | 'failed-precondition'
  | 'unavailable'
  | 'internal'

const defaultMessages: Record<BackendErrorCode, string> = {
  configuration: 'Firebase configuration is incomplete.',
  validation: 'Some provided values are invalid.',
  unauthenticated: 'Sign in to continue.',
  'permission-denied': 'You do not have permission to perform this action.',
  'not-found': 'The requested item was not found.',
  'already-exists': 'This item already exists.',
  'failed-precondition': 'The requested operation cannot be completed in the current state.',
  unavailable: 'The service is temporarily unavailable. Please try again.',
  internal: 'An unexpected error occurred.',
}

export class BackendError extends Error {
  readonly code: BackendErrorCode
  readonly causeValue: unknown

  constructor(code: BackendErrorCode, message = defaultMessages[code], causeValue?: unknown) {
    super(message)
    this.name = 'BackendError'
    this.code = code
    this.causeValue = causeValue
  }
}

export function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error

  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
  const mapped: Record<string, BackendErrorCode> = {
    'auth/email-already-in-use': 'already-exists',
    'auth/invalid-credential': 'unauthenticated',
    'auth/invalid-email': 'validation',
    'auth/weak-password': 'validation',
    'auth/user-disabled': 'permission-denied',
    'auth/user-not-found': 'not-found',
    'auth/wrong-password': 'unauthenticated',
    'auth/too-many-requests': 'unavailable',
    'auth/network-request-failed': 'unavailable',
    'auth/operation-not-allowed': 'failed-precondition',
    'permission-denied': 'permission-denied',
    'firestore/permission-denied': 'permission-denied',
    'not-found': 'not-found',
    'firestore/not-found': 'not-found',
    'already-exists': 'already-exists',
    'firestore/already-exists': 'already-exists',
    'unavailable': 'unavailable',
    'firestore/unavailable': 'unavailable',
    'failed-precondition': 'failed-precondition',
  }
  const mappedCode = mapped[code] ?? 'internal'
  return new BackendError(mappedCode, defaultMessages[mappedCode], error)
}

export function assertAuthenticated(userId: string | null | undefined): asserts userId is string {
  if (!userId) throw new BackendError('unauthenticated')
}
