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

// Firebase Auth errors are shown directly on the sign-in screen, so they get user-facing text.
const authMessages: Record<string, string> = {
  'auth/email-already-in-use': 'Аккаунт с таким email уже существует. Войдите или восстановите пароль.',
  'auth/invalid-credential': 'Неверный email или пароль.',
  'auth/invalid-login-credentials': 'Неверный email или пароль.',
  'auth/wrong-password': 'Неверный email или пароль.',
  'auth/user-not-found': 'Неверный email или пароль.',
  'auth/invalid-email': 'Введите корректный email.',
  'auth/missing-email': 'Введите email.',
  'auth/missing-password': 'Введите пароль.',
  'auth/weak-password': 'Пароль слишком простой. Используйте не менее 8 символов, буквы и цифры.',
  'auth/user-disabled': 'Этот аккаунт отключён.',
  'auth/too-many-requests': 'Слишком много попыток. Подождите немного и попробуйте снова.',
  'auth/network-request-failed': 'Нет соединения с сервером. Проверьте интернет и попробуйте снова.',
  'auth/operation-not-allowed': 'Вход по email и паролю отключён в настройках Firebase.',
  'auth/requires-recent-login': 'Для этого действия войдите в аккаунт заново.',
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
    'auth/invalid-login-credentials': 'unauthenticated',
    'auth/missing-password': 'validation',
    'auth/missing-email': 'validation',
    'auth/requires-recent-login': 'unauthenticated',
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
  return new BackendError(mappedCode, authMessages[code] ?? defaultMessages[mappedCode], error)
}

export function assertAuthenticated(userId: string | null | undefined): asserts userId is string {
  if (!userId) throw new BackendError('unauthenticated')
}
