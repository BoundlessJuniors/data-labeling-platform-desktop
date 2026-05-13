import { safeStorage, app } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs'

const tokenDir = join(app.getPath('userData'), 'auth')
const tokenFile = join(tokenDir, 'token.enc')

export interface DesktopSessionData {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string | Date
  refreshTokenExpiresAt: string | Date
  sessionId: string
}

// We also keep it in memory during runtime
let memorySession: DesktopSessionData | null = null

function ensureDir(): void {
  if (!existsSync(tokenDir)) {
    mkdirSync(tokenDir, { recursive: true })
  }
}

export function saveSession(session: DesktopSessionData): void {
  memorySession = session
  ensureDir()

  const dataString = JSON.stringify(session)

  if (safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(dataString)
      writeFileSync(tokenFile, encrypted)
    } catch (err) {
      console.error('[TokenStore] Failed to encrypt session using safeStorage', err)
    }
  } else {
    if (!app.isPackaged) {
      console.warn(
        '[TokenStore] WARNING: safeStorage unavailable. Using plaintext fallback in development.'
      )
      writeFileSync(tokenFile, dataString, 'utf8')
    } else {
      console.warn(
        '[TokenStore] safeStorage unavailable in production. Session will NOT be persisted to disk.'
      )
    }
  }
}

export function getSession(): DesktopSessionData | null {
  if (memorySession) return memorySession

  if (!existsSync(tokenFile)) return null

  try {
    const data = readFileSync(tokenFile)
    let decryptedString = ''

    if (safeStorage.isEncryptionAvailable()) {
      decryptedString = safeStorage.decryptString(data)
    } else {
      if (!app.isPackaged) {
        decryptedString = data.toString('utf8')
      } else {
        console.warn(
          '[TokenStore] Found session file but safeStorage is unavailable in production. Ignoring.'
        )
        return null
      }
    }

    if (decryptedString) {
      memorySession = JSON.parse(decryptedString)
    }
  } catch (err) {
    console.error('[TokenStore] Failed to read, decrypt, or parse session', err)
    memorySession = null
  }

  return memorySession
}

export function getAccessToken(): string | null {
  const session = getSession()
  return session ? session.accessToken : null
}

export function getRefreshToken(): string | null {
  const session = getSession()
  return session ? session.refreshToken : null
}

export function clearSession(): void {
  memorySession = null
  if (existsSync(tokenFile)) {
    try {
      unlinkSync(tokenFile)
    } catch (err) {
      console.error('[TokenStore] Failed to delete token file', err)
    }
  }
}

export function updateTokens(newSessionData: Partial<DesktopSessionData>): void {
  const currentSession = getSession()
  if (currentSession) {
    saveSession({ ...currentSession, ...newSessionData } as DesktopSessionData)
  }
}
