import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getApps: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  connectAuthEmulator: vi.fn(),
  getFirestore: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  defaultApp: { name: '[DEFAULT]', options: { projectId: 'dayflow-by-balthazar' } },
  otherProjectApp: { name: '[DEFAULT]', options: { projectId: 'different-project' } },
  auth: { name: 'auth' },
  db: { name: 'db' },
}))

vi.mock('firebase/app', () => ({ getApps: mocks.getApps, initializeApp: mocks.initializeApp }))
vi.mock('firebase/auth', () => ({ getAuth: mocks.getAuth, connectAuthEmulator: mocks.connectAuthEmulator }))
vi.mock('firebase/firestore', () => ({ getFirestore: mocks.getFirestore, connectFirestoreEmulator: mocks.connectFirestoreEmulator }))

async function loadFirebaseConfig() {
  return import('./firebase')
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key')
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.example.invalid')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'dayflow-by-balthazar')
  vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test-bucket')
  vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'test-sender')
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app')
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false')
  mocks.getApps.mockReturnValue([])
  mocks.initializeApp.mockReturnValue(mocks.defaultApp)
  mocks.getAuth.mockReturnValue(mocks.auth)
  mocks.getFirestore.mockReturnValue(mocks.db)
})

afterEach(() => vi.unstubAllEnvs())

describe('Firebase client configuration', () => {
  it('initializes the configured project and explicitly selects the default database', async () => {
    const { getFirebaseServices } = await loadFirebaseConfig()

    expect(getFirebaseServices()).toMatchObject({ app: mocks.defaultApp, auth: mocks.auth, db: mocks.db })
    expect(mocks.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'dayflow-by-balthazar' }))
    expect(mocks.getFirestore).toHaveBeenCalledWith(mocks.defaultApp, '(default)')
  })

  it('reuses only the matching default app', async () => {
    mocks.getApps.mockReturnValue([mocks.defaultApp])
    const { getFirebaseServices } = await loadFirebaseConfig()

    getFirebaseServices()
    expect(mocks.initializeApp).not.toHaveBeenCalled()
    expect(mocks.getAuth).toHaveBeenCalledWith(mocks.defaultApp)
    expect(mocks.getFirestore).toHaveBeenCalledWith(mocks.defaultApp, '(default)')
  })

  it('rejects a pre-existing default app for a different project', async () => {
    mocks.getApps.mockReturnValue([mocks.otherProjectApp])
    const { getFirebaseServices } = await loadFirebaseConfig()

    expect(() => getFirebaseServices()).toThrow(/project does not match/)
    expect(mocks.getFirestore).not.toHaveBeenCalled()
  })
})
