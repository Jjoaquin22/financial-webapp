export type Theme = "light" | "dark"

const THEME_STORAGE_KEY = "finaura-theme"

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark"
}

export function getPreferredTheme(): Theme {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(savedTheme)) return savedTheme
  } catch {
    // A browser can disable local storage; the system preference is still usable.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The active theme still works for this session when storage is unavailable.
  }
}
