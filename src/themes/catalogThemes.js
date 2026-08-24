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
 *
 * 23-ago-2026: se recorto el set a 3 temas (censo sobre 679 negocios:
 * light 97, bold 12, boutique 7 tiendas activas; galeria/nocturno/mercado/
 * sabor sumaban 5 y se eliminaron; los fantasma dark/cafe/minimal se
 * migraron a light en Firestore). Un catalogTheme desconocido SIEMPRE
 * cae a light — esa red de seguridad no se toca.
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
    // Tokens de VALORES CSS (Fase 1 del port shopifree): espejo del look
    // actual. primary NO va aqui — siempre es el acento resuelto en runtime.
    tokens: {
      colors: {
        background: '#F9FAFB', surface: '#FFFFFF', surfaceHover: '#F3F4F6',
        text: '#111827', textMuted: '#6B7280', textInverted: '#FFFFFF',
        border: '#E5E7EB', badge: 'rgba(255,255,255,0.9)', badgeText: '#4B5563',
      },
      radius: { sm: '0.5rem', md: '0.75rem', lg: '0.75rem', xl: '1rem', full: '9999px' },
      shadows: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        lg: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
      },
      effects: { darkMode: false, headerBlur: false },
    },
    // Chrome (Fase 2): header y hero del tema. Estilo "minimal" de
    // shopifree: nombre fino, carrito fantasma, portada en tarjeta redondeada
    // sin texto encima y hero tipografico limpio cuando no hay portada.
    chrome: {
      headerName: 'font-medium tracking-tight',
      headerNameAccent: false,
      headerCart: 'ghost',
      headerScrollFx: 'shadow',
      heroCover: 'card',
      heroEmpty: 'clean',
    },
    // Motor v2 (A3): fuentes por tema (googleFontsUrl se inyecta como <link>;
    // heading/body son font-family CSS). null = usar las fuentes del bundle.
    fonts: { heading: null, body: null, googleFontsUrl: null },
    // Variantes de layout por sección. grid null = respeta la config del negocio.
    // categories: 'underline' | 'underline'. card: 'classic' | 'overlay'.
    layout: { hero: 'classic', categories: 'underline', grid: null, card: 'classic' },
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
    // Tokens de VALORES CSS (Fase 1 del port shopifree): espejo del look actual.
    tokens: {
      colors: {
        background: '#FFF7F8', surface: '#FFFFFF', surfaceHover: '#FCE7F0',
        text: '#2A0F1C', textMuted: '#8C5266', textInverted: '#FFFFFF',
        border: '#F8D2E0', badge: 'rgba(255,255,255,0.9)', badgeText: '#8C2A4E',
      },
      radius: { sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem', full: '9999px' },
      shadows: {
        sm: '0 1px 2px 0 rgb(136 19 55 / 0.05)',
        md: '0 4px 6px -1px rgb(136 19 55 / 0.1)',
        lg: '0 20px 25px -5px rgb(136 19 55 / 0.15)',
      },
      effects: { darkMode: false, headerBlur: true },
    },
    // Chrome (Fase 2): serif elegante, carrito en burbuja rosada, portada
    // con velo oscuro suave y nombre serif; sin portada, hero romantico.
    chrome: {
      headerName: 'font-serif tracking-wide font-medium',
      headerNameAccent: false,
      headerCart: 'bubble',
      headerLogoRound: true,
      headerScrollFx: 'shadow',
      heroCover: 'overlay',
      heroEmpty: 'romantic',
    },
    // Motor v2 (A3): fuentes por tema (googleFontsUrl se inyecta como <link>;
    // heading/body son font-family CSS). null = usar las fuentes del bundle.
    fonts: { heading: null, body: null, googleFontsUrl: null },
    // Variantes de layout por sección. grid null = respeta la config del negocio.
    // categories: 'underline' | 'underline'. card: 'classic' | 'overlay'.
    layout: { hero: 'classic', categories: 'underline', grid: null, card: 'classic' },
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
    // Tokens de VALORES CSS (Fase 1 del port shopifree): espejo del look actual.
    tokens: {
      colors: {
        background: '#0F0F12', surface: '#1A1A20', surfaceHover: '#26262E',
        text: '#FFFFFF', textMuted: '#9CA3AF', textInverted: '#0F0F12',
        border: '#26262E', badge: 'rgba(26,26,32,0.9)', badgeText: '#F97316',
      },
      radius: { sm: '0', md: '0', lg: '0', xl: '0', full: '9999px' },
      shadows: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.4)',
        md: '0 10px 15px -3px rgb(0 0 0 / 0.4)',
        lg: '0 25px 50px -12px rgb(0 0 0 / 0.5)',
      },
      effects: { darkMode: true, headerBlur: false },
    },
    // Chrome (Fase 2): brutalista — nombre display en el acento, carrito
    // CUADRADO relleno, filete del acento al scrollear, portada con degradado
    // del acento y nombre gigante; sin portada, hero tipografico con glow.
    chrome: {
      headerName: 'font-black uppercase tracking-tight',
      headerNameAccent: true,
      headerCart: 'square',
      headerScrollFx: 'accent-border',
      heroCover: 'impact',
      heroEmpty: 'impact',
    },
    // Motor v2 (A3): fuentes por tema (googleFontsUrl se inyecta como <link>;
    // heading/body son font-family CSS). null = usar las fuentes del bundle.
    fonts: { heading: null, body: null, googleFontsUrl: null },
    // Variantes de layout por sección. grid null = respeta la config del negocio.
    // categories: 'underline' | 'underline'. card: 'classic' | 'overlay'.
    layout: { hero: 'classic', categories: 'underline', grid: null, card: 'classic' },
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
      cardRadius: 'rounded-none',
      cardShadowEffect: 'shadow-xl hover:shadow-2xl shadow-black/40',
      productNameClass: 'font-display text-base tracking-wider uppercase',
      priceClass: 'inline-block px-2.5 py-0.5 rounded-full bg-white text-black text-xs font-bold tracking-wide',
      // Drawer OSCURO (port shopifree): el detalle vive sobre surface #1A1A20
      detailNameClass: 'font-display text-2xl tracking-wider uppercase text-white',
      detailPriceClass: 'text-3xl font-bold text-white',
      fontWrapper: 'font-sans',
    },
  },

  bauhaus: {
    id: 'bauhaus',
    name: 'Bauhaus',
    description: 'Geometría primaria: bloques rojo, amarillo y azul sobre blanco, sin sombras. Diseño, mobiliario y objetos de autor',
    category: 'retail',
    isNew: true,
    swatch: { bg: '#FFFFFF', card: '#FAFAF8', accent: '#E63E3E' },
    accent: '#E63E3E',
    fonts: {
      heading: "'Inter Tight', system-ui, sans-serif",
      body: "'Inter', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800;900&family=Inter:wght@300;400;500;600&display=swap',
    },
    // Colores de la composición (Bauhaus / De Stijl). Viven en el tema para
    // que el hero y la miniatura pinten exactamente lo mismo.
    palette: { rojo: '#E63E3E', amarillo: '#FFD500', azul: '#1A4DCC', negro: '#0E0E0E' },
    tokens: {
      colors: {
        background: '#FFFFFF', surface: '#FAFAF8', surfaceHover: '#F2F2EE',
        text: '#0E0E0E', textMuted: '#5A5A56', textInverted: '#FFFFFF',
        border: '#0E0E0E', badge: '#FFD500', badgeText: '#0E0E0E',
      },
      // Todo recto: la geometria primaria no admite esquinas blandas.
      radius: { sm: '0', md: '0', lg: '0', xl: '0', full: '9999px' },
      shadows: { sm: 'none', md: 'none', lg: 'none' },
      effects: { darkMode: false, headerBlur: true },
    },
    chrome: {
      headerName: 'font-extrabold uppercase tracking-tight',
      headerNameAccent: false,
      headerCart: 'outline',       // boton rectangular con borde, invierte al hover
      headerScrollFx: 'shadow',
      heroCover: 'mondrian',       // composicion geometrica en vez de portada
      heroEmpty: 'mondrian',
      topStrip: true,              // franja numerada sobre el header
      sectionRule: true,           // cabecera de seccion con linea y contador
    },
    layout: { hero: 'classic', categories: 'underline', grid: 'grid', card: 'classic' },
    classes: {
      bg: 'bg-white',
      card: 'bg-[#FAFAF8]',
      cardShadow: 'bg-[#FAFAF8]',
      text: 'text-[#0E0E0E]',
      textMuted: 'text-[#5A5A56]',
      textFaint: 'text-[#8A8A86]',
      obsText: 'text-[#2A2A28]',
      headerBg: 'bg-white border-b-2 border-[#0E0E0E]',
      catInactive: 'bg-transparent text-[#5A5A56] hover:text-[#0E0E0E] uppercase tracking-wider text-xs font-bold',
      viewActive: 'bg-[#0E0E0E]/10',
      viewHover: 'hover:bg-[#F2F2EE]',
      catBadge: 'bg-[#FFD500] text-[#0E0E0E] uppercase tracking-wider font-bold',
      listBadge: 'bg-[#F2F2EE] text-[#0E0E0E] uppercase tracking-wider font-bold',
      searchBanner: 'bg-white text-[#0E0E0E] placeholder-[#8A8A86] border-2 border-[#0E0E0E] focus:ring-[#E63E3E]/30',
      searchClassic: 'bg-white text-[#0E0E0E] placeholder-[#8A8A86] border-2 border-[#0E0E0E]',
      borderColor: 'border-[#0E0E0E]',
      footerPowered: 'text-[#5A5A56] border-[#0E0E0E]',
      footerLink: 'text-[#0E0E0E]',
      heroFallbackBg: 'bg-white',
      cartBadgeBg: '#E63E3E',
      cartBadgeColor: '#FFFFFF',
      // Tarjeta enmarcada en negro, sin sombra: el borde ES el diseño.
      cardRadius: 'rounded-none',
      cardShadowEffect: 'border-2 border-[#0E0E0E]',
      // Marco de la loseta de producto: el borde ES el diseno en Bauhaus. Los
      // demas temas no lo definen y sus tarjetas siguen sin borde.
      cardFrame: 'border-2 border-[#0E0E0E]',
      productNameClass: 'catalog-heading text-sm font-bold uppercase tracking-tight',
      priceClass: 'text-base font-extrabold text-[#0E0E0E]',
      detailNameClass: 'catalog-heading text-2xl font-extrabold uppercase tracking-tight text-[#0E0E0E]',
      detailPriceClass: 'text-3xl font-extrabold text-[#0E0E0E]',
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
