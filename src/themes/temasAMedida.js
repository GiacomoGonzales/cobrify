/**
 * TEMAS A MEDIDA del catálogo: diseños hechos para UN negocio, que los pagó.
 *
 * Tienen la misma forma que los temas de catalogThemes.js (tokens, chrome,
 * fonts, layout, classes) y se registran junto con ellos, pero llevan
 * `soloPara`: la galería de Configuración solo se los muestra a esos
 * negocios. El resto no los ve ni los puede elegir.
 *
 * Para agregar uno: copiar la forma de CITEX, cambiar el id y `soloPara`.
 */

/**
 * CITEX — Luis Ponce, RUC 20612459950. Pagó S/150 el 10-set-2026 para que su
 * catálogo (citex.pe) se vea igual que su web (citex.com.pe): el botón
 * "Comprar ahora" de la web lleva al catálogo y el salto no se tiene que notar.
 *
 * Medido en su web: cabecera y pie en #1E1E1E, texto gris #8A8A8A y #C8C8C8,
 * Inter para el texto, Instrument Serif para los títulos grandes, enlaces en
 * mayúsculas con 0.14em de espaciado, botones cápsula en mayúsculas y
 * esquinas rectas en todo lo demás. Su logo del catálogo es negro: sobre la
 * cabecera y el pie oscuros se pinta de blanco, como el de su web.
 */
const CITEX = {
  id: 'citex',
  name: 'CITEX',
  description: 'Diseño a medida: el mismo de citex.com.pe',
  category: 'retail',
  isNew: false,
  soloPara: ['A9e8PaWWtqXY8DPoG9eLBPSMCro1'],
  // Réplica de su web: cabecera, portada, secciones y pie propios
  // (src/components/catalog/aMedida/citex). Sin ella, el tema solo pinta.
  replica: 'citex',
  swatch: { bg: '#FFFFFF', card: '#F4F4F4', accent: '#1E1E1E' },
  accent: '#1E1E1E',
  // El negro de la marca no se cambia desde el selector de color: el negocio
  // tiene guardado un gris (#4d4d4d) que pisaría al tema. Ver getCatalogAccent.
  acentoFijo: true,
  fonts: {
    heading: "'Instrument Serif', Georgia, serif",
    body: "Inter, 'Helvetica Neue', Arial, sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&family=Montserrat:wght@300;400;500;600;700&display=swap',
  },
  tokens: {
    colors: {
      background: '#FAFAF8', surface: '#FFFFFF', surfaceHover: '#F4F4F4',
      text: '#1E1E1E', textMuted: '#8A8A8A', textInverted: '#FFFFFF',
      border: '#E6E6E6', badge: '#1E1E1E', badgeText: '#FFFFFF',
    },
    radius: { sm: '0', md: '0', lg: '0', xl: '0', full: '9999px' },
    shadows: { sm: 'none', md: 'none', lg: '0 24px 48px -16px rgba(0,0,0,.18)' },
    effects: { darkMode: false, headerBlur: false },
  },
  chrome: {
    // Cabecera #1E1E1E con texto claro sobre una página blanca.
    headerDark: true,
    headerLogoInvert: true,
    footerLogoInvert: true,
    headerName: 'font-medium uppercase tracking-[0.3em]',
    headerNameAccent: false,
    headerCart: 'ghost',
    headerScrollFx: 'shadow',
    heroCover: 'fade',
    heroEmpty: 'clean',
  },
  layout: { hero: 'classic', categories: 'underline', grid: null, card: 'classic' },
  classes: {
    bg: 'bg-[#FAFAF8]',
    card: 'bg-[#FAFAF8]',
    cardShadow: 'bg-transparent',
    text: 'text-[#1E1E1E]',
    textMuted: 'text-[#8A8A8A]',
    textFaint: 'text-[#6E6E6E]',
    obsText: 'text-[#4A4A4A]',
    headerBg: 'bg-[#1E1E1E]',
    catInactive: 'bg-transparent text-[#8A8A8A] hover:text-[#1E1E1E] uppercase tracking-[0.14em] text-xs font-medium',
    // Pestañas de categoría como el menú de su web: mayúsculas espaciadas.
    catTabText: 'text-[11px] font-[500] uppercase tracking-[0.18em]',
    viewActive: 'bg-[#F4F4F4]',
    viewHover: 'hover:bg-[#F4F4F4]',
    catBadge: 'bg-[#1E1E1E] text-white uppercase tracking-[0.12em] text-[10px] font-semibold',
    listBadge: 'bg-[#F4F4F4] text-[#1E1E1E] uppercase tracking-[0.12em]',
    searchBanner: 'bg-white text-[#1E1E1E] placeholder-[#8A8A8A] border border-[#E6E6E6] focus:ring-[#1E1E1E]/20',
    searchClassic: 'bg-white text-[#1E1E1E] placeholder-[#8A8A8A] border border-[#E6E6E6]',
    borderColor: 'border-[#E6E6E6]',
    footerPowered: 'text-[#8A8A8A]',
    footerLink: 'text-[#C8C8C8]',
    heroFallbackBg: 'bg-[#1E1E1E]',
    cartBadgeBg: '#FFFFFF',
    cartBadgeColor: '#1E1E1E',
    // Como las fotos de sus tarjetas: 12px de radio sobre un fondo arena.
    cardRadius: 'rounded-[12px]',
    cardFrame: 'bg-[#E8E5E0]',
    cardShadowEffect: 'transition-opacity hover:opacity-90',
    productNameClass: 'text-[15px] font-[500] tracking-[-0.01em] text-[#1E1E1E]',
    priceClass: 'text-[13px] font-[600] tracking-[0.02em] text-[#1E1E1E]',
    detailNameClass: 'catalog-heading text-3xl md:text-4xl font-normal text-[#1E1E1E]',
    detailPriceClass: 'text-2xl font-medium text-[#1E1E1E]',
    fontWrapper: 'font-sans',
    // Pie con color propio (CatalogFooter).
    footerBg: 'bg-[#1E1E1E]',
    footerText: 'text-white',
    footerMuted: 'text-[#8A8A8A]',
    footerFaint: 'text-[#6E6E6E]',
    footerBorder: 'border-[#333333]',
    footerIconBg: 'rgba(255,255,255,0.08)',
    // Botones principales: cápsula en mayúsculas, como "Comprar ahora".
    ctaText: '!rounded-full uppercase tracking-[0.12em] text-[12px] font-[600]',
  },
}

export const TEMAS_A_MEDIDA = { citex: CITEX }
