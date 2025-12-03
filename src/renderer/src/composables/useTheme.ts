import { onMounted } from 'vue'
const THEME_KEY = 'labelgun_theme' as const
type ThemeMode = 'light' | 'dark'

export function useTheme() {
  const applyTheme = (mode: ThemeMode) =>
    document.documentElement.classList.toggle('dark', mode === 'dark')

  const getStoredTheme = (): ThemeMode | null => {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'dark' || v === 'light' ? (v as ThemeMode) : null
  }

  const setStoredTheme = (mode: ThemeMode) => localStorage.setItem(THEME_KEY, mode)

  const getSystemTheme = (): ThemeMode =>
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'

  const initTheme = () => {
    const stored = getStoredTheme()
    applyTheme(stored ?? getSystemTheme())

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      if (!getStoredTheme()) applyTheme(e.matches ? 'dark' : 'light')
    }
    if ('addEventListener' in mql) mql.addEventListener('change', onChange)
    else (mql as any).addListener?.(onChange)
  }

  onMounted(initTheme)
  return { applyTheme, setStoredTheme }
}
