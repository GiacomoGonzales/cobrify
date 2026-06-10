/**
 * Tokens de color compartidos para TODOS los gráficos (Recharts) de la app.
 * Alineados con el tema global (tailwind.config gray azulado + primary #2563EB),
 * que a su vez replica la landing/login: navy #0A2540, azul #2563EB, bordes #E6EBF1.
 *
 * Regla: ningún gráfico define colores propios; siempre importa de aquí.
 */
export const CHART = {
  primary: '#2563EB',   // serie principal (azul de marca)
  cyan: '#06B6D4',      // serie de apoyo
  navy: '#0A2540',      // acentos oscuros
  muted: '#8898AA',     // series secundarias / líneas de referencia (gray-400)
  axis: '#6B7C93',      // texto de ejes (gray-500)
  grid: '#E6EBF1',      // grillas y bordes (gray-200)
  label: '#425466',     // etiquetas (gray-600)
}

// Estilo unificado del tooltip de Recharts (contentStyle)
export const CHART_TOOLTIP = {
  backgroundColor: '#fff',
  border: '1px solid #E6EBF1',
  borderRadius: '10px',
  boxShadow: '0 8px 24px -12px rgba(10, 37, 64, 0.18)',
}

// Paleta para series categóricas (p. ej. dona de métodos de pago):
// familia azul/cian de la marca, de la más dominante a la más suave.
export const CHART_SERIES = [
  '#2563EB', // azul marca
  '#06B6D4', // cian
  '#0A2540', // navy
  '#60A5FA', // azul claro
  '#67E8F9', // cian claro
  '#1D4ED8', // azul profundo
  '#93C5FD', // celeste
  '#8898AA', // gris azulado (resto)
]
