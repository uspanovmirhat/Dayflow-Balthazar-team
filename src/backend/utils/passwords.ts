import { BackendError } from './errors'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export type PasswordRequirement = 'length' | 'letter' | 'digit' | 'noEdgeSpaces'

export interface PasswordCheck {
  /** Requirements that the password does not satisfy yet. Empty when the password is acceptable. */
  missing: PasswordRequirement[]
  /** 0 (empty/very weak) … 4 (strong). Informational only; acceptance is decided by `missing`. */
  score: 0 | 1 | 2 | 3 | 4
  valid: boolean
}

export const PASSWORD_REQUIREMENT_LABELS: Record<PasswordRequirement, string> = {
  length: `От ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символов`,
  letter: 'Хотя бы одна буква',
  digit: 'Хотя бы одна цифра',
  noEdgeSpaces: 'Без пробелов в начале и в конце',
}

export function checkPassword(value: unknown): PasswordCheck {
  const password = typeof value === 'string' ? value : ''
  const missing: PasswordRequirement[] = []
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) missing.push('length')
  if (!/\p{L}/u.test(password)) missing.push('letter')
  if (!/\d/.test(password)) missing.push('digit')
  if (password.length > 0 && password.trim() !== password) missing.push('noEdgeSpaces')

  let score = 0
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1
  if (password.length >= 12) score += 1
  if (/\p{Ll}/u.test(password) && /\p{Lu}/u.test(password)) score += 1
  if (/\d/.test(password) && /[^\p{L}\d\s]/u.test(password)) score += 1
  if (missing.length > 0) score = Math.min(score, 1)
  return { missing, score: score as PasswordCheck['score'], valid: missing.length === 0 }
}

export function assertValidPassword(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new BackendError('validation', 'Введите пароль.')
  const { missing } = checkPassword(value)
  if (missing.length > 0) {
    throw new BackendError('validation', `Пароль не подходит: ${missing.map((item) => PASSWORD_REQUIREMENT_LABELS[item].toLowerCase()).join(', ')}.`)
  }
}
