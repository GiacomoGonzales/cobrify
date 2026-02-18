import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { THEMES } from '@/config/themes'

const ThemeContext = createContext({
  theme: THEMES.default,
  themeId: 'default',
  setThemeId: () => {},
})

export function ThemeProvider({ children }) {
  const { businessSettings } = useAppContext()
  const [themeId, setThemeId] = useState('default')

  // Cargar tema guardado en businessSettings
  useEffect(() => {
    if (businessSettings?.uiTheme && THEMES[businessSettings.uiTheme]) {
      setThemeId(businessSettings.uiTheme)
    }
  }, [businessSettings?.uiTheme])

  const theme = useMemo(() => THEMES[themeId] || THEMES.default, [themeId])

  // Aplicar CSS variables y data-theme en el <html>
  useEffect(() => {
    const root = document.documentElement

    // data-theme para los overrides CSS de temas oscuros
    root.setAttribute('data-theme', themeId)

    // CSS custom properties
    root.style.setProperty('--theme-sidebar-bg', theme.sidebarBg)
    root.style.setProperty('--theme-sidebar-border', theme.sidebarBorder)
    root.style.setProperty('--theme-sidebar-text', theme.sidebarText)
    root.style.setProperty('--theme-navbar-bg', theme.navbarBg)
    root.style.setProperty('--theme-navbar-border', theme.navbarBorder)
    root.style.setProperty('--theme-navbar-text', theme.navbarText)
    root.style.setProperty('--theme-content-bg', theme.contentBg)
    root.style.setProperty('--theme-card-bg', theme.cardBg)
    root.style.setProperty('--theme-card-border', theme.cardBorder)
    root.style.setProperty('--theme-table-header-bg', theme.tableHeaderBg)
    root.style.setProperty('--theme-table-row-hover-bg', theme.tableRowHoverBg)
    root.style.setProperty('--theme-table-border', theme.tableBorder)
    root.style.setProperty('--theme-text-primary', theme.textPrimary)
    root.style.setProperty('--theme-text-secondary', theme.textSecondary)
    root.style.setProperty('--theme-text-muted', theme.textMuted)
    root.style.setProperty('--theme-input-bg', theme.inputBg)
    root.style.setProperty('--theme-input-border', theme.inputBorder)
    root.style.setProperty('--theme-input-text', theme.inputText)
    root.style.setProperty('--theme-modal-bg', theme.modalBg)
    root.style.setProperty('--theme-modal-border', theme.modalBorder)
    root.style.setProperty('--theme-scrollbar-thumb', theme.scrollbarThumb)
    root.style.setProperty('--theme-sidebar-hover-bg', theme.sidebarHoverBg)
  }, [theme, themeId])

  const value = useMemo(() => ({
    theme,
    themeId,
    setThemeId,
  }), [theme, themeId])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export default ThemeContext
