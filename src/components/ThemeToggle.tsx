import { useState } from "react"
import { applyTheme, getPreferredTheme, saveTheme, type Theme } from "../theme"
import "./ThemeToggle.css"

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2M12 19.5v2M5.28 5.28 6.7 6.7M17.3 17.3l1.42 1.42M2.5 12h2M19.5 12h2M5.28 18.72 6.7 17.3M17.3 6.7l1.42-1.42" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.2 15.1A8.2 8.2 0 0 1 8.9 3.8a8.2 8.2 0 1 0 11.3 11.3Z" />
    </svg>
  )
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const activeTheme = document.documentElement.dataset.theme
    return activeTheme === "dark" || activeTheme === "light" ? activeTheme : getPreferredTheme()
  })

  const isDark = theme === "dark"
  const nextTheme: Theme = isDark ? "light" : "dark"

  const handleToggle = () => {
    applyTheme(nextTheme)
    saveTheme(nextTheme)
    setTheme(nextTheme)
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark mode"
      title={`Switch to ${nextTheme} mode`}
      onClick={handleToggle}
    >
      <span className="theme-toggle__icon theme-toggle__icon--sun" aria-hidden="true"><SunIcon /></span>
      <span className="theme-toggle__icon theme-toggle__icon--moon" aria-hidden="true"><MoonIcon /></span>
      <span className="theme-toggle__label">Dark mode {isDark ? "on" : "off"}</span>
    </button>
  )
}
