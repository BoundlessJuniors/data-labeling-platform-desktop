import { ipcMain } from 'electron'
import { apiClient, clearCookies } from './apiClient'

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
        return response.data.data.user
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Login failed'
        const status = (err as { response?: { status?: number } }).response?.status ?? 0
        throw Object.assign(new Error(message), { status })
      }
    }
  )

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
