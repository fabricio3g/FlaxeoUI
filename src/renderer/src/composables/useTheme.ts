import { readonly, ref } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'

const themePreference = ref<ThemePreference>('dark')
const isDark = ref(true)
let initialized = false
let systemTheme: MediaQueryList | null = null

function savedPreference(): ThemePreference {
  const saved = localStorage.getItem('flaxeo-theme')
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark'
}

function applyTheme(): void {
  const dark =
    themePreference.value === 'system'
      ? (systemTheme?.matches ?? false)
      : themePreference.value === 'dark'

  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
}

function handleSystemThemeChange(): void {
  if (themePreference.value === 'system') applyTheme()
}

export function initializeTheme(): void {
  if (!initialized) {
    themePreference.value = savedPreference()
    systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    systemTheme.addEventListener('change', handleSystemThemeChange)
    initialized = true
  }

  applyTheme()
}

export function useTheme() {
  initializeTheme()

  function setTheme(preference: ThemePreference): void {
    themePreference.value = preference
    localStorage.setItem('flaxeo-theme', preference)
    applyTheme()
  }

  function toggleTheme(): void {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return {
    themePreference: readonly(themePreference),
    isDark: readonly(isDark),
    setTheme,
    toggleTheme
  }
}
