import { useMemo } from 'react'

/**
 * Selector de MES para los filtros de fecha.
 *
 * Los filtros de la app ofrecen Hoy / Semana / Este mes / Trimestre / Este año /
 * Todo / Personalizado. Para mirar "julio" había que ir a Personalizado y tipear
 * las dos fechas a mano cada vez, sabiendo en qué día termina cada mes.
 *
 * DECISIÓN DE DISEÑO: esto NO agrega un modo de filtro nuevo. Rellena el rango
 * PERSONALIZADO que cada página ya sabe procesar. Así no hay que tocar la lógica
 * de fechas de ninguna pantalla —que está escrita distinto en cada una— y el mes
 * elegido se comporta igual que un rango tipeado a mano.
 *
 * Devuelve las fechas como 'YYYY-MM-DD' locales, sin `toISOString()`: esa función
 * convierte a UTC y en Perú (UTC-5) adelanta el día, así que el 1 de agosto se
 * guardaría como 31 de julio.
 */

const NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const fmt = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Primer y último día de un mes, en fechas locales. */
export const getMonthRange = (year, monthIndex) => ({
  // `new Date(y, m + 1, 0)` da el último día del mes m sin tener que saber si
  // tiene 28, 29, 30 o 31 días.
  start: fmt(new Date(year, monthIndex, 1)),
  end: fmt(new Date(year, monthIndex + 1, 0)),
  label: `${NOMBRES[monthIndex]} ${year}`,
  value: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
})

/**
 * @param {string}   value      mes seleccionado ('YYYY-MM') o '' si no hay
 * @param {Function} onSelect   recibe { start, end, label, value } o null al limpiar
 * @param {number}   monthsBack cuántos meses hacia atrás ofrecer (default 24)
 * @param {string}   className  clases extra para el <select>
 */
export default function MonthSelect({ value = '', onSelect, monthsBack = 24, className = '' }) {
  const meses = useMemo(() => {
    const hoy = new Date()
    const out = []
    // Del más reciente al más antiguo: casi siempre se busca un mes cercano.
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      out.push(getMonthRange(d.getFullYear(), d.getMonth()))
    }
    return out
  }, [monthsBack])

  return (
    <select
      value={value}
      onChange={(e) => {
        const elegido = meses.find(m => m.value === e.target.value)
        onSelect(elegido || null)
      }}
      className={className || 'px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500'}
    >
      <option value="">Por mes...</option>
      {meses.map(m => (
        <option key={m.value} value={m.value}>{m.label}</option>
      ))}
    </select>
  )
}
