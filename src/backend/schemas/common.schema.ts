import { Timestamp } from 'firebase/firestore'
import { BackendError } from '../utils/errors'
import { isLocalDate } from '../utils/dates'
import { isValidTimezone } from '../utils/schedules'

export type UnknownRecord = Record<string, unknown>

export function asRecord(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BackendError('failed-precondition', `Stored ${label} has an invalid shape.`)
  }
  return value as UnknownRecord
}

export function requireStoredString(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && value.trim().length === 0)) {
    throw new BackendError('failed-precondition', `Stored ${label} is invalid.`)
  }
  return value
}

export function requireStoredTimestamp(value: unknown, label: string): Timestamp {
  if (!(value instanceof Timestamp)) throw new BackendError('failed-precondition', `Stored ${label} is not a Firestore timestamp.`)
  return value
}

export function requireStoredDate(value: unknown, label: string) {
  if (!isLocalDate(value)) throw new BackendError('failed-precondition', `Stored ${label} is not a valid local date.`)
  return value
}

export function requireStoredTimezone(value: unknown): string {
  if (typeof value !== 'string' || !isValidTimezone(value)) {
    throw new BackendError('failed-precondition', 'Stored timezone is not a valid IANA timezone.')
  }
  return value
}
