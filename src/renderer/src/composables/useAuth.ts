import { ref, computed, type ComputedRef, type Ref } from 'vue'

// -----------------------------------------------------------------------
// Module-scope singleton state
// Tüm bileşenler aynı instance'ı paylaşır — Pinia gerektirmez.
// -----------------------------------------------------------------------
const user = ref<{
  id: string
  email: string
  role: string
  [key: string]: unknown
} | null>(null)

const isLoading = ref(false)
const error = ref<string | null>(null)

// -----------------------------------------------------------------------
// Composable
// -----------------------------------------------------------------------
export function useAuth(): {
  user: Ref<{ id: string; email: string; role: string; [key: string]: unknown } | null>
  isLoading: Ref<boolean>
  error: Ref<string | null>
  isAuthenticated: ComputedRef<boolean>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  bootstrapSession: () => Promise<void>
} {
  const isAuthenticated = computed(() => user.value !== null)

  /**
   * Web API'ye login isteği atar (Main Process üzerinden).
   * Başarılıysa user state'ini doldurur.
   */
  const login = async (email: string, password: string): Promise<void> => {
    isLoading.value = true
    error.value = null
    try {
      const profile = await window.api.auth.login({ email, password })
      user.value = profile
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Giriş başarısız. Lütfen tekrar deneyin.'
      error.value = msg
      throw err // Çağıran bileşen de yakalayabilsin
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Web API'ye logout isteği atar ve tüm state'leri sıfırlar.
   */
  const logout = async (): Promise<void> => {
    isLoading.value = true
    try {
      await window.api.auth.logout()
    } finally {
      user.value = null
      error.value = null
      isLoading.value = false
    }
  }

  /**
   * Hata mesajını manuel olarak temizler.
   */
  const clearError = (): void => {
    error.value = null
  }

  /**
   * Session'u diske/cookie'ye güvenerek initialize eder.
   */
  const bootstrapSession = async (): Promise<void> => {
    isLoading.value = true
    error.value = null
    try {
      const profile = await window.api.auth.bootstrapSession()
      if (profile) {
        user.value = profile
      } else {
        user.value = null
      }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Session could not be verified'
    } finally {
      isLoading.value = false
    }
  }

  return {
    // State (readonly expose)
    user,
    isLoading,
    error,
    // Computed
    isAuthenticated,
    // Actions
    login,
    logout,
    clearError,
    bootstrapSession
  }
}
