import { createContext, useContext, useMemo } from 'react'
import { getCatalogTheme, getCatalogAccent } from '@/themes/catalogThemes'

/**
 * Provider de tema del catálogo — Fase 1 del port del patrón shopifree-v2.
 *
 * Hasta ahora el tema viajaba como ~26 clases Tailwind (ctx.th) que el
 * storefront interpola en los className. Eso obliga a que todos los temas
 * compartan el MISMO esqueleto: solo cambia la pintura. El patrón shopifree
 * usa TOKENS DE VALORES CSS (hex, rem, sombras, familias) que cada pieza
 * compartida lee por contexto — así un tema puede tener esquinas 0 y otro
 * 1.5rem sin que la pieza sepa de temas.
 *
 * Fase 1 (esta): tokens definidos en catalogThemes.js + este provider +
 * variables CSS --ct-* en la raíz del storefront. Nada las consume todavía:
 * el render es píxel-idéntico. Las fases siguientes (header/hero por tema,
 * tarjetas, drawers) migran pieza por pieza de clases a tokens.
 *
 * FUENTES DE VERDAD, sin duplicar:
 *   - el tema completo sale de getCatalogTheme (mismo registro de siempre)
 *   - el acento sale de getCatalogAccent (el color del negocio pisa al tema)
 *   - primary de los tokens SIEMPRE es el acento resuelto: los tokens del
 *     registro no traen primary para que nadie lo lea sin pasar por aquí.
 */
const CatalogThemeContext = createContext(null)

/** Escala de radios por defecto (la del tema light). */
const RADIUS_DEFAULT = { sm: '0.5rem', md: '0.75rem', lg: '0.75rem', xl: '1rem', full: '9999px' }
const SHADOWS_DEFAULT = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
}
/** La fuente del bundle (index.html) — fallback cuando el tema no define familia. */
const FONT_BUNDLE = "'Plus Jakarta Sans', Inter, system-ui, sans-serif"

/**
 * Resuelve los tokens finales de un tema + negocio: mezcla los tokens del
 * registro con los defaults y monta el acento como primary. Pura, exportada
 * para poder construir las variables CSS ANTES del provider (la raíz del
 * storefront las necesita en su propio style).
 */
export function resolveCatalogTokens(themeFull, accent) {
  const t = themeFull?.tokens || {}
  const colors = t.colors || {}
  const fonts = themeFull?.fonts || {}
  return {
    colors: {
      background: colors.background || '#F9FAFB',
      surface: colors.surface || '#FFFFFF',
      surfaceHover: colors.surfaceHover || '#F3F4F6',
      text: colors.text || '#111827',
      textMuted: colors.textMuted || '#6B7280',
      textInverted: colors.textInverted || '#FFFFFF',
      border: colors.border || '#E5E7EB',
      badge: colors.badge || '#FFFFFF',
      badgeText: colors.badgeText || '#4B5563',
      primary: accent,
    },
    radius: { ...RADIUS_DEFAULT, ...(t.radius || {}) },
    shadows: { ...SHADOWS_DEFAULT, ...(t.shadows || {}) },
    fonts: {
      heading: fonts.heading || FONT_BUNDLE,
      body: fonts.body || FONT_BUNDLE,
    },
    effects: {
      darkMode: false,
      headerBlur: false,
      ...(t.effects || {}),
    },
  }
}

/**
 * Tokens → variables CSS --ct-*. Se ponen en el style de la raíz del
 * storefront: son inertes hasta que una pieza las use (var(--ct-surface),
 * bg-[var(--ct-bg)], etc.), por eso la Fase 1 no cambia ni un píxel.
 */
export function buildCatalogCssVars(themeFull, accent) {
  const tk = resolveCatalogTokens(themeFull, accent)
  return {
    '--ct-bg': tk.colors.background,
    '--ct-surface': tk.colors.surface,
    '--ct-surface-hover': tk.colors.surfaceHover,
    '--ct-text': tk.colors.text,
    '--ct-text-muted': tk.colors.textMuted,
    '--ct-text-inverted': tk.colors.textInverted,
    '--ct-border': tk.colors.border,
    '--ct-badge': tk.colors.badge,
    '--ct-badge-text': tk.colors.badgeText,
    '--ct-accent': tk.colors.primary,
    '--ct-radius-sm': tk.radius.sm,
    '--ct-radius-md': tk.radius.md,
    '--ct-radius-lg': tk.radius.lg,
    '--ct-radius-xl': tk.radius.xl,
    '--ct-radius-full': tk.radius.full,
    '--ct-shadow-sm': tk.shadows.sm,
    '--ct-shadow-md': tk.shadows.md,
    '--ct-shadow-lg': tk.shadows.lg,
    '--ct-font-heading': tk.fonts.heading,
    '--ct-font-body': tk.fonts.body,
  }
}

/**
 * @param business   doc del negocio (para el acento personalizado)
 * @param themeId    id efectivo del tema (incluye el override ?previewTheme=)
 */
export function CatalogThemeProvider({ business, themeId, children }) {
  const value = useMemo(() => {
    const theme = getCatalogTheme(themeId)
    const accent = getCatalogAccent(business, themeId)
    return {
      themeId: theme.id,
      theme,
      classes: theme.classes || {},
      layout: theme.layout || {},
      fonts: theme.fonts || {},
      accent,
      tokens: resolveCatalogTokens(theme, accent),
    }
  }, [business, themeId])
  return (
    <CatalogThemeContext.Provider value={value}>
      {children}
    </CatalogThemeContext.Provider>
  )
}

export function useCatalogTheme() {
  const ctx = useContext(CatalogThemeContext)
  if (!ctx) {
    throw new Error('useCatalogTheme debe usarse dentro de <CatalogThemeProvider>')
  }
  return ctx
}
