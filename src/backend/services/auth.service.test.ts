import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  resetPassword: vi.fn(),
  onAuthStateChanged: vi.fn(),
  getFirebaseServices: vi.fn(),
  createProfileIfMissing: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mocks.createUser,
  signInWithEmailAndPassword: mocks.signIn,
  signOut: mocks.signOut,
  updateProfile: mocks.updateProfile,
  sendPasswordResetEmail: mocks.resetPassword,
  onAuthStateChanged: mocks.onAuthStateChanged,
}))
vi.mock('../config/firebase', () => ({ getFirebaseServices: mocks.getFirebaseServices }))
vi.mock('../repositories/user.repository', () => ({ createProfileIfMissing: mocks.createProfileIfMissing }))

import { login, logout, register, requestPasswordReset, subscribeToAuthState } from './auth.service'

describe('authentication service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const user = { uid: 'u1', email: 'person@example.com', displayName: 'Person' }
    mocks.getFirebaseServices.mockReturnValue({ auth: { currentUser: user } })
    mocks.createUser.mockResolvedValue({ user })
    mocks.signIn.mockResolvedValue({ user })
    mocks.signOut.mockResolvedValue(undefined)
    mocks.updateProfile.mockResolvedValue(undefined)
    mocks.createProfileIfMissing.mockResolvedValue({ uid: 'u1' })
    mocks.resetPassword.mockResolvedValue(undefined)
    mocks.onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(user)
      return vi.fn()
    })
  })

  it('normalizes registration email and creates the matching user profile', async () => {
    const user = await register({ email: '  PERSON@Example.com ', password: 'long-password', displayName: 'Person', timezone: 'UTC' })
    expect(user.uid).toBe('u1')
    expect(mocks.createUser).toHaveBeenCalledWith({ currentUser: expect.anything() }, 'person@example.com', 'long-password')
    expect(mocks.updateProfile).toHaveBeenCalledWith(user, { displayName: 'Person' })
    expect(mocks.createProfileIfMissing).toHaveBeenCalledWith(user, 'UTC')
  })

  it('repairs a missing profile after login and signs out through Firebase Auth', async () => {
    const user = await login('PERSON@example.com', 'long-password')
    expect(mocks.signIn).toHaveBeenCalledWith({ currentUser: expect.anything() }, 'person@example.com', 'long-password')
    expect(mocks.createProfileIfMissing).toHaveBeenCalledWith(user, expect.any(String))
    await logout()
    expect(mocks.signOut).toHaveBeenCalled()
  })

  it('rejects invalid registration values before creating an account', async () => {
    await expect(register({ email: 'not-an-email', password: 'short', displayName: '' })).rejects.toMatchObject({ code: 'validation' })
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('forwards password reset and auth-state subscriptions', async () => {
    await requestPasswordReset('Person@example.com')
    expect(mocks.resetPassword).toHaveBeenCalledWith({ currentUser: expect.anything() }, 'person@example.com')
    const callback = vi.fn()
    const unsubscribe = subscribeToAuthState(callback)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }))
    expect(typeof unsubscribe).toBe('function')
  })
})
