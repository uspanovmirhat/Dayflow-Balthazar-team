import { BackendError } from './errors'

const HEX_COLOR = /^#[\da-f]{6}$/i

export function isHabitColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

export function validateHabitColor(value: unknown): asserts value is string {
  if (!isHabitColor(value)) throw new BackendError('validation', 'color must be a six-digit HEX color.')
}

export function stableHabitColor(seed: string): string {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const hue = (hash >>> 0) % 360
  return hslToHex(hue, 62, 58)
}

export function randomHabitColor(): string {
  return hslToHex(Math.floor(Math.random() * 360), 68 + Math.floor(Math.random() * 20), 52 + Math.floor(Math.random() * 16))
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100
  const l = lightness / 100
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase()
}
