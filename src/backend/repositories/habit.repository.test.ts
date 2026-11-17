import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  collectionGroup: vi.fn(() => ({ kind: 'collection-group', id: 'settingsHistory' })),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((source: unknown, ...filters: unknown[]) => ({ source, filters })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  where: vi.fn((...args: unknown[]) => ({ where: args })),
  writeBatch: vi.fn(),
  parseHabitSettings: vi.fn(() => ({ id: '1', habitId: 'habit-1' })),
}))

vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  collectionGroup: mocks.collectionGroup,
  deleteDoc: mocks.deleteDoc,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  query: mocks.query,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
  where: mocks.where,
  writeBatch: mocks.writeBatch,
}))
vi.mock('../config/firebase', () => ({ getFirebaseServices: () => ({ db: 'db' }) }))
vi.mock('../schemas/habit.schema', () => ({ parseHabitSettings: mocks.parseHabitSettings }))

import { readHabitSettingsHistory } from './habit.repository'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getDocs.mockResolvedValue({ docs: [{
    id: '1',
    ref: { parent: { parent: { id: 'habit-1' } } },
    data: () => ({ id: '1', userId: 'user-1' }),
  }] })
})

describe('habit settings history collection-group query', () => {
  it('queries only by userId when no effective date is requested', async () => {
    await readHabitSettingsHistory('user-1')

    expect(mocks.collectionGroup).toHaveBeenCalledWith('db', 'settingsHistory')
    expect(mocks.where).toHaveBeenCalledTimes(1)
    expect(mocks.where).toHaveBeenCalledWith('userId', '==', 'user-1')
    expect(mocks.query).toHaveBeenCalledWith(
      { kind: 'collection-group', id: 'settingsHistory' },
      { where: ['userId', '==', 'user-1'] },
    )
  })

  it('adds effectiveFrom only when a through-date is supplied', async () => {
    await readHabitSettingsHistory('user-1', '2026-11-17')

    expect(mocks.where).toHaveBeenNthCalledWith(1, 'userId', '==', 'user-1')
    expect(mocks.where).toHaveBeenNthCalledWith(2, 'effectiveFrom', '<=', '2026-11-17')
  })
})
