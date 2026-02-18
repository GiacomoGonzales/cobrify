// Definición de temas visuales del sistema
// Cada tema define colores para sidebar, navbar, contenido, cards, tablas, inputs y modales

export const THEMES = {
  default: {
    id: 'default',
    name: 'Clásico',
    isDark: false,
    // Sidebar
    sidebarBg: '#ffffff',
    sidebarGradient: null,
    sidebarBorder: '#e5e7eb',
    sidebarText: '#374151',
    sidebarTextActive: null, // usa branding.primaryColor
    sidebarActiveBg: null, // usa branding.primaryColor + '15'
    sidebarIconColor: '#6b7280',
    sidebarHoverBg: '#f3f4f6',
    sidebarActiveLeftBar: null,
    // Navbar
    navbarBg: '#ffffff',
    navbarBorder: '#e5e7eb',
    navbarText: '#374151',
    // Content
    contentBg: '#f9fafb',
    // Card
    cardBg: '#ffffff',
    cardBorder: '#e5e7eb',
    // Table
    tableHeaderBg: '#f9fafb',
    tableRowHoverBg: '#f9fafb',
    tableBorder: '#e5e7eb',
    // Text
    textPrimary: '#111827',
    textSecondary: '#374151',
    textMuted: '#6b7280',
    // Input
    inputBg: '#ffffff',
    inputBorder: '#d1d5db',
    inputText: '#111827',
    // Modal
    modalBg: '#ffffff',
    modalBorder: '#e5e7eb',
    // Scrollbar
    scrollbarThumb: 'rgba(209,213,219,0.6)',
  },

  midnight: {
    id: 'midnight',
    name: 'Midnight',
    isDark: false,
    // Sidebar - gradiente oscuro elegante
    sidebarBg: '#1e293b',
    sidebarGradient: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    sidebarBorder: '#334155',
    sidebarText: '#94a3b8',
    sidebarTextActive: '#ffffff',
    sidebarActiveBg: 'rgba(255,255,255,0.1)',
    sidebarIconColor: '#64748b',
    sidebarHoverBg: 'rgba(255,255,255,0.05)',
    sidebarActiveLeftBar: '#38bdf8',
    // Navbar
    navbarBg: '#ffffff',
    navbarBorder: '#e2e8f0',
    navbarText: '#334155',
    // Content
    contentBg: '#f1f5f9',
    // Card
    cardBg: '#ffffff',
    cardBorder: '#e2e8f0',
    // Table
    tableHeaderBg: '#f8fafc',
    tableRowHoverBg: '#f1f5f9',
    tableBorder: '#e2e8f0',
    // Text
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    // Input
    inputBg: '#ffffff',
    inputBorder: '#cbd5e1',
    inputText: '#0f172a',
    // Modal
    modalBg: '#ffffff',
    modalBorder: '#e2e8f0',
    // Scrollbar
    scrollbarThumb: 'rgba(148,163,184,0.5)',
  },

  aurora: {
    id: 'aurora',
    name: 'Aurora',
    isDark: false,
    // Sidebar - gradiente púrpura/índigo
    sidebarBg: '#581c87',
    sidebarGradient: 'linear-gradient(180deg, #7c3aed 0%, #4338ca 100%)',
    sidebarBorder: '#6d28d9',
    sidebarText: 'rgba(255,255,255,0.7)',
    sidebarTextActive: '#ffffff',
    sidebarActiveBg: 'rgba(255,255,255,0.15)',
    sidebarIconColor: 'rgba(255,255,255,0.5)',
    sidebarHoverBg: 'rgba(255,255,255,0.08)',
    sidebarActiveLeftBar: '#a78bfa',
    // Navbar
    navbarBg: '#ffffff',
    navbarBorder: '#ede9fe',
    navbarText: '#3b0764',
    // Content
    contentBg: '#faf5ff',
    // Card
    cardBg: '#ffffff',
    cardBorder: '#ede9fe',
    // Table
    tableHeaderBg: '#faf5ff',
    tableRowHoverBg: '#f5f3ff',
    tableBorder: '#ede9fe',
    // Text
    textPrimary: '#1e1b4b',
    textSecondary: '#3b0764',
    textMuted: '#7c3aed',
    // Input
    inputBg: '#ffffff',
    inputBorder: '#c4b5fd',
    inputText: '#1e1b4b',
    // Modal
    modalBg: '#ffffff',
    modalBorder: '#ede9fe',
    // Scrollbar
    scrollbarThumb: 'rgba(167,139,250,0.4)',
  },

  neon: {
    id: 'neon',
    name: 'Neon',
    isDark: true,
    // Sidebar - negro profundo
    sidebarBg: '#0a0a0a',
    sidebarGradient: 'linear-gradient(180deg, #0a0a0a 0%, #171717 100%)',
    sidebarBorder: '#262626',
    sidebarText: '#a3a3a3',
    sidebarTextActive: '#22d3ee',
    sidebarActiveBg: 'rgba(34,211,238,0.1)',
    sidebarIconColor: '#525252',
    sidebarHoverBg: 'rgba(255,255,255,0.05)',
    sidebarActiveLeftBar: '#22d3ee',
    // Navbar
    navbarBg: '#0a0a0a',
    navbarBorder: '#262626',
    navbarText: '#e5e5e5',
    // Content
    contentBg: '#171717',
    // Card
    cardBg: '#1c1c1c',
    cardBorder: '#2a2a2a',
    // Table
    tableHeaderBg: '#1c1c1c',
    tableRowHoverBg: '#262626',
    tableBorder: '#2a2a2a',
    // Text
    textPrimary: '#f5f5f5',
    textSecondary: '#d4d4d4',
    textMuted: '#737373',
    // Input
    inputBg: '#1c1c1c',
    inputBorder: '#404040',
    inputText: '#f5f5f5',
    // Modal
    modalBg: '#1c1c1c',
    modalBorder: '#2a2a2a',
    // Scrollbar
    scrollbarThumb: 'rgba(82,82,82,0.6)',
  },

  earth: {
    id: 'earth',
    name: 'Earth',
    isDark: false,
    // Sidebar - crema cálido
    sidebarBg: '#fefce8',
    sidebarGradient: 'linear-gradient(180deg, #fef9c3 0%, #fef3c7 100%)',
    sidebarBorder: '#e5d5a0',
    sidebarText: '#78350f',
    sidebarTextActive: '#92400e',
    sidebarActiveBg: 'rgba(180,83,9,0.1)',
    sidebarIconColor: '#a16207',
    sidebarHoverBg: 'rgba(180,83,9,0.05)',
    sidebarActiveLeftBar: '#b45309',
    // Navbar
    navbarBg: '#fffbeb',
    navbarBorder: '#e5d5a0',
    navbarText: '#78350f',
    // Content
    contentBg: '#fffdf7',
    // Card
    cardBg: '#ffffff',
    cardBorder: '#e5d5a0',
    // Table
    tableHeaderBg: '#fffbeb',
    tableRowHoverBg: '#fefce8',
    tableBorder: '#e5d5a0',
    // Text
    textPrimary: '#451a03',
    textSecondary: '#78350f',
    textMuted: '#a16207',
    // Input
    inputBg: '#ffffff',
    inputBorder: '#d6c48b',
    inputText: '#451a03',
    // Modal
    modalBg: '#ffffff',
    modalBorder: '#e5d5a0',
    // Scrollbar
    scrollbarThumb: 'rgba(161,98,7,0.3)',
  },

  minimal_dark: {
    id: 'minimal_dark',
    name: 'Dark',
    isDark: true,
    // Sidebar - gris oscuro limpio
    sidebarBg: '#18181b',
    sidebarGradient: null,
    sidebarBorder: '#27272a',
    sidebarText: '#a1a1aa',
    sidebarTextActive: '#ffffff',
    sidebarActiveBg: 'rgba(255,255,255,0.08)',
    sidebarIconColor: '#52525b',
    sidebarHoverBg: 'rgba(255,255,255,0.04)',
    sidebarActiveLeftBar: '#a1a1aa',
    // Navbar
    navbarBg: '#18181b',
    navbarBorder: '#27272a',
    navbarText: '#e4e4e7',
    // Content
    contentBg: '#09090b',
    // Card
    cardBg: '#18181b',
    cardBorder: '#27272a',
    // Table
    tableHeaderBg: '#18181b',
    tableRowHoverBg: '#27272a',
    tableBorder: '#27272a',
    // Text
    textPrimary: '#fafafa',
    textSecondary: '#d4d4d8',
    textMuted: '#71717a',
    // Input
    inputBg: '#18181b',
    inputBorder: '#3f3f46',
    inputText: '#fafafa',
    // Modal
    modalBg: '#18181b',
    modalBorder: '#27272a',
    // Scrollbar
    scrollbarThumb: 'rgba(113,113,122,0.5)',
  },
}

// Orden de temas para el selector
export const THEME_ORDER = ['default', 'midnight', 'aurora', 'neon', 'earth', 'minimal_dark']

// Colores de preview para el selector en Settings
export const THEME_PREVIEWS = {
  default: { sidebar: '#ffffff', content: '#f9fafb', accent: '#3b82f6' },
  midnight: { sidebar: '#1e293b', content: '#f1f5f9', accent: '#38bdf8' },
  aurora: { sidebar: '#7c3aed', content: '#faf5ff', accent: '#a78bfa' },
  neon: { sidebar: '#0a0a0a', content: '#171717', accent: '#22d3ee' },
  earth: { sidebar: '#fef9c3', content: '#fffdf7', accent: '#b45309' },
  minimal_dark: { sidebar: '#18181b', content: '#09090b', accent: '#a1a1aa' },
}
