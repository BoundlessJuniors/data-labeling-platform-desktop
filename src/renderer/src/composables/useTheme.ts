import { onMounted } from 'vue'
const THEME_KEY = 'labelgun_theme' as const
type ThemeMode = 'light' | 'dark'

export function useTheme(): {
  applyTheme: (mode: ThemeMode) => void
  setStoredTheme: (mode: ThemeMode) => void
} {
  const applyTheme = (mode: ThemeMode): void => {
    document.documentElement.classList.toggle('dark', mode === 'dark')
  }

  const getStoredTheme = (): ThemeMode | null => {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'dark' || v === 'light' ? (v as ThemeMode) : null
  }

  const setStoredTheme = (mode: ThemeMode): void => localStorage.setItem(THEME_KEY, mode)

  const getSystemTheme = (): ThemeMode =>
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'

  const initTheme = (): void => {
    const stored = getStoredTheme()
    applyTheme(stored ?? getSystemTheme())

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent): void => {
      if (!getStoredTheme()) applyTheme(e.matches ? 'dark' : 'light')
    }
    mql.addEventListener('change', onChange)
  }

  onMounted(initTheme)
  return { applyTheme, setStoredTheme }
}
