import { safeStorage, app } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs'

const tokenDir = join(app.getPath('userData'), 'auth')
const tokenFile = join(tokenDir, 'token.enc')

// We also keep it in memory during runtime
let memoryToken: string | null = null

function ensureDir(): void {
  if (!existsSync(tokenDir)) {
    mkdirSync(tokenDir, { recursive: true })
  }
}

export function saveToken(token: string): void {
  memoryToken = token
  ensureDir()

  if (safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(token)
      writeFileSync(tokenFile, encrypted)
    } catch (err) {
      console.error('[TokenStore] Failed to encrypt token using safeStorage', err)
    }
  } else {
    if (!app.isPackaged) {
      console.warn(
        '[TokenStore] WARNING: safeStorage unavailable. Using plaintext fallback in development.'
      )
      writeFileSync(tokenFile, token, 'utf8')
    } else {
      console.warn(
        '[TokenStore] safeStorage unavailable in production. Token will NOT be persisted to disk.'
      )
    }
  }
}

export function getToken(): string | null {
  if (memoryToken) return memoryToken

  if (!existsSync(tokenFile)) return null

  try {
    const data = readFileSync(tokenFile)

    if (safeStorage.isEncryptionAvailable()) {
      memoryToken = safeStorage.decryptString(data)
    } else {
      if (!app.isPackaged) {
        memoryToken = data.toString('utf8')
      } else {
        // In production, if we can't encrypt, we shouldn't have written it,
        // but if it's there, we shouldn't trust it / can't decrypt it securely
        console.warn(
          '[TokenStore] Found token file but safeStorage is unavailable in production. Ignoring.'
        )
        memoryToken = null
      }
    }
  } catch (err) {
    console.error('[TokenStore] Failed to read or decrypt token', err)
    memoryToken = null
  }

  return memoryToken
}

export function clearToken(): void {
  memoryToken = null
  if (existsSync(tokenFile)) {
    try {
      unlinkSync(tokenFile)
    } catch (err) {
      console.error('[TokenStore] Failed to delete token file', err)
    }
  }
}
