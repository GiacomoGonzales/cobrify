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
    // categories: 'underline' | 'pill' | 'solid'. card: 'classic' | 'overlay'.
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
    // categories: 'underline' | 'pill' | 'solid'. card: 'classic' | 'overlay'.
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
    // categories: 'underline' | 'pill' | 'solid'. card: 'classic' | 'overlay'.
    layout: { hero: 'classic', categories: 'solid', grid: null, card: 'classic' },
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
      topStripText: 'La forma sigue a la función',
      sectionRule: true,           // cabecera de seccion con linea y contador
    },
    layout: { hero: 'classic', categories: 'solid', grid: 'grid', card: 'classic' },
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

  brutalist: {
    id: 'brutalist',
    name: 'Brutalist',
    description: 'Anti-diseño crudo: monoespaciada, bordes gruesos y sombras duras en rojo y negro. Marcas independientes, arte y estudios creativos',
    category: 'retail',
    isNew: true,
    swatch: { bg: '#FFFFFF', card: '#FFFFFF', accent: '#FF0000' },
    accent: '#FF0000',
    fonts: {
      heading: "'Space Mono', ui-monospace, 'Courier New', monospace",
      body: "'Space Mono', ui-monospace, 'Courier New', monospace",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap',
    },
    tokens: {
      colors: {
        background: '#FFFFFF', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
        text: '#000000', textMuted: '#555555', textInverted: '#FFFFFF',
        border: '#000000', badge: '#FF0000', badgeText: '#FFFFFF',
      },
      // Ni una esquina redondeada, tampoco en lo circular: es el punto del tema.
      radius: { sm: '0', md: '0', lg: '0', xl: '0', full: '0' },
      // Sombras DURAS: desplazadas y sin difuminar. Es lo que separa a este
      // tema del Bauhaus, que no lleva sombra ninguna.
      shadows: { sm: '4px 4px 0 #000000', md: '6px 6px 0 #000000', lg: '8px 8px 0 #000000' },
      effects: { darkMode: false, headerBlur: false },
    },
    chrome: {
      headerName: 'font-bold uppercase tracking-tighter',
      headerNameAccent: false,
      headerCart: 'brutal',        // rectangulo con borde grueso y sombra dura
      headerScrollFx: 'none',      // el borde de 3px ya separa el header
      heroCover: 'raw',            // la foto cruda, sin degradado encima
      heroEmpty: 'manifiesto',     // nombre gigante y el lema como comentario
      topStrip: true,
      topStripText: 'Sin concesiones',
      sectionRule: true,
    },
    layout: { hero: 'classic', categories: 'solid', grid: 'grid', card: 'classic' },
    classes: {
      bg: 'bg-white',
      card: 'bg-white',
      cardShadow: 'bg-white',
      text: 'text-black',
      textMuted: 'text-[#555555]',
      textFaint: 'text-[#888888]',
      obsText: 'text-[#222222]',
      headerBg: 'bg-white border-b-[3px] border-black',
      catInactive: 'bg-transparent text-[#555555] hover:text-black uppercase tracking-wider text-xs font-bold',
      viewActive: 'bg-black/10',
      viewHover: 'hover:bg-[#F5F5F5]',
      catBadge: 'bg-[#FF0000] text-white uppercase tracking-wider font-bold',
      listBadge: 'bg-[#F5F5F5] text-black uppercase tracking-wider font-bold',
      searchBanner: 'bg-white text-black placeholder-[#888888] border-[3px] border-black focus:ring-[#FF0000]/30',
      searchClassic: 'bg-white text-black placeholder-[#888888] border-[3px] border-black',
      borderColor: 'border-black',
      footerPowered: 'text-[#555555] border-black',
      footerLink: 'text-black',
      heroFallbackBg: 'bg-white',
      cartBadgeBg: '#FF0000',
      cartBadgeColor: '#FFFFFF',
      cardRadius: 'rounded-none',
      // La tarjeta entera: marco grueso y sombra dura que crece al pasar el
      // mouse, desplazandose en diagonal (el "hover" del brutalismo).
      cardShadowEffect: 'border-[3px] border-black shadow-[4px_4px_0_#000000] transition-all hover:shadow-[7px_7px_0_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5',
      // Marco de la loseta de la foto, dentro de la tarjeta.
      cardFrame: 'border-[3px] border-black',
      productNameClass: 'catalog-heading text-sm font-bold uppercase tracking-tighter',
      priceClass: 'text-base font-bold text-black',
      detailNameClass: 'catalog-heading text-2xl font-bold uppercase tracking-tighter text-black',
      detailPriceClass: 'text-3xl font-bold text-[#FF0000]',
      fontWrapper: 'font-mono',
    },
  },

  zine: {
    id: 'zine',
    name: 'Zine',
    description: 'Fanzine fotocopiado: letras recortadas, cinta adhesiva y alto contraste en blanco y negro con rojo punk. Moda independiente, merch de bandas y streetwear',
    category: 'retail',
    isNew: true,
    swatch: { bg: '#EFEDE6', card: '#FFFFFF', accent: '#E11414' },
    accent: '#E11414',
    fonts: {
      heading: "'Special Elite', 'Courier New', monospace",
      body: "'Anonymous Pro', 'Courier New', monospace",
      // Bebas Neue y Bangers no son la fuente del tema: las usan las letras
      // recortadas del nombre (RansomText), que mezcla seis voces distintas.
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Special+Elite&family=Anonymous+Pro:wght@400;700&family=Bebas+Neue&family=Bangers&display=swap',
    },
    tokens: {
      colors: {
        background: '#EFEDE6', surface: '#FFFFFF', surfaceHover: '#F4F2EB',
        text: '#0A0A0A', textMuted: '#3A3A3A', textInverted: '#EFEDE6',
        border: '#0A0A0A', badge: '#E11414', badgeText: '#EFEDE6',
      },
      // Recto como el papel cortado con tijera; lo circular se conserva
      // (a diferencia de Brutalist) porque el collage sí admite pegatinas.
      radius: { sm: '0', md: '0', lg: '0', xl: '0', full: '9999px' },
      shadows: { sm: '2px 2px 0 0 #0A0A0A', md: '4px 4px 0 0 #0A0A0A', lg: '6px 6px 0 0 #0A0A0A' },
      effects: { darkMode: false, headerBlur: true },
    },
    chrome: {
      headerName: 'font-bold uppercase tracking-tight',
      headerNameAccent: false,
      headerNameStamp: true,       // el nombre va en un recuadro de tinta, ladeado
      headerCart: 'zine',          // recuadro rojo con sombra dura, "$$ Bolsa [n]"
      headerScrollFx: 'shadow',
      heroCover: 'collage',        // el collage manda: con foto o sin ella
      heroEmpty: 'collage',
      pageTexture: 'paper',        // grano de fotocopia sobre todo el fondo
      sectionRule: 'zine',
    },
    layout: { hero: 'classic', categories: 'solid', grid: 'grid', card: 'classic' },
    classes: {
      bg: 'bg-[#EFEDE6]',
      card: 'bg-white',
      cardShadow: 'bg-white',
      text: 'text-[#0A0A0A]',
      textMuted: 'text-[#3A3A3A]',
      textFaint: 'text-[#6B6B6B]',
      obsText: 'text-[#1A1A1A]',
      headerBg: 'bg-[#EFEDE6] border-b-[3px] border-[#0A0A0A]',
      catInactive: 'bg-transparent text-[#3A3A3A] hover:text-[#0A0A0A] uppercase tracking-wider text-xs font-bold',
      viewActive: 'bg-[#0A0A0A]/10',
      viewHover: 'hover:bg-[#F4F2EB]',
      catBadge: 'bg-[#E11414] text-[#EFEDE6] uppercase tracking-wider font-bold',
      listBadge: 'bg-[#F4F2EB] text-[#0A0A0A] uppercase tracking-wider font-bold',
      searchBanner: 'bg-white text-[#0A0A0A] placeholder-[#6B6B6B] border-[3px] border-[#0A0A0A] focus:ring-[#E11414]/30',
      searchClassic: 'bg-white text-[#0A0A0A] placeholder-[#6B6B6B] border-[3px] border-[#0A0A0A]',
      borderColor: 'border-[#0A0A0A]',
      footerPowered: 'text-[#3A3A3A] border-[#0A0A0A]',
      footerLink: 'text-[#0A0A0A]',
      heroFallbackBg: 'bg-[#EFEDE6]',
      cartBadgeBg: '#E11414',
      cartBadgeColor: '#EFEDE6',
      cardRadius: 'rounded-none',
      // Recorte pegado en la hoja: marco, sombra dura y un giro leve al pasar
      // el mouse — el gesto de acomodar el papel con el dedo.
      cardShadowEffect: 'border-[3px] border-[#0A0A0A] shadow-[4px_4px_0_0_#0A0A0A] transition-transform hover:rotate-1',
      cardFrame: 'border-[3px] border-[#0A0A0A]',
      productNameClass: 'catalog-heading text-sm font-bold uppercase tracking-tight',
      priceClass: 'text-base font-bold text-[#0A0A0A]',
      detailNameClass: 'catalog-heading text-2xl font-bold uppercase tracking-tight text-[#0A0A0A]',
      detailPriceClass: 'text-3xl font-bold text-[#E11414]',
      fontWrapper: 'font-mono',
    },
  },

  velvet: {
    id: 'velvet',
    name: 'Velvet',
    description: 'Lujo nocturno: serif itálica, brillos rosa y lavanda sobre casi negro y textura de grano. Joyería, perfumería y marcas de autor',
    category: 'all',
    isNew: true,
    swatch: { bg: '#0E060C', card: '#1A1018', accent: '#E8A0C8' },
    accent: '#E8A0C8',
    fonts: {
      heading: "'Playfair Display', Georgia, serif",
      body: "'Lato', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Lato:wght@300;400;700&display=swap',
    },
    tokens: {
      colors: {
        background: '#0E060C', surface: '#1A1018', surfaceHover: '#241822',
        text: '#F2E8EF', textMuted: '#A08898', textInverted: '#0E060C',
        border: '#2E1F2A', badge: '#E8A0C8', badgeText: '#0E060C',
      },
      radius: { sm: '0.375rem', md: '0.625rem', lg: '0.875rem', xl: '1.25rem', full: '9999px' },
      // Sombras que son HALOS, no sombras: en fondo oscuro lo que separa una
      // pieza del fondo es la luz que emite, no la que tapa.
      shadows: {
        sm: '0 0 20px rgba(232,160,200,.10)',
        md: '0 0 35px rgba(232,160,200,.15)',
        lg: '0 0 60px rgba(232,160,200,.20)',
      },
      effects: { darkMode: true, headerBlur: true },
    },
    chrome: {
      headerName: 'font-medium italic tracking-[0.1em]',
      headerNameAccent: true,
      headerNameGlow: true,        // halo detras del nombre
      headerCart: 'glow',          // pildora con degradado y halo al llenarse
      headerScrollFx: 'shadow',
      heroCover: 'fade',           // la portada se funde con el fondo
      heroCoverFilter: 'brightness(0.75) contrast(1.15) saturate(0.9)',
      heroEmpty: 'opulent',        // nombre en serif itálica entre filetes
      ambience: 'velvet',          // capas fijas: grano, brillos, ornamento
    },
    layout: { hero: 'classic', categories: 'pill', grid: 'grid', card: 'classic' },
    classes: {
      bg: 'bg-[#0E060C]',
      card: 'bg-[#1A1018]',
      cardShadow: 'bg-[#1A1018]',
      text: 'text-[#F2E8EF]',
      textMuted: 'text-[#A08898]',
      textFaint: 'text-[#7A6470]',
      obsText: 'text-[#D8C8D2]',
      headerBg: 'bg-[#0E060C]/80 backdrop-blur-xl border-b border-[#2E1F2A]',
      catInactive: 'bg-[#1A1018] text-[#A08898] hover:text-[#F2E8EF] hover:bg-[#241822]',
      viewActive: 'bg-[#241822]',
      viewHover: 'hover:bg-[#241822]',
      catBadge: 'bg-[#E8A0C8] text-[#0E060C] font-semibold',
      listBadge: 'bg-[#241822] text-[#F2E8EF]',
      searchBanner: 'bg-[#1A1018] text-[#F2E8EF] placeholder-[#7A6470] border border-[#2E1F2A] focus:ring-[#E8A0C8]/40',
      searchClassic: 'bg-[#1A1018] text-[#F2E8EF] placeholder-[#7A6470] border border-[#2E1F2A]',
      borderColor: 'border-[#2E1F2A]',
      footerPowered: 'text-[#A08898] border-[#2E1F2A]',
      footerLink: 'text-[#F2E8EF]',
      heroFallbackBg: 'bg-[#0E060C]',
      cartBadgeBg: '#E8A0C8',
      cartBadgeColor: '#0E060C',
      cardRadius: 'rounded-xl',
      cardShadowEffect: 'border border-[#2E1F2A] transition-all hover:border-[#E8A0C8]/40 hover:shadow-[0_0_35px_rgba(232,160,200,.15)]',
      productNameClass: 'catalog-heading text-sm font-medium text-[#F2E8EF]',
      priceClass: 'text-base font-semibold text-[#E8A0C8]',
      detailNameClass: 'catalog-heading text-2xl font-semibold italic text-[#F2E8EF]',
      detailPriceClass: 'text-3xl font-semibold text-[#E8A0C8]',
      fontWrapper: 'font-sans',
    },
  },

  hologram: {
    id: 'hologram',
    name: 'Hologram',
    description: 'Iridiscente y futurista: un espectro que sigue al cursor sobre negro, retícula luminosa y tipografía espaciada. Tecnología, sneakers y coleccionables',
    category: 'all',
    isNew: true,
    swatch: { bg: '#030305', card: '#0E0E14', accent: '#8B5CF6' },
    accent: '#8B5CF6',
    fonts: {
      heading: "'Sora', system-ui, sans-serif",
      body: "'Inter', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap',
    },
    tokens: {
      colors: {
        background: '#030305', surface: '#0E0E14', surfaceHover: '#16161F',
        text: '#E8E8F0', textMuted: '#707080', textInverted: '#030305',
        border: '#1E1E2A', badge: '#E8E8F0', badgeText: '#030305',
      },
      radius: { sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem', full: '9999px' },
      shadows: {
        sm: '0 0 15px rgba(180,180,200,.08)',
        md: '0 0 30px rgba(180,180,200,.12)',
        lg: '0 0 50px rgba(180,180,200,.15)',
      },
      effects: { darkMode: true, headerBlur: true },
    },
    chrome: {
      headerName: 'font-semibold uppercase tracking-[0.2em]',
      headerNameAccent: false,
      headerNameSpectrum: true,    // el nombre pintado con el espectro, animado
      headerCart: 'glow',
      headerScrollFx: 'shadow',
      heroCover: 'fade',
      heroCoverFilter: 'brightness(0.7) grayscale(0.4) contrast(1.2)',
      heroEmpty: 'spectrum',
      ambience: 'hologram',
    },
    layout: { hero: 'classic', categories: 'pill', grid: 'grid', card: 'classic' },
    classes: {
      bg: 'bg-[#030305]',
      card: 'bg-[#0E0E14]',
      cardShadow: 'bg-[#0E0E14]',
      text: 'text-[#E8E8F0]',
      textMuted: 'text-[#707080]',
      textFaint: 'text-[#55555F]',
      obsText: 'text-[#C8C8D4]',
      headerBg: 'bg-[#030305]/80 backdrop-blur-xl border-b border-[#1E1E2A]',
      catInactive: 'bg-[#0E0E14] text-[#707080] hover:text-[#E8E8F0] hover:bg-[#16161F]',
      viewActive: 'bg-[#16161F]',
      viewHover: 'hover:bg-[#16161F]',
      catBadge: 'bg-[#E8E8F0] text-[#030305] font-semibold',
      listBadge: 'bg-[#16161F] text-[#E8E8F0]',
      searchBanner: 'bg-[#0E0E14] text-[#E8E8F0] placeholder-[#55555F] border border-[#1E1E2A] focus:ring-[#8B5CF6]/40',
      searchClassic: 'bg-[#0E0E14] text-[#E8E8F0] placeholder-[#55555F] border border-[#1E1E2A]',
      borderColor: 'border-[#1E1E2A]',
      footerPowered: 'text-[#707080] border-[#1E1E2A]',
      footerLink: 'text-[#E8E8F0]',
      heroFallbackBg: 'bg-[#030305]',
      cartBadgeBg: '#E8E8F0',
      cartBadgeColor: '#030305',
      cardRadius: 'rounded-2xl',
      cardShadowEffect: 'border border-[#1E1E2A] transition-all hover:border-[#8B5CF6]/50 hover:shadow-[0_0_30px_rgba(139,92,246,.18)]',
      productNameClass: 'catalog-heading text-sm font-medium text-[#E8E8F0]',
      priceClass: 'text-base font-semibold text-[#E8E8F0]',
      detailNameClass: 'catalog-heading text-2xl font-semibold tracking-wide text-[#E8E8F0]',
      detailPriceClass: 'text-3xl font-semibold text-[#E8E8F0]',
      fontWrapper: 'font-sans',
    },
  },

  urban: {
    id: 'urban',
    name: 'Urban',
    description: 'Calle y neón: negro absoluto, verde lima eléctrico y titulares en mayúscula compacta. Sneakers, streetwear y moda urbana',
    category: 'retail',
    isNew: true,
    swatch: { bg: '#0A0A0A', card: '#1A1A1A', accent: '#CCFF00' },
    accent: '#CCFF00',
    fonts: { heading: null, body: null, googleFontsUrl: null },
    tokens: {
      colors: {
        background: '#0A0A0A', surface: '#1A1A1A', surfaceHover: '#2A2A2A',
        text: '#FFFFFF', textMuted: '#888888', textInverted: '#0A0A0A',
        border: '#2A2A2A', badge: '#CCFF00', badgeText: '#0A0A0A',
      },
      radius: { sm: '0', md: '0', lg: '0', xl: '0', full: '0' },
      shadows: { sm: 'none', md: 'none', lg: '0 25px 50px -12px rgba(0,0,0,.5)' },
      effects: { darkMode: true, headerBlur: true },
    },
    chrome: {
      headerName: 'font-black uppercase tracking-tight',
      headerNameAccent: false,
      headerCart: 'square',        // bloque del acento, sin esquinas
      headerScrollFx: 'shadow',
      heroCover: 'fade',
      heroCoverFilter: 'contrast(1.1)',
      heroEmpty: 'impact',
    },
    layout: { hero: 'classic', categories: 'solid', grid: 'grid', card: 'classic' },
    classes: {
      bg: 'bg-[#0A0A0A]',
      card: 'bg-[#1A1A1A]',
      cardShadow: 'bg-[#1A1A1A]',
      text: 'text-white',
      textMuted: 'text-[#888888]',
      textFaint: 'text-[#666666]',
      obsText: 'text-[#DDDDDD]',
      headerBg: 'bg-[#0A0A0A]/95 backdrop-blur-md border-b border-[#2A2A2A]',
      catInactive: 'bg-[#1A1A1A] text-[#888888] hover:text-white hover:bg-[#2A2A2A] uppercase tracking-wider text-xs font-bold',
      viewActive: 'bg-[#2A2A2A]',
      viewHover: 'hover:bg-[#2A2A2A]',
      catBadge: 'bg-[#CCFF00] text-[#0A0A0A] uppercase tracking-wider font-black',
      listBadge: 'bg-[#2A2A2A] text-white uppercase tracking-wider font-bold',
      searchBanner: 'bg-[#1A1A1A] text-white placeholder-[#666666] border border-[#2A2A2A] focus:ring-[#CCFF00]/40',
      searchClassic: 'bg-[#1A1A1A] text-white placeholder-[#666666] border border-[#2A2A2A]',
      borderColor: 'border-[#2A2A2A]',
      footerPowered: 'text-[#888888] border-[#2A2A2A]',
      footerLink: 'text-white',
      heroFallbackBg: 'bg-[#0A0A0A]',
      cartBadgeBg: '#CCFF00',
      cartBadgeColor: '#0A0A0A',
      cardRadius: 'rounded-none',
      cardShadowEffect: 'border border-[#2A2A2A] transition-all hover:border-[#CCFF00]',
      productNameClass: 'catalog-heading text-sm font-bold uppercase tracking-tight',
      priceClass: 'text-base font-black text-[#CCFF00]',
      detailNameClass: 'catalog-heading text-2xl font-black uppercase tracking-tight text-white',
      detailPriceClass: 'text-3xl font-black text-[#CCFF00]',
      fontWrapper: 'font-sans',
    },
  },

  bistro: {
    id: 'bistro',
    name: 'Bistro',
    description: 'Mantel oscuro y cobre a media luz, con serif de carta y filetes finos. Restaurantes de mantel largo, bares de vinos y cafés de autor',
    category: 'restaurant',
    isNew: true,
    swatch: { bg: '#1C1917', card: '#292524', accent: '#B87333' },
    accent: '#B87333',
    fonts: {
      heading: "'Playfair Display', Georgia, serif",
      body: "'Inter', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap',
    },
    tokens: {
      colors: {
        background: '#1C1917', surface: '#292524', surfaceHover: '#3D3835',
        text: '#FAF7F2', textMuted: '#A8A29E', textInverted: '#1C1917',
        border: '#3D3835', badge: '#B87333', badgeText: '#1C1917',
      },
      radius: { sm: '0.25rem', md: '0.375rem', lg: '0.5rem', xl: '0.75rem', full: '9999px' },
      shadows: {
        sm: '0 2px 4px 0 rgba(0,0,0,.3)',
        md: '0 4px 12px -2px rgba(0,0,0,.4)',
        lg: '0 20px 40px -8px rgba(0,0,0,.5)',
      },
      effects: { darkMode: true, headerBlur: true },
    },
    chrome: {
      headerName: 'font-semibold',
      headerNameAccent: false,
      headerCart: 'bubble',
      headerScrollFx: 'shadow',
      // A sangre: el nombre y el lema van CENTRADOS sobre la portada, entre
      // los filetes de cobre — la portada de una carta, no un banner.
      heroCover: 'banner',
      heroEmpty: 'opulent',
    },
    layout: { hero: 'full-bleed', categories: 'pill', grid: 'grid', card: 'classic' },
    classes: {
      bg: 'bg-[#1C1917]',
      card: 'bg-[#292524]',
      cardShadow: 'bg-[#292524]',
      text: 'text-[#FAF7F2]',
      textMuted: 'text-[#A8A29E]',
      textFaint: 'text-[#7A736E]',
      obsText: 'text-[#E4DDD4]',
      headerBg: 'bg-[#1C1917]/95 backdrop-blur-xl border-b border-[#B87333]/20',
      catInactive: 'bg-[#292524] text-[#A8A29E] hover:text-[#FAF7F2] hover:bg-[#3D3835]',
      viewActive: 'bg-[#3D3835]',
      viewHover: 'hover:bg-[#3D3835]',
      catBadge: 'bg-[#B87333] text-[#1C1917] font-semibold',
      listBadge: 'bg-[#3D3835] text-[#FAF7F2]',
      searchBanner: 'bg-[#292524] text-[#FAF7F2] placeholder-[#7A736E] border border-[#3D3835] focus:ring-[#B87333]/40',
      searchClassic: 'bg-[#292524] text-[#FAF7F2] placeholder-[#7A736E] border border-[#3D3835]',
      borderColor: 'border-[#3D3835]',
      footerPowered: 'text-[#A8A29E] border-[#3D3835]',
      footerLink: 'text-[#FAF7F2]',
      heroFallbackBg: 'bg-[#1C1917]',
      cartBadgeBg: '#B87333',
      cartBadgeColor: '#1C1917',
      cardRadius: 'rounded-lg',
      cardShadowEffect: 'border border-[#3D3835] transition-all hover:border-[#B87333]/50 hover:shadow-lg',
      productNameClass: 'catalog-heading text-sm font-medium text-[#FAF7F2]',
      priceClass: 'text-base font-semibold text-[#B87333]',
      detailNameClass: 'catalog-heading text-2xl font-semibold text-[#FAF7F2]',
      detailPriceClass: 'text-3xl font-semibold text-[#B87333]',
      fontWrapper: 'font-sans',
    },
  },

  libreria: {
    id: 'libreria',
    name: 'Librería',
    description: 'Papel crema, azul noche y tinta roja con serif de imprenta. Librerías, papelerías, editoriales y tiendas de oficio',
    category: 'retail',
    isNew: true,
    swatch: { bg: '#F5F0E8', card: '#FFFFFF', accent: '#1E3A5F' },
    accent: '#1E3A5F',
    fonts: {
      heading: "'Libre Baskerville', Georgia, serif",
      body: "'Source Sans 3', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Source+Sans+3:wght@300;400;500;600;700&display=swap',
    },
    tokens: {
      colors: {
        background: '#F5F0E8', surface: '#FFFFFF', surfaceHover: '#EDE5D8',
        text: '#1A1A1A', textMuted: '#6B6358', textInverted: '#F5F0E8',
        border: '#D4CCBE', badge: '#8B2232', badgeText: '#FFFFFF',
      },
      // Casi rectas: el papel impreso no tiene esquinas blandas, pero tampoco
      // el filo del brutalismo.
      radius: { sm: '0.125rem', md: '0.25rem', lg: '0.375rem', xl: '0.5rem', full: '9999px' },
      shadows: {
        sm: '0 1px 3px 0 rgba(30,58,95,.08)',
        md: '0 4px 12px -2px rgba(30,58,95,.10)',
        lg: '0 20px 40px -8px rgba(30,58,95,.12)',
      },
      effects: { darkMode: false, headerBlur: true },
    },
    chrome: {
      headerName: 'font-bold',
      headerNameAccent: true,       // el nombre en azul noche
      headerCart: 'square',
      headerScrollFx: 'shadow',
      heroCover: 'fade',            // la foto se funde con el papel
      heroEmpty: 'editorial',
    },
    layout: { hero: 'classic', categories: 'underline', grid: 'grid', card: 'classic' },
    classes: {
      bg: 'bg-[#F5F0E8]',
      card: 'bg-white',
      cardShadow: 'bg-white',
      text: 'text-[#1A1A1A]',
      textMuted: 'text-[#6B6358]',
      textFaint: 'text-[#8F8578]',
      obsText: 'text-[#33302B]',
      headerBg: 'bg-[#F5F0E8]/95 backdrop-blur-md border-b-2 border-[#1E3A5F]',
      catInactive: 'bg-white text-[#6B6358] hover:text-[#1E3A5F] hover:bg-[#EDE5D8]',
      viewActive: 'bg-[#EDE5D8]',
      viewHover: 'hover:bg-[#EDE5D8]',
      catBadge: 'bg-[#1E3A5F] text-[#F5F0E8] font-semibold',
      listBadge: 'bg-[#EDE5D8] text-[#1A1A1A]',
      searchBanner: 'bg-white text-[#1A1A1A] placeholder-[#8F8578] border border-[#D4CCBE] focus:ring-[#1E3A5F]/30',
      searchClassic: 'bg-white text-[#1A1A1A] placeholder-[#8F8578] border border-[#D4CCBE]',
      borderColor: 'border-[#D4CCBE]',
      footerPowered: 'text-[#6B6358] border-[#D4CCBE]',
      footerLink: 'text-[#1E3A5F]',
      heroFallbackBg: 'bg-[#EDE5D8]',
      // El sello del carrito va en tinta ROJA sobre el azul: es el segundo
      // color del tema y el unico sitio donde aparece a plena saturacion.
      cartBadgeBg: '#8B2232',
      cartBadgeColor: '#FFFFFF',
      cardRadius: 'rounded-sm',
      cardShadowEffect: 'border border-[#D4CCBE] transition-all hover:border-[#1E3A5F] hover:shadow-md',
      productNameClass: 'catalog-heading text-sm font-bold text-[#1A1A1A]',
      priceClass: 'text-base font-bold text-[#1E3A5F]',
      detailNameClass: 'catalog-heading text-2xl font-bold text-[#1E3A5F]',
      detailPriceClass: 'text-3xl font-bold text-[#8B2232]',
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
