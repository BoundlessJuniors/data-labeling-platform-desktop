import { ipcMain } from 'electron'
import { apiClient, clearCookies, saveCookies } from './apiClient'

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
          data: { user: UserProfile }
        }>('/api/v1/auth/login', credentials)
        // Web API'nin döndürdüğü kullanıcı profilini Renderer'a ilet.
        // httpOnly cookie apiClient tarafından otomatik saklanmış durumda.
        saveCookies()
        return response.data.data.user
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Login failed'
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
      const response = await apiClient.get<{
        success: boolean
        data: UserProfile
      }>('/api/v1/auth/profile')
      saveCookies() // Eğer geçerliyse diske sakla (refresh durumlarına karşı)
      return response.data.data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status
      // Yalnızca kesin auth geçersizliği durumlarında çerezi sil (örn. 401, 403)
      if (status === 401 || status === 403) {
        clearCookies()
        return null
      }
      // Timeout veya network exception gibi 401/403 dışı hatalarda state'i silmeyiz.
      // throw ediyoruz ki renderer bunun network sorunu olduğunu algılayabilsin.
      const message = err instanceof Error ? err.message : 'Session could not be verified'
      throw Object.assign(new Error(message), { status: status ?? 0 })
    }
  })

  // -----------------------------------------------------------------------
  // auth:logout
  // -----------------------------------------------------------------------
  ipcMain.handle('auth:logout', async (): Promise<void> => {
    try {
      await apiClient.post('/api/v1/auth/logout')
    } catch {
      // Sunucu erişilemez olsa dahi local cookie'leri temizle
    } finally {
      clearCookies()
    }
  })
}
