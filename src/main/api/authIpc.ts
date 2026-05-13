import { ipcMain } from 'electron'
import { apiClient } from './apiClient'
import { saveSession, clearSession, getAccessToken, getRefreshToken } from './tokenStore'

/**
 * Backend response body'sinden okunabilir hata mesajı çıkarır.
 * `any` kullanmadan tip-güvenli şekilde çalışır.
 */
function getApiErrorMessage(err: unknown, fallback: string): string {
  const maybe = err as { response?: { data?: unknown }; message?: string }
  const data = maybe.response?.data
  if (typeof data === 'object' && data !== null) {
    const obj = data as { error?: { message?: string }; message?: string }
    return obj.error?.message ?? obj.message ?? maybe.message ?? fallback
  }
  return maybe.message ?? fallback
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface UserProfile {
  id: string
  email: string
  role: string
  [key: string]: unknown
}

/**
 * Tüm auth IPC handler'larını kayıt eder.
 * src/main/index.ts içinde app.whenReady() içinde bir kez çağrılmalıdır.
 */
export function registerAuthIpc(): void {
  // -----------------------------------------------------------------------
  // auth:login
  // -----------------------------------------------------------------------
  ipcMain.handle(
    'auth:login',
    async (_event, credentials: LoginCredentials): Promise<UserProfile> => {
      try {
        const response = await apiClient.post<{
          success: boolean
          data: {
            user: UserProfile
            accessToken: string
            refreshToken: string
            accessTokenExpiresAt: string
            refreshTokenExpiresAt: string
            sessionId: string
          }
        }>('/api/v1/desktop/auth/login', credentials)

        const session = response.data.data
        saveSession(session)
        return session.user
      } catch (err: unknown) {
        const message = getApiErrorMessage(err, 'Login failed')
        const status = (err as { response?: { status?: number } }).response?.status ?? 0
        throw Object.assign(new Error(message), { status })
      }
    }
  )

  // -----------------------------------------------------------------------
  // auth:bootstrapSession
  // -----------------------------------------------------------------------
  ipcMain.handle('auth:bootstrapSession', async (): Promise<UserProfile | null> => {
    try {
      const hasAnyToken = getAccessToken() || getRefreshToken()
      if (!hasAnyToken) return null

      const response = await apiClient.get<{
        success: boolean
        data: UserProfile
      }>('/api/v1/desktop/auth/profile')

      return response.data.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status
      // Yalnızca kesin auth geçersizliği durumlarında token'ı sil (örn. 401, 403)
      if (status === 401 || status === 403) {
        clearSession()
        return null
      }
      // Timeout veya network exception gibi 401/403 dışı hatalarda state'i silmeyiz.
      const message = err instanceof Error ? err.message : 'Session could not be verified'
      throw Object.assign(new Error(message), { status: status ?? 0 })
    }
  })

  // -----------------------------------------------------------------------
  // auth:logout
  // -----------------------------------------------------------------------
  ipcMain.handle('auth:logout', async (): Promise<void> => {
    try {
      await apiClient.post('/api/v1/desktop/auth/logout')
    } catch {
      // Sunucu erişilemez olsa dahi local token'ı temizle
    } finally {
      clearSession()
    }
  })
}
