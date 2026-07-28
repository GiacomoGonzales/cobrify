/**
 * Registro de temas del catálogo público (Fase 3 del rediseño).
 *
 * Arquitectura (adaptada de shopifree-v2): el catálogo es UN solo storefront
 * (CatalogoPublico + componentes de src/components/catalog/) y cada tema es un
 * SET DE TOKENS — no un componente. Así toda la lógica de negocio (variantes,
 * modificadores, stock, multi-divisa, pedidos, mesas) se escribe una sola vez.
 *
 * Cada tema define:
 *   - metadata: id, name, description, category ('general'|'retail'|'restaurant'),
 *     isNew (badge "Nuevo" en la galería de Settings)
 *   - swatch: colores para la mini-preview de la galería
 *   - accent: color de acento POR DEFECTO del tema (botones, precios destacados,
 *     categoría activa). El negocio puede pisarlo eligiendo un color propio en
 *     Settings (catalogColor ≠ verde default) — ver getCatalogAccent.
 *   - classes: mapa de clases Tailwind que consume el storefront (~26 llaves).
 *
 * Para agregar un tema: copiar la forma de uno existente y ajustar tokens.
 */

export const CATALOG_THEMES = {
  light: {
    id: 'light',
    name: 'Estándar',
    description: 'Limpio y profesional, sirve para cualquier negocio',
    category: 'general',
    isNew: false,
    swatch: { bg: '#F9FAFB', card: '#FFFFFF', accent: '#10B981' },
    accent: '#10B981',
    // Motor v2 (A3): fuentes por tema (googleFontsUrl se inyecta como <link>;
    // heading/body son font-family CSS). null = usar las fuentes del bundle.
    fonts: { heading: null, body: null, googleFontsUrl: null },
    // Variantes de layout por sección. grid null = respeta la config del negocio.
    // categories: 'pills' | 'underline'. card: 'classic' | 'overlay'.
    layout: { hero: 'classic', categories: 'pills', grid: null, card: 'classic' },
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
      // Detalle (drawer): misma familia que la tarjeta
      detailNameClass: 'text-2xl font-bold text-gray-900',
      detailPriceClass: 'text-3xl font-bold text-gray-900',
      fontWrapper: 'font-sans',
    },
  },



  boutique: {
    id: 'boutique',
    name: 'Boutique',
    description: 'Elegante con tipografía serif, ideal para moda y productos premium',
    category: 'retail',
    isNew: false,
    swatch: { bg: '#FFF7F8', card: '#FFFFFF', accent: '#DB2777' },
    accent: '#DB2777',
    // Motor v2 (A3): fuentes por tema (googleFontsUrl se inyecta como <link>;
    // heading/body son font-family CSS). null = usar las fuentes del bundle.
    fonts: { heading: null, body: null, googleFontsUrl: null },
    // Variantes de layout por sección. grid null = respeta la config del negocio.
    // categories: 'pills' | 'underline'. card: 'classic' | 'overlay'.
    layout: { hero: 'classic', categories: 'pills', grid: null, card: 'classic' },
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
      detailNameClass: 'font-serif text-2xl font-semibold text-[#2A0F1C]',
      detailPriceClass: 'font-serif italic text-3xl font-bold text-[#2A0F1C]',
      fontWrapper: 'font-sans',
    },
  },



  bold: {
    id: 'bold',
    name: 'Bold',
    description: 'Impactante con tipografía display, para marcas urbanas y modernas',
    category: 'retail',
    isNew: false,
    swatch: { bg: '#0F0F12', card: '#1A1A20', accent: '#F97316' },
    accent: '#F97316',
    // Motor v2 (A3): fuentes por tema (googleFontsUrl se inyecta como <link>;
    // heading/body son font-family CSS). null = usar las fuentes del bundle.
    fonts: { heading: null, body: null, googleFontsUrl: null },
    // Variantes de layout por sección. grid null = respeta la config del negocio.
    // categories: 'pills' | 'underline'. card: 'classic' | 'overlay'.
    layout: { hero: 'classic', categories: 'pills', grid: null, card: 'classic' },
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
      detailNameClass: 'font-display text-2xl tracking-wider uppercase text-gray-900',
      detailPriceClass: 'text-3xl font-bold text-gray-900',
      fontWrapper: 'font-sans',
    },
  },

  // ===== Temas insignia (Ola B del rediseño): cada uno usa el motor v2 =====
  // (fuentes Google propias + variantes de layout, no solo colores)

  galeria: {
    id: 'galeria',
    name: 'Galería',
    description: 'Estilo revista: papel, tipografía editorial y grilla con portada. Moda, librerías y deco',
    category: 'retail',
    isNew: true,
    swatch: { bg: '#FAFAF7', card: '#FFFFFF', accent: '#C8102E' },
    accent: '#C8102E',
    fonts: {
      // Fraunces solo para títulos/nombres de producto; el cuerpo usa la del bundle
      heading: "'Fraunces', Georgia, serif",
      body: null,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap',
    },
    layout: { hero: 'classic', categories: 'underline', grid: 'magazine', card: 'classic' },
    classes: {
      bg: 'bg-[#FAFAF7]',
      card: 'bg-white',
      cardShadow: 'bg-white',
      text: 'text-[#0A0A0A]',
      textMuted: 'text-[#5C5C5C]',
      textFaint: 'text-[#8A8A8A]',
      obsText: 'text-[#333333]',
      headerBg: 'bg-[#FAFAF7] border-b-2 border-[#0A0A0A]',
      catInactive: 'bg-transparent text-[#5C5C5C] border border-[#0A0A0A]/20 hover:border-[#0A0A0A] hover:text-[#0A0A0A]',
      viewActive: 'bg-[#0A0A0A]/10',
      viewHover: 'hover:bg-[#F2F2EC]',
      catBadge: 'bg-white/95 text-[#0A0A0A] uppercase tracking-wider',
      listBadge: 'bg-[#F2F2EC] text-[#5C5C5C]',
      searchBanner: 'bg-white text-[#0A0A0A] placeholder-[#8A8A8A] border border-[#0A0A0A]/30 focus:ring-[#0A0A0A]/20',
      searchClassic: 'bg-white text-[#0A0A0A] placeholder-[#8A8A8A] border border-[#0A0A0A]/30',
      borderColor: 'border-[#0A0A0A]/15',
      footerPowered: 'text-[#8A8A8A] border-[#0A0A0A]/15',
      footerLink: 'text-[#5C5C5C]',
      heroFallbackBg: 'bg-[#FAFAF7]',
      cartBadgeBg: '#C8102E',
      cartBadgeColor: '#FFFFFF',
      // Tarjetas "enmarcadas": sin sombra, borde fino que se afirma al hover
      cardRadius: 'rounded-none',
      cardShadowEffect: 'border border-[#0A0A0A]/15 hover:border-[#0A0A0A]',
      productNameClass: 'catalog-heading text-base font-semibold',
      priceClass: 'text-base font-bold text-[#0A0A0A]',
      detailNameClass: 'catalog-heading text-2xl font-semibold text-[#0A0A0A]',
      detailPriceClass: 'text-3xl font-bold text-[#0A0A0A]',
      fontWrapper: 'font-sans',
    },
  },

  nocturno: {
    id: 'nocturno',
    name: 'Nocturno',
    description: 'Oscuro profundo con brillos cian y tarjetas de imagen completa. Tecnología y marcas premium',
    category: 'retail',
    isNew: true,
    swatch: { bg: '#0B0D1A', card: '#131628', accent: '#22D3EE' },
    accent: '#22D3EE',
    fonts: {
      heading: "'Space Grotesk', system-ui, sans-serif",
      body: "'Space Grotesk', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap',
    },
    layout: { hero: 'classic', categories: 'pills', grid: null, card: 'overlay' },
    classes: {
      bg: 'bg-[#0B0D1A]',
      card: 'bg-[#131628]',
      cardShadow: 'bg-[#131628]',
      text: 'text-[#E8E4F0]',
      textMuted: 'text-[#8B85A8]',
      textFaint: 'text-[#6B6488]',
      obsText: 'text-[#C4BFDA]',
      headerBg: 'bg-[#0B0D1A]/95 border-b border-white/10',
      catInactive: 'bg-[#131628] text-[#8B85A8] border border-white/10 hover:border-[#22D3EE]/50 hover:text-white',
      viewActive: 'bg-[#22D3EE]/15',
      viewHover: 'hover:bg-[#131628]',
      catBadge: 'bg-[#0B0D1A]/90 text-[#22D3EE]',
      listBadge: 'bg-[#1A1E38] text-[#8B85A8]',
      searchBanner: 'bg-[#131628] text-white placeholder-[#6B6488] border border-white/10 focus:ring-[#22D3EE]/40',
      searchClassic: 'bg-[#131628] text-white placeholder-[#6B6488] border border-white/10',
      borderColor: 'border-white/10',
      footerPowered: 'text-[#6B6488] border-white/10',
      footerLink: 'text-[#8B85A8]',
      heroFallbackBg: 'bg-[#0B0D1A]',
      cartBadgeBg: '#22D3EE',
      cartBadgeColor: '#0B0D1A',
      cardRadius: 'rounded-2xl',
      cardShadowEffect: 'shadow-[0_0_24px_rgba(124,58,237,0.12)] hover:shadow-[0_0_36px_rgba(34,211,238,0.25)]',
      productNameClass: 'text-sm font-semibold',
      priceClass: 'text-base font-bold text-[#22D3EE]',
      detailNameClass: 'text-2xl font-bold text-gray-900',
      detailPriceClass: 'text-3xl font-bold text-gray-900',
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
 * Tema completo (metadata + fonts + layout + classes) con fallback a "light".
 * Para leer las variantes de layout y fuentes del motor v2.
 */
export function getCatalogTheme(themeId) {
  return CATALOG_THEMES[themeId] || CATALOG_THEMES.light
}

/**
 * Color de acento del catálogo. Prioridad:
 *   1. Color personalizado del negocio (catalogColor), SI lo cambió del verde
 *      default. El picker de Settings guarda '#10B981' aunque el usuario nunca
 *      lo toque, así que el verde default se trata como "sin personalizar".
 *   2. Acento propio del tema elegido (Fase 3: cada tema define el suyo).
 *   3. Verde histórico (compatibilidad).
 */
export const DEFAULT_CATALOG_ACCENT = '#10B981'
export function getCatalogAccent(business, themeIdOverride) {
  const custom = business?.catalogColor
  if (custom && custom.toLowerCase() !== DEFAULT_CATALOG_ACCENT.toLowerCase()) {
    return custom
  }
  const theme = CATALOG_THEMES[themeIdOverride || business?.catalogTheme]
  return theme?.accent || custom || DEFAULT_CATALOG_ACCENT
}

/**
 * Lista de temas en orden estable (el orden de declaración es el de la galería).
 */
export function getCatalogThemesList() {
  return Object.values(CATALOG_THEMES)
}
