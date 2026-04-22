import axios from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'

const configDir = join(app.getPath('userData'), 'auth')
const cookiePath = join(configDir, 'cookies.json')
if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })

export let cookieJar = new CookieJar()

try {
  if (existsSync(cookiePath)) {
    const data = readFileSync(cookiePath, 'utf8')
    if (data && data.trim()) {
      cookieJar = CookieJar.deserializeSync(JSON.parse(data))
    }
  }
} catch (e) {
  console.warn('[apiClient] Failed to load cookies from disk, starting fresh.', e)
  cookieJar = new CookieJar()
}

export function saveCookies(): void {
  try {
    const serialized = cookieJar.serializeSync()
    writeFileSync(cookiePath, JSON.stringify(serialized), 'utf8')
  } catch (e) {
    console.error('[apiClient] Failed to save cookies:', e)
  }
}

const _rawClient = axios.create({
  baseURL: 'http://localhost:3000',
  withCredentials: true, // cookie gönder / al
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// tough-cookie entegrasyonunu etkinleştir
export const apiClient = wrapper(_rawClient)
apiClient.defaults.jar = cookieJar

/**
 * Cookie jar'ı tamamen temizler (logout veya strict 401/403 sonrası).
 */
export function clearCookies(): void {
  cookieJar = new CookieJar()
  apiClient.defaults.jar = cookieJar
  if (existsSync(cookiePath)) {
    try {
      unlinkSync(cookiePath)
    } catch {
      // ignore
    }
  }
}
