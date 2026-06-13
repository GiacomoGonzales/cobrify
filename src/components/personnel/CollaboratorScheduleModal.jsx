import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Coffee, MapPin, Clock } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/contexts/ToastContext'
import { getMonthSchedule, dateKey, calcShiftHours } from '@/services/scheduleService'

// id sentinel de la sucursal "Principal" (coherente con el resto del módulo).
const MAIN_BRANCH_ID = 'main'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const WEEK_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * Modal que muestra el horario COMPLETO de un colaborador en formato calendario
 * mensual (con navegación a meses anteriores/siguientes). Sólo lectura: agrega
 * los turnos guardados de todas las semanas que tocan el mes y los pinta por día.
 *
 * Se abre desde SchedulePlanner al hacer click en el nombre de un colaborador.
 */
export default function CollaboratorScheduleModal({ isOpen, onClose, businessId, employee, branches = [] }) {
  const toast = useToast()
  const [refDate, setRefDate] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ cells: {}, totalHours: 0, publishedByDate: {} })

  const year = refDate.getFullYear()
  const monthIndex = refDate.getMonth()

  // El nombre de sucursal sólo se muestra si el negocio tiene 2+ sucursales
  // (en negocios de una sola sucursal sería ruido).
  const multiBranch = (branches?.length || 0) > 1
  const branchMap = useMemo(() => {
    const map = { [MAIN_BRANCH_ID]: 'Sucursal Principal' }
    for (const b of branches || []) {
      if (b?.id) map[b.id] = b.isMain ? 'Sucursal Principal' : (b.name || 'Sucursal')
    }
    return map
  }, [branches])

  // Cargar el horario del mes cada vez que cambia el colaborador o el mes.
  useEffect(() => {
    if (!isOpen || !businessId || !employee?.id) return
    let cancelled = false
    setLoading(true)
    getMonthSchedule(businessId, employee.id, year, monthIndex)
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setData(res.data)
        } else {
          toast.error('Error cargando el horario del colaborador')
          setData({ cells: {}, totalHours: 0, publishedByDate: {} })
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, businessId, employee?.id, year, monthIndex])

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

  const goPrev = () => setRefDate(new Date(year, monthIndex - 1, 1))
  const goNext = () => setRefDate(new Date(year, monthIndex + 1, 1))
  const goThisMonth = () => setRefDate(new Date())

  const todayKey = dateKey(new Date())
  const title = employee
    ? `Horario de ${employee.displayName || employee.email || 'colaborador'}`
    : 'Horario del colaborador'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="5xl" fullScreenMobile>
      <div className="space-y-4">
        {/* Cargo / área del colaborador */}
        {(employee?.jobTitle || employee?.department) && (
          <p className="-mt-2 text-sm text-gray-500">
            {employee.jobTitle || ''}
            {employee.jobTitle && employee.department ? ' · ' : ''}
            {employee.department || ''}
          </p>
        )}

        {/* Navegación de mes + total */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="p-2 rounded-lg hover:bg-gray-100" title="Mes anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 text-base font-semibold text-gray-900 min-w-[150px] text-center">
              {MONTHS[monthIndex]} {year}
            </div>
            <button onClick={goNext} className="p-2 rounded-lg hover:bg-gray-100" title="Mes siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={goThisMonth}
              className="ml-1 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-lg"
            >
              Este mes
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-primary-600" />
            <span className="text-gray-500">Total del mes:</span>
            <span className="font-bold text-gray-900">{data.totalHours.toFixed(1)}h</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando horario...
          </div>
        ) : (
          <>
            {/* Calendario del mes */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
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
                          className="min-h-[64px] sm:min-h-[84px] bg-gray-50/40 border-r border-gray-100 last:border-r-0"
                        />
                      )
                    }
                    const key = dateKey(date)
                    return (
                      <DayCell
                        key={di}
                        date={date}
                        cell={data.cells[key]}
                        isToday={key === todayKey}
                        multiBranch={multiBranch}
                        branchMap={branchMap}
                      />
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" /> Turno
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-100 border border-gray-300 inline-block" /> Descanso
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-orange-50 border border-orange-300 inline-block" /> Recuperación
              </span>
            </div>

            <p className="text-[11px] text-gray-400">
              Muestra los turnos guardados de todas las sucursales. Los días en blanco no tienen turno asignado.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}

function DayCell({ date, cell, isToday, multiBranch, branchMap }) {
  const isRest = !!cell?.rest
  const isRecovery = !!cell?.recovery && !isRest
  const isShift = !!(cell?.start && cell?.end) && !isRest && !isRecovery

  const branchName = branchMap[cell?.branchId || MAIN_BRANCH_ID]
  const hours = isShift ? calcShiftHours(cell.start, cell.end, cell.breakMinutes || 0, cell.recoveryMinutes || 0) : 0
  const accent = isShift && cell.color ? cell.color : null

  return (
    <div className={`min-h-[64px] sm:min-h-[84px] p-1.5 border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-primary-50/50' : ''}`}>
      <div className={`text-[11px] font-semibold mb-1 ${isToday ? 'text-primary-700' : 'text-gray-400'}`}>
        {date.getDate()}
      </div>

      {isShift ? (
        <div
          className="rounded-md bg-amber-50 border border-amber-200 px-1.5 py-1 text-[10px] sm:text-[11px] leading-tight"
          style={accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined}
        >
          <div className="font-semibold text-gray-900">{cell.start}–{cell.end}</div>
          <div className="text-gray-500">
            {hours.toFixed(1)}h
            {cell.recoveryMinutes > 0 && (
              <span className="ml-1 text-orange-600" title={`${cell.recoveryMinutes} min de recuperación`}>↻{cell.recoveryMinutes}m</span>
            )}
          </div>
          {multiBranch && branchName && (
            <div className="mt-0.5 flex items-center gap-0.5 text-[9px] text-gray-500">
              <MapPin className="w-2.5 h-2.5 text-primary-500 flex-shrink-0" />
              <span className="truncate">{branchName}</span>
            </div>
          )}
        </div>
      ) : isRest ? (
        <div className="rounded-md bg-gray-100 border border-gray-200 px-1.5 py-1 text-[10px] text-gray-500 flex items-center gap-1">
          <Coffee className="w-3 h-3" /> Descanso
        </div>
      ) : isRecovery ? (
        <div className="rounded-md bg-orange-50 border border-orange-200 px-1.5 py-1 text-[10px] sm:text-[11px] text-orange-700 leading-tight">
          <div className="flex items-center gap-1 font-medium"><Coffee className="w-3 h-3" /> Recup.</div>
          {cell.start && cell.end && (
            <div className="text-orange-600">{cell.start}–{cell.end} · {calcShiftHours(cell.start, cell.end, cell.breakMinutes || 0)}h</div>
          )}
          {multiBranch && branchName && (
            <div className="mt-0.5 flex items-center gap-0.5 text-[9px] text-gray-500">
              <MapPin className="w-2.5 h-2.5 text-primary-500 flex-shrink-0" />
              <span className="truncate">{branchName}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
