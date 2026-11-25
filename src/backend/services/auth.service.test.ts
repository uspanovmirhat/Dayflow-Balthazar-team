import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  resetPassword: vi.fn(),
  sendVerification: vi.fn(),
  reload: vi.fn(),
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
  sendEmailVerification: mocks.sendVerification,
  reload: mocks.reload,
  onAuthStateChanged: mocks.onAuthStateChanged,
}))
vi.mock('../config/firebase', () => ({ getFirebaseServices: mocks.getFirebaseServices }))
vi.mock('../repositories/user.repository', () => ({ createProfileIfMissing: mocks.createProfileIfMissing }))

import { login, logout, register, requestPasswordReset, resendEmailVerification, subscribeToAuthState } from './auth.service'

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
    mocks.sendVerification.mockResolvedValue(undefined)
    mocks.onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(user)
      return vi.fn()
    })
  })

  it('normalizes registration email and creates the matching user profile', async () => {
    const { user, verificationEmailSent } = await register({ email: '  PERSON@Example.com ', password: 'long-password1', confirmPassword: 'long-password1', displayName: '  Person  ', timezone: 'UTC' })
    expect(user.uid).toBe('u1')
    expect(verificationEmailSent).toBe(true)
    expect(mocks.createUser).toHaveBeenCalledWith({ currentUser: expect.anything() }, 'person@example.com', 'long-password1')
    expect(mocks.updateProfile).toHaveBeenCalledWith(user, { displayName: 'Person' })
    expect(mocks.createProfileIfMissing).toHaveBeenCalledWith(user, 'UTC')
    expect(mocks.sendVerification).toHaveBeenCalledWith(user)
  })

  it('repairs a missing profile after login and signs out through Firebase Auth', async () => {
    const user = await login('PERSON@example.com', 'long-password')
    expect(mocks.signIn).toHaveBeenCalledWith({ currentUser: expect.anything() }, 'person@example.com', 'long-password')
    expect(mocks.createProfileIfMissing).toHaveBeenCalledWith(user, expect.any(String))
    await logout()
    expect(mocks.signOut).toHaveBeenCalled()
  })

  it('rejects invalid registration values before creating an account', async () => {
    await expect(register({ email: 'not-an-email', password: 'short', confirmPassword: 'short', displayName: '' })).rejects.toMatchObject({ code: 'validation' })
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('rejects a password confirmation that does not match', async () => {
    await expect(register({ email: 'person@example.com', password: 'long-password1', confirmPassword: 'long-password2', displayName: 'Person', timezone: 'UTC' }))
      .rejects.toMatchObject({ code: 'validation', message: 'Пароли не совпадают.' })
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it.each(['onlyletters', '12345678', 'short1', ' padded-pass1 '])('rejects the weak password %j', async (password) => {
    await expect(register({ email: 'person@example.com', password, confirmPassword: password, displayName: 'Person', timezone: 'UTC' }))
      .rejects.toMatchObject({ code: 'validation' })
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('keeps the new account when the verification email cannot be sent', async () => {
    mocks.sendVerification.mockRejectedValue(new Error('quota'))
    const result = await register({ email: 'person@example.com', password: 'long-password1', confirmPassword: 'long-password1', displayName: 'Person', timezone: 'UTC' })
    expect(result).toMatchObject({ user: { uid: 'u1' }, verificationEmailSent: false })
  })

  it('translates Firebase Auth errors into readable messages', async () => {
    mocks.createUser.mockRejectedValue({ code: 'auth/email-already-in-use' })
    await expect(register({ email: 'person@example.com', password: 'long-password1', confirmPassword: 'long-password1', displayName: 'Person', timezone: 'UTC' }))
      .rejects.toMatchObject({ code: 'already-exists', message: expect.stringContaining('уже существует') })
    mocks.signIn.mockRejectedValue({ code: 'auth/invalid-credential' })
    await expect(login('person@example.com', 'wrong')).rejects.toMatchObject({ code: 'unauthenticated', message: 'Неверный email или пароль.' })
  })

  it('resends the verification email only for unverified users', async () => {
    await resendEmailVerification()
    expect(mocks.sendVerification).toHaveBeenCalledTimes(1)
    mocks.getFirebaseServices.mockReturnValue({ auth: { currentUser: { uid: 'u1', emailVerified: true } } })
    await expect(resendEmailVerification()).rejects.toMatchObject({ code: 'failed-precondition' })
  })

  it('rejects a valid IANA timezone that Rules do not support', async () => {
    await expect(register({ email: 'person@example.com', password: 'long-password1', confirmPassword: 'long-password1', displayName: 'Person', timezone: 'America/Detroit' }))
      .rejects.toMatchObject({ code: 'validation' })
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
