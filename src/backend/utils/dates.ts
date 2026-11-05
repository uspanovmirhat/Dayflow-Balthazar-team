import { BackendError } from './errors'
import type { LocalDate } from '../types'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

function utcCalendarDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, monthIndex, day)
  return date
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || year > 9999) return false
  const date = utcCalendarDate(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function assertLocalDate(value: unknown, field = 'date'): asserts value is LocalDate {
  if (!isLocalDate(value)) throw new BackendError('validation', `${field} must be a real date in YYYY-MM-DD format.`)
}

export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format()
  } catch {
    throw new BackendError('validation', 'timezone must be a valid IANA timezone.')
  }
}

export function localDateInTimeZone(date: Date, timeZone: string): LocalDate {
  assertTimeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}` as LocalDate
}

export function dateOrdinal(value: LocalDate): number {
  assertLocalDate(value)
  const [year, month, day] = value.split('-').map(Number)
  return Math.floor(utcCalendarDate(year, month - 1, day).getTime() / DAY_MS)
}

export function addDays(value: LocalDate, amount: number): LocalDate {
  assertLocalDate(value)
  if (!Number.isInteger(amount)) throw new BackendError('validation', 'Day offset must be an integer.')
  const [year, month, day] = value.split('-').map(Number)
  const result = utcCalendarDate(year, month - 1, day + amount)
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}` as LocalDate
}

export function daysBetween(start: LocalDate, end: LocalDate): number {
  return dateOrdinal(end) - dateOrdinal(start)
}

export function enumerateDates(start: LocalDate, end: LocalDate): LocalDate[] {
  assertLocalDate(start, 'startDate')
  assertLocalDate(end, 'endDate')
  if (start > end) throw new BackendError('validation', 'startDate must be on or before endDate.')
  const count = daysBetween(start, end) + 1
  if (count > 36_600) throw new BackendError('validation', 'Date range cannot exceed 100 years.')
  return Array.from({ length: count }, (_, index) => addDays(start, index))
}

export function isoWeekday(value: LocalDate): number {
  const weekday = new Date(dateOrdinal(value) * DAY_MS).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function startOfIsoWeek(value: LocalDate): LocalDate {
  return addDays(value, 1 - isoWeekday(value))
}

export function endOfMonth(value: LocalDate): LocalDate {
  assertLocalDate(value)
  const [year, month] = value.split('-').map(Number)
  const date = utcCalendarDate(year, month, 0)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}` as LocalDate
}
