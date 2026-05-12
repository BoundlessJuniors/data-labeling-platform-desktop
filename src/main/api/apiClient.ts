import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
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

// ---------------------------------------------------------------------------
// CSRF token state
// ---------------------------------------------------------------------------
interface CsrfResponse {
  success: boolean
  data?: {
    csrfToken?: string
  }
}

/** Genişletilmiş config – retry bayrağını taşır */
interface CsrfRetryConfig extends InternalAxiosRequestConfig {
  __csrfRetried?: boolean
}

let csrfToken: string | null = null
let csrfFetchInFlight: Promise<string> | null = null

function isUnsafeMethod(method?: string): boolean {
  return ['post', 'put', 'patch', 'delete'].includes((method ?? 'get').toLowerCase())
}

function isCsrfEndpoint(url?: string): boolean {
  return typeof url === 'string' && url.includes('/api/v1/auth/csrf')
}

async function fetchCsrfToken(): Promise<string> {
  const response = await apiClient.get<CsrfResponse>('/api/v1/auth/csrf')
  const token = response.data.data?.csrfToken
  if (!token) throw new Error('CSRF token response is missing csrfToken')
  csrfToken = token
  saveCookies()
  return token
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  if (!csrfFetchInFlight) {
    csrfFetchInFlight = fetchCsrfToken().finally(() => {
      csrfFetchInFlight = null
    })
  }
  return csrfFetchInFlight
}

// ---------------------------------------------------------------------------
// Request interceptor – unsafe method'lara X-CSRF-Token ekle
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use(async (config) => {
  if (isUnsafeMethod(config.method) && !isCsrfEndpoint(config.url)) {
    const token = await ensureCsrfToken()
    config.headers = AxiosHeaders.from(config.headers)
    config.headers.set('X-CSRF-Token', token)
  }
  return config
})

// ---------------------------------------------------------------------------
// Response interceptor – 403 CSRF validation failed → token refresh + retry
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const axiosError = error as {
      response?: { status?: number; data?: unknown }
      config?: CsrfRetryConfig
    }

    const status = axiosError.response?.status
    const config = axiosError.config

    if (status === 403 && config && !config.__csrfRetried) {
      const body = axiosError.response?.data
      const bodyStr =
        typeof body === 'string' ? body : typeof body === 'object' ? JSON.stringify(body) : ''

      if (bodyStr.toLowerCase().includes('csrf validation failed')) {
        config.__csrfRetried = true
        csrfToken = null
        const retryToken = await ensureCsrfToken()
        config.headers = AxiosHeaders.from(config.headers)
        config.headers.set('X-CSRF-Token', retryToken)
        return apiClient(config)
      }
    }

    return Promise.reject(error)
  }
)

// ---------------------------------------------------------------------------
// clearCookies – jar + CSRF state sıfırla
// ---------------------------------------------------------------------------
/**
 * Cookie jar'ı ve CSRF token state'ini tamamen temizler
 * (logout veya strict 401/403 sonrası).
 */
export function clearCookies(): void {
  cookieJar = new CookieJar()
  apiClient.defaults.jar = cookieJar
  csrfToken = null
  csrfFetchInFlight = null
  if (existsSync(cookiePath)) {
    try {
      unlinkSync(cookiePath)
    } catch {
      // ignore
    }
  }
}
