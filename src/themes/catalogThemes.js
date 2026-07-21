/**
 * Registro de temas del catálogo público.
 * Cada tema define color + forma + tipografía:
 *   - colors (bg, card, accent en swatch + clases Tailwind en classes)
 *   - cardRadius / cardShadow      → forma de las tarjetas
 *   - productNameClass / priceClass → tipografía de nombre y precio
 *   - fontWrapper                   → fuente body global del catálogo
 *
 * Para agregar un tema: copiar la forma de uno existente y ajustar.
 */

export const CATALOG_THEMES = {
  light: {
    id: 'light',
    name: 'Estándar',
    description: 'Limpio y profesional, sirve para cualquier negocio',
    swatch: { bg: '#F9FAFB', card: '#FFFFFF', accent: '#10B981' },
    classes: {
      // Color base
      bg: 'bg-gray-50',
      card: 'bg-white',
      cardShadow: 'bg-white',
      text: 'text-gray-900',
      textMuted: 'text-gray-500',
      textFaint: 'text-gray-600',
      obsText: 'text-gray-700',
      headerBg: 'bg-white',
      catInactive: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      viewActive: 'bg-gray-200',
      viewHover: 'hover:bg-gray-100',
      catBadge: 'bg-white/90 text-gray-600',
      listBadge: 'bg-gray-100 text-gray-500',
      searchBanner: 'bg-white text-gray-900 placeholder-gray-400 border border-gray-200 focus:ring-gray-300',
      searchClassic: 'bg-white text-gray-900 placeholder-gray-400',
      borderColor: '',
      footerPowered: 'text-gray-400',
      footerLink: 'text-gray-600',
      heroFallbackBg: 'bg-gray-50',
      cartBadgeBg: '#000',
      cartBadgeColor: '#fff',
      // Forma + tipografía
      cardRadius: 'rounded-xl',
      cardShadowEffect: 'shadow-sm hover:shadow-md',
      productNameClass: 'font-semibold text-sm',
      priceClass: 'text-base font-bold text-gray-900',
      fontWrapper: 'font-sans',
    },
  },
  boutique: {
    id: 'boutique',
    name: 'Boutique',
    description: 'Elegante con tipografía serif, ideal para moda y productos premium',
    swatch: { bg: '#FFF7F8', card: '#FFFFFF', accent: '#DB2777' },
    classes: {
      // Color base
      bg: 'bg-[#FFF7F8]',
      card: 'bg-white',
      cardShadow: 'bg-white shadow-pink-900/5',
      text: 'text-[#2A0F1C]',
      textMuted: 'text-[#8C5266]',
      textFaint: 'text-[#A37788]',
      obsText: 'text-[#5C2A40]',
      headerBg: 'bg-white shadow-pink-900/5',
      catInactive: 'bg-transparent text-[#8C2A4E] hover:text-[#2A0F1C] border-b-2 border-transparent hover:border-[#F8D2E0]',
      viewActive: 'bg-[#F8D2E0]',
      viewHover: 'hover:bg-[#FCE7F0]',
      catBadge: 'bg-white/90 text-[#8C2A4E]',
      listBadge: 'bg-[#FCE7F0] text-[#8C2A4E]',
      searchBanner: 'bg-white text-[#2A0F1C] placeholder-[#A37788] border border-[#F8D2E0] focus:ring-[#DB2777]/30',
      searchClassic: 'bg-white text-[#2A0F1C] placeholder-[#A37788] border border-[#F8D2E0]',
      borderColor: 'border-[#F8D2E0]',
      footerPowered: 'text-[#A37788] border-[#F8D2E0]',
      footerLink: 'text-[#8C5266]',
      heroFallbackBg: 'bg-[#FFF7F8]',
      cartBadgeBg: '#2A0F1C',
      cartBadgeColor: '#FFFFFF',
      // Forma + tipografía
      cardRadius: 'rounded-2xl',
      cardShadowEffect: 'shadow-md hover:shadow-xl shadow-pink-900/10',
      productNameClass: 'font-serif text-base font-semibold',
      priceClass: 'text-lg font-serif italic font-bold text-[#2A0F1C]',
      fontWrapper: 'font-sans',
    },
  },
  bold: {
    id: 'bold',
    name: 'Bold',
    description: 'Impactante con tipografía display, para marcas urbanas y modernas',
    swatch: { bg: '#0F0F12', card: '#1A1A20', accent: '#F97316' },
    classes: {
      // Color base
      bg: 'bg-[#0F0F12]',
      card: 'bg-[#1A1A20]',
      cardShadow: 'bg-[#1A1A20] shadow-black/40',
      text: 'text-white',
      textMuted: 'text-gray-400',
      textFaint: 'text-gray-500',
      obsText: 'text-gray-300',
      headerBg: 'bg-[#1A1A20] shadow-black/30',
      catInactive: 'bg-[#26262E] text-gray-300 hover:bg-[#34343F] uppercase tracking-wider text-xs font-bold',
      viewActive: 'bg-[#34343F]',
      viewHover: 'hover:bg-[#26262E]',
      catBadge: 'bg-[#1A1A20]/90 text-[#F97316] uppercase tracking-wider',
      listBadge: 'bg-[#26262E] text-gray-300',
      searchBanner: 'bg-[#1A1A20] text-white placeholder-gray-500 border border-[#34343F] focus:ring-[#F97316]/50',
      searchClassic: 'bg-[#1A1A20] text-white placeholder-gray-500 border border-[#34343F]',
      borderColor: 'border-[#26262E]',
      footerPowered: 'text-gray-500 border-[#26262E]',
      footerLink: 'text-gray-400',
      heroFallbackBg: 'bg-[#1A1A20]',
      cartBadgeBg: '#F97316',
      cartBadgeColor: '#0F0F12',
      // Forma + tipografía
      cardRadius: 'rounded-md',
      cardShadowEffect: 'shadow-xl hover:shadow-2xl shadow-black/40',
      productNameClass: 'font-display text-base tracking-wider uppercase',
      priceClass: 'inline-block px-2.5 py-0.5 rounded-full bg-white text-black text-xs font-bold tracking-wide',
      fontWrapper: 'font-sans',
    },
  },
}

/**
 * Devuelve el set de clases del tema indicado.
 * Si el tema no existe (ej. valor antiguo o roto), cae al "light" por seguridad.
 */
export function getCatalogThemeClasses(themeId) {
  return (CATALOG_THEMES[themeId] || CATALOG_THEMES.light).classes
}

/**
 * Color de acento del catálogo (F1.5 del plan de rediseño): ÚNICA fuente del
 * fallback. Antes '#10B981' estaba hardcodeado ~50 veces entre la página, las
 * tarjetas, el modal de producto y el carrito — cambiar el default (o hacerlo
 * configurable por tema en la Fase 3) era intocable.
 */
export const DEFAULT_CATALOG_ACCENT = '#10B981'
export function getCatalogAccent(business) {
  return business?.catalogColor || DEFAULT_CATALOG_ACCENT
}

/**
 * Lista de temas en orden estable.
 */
export function getCatalogThemesList() {
  return Object.values(CATALOG_THEMES)
}
