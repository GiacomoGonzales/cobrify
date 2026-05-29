import { useMemo } from 'react'
import { Loader2, Clock, Users } from 'lucide-react'
import { dateKey, calcShiftHours, timeToMinutes } from '@/services/scheduleService'

// id sentinel de la sucursal "Principal" (coherente con el resto del módulo).
const MAIN_BRANCH_ID = 'main'
const cellBranchId = (cell) => cell?.branchId || MAIN_BRANCH_ID

const WEEK_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Misma paleta que el resto del planner, para que los colores se sientan consistentes.
const PALETTE = ['#fbbf24', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6']
const NO_AREA = 'Sin área'

// Color estable por nombre de área (free-text). El mismo área siempre obtiene el
// mismo color. "Sin área" usa un gris neutro.
const areaColor = (name) => {
  if (!name || name === NO_AREA) return '#cbd5e1'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// Formatea minutos-desde-medianoche a "HH:MM" (envuelve a 24h para turnos que
// cruzan la medianoche, p.ej. 1500 min → "01:00").
const fmtMin = (min) => {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Vista MENSUAL del equipo (overview navegable). Cada día muestra barritas por
 * área (department) con el número de empleados con turno ese día, filtrado por
 * la sucursal activa. Al tocar un día se hace "zoom" a la vista diaria de esa
 * fecha (onSelectDay recibe el Date).
 *
 * Sólo lectura/navegación: la edición vive en las vistas Semanal y Diaria.
 */
export default function ScheduleMonthOverview({
  year, monthIndex, employees = [], selectedBranchId = MAIN_BRANCH_ID,
  data = { byUser: {}, publishedByDate: {} }, loading = false, onSelectDay,
}) {
  // Matriz del mes: filas de 7 columnas (Lun..Dom) con huecos al inicio/fin.
  const weeks = useMemo(() => {
    const firstOfMonth = new Date(year, monthIndex, 1)
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
    const lead = (firstOfMonth.getDay() + 6) % 7 // Lun=0 .. Dom=6
    const arr = []
    for (let i = 0; i < lead; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, monthIndex, d))
    while (arr.length % 7 !== 0) arr.push(null)
    const rows = []
    for (let i = 0; i < arr.length; i += 7) rows.push(arr.slice(i, i + 7))
    return rows
  }, [year, monthIndex])

  // Agregación por fecha: { 'YYYY-MM-DD': { areas: [{name,count,color}], totalShifts, totalHours } }
  // Sólo turnos reales (no descanso/recuperación) de la sucursal activa.
  const { byDate, monthShifts, monthHours } = useMemo(() => {
    const byUser = data?.byUser || {}
    const map = {}
    let totShifts = 0
    let totHours = 0
    for (const emp of employees) {
      const userCells = byUser[emp.id]
      if (!userCells) continue
      const area = (emp.department || '').trim() || NO_AREA
      for (const key in userCells) {
        const cell = userCells[key]
        if (!cell || cell.rest || cell.recovery || !cell.start || !cell.end) continue
        if (cellBranchId(cell) !== selectedBranchId) continue
        if (!map[key]) map[key] = { areas: new Map(), totalShifts: 0, totalHours: 0, minStart: Infinity, maxEnd: 0 }
        const m = map[key]
        const h = calcShiftHours(cell.start, cell.end, cell.breakMinutes || 0)
        const sMin = timeToMinutes(cell.start)
        let eMin = timeToMinutes(cell.end)
        if (eMin <= sMin) eMin += 24 * 60 // turno nocturno: cruza la medianoche
        m.minStart = Math.min(m.minStart, sMin)
        m.maxEnd = Math.max(m.maxEnd, eMin)
        m.totalShifts += 1
        m.totalHours += h
        m.areas.set(area, (m.areas.get(area) || 0) + 1)
        totShifts += 1
        totHours += h
      }
    }
    // Convertir cada Map de áreas a array ordenado (más empleados primero, luego nombre).
    const byDate = {}
    for (const key in map) {
      const m = map[key]
      const areas = Array.from(m.areas.entries())
        .map(([name, count]) => ({ name, count, color: areaColor(name) }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      byDate[key] = { areas, totalShifts: m.totalShifts, totalHours: m.totalHours, minStart: m.minStart, maxEnd: m.maxEnd }
    }
    return { byDate, monthShifts: totShifts, monthHours: totHours }
  }, [employees, data, selectedBranchId])

  const todayKey = dateKey(new Date())

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando vista mensual...
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Resumen del mes */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b border-gray-100 text-sm">
        <span className="flex items-center gap-1.5 text-gray-600">
          <Users className="w-4 h-4 text-primary-600" />
          <span className="font-bold text-gray-900">{monthShifts}</span> turnos
        </span>
        <span className="flex items-center gap-1.5 text-gray-600">
          <Clock className="w-4 h-4 text-primary-600" />
          <span className="font-bold text-gray-900">{monthHours.toFixed(1)}h</span> en el mes
        </span>
        <span className="text-xs text-gray-400 ml-auto hidden sm:block">
          Toca un día para abrirlo en detalle
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Cabecera de días */}
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {WEEK_HEADERS.map((h) => (
              <div key={h} className="px-2 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                {h}
              </div>
            ))}
          </div>
          {/* Semanas */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
              {week.map((date, di) => {
                if (!date) {
                  return (
                    <div
                      key={di}
                      className="min-h-[88px] sm:min-h-[112px] bg-gray-50/40 border-r border-gray-100 last:border-r-0"
                    />
                  )
                }
                const key = dateKey(date)
                return (
                  <DayCell
                    key={di}
                    date={date}
                    agg={byDate[key]}
                    isToday={key === todayKey}
                    published={!!data?.publishedByDate?.[key]}
                    onClick={() => onSelectDay?.(date)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3 text-primary-500" /> personas ·
          <Clock className="w-3 h-3 text-gray-400" /> horas · franja de cobertura
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-primary-500 inline-block" /> Cada barra es un área · el número es cuántos trabajan
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Publicado
        </span>
      </div>
    </div>
  )
}

function DayCell({ date, agg, isToday, published, onClick }) {
  const areas = agg?.areas || []
  const headcount = agg?.totalShifts || 0
  const hours = agg?.totalHours || 0
  const hasShifts = headcount > 0
  const overnight = hasShifts && agg?.maxEnd >= 24 * 60
  const coverage = hasShifts && Number.isFinite(agg?.minStart)
    ? `${fmtMin(agg.minStart)}–${fmtMin(agg.maxEnd)}`
    : null

  const MAX = 3
  const shown = areas.slice(0, MAX)
  const extra = areas.length - shown.length

  // Tooltip con el desglose completo del día (se ve al pasar el cursor).
  const tip = (() => {
    const d = date.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })
    if (!hasShifts) return `${d}\nSin turnos · toca para abrir`
    const lines = [d, `${headcount} ${headcount === 1 ? 'persona' : 'personas'} · ${hours.toFixed(1)}h`]
    if (coverage) lines.push(`Cobertura ${coverage}${overnight ? ' (termina al día siguiente)' : ''}`)
    if (areas.length) {
      lines.push('')
      for (const a of areas) lines.push(`• ${a.name}: ${a.count}`)
    }
    return lines.join('\n')
  })()

  return (
    <button
      type="button"
      onClick={onClick}
      title={tip}
      className={`min-h-[96px] sm:min-h-[128px] w-full text-left p-1.5 border-r border-gray-100 last:border-r-0 transition-colors hover:bg-primary-50/50 focus:bg-primary-50/60 focus:outline-none ${isToday ? 'bg-primary-50/40' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] font-semibold ${isToday ? 'text-primary-700' : 'text-gray-400'}`}>
          {date.getDate()}
        </span>
        {published && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Publicado" />}
      </div>

      {hasShifts ? (
        <>
          {/* Resumen del día: personas con turno + horas totales */}
          <div className="flex items-center gap-2 mb-0.5 text-[10px] leading-none">
            <span className="inline-flex items-center gap-0.5 font-bold text-gray-900">
              <Users className="w-3 h-3 text-primary-500" />
              {headcount}
            </span>
            <span className="inline-flex items-center gap-0.5 text-gray-500">
              <Clock className="w-3 h-3 text-gray-400" />
              {Math.round(hours)}h
            </span>
          </div>

          {/* Franja de cobertura: del primer inicio al último fin */}
          {coverage && (
            <div className="mb-1 text-[10px] text-gray-500 tabular-nums leading-none">
              {coverage}
              {overnight && <span className="text-[8px] text-primary-500 align-super ml-0.5">+1</span>}
            </div>
          )}

          {/* Áreas (free-text) con su número de personas */}
          <div className="space-y-0.5">
            {shown.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight"
                style={{ background: a.color + '22', borderLeft: `3px solid ${a.color}` }}
              >
                <span className="truncate text-gray-700 flex-1 hidden sm:inline">{a.name}</span>
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 sm:hidden"
                  style={{ background: a.color }}
                />
                <span className="font-bold text-gray-900 ml-auto">{a.count}</span>
              </div>
            ))}
            {extra > 0 && <div className="text-[9px] text-gray-400 pl-1">+{extra} área{extra !== 1 ? 's' : ''}</div>}
          </div>
        </>
      ) : null}
    </button>
  )
}
