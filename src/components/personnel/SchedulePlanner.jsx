import { useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import {
  Calendar, ChevronLeft, ChevronRight, ChevronDown, Plus, Loader2, Save,
  Copy, Send, Edit2, Trash2, X, Tag, Coffee, FileDown, MoveHorizontal,
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { generateSchedulePDF } from '@/utils/schedulePdfGenerator'
import CollaboratorScheduleModal from '@/components/personnel/CollaboratorScheduleModal'
import ScheduleMonthOverview from '@/components/personnel/ScheduleMonthOverview'
import {
  listShiftTemplates,
  createShiftTemplate,
  updateShiftTemplate,
  deleteShiftTemplate,
  getWeekScheduleAll,
  getMonthScheduleAll,
  saveWeekSchedule,
  publishWeekSchedules,
  copyPreviousWeek,
  calculateWeekHours,
  getIsoWeek,
  addWeeks,
  getWeekDates,
  timeToMinutes,
  DAY_KEYS,
  DAY_LABELS,
} from '@/services/scheduleService'

// id sentinel para la sucursal "Principal" (mismo string que usa el resto del sistema).
const MAIN_BRANCH_ID = 'main'
// Resuelve el branchId efectivo de una celda. Celdas viejas (sin branchId)
// se asumen como Principal — coherente con el comportamiento previo al feature.
const cellBranchId = (cell) => cell?.branchId || MAIN_BRANCH_ID

const PALETTE = ['#fbbf24', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6']

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const formatDayShort = (d) =>
  d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '')

const formatRange = (mon, sun) =>
  `${mon.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} – ${sun.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`.replace(/\./g, '')

// ----- Escala de la cinta diaria continua (vista "Día" multi-jornada) -----
// La vista diaria es una LÍNEA DE TIEMPO CONTINUA de los 7 días de la semana:
// cada día ocupa 24 h en un eje horizontal único, así un turno que cruza la
// medianoche (p. ej. 22:00–05:00) fluye sin cortes hacia el día siguiente. Se
// recorre arrastrando con el mouse o deslizando (swipe) en táctil.
const PX_PER_HOUR = 56                       // densidad horizontal (px por hora)
const DAY_MIN = 24 * 60                      // minutos en un día
const DAY_W = (DAY_MIN / 60) * PX_PER_HOUR   // ancho en px de un día completo (1344)
const TL_NAME_W = 176                        // ancho de la columna de nombres (sticky)
const xOfMin = (min) => (min / 60) * PX_PER_HOUR  // minutos absolutos → px
const minOfX = (px) => (px / PX_PER_HOUR) * 60    // px → minutos absolutos
const TL_HOUR_LINE = '#f1f5f9'               // línea de hora (tenue)
const TL_DAY_LINE = '#cbd5e1'                // línea divisoria de día (marcada)

export default function SchedulePlanner({ businessId, employees, currentUserUid, businessInfo = {}, selectedBranchId = MAIN_BRANCH_ID, selectedBranchName = '', branches = [] }) {
  const toast = useToast()

  // Semana ISO seleccionada (default: hoy)
  const initialIso = getIsoWeek(new Date())
  const [isoYear, setIsoYear] = useState(initialIso.isoYear)
  const [isoWeek, setIsoWeek] = useState(initialIso.isoWeek)

  // Datos
  const [templates, setTemplates] = useState([])
  const [schedules, setSchedules] = useState({}) // { [userId]: { days, totalHours, publishedAt } }
  const [dirtyUsers, setDirtyUsers] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [printing, setPrinting] = useState(false)

  // UI
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null) // null o template existente o {} para nueva
  const [editingCell, setEditingCell] = useState(null) // { userId, dayKey, anchor }
  // Ordenamiento de filas: 'name' (default, alfabético) o 'department'
  // (agrupa por personnel.department con headers de sección entre grupos).
  const [sortBy, setSortBy] = useState('name')
  const popoverRef = useRef(null)
  // Dropdown de exportación PDF (agrupa "esta sucursal" y "por sucursal").
  const pdfMenuRef = useRef(null)
  const [showPdfMenu, setShowPdfMenu] = useState(false)
  // 'weekly' = grid de edición de la semana actual (por defecto) · 'month' =
  // overview mensual navegable · 'daily' = detalle de un día (es el "zoom" al
  // que se entra tocando un día, no un toggle suelto).
  const [viewMode, setViewMode] = useState('weekly')
  // Vista desde la que se entró al detalle diario ('weekly' | 'month'), para que
  // el botón de volver regrese al lugar correcto.
  const [dailyOrigin, setDailyOrigin] = useState('weekly')
  // Mes mostrado en la vista mensual (independiente de la semana ISO activa).
  const [monthRef, setMonthRef] = useState(() => new Date())
  const [monthData, setMonthData] = useState({ byUser: {}, publishedByDate: {} })
  const [monthLoading, setMonthLoading] = useState(true)
  // Colaborador cuyo horario mensual se está viendo (modal). null = cerrado.
  const [detailEmployee, setDetailEmployee] = useState(null)
  // Día seleccionado en modo diario: por defecto hoy si está en la semana, o lunes
  const [selectedDayKey, setSelectedDayKey] = useState(() => {
    const todayDow = new Date().getDay()
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][todayDow]
  })

  const weekDates = useMemo(() => getWeekDates(isoYear, isoWeek), [isoYear, isoWeek])
  const monday = weekDates[0]
  const sunday = weekDates[6]
  const monthYear = monthRef.getFullYear()
  const monthIndex = monthRef.getMonth()

  // ----- Cargar plantillas + horarios de la semana -----
  const loadAll = async () => {
    if (!businessId) return
    setLoading(true)
    try {
      const [tplRes, schRes] = await Promise.all([
        listShiftTemplates(businessId),
        getWeekScheduleAll(businessId, isoYear, isoWeek),
      ])
      if (tplRes.success) setTemplates(tplRes.data)
      const map = {}
      if (schRes.success) {
        schRes.data.forEach((s) => {
          map[s.userId] = {
            days: s.days || {},
            totalHours: s.totalHours || 0,
            publishedAt: s.publishedAt || null,
          }
        })
      }
      setSchedules(map)
      setDirtyUsers(new Set())
    } catch (e) {
      console.error(e)
      toast.error('Error cargando horarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, isoYear, isoWeek])

  // ----- Cargar la vista mensual (todo el equipo) -----
  // Se recarga al entrar a la vista mensual y al cambiar de mes, para reflejar
  // ediciones hechas en las vistas Semanal/Diaria al volver al overview.
  useEffect(() => {
    if (!businessId || viewMode !== 'month') return
    let cancelled = false
    setMonthLoading(true)
    getMonthScheduleAll(businessId, monthYear, monthIndex)
      .then((res) => {
        if (cancelled) return
        setMonthData(res.success ? res.data : { byUser: {}, publishedByDate: {} })
      })
      .finally(() => { if (!cancelled) setMonthLoading(false) })
    return () => { cancelled = true }
  }, [businessId, viewMode, monthYear, monthIndex])

  // Cerrar popover con click fuera
  useEffect(() => {
    if (!editingCell) return
    const onClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setEditingCell(null)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => document.removeEventListener('mousedown', onClick)
  }, [editingCell])

  // Cerrar el menú PDF al hacer click fuera (mismo patrón que el popover de celda).
  useEffect(() => {
    if (!showPdfMenu) return
    const onClick = (e) => {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target)) {
        setShowPdfMenu(false)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showPdfMenu])

  // ----- Navegación semanas -----
  const goPrev = () => {
    const next = addWeeks(isoYear, isoWeek, -1)
    setIsoYear(next.isoYear); setIsoWeek(next.isoWeek)
  }
  const goNext = () => {
    const next = addWeeks(isoYear, isoWeek, 1)
    setIsoYear(next.isoYear); setIsoWeek(next.isoWeek)
  }
  const goThis = () => {
    const t = getIsoWeek(new Date())
    setIsoYear(t.isoYear); setIsoWeek(t.isoWeek)
  }

  // ----- Navegación meses (vista mensual) -----
  const goPrevMonth = () => setMonthRef(new Date(monthYear, monthIndex - 1, 1))
  const goNextMonth = () => setMonthRef(new Date(monthYear, monthIndex + 1, 1))
  const goThisMonth = () => setMonthRef(new Date())

  // "Zoom" a un día: ajusta la semana ISO y el día seleccionado, y entra al
  // detalle diario. Es el gesto principal de la vista mensual.
  const zoomToDay = (date, from = 'month') => {
    const iso = getIsoWeek(date)
    setIsoYear(iso.isoYear)
    setIsoWeek(iso.isoWeek)
    setSelectedDayKey(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()])
    setDailyOrigin(from)
    setViewMode('daily')
  }

  // Volver del detalle diario al mes. Sincroniza el mes mostrado con el día que
  // se estaba viendo (por si se navegó de semana dentro del detalle).
  const backToMonth = () => {
    const idx = DAY_KEYS.indexOf(selectedDayKey)
    const d = weekDates[idx] || weekDates[0]
    if (d) setMonthRef(new Date(d.getFullYear(), d.getMonth(), 1))
    setViewMode('month')
  }

  // Salir del detalle diario hacia la vista de origen (semanal o mensual).
  const backFromDaily = () => {
    if (dailyOrigin === 'weekly') setViewMode('weekly')
    else backToMonth()
  }

  // ----- Mutaciones de celdas -----
  const setCell = (userId, dayKey, value) => {
    setSchedules((prev) => {
      const userSch = prev[userId] || { days: {}, totalHours: 0, publishedAt: null }
      const newDays = { ...userSch.days, [dayKey]: value }
      return {
        ...prev,
        [userId]: { ...userSch, days: newDays, totalHours: calculateWeekHours(newDays) },
      }
    })
    setDirtyUsers((prev) => new Set(prev).add(userId))
  }

  const assignTemplate = (userId, dayKey, template) => {
    // Si la plantilla tiene una sucursal por defecto (defaultBranchId),
    // priorizarla sobre el filtro activo del planner. Permite plantillas
    // tipo "Mañana Mall" que siempre quedan vinculadas a esa sucursal.
    const effectiveBranchId = template.defaultBranchId || selectedBranchId
    if (template.isRest) {
      setCell(userId, dayKey, { rest: true, branchId: effectiveBranchId })
    } else if (template.isRecovery) {
      // Recuperación: día visible en el horario pero NO suma horas semanales.
      // Útil para reponer un día perdido o cubrir una falta sin contabilizarlo
      // como hora extra en el cómputo del salario.
      setCell(userId, dayKey, { recovery: true, branchId: effectiveBranchId })
    } else {
      setCell(userId, dayKey, {
        templateId: template.id || null,
        start: template.startTime,
        end: template.endTime,
        breakMinutes: template.breakMinutes || 0,
        color: template.color || '#fbbf24',
        branchId: effectiveBranchId,
      })
    }
    setEditingCell(null)
  }

  const setRest = (userId, dayKey) => {
    setCell(userId, dayKey, { rest: true, branchId: selectedBranchId })
    setEditingCell(null)
  }
  const setRecovery = (userId, dayKey) => {
    setCell(userId, dayKey, { recovery: true, branchId: selectedBranchId })
    setEditingCell(null)
  }
  const clearCell = (userId, dayKey) => {
    setCell(userId, dayKey, null)
    setEditingCell(null)
  }
  const setCustom = (userId, dayKey, start, end, breakMin = 0) => {
    setSchedules((prev) => {
      const userSch = prev[userId] || { days: {}, totalHours: 0, publishedAt: null }
      const existing = userSch.days?.[dayKey] || {}
      // Si la celda existente está en OTRA sucursal (filtrada/oculta), tratarla como nueva
      // y no preservar nada. Evita sobrescribir datos de otra sucursal por accidente.
      const sameBranch = !existing.branchId || existing.branchId === selectedBranchId
      const base = sameBranch ? existing : {}
      const newDays = { ...userSch.days, [dayKey]: {
        ...base,
        start,
        end,
        breakMinutes: breakMin,
        color: base.color || '#94a3b8',
        branchId: selectedBranchId,
      } }
      return {
        ...prev,
        [userId]: { ...userSch, days: newDays, totalHours: calculateWeekHours(newDays) },
      }
    })
    setDirtyUsers((prev) => new Set(prev).add(userId))
    setEditingCell(null)
  }
  // Reemplaza solo start/end de una celda existente. Preserva templateId, color,
  // breakMinutes y branchId — pensado para drag (mover/redimensionar la barra).
  const updateCellTimes = (userId, dayKey, start, end) => {
    setSchedules((prev) => {
      const userSch = prev[userId] || { days: {}, totalHours: 0, publishedAt: null }
      const existing = userSch.days?.[dayKey] || {}
      const newDays = { ...userSch.days, [dayKey]: {
        ...existing,
        start,
        end,
        // Si la celda no tenía branchId (legacy), tagueamos con la activa al editar.
        branchId: existing.branchId || selectedBranchId,
      } }
      return {
        ...prev,
        [userId]: { ...userSch, days: newDays, totalHours: calculateWeekHours(newDays) },
      }
    })
    setDirtyUsers((prev) => new Set(prev).add(userId))
  }

  // ----- Acciones bulk -----
  const handleSaveAll = async () => {
    if (dirtyUsers.size === 0) { toast.info('No hay cambios para guardar'); return }
    setSaving(true)
    try {
      const promises = Array.from(dirtyUsers).map((uid) =>
        saveWeekSchedule(businessId, uid, isoYear, isoWeek, schedules[uid]?.days || {})
      )
      const results = await Promise.all(promises)
      const failed = results.filter((r) => !r.success).length
      if (failed) toast.error(`${failed} horario(s) fallaron al guardar`)
      else toast.success(`${dirtyUsers.size} horario(s) guardado(s)`)
      setDirtyUsers(new Set())
    } catch (e) {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyPrevious = async () => {
    if (!confirm('¿Copiar el horario de la semana anterior a esta semana? Reemplaza lo que tengas asignado.')) return
    setLoading(true)
    try {
      const promises = employees.map((emp) =>
        copyPreviousWeek(businessId, emp.id, isoYear, isoWeek).catch(() => ({ success: false }))
      )
      await Promise.all(promises)
      toast.success('Horario copiado de la semana anterior')
      await loadAll()
    } catch (e) {
      toast.error('Error al copiar')
    } finally {
      setLoading(false)
    }
  }

  const handlePrintPdf = async () => {
    if (employees.length === 0) {
      toast.error('No hay empleados para imprimir')
      return
    }
    setPrinting(true)
    try {
      await generateSchedulePDF({
        employees,
        // Pasamos las filas en el mismo orden y agrupamiento que muestra la UI
        // (incluye headers de sección cuando sortBy === 'department').
        rows: displayRows,
        schedules,
        weekDates,
        isoYear,
        isoWeek,
        businessInfo,
        branchName: selectedBranchName,
        // Filtrar el PDF a la sucursal activa (antes el PDF mostraba todas
        // las celdas sin importar el filtro de la UI — ahora coincide).
        branchId: selectedBranchId,
      })
      toast.success('PDF generado')
    } catch (e) {
      console.error(e)
      toast.error('Error al generar PDF')
    } finally {
      setPrinting(false)
    }
  }

  // Genera un PDF por cada sucursal accesible. Cada PDF contiene SOLO los
  // turnos de esa sucursal — los empleados que no tienen turnos en ella se
  // ocultan; los que tienen en varias aparecen en cada PDF correspondiente
  // con sólo sus turnos de esa sucursal.
  const handlePrintPerBranch = async () => {
    if (employees.length === 0) {
      toast.error('No hay empleados para imprimir')
      return
    }
    if (!branches || branches.length === 0) {
      toast.error('No hay sucursales configuradas')
      return
    }
    setPrinting(true)
    try {
      for (const branch of branches) {
        await generateSchedulePDF({
          employees,
          rows: displayRows,
          schedules,
          weekDates,
          isoYear,
          isoWeek,
          businessInfo,
          branchName: branch.name || 'Sucursal',
          branchId: branch.id,
        })
      }
      toast.success(`${branches.length} PDF(s) generado(s)`)
    } catch (e) {
      console.error(e)
      toast.error('Error al generar PDFs')
    } finally {
      setPrinting(false)
    }
  }

  const handlePublish = async () => {
    if (dirtyUsers.size > 0) {
      if (!confirm('Hay cambios sin guardar. Se guardarán antes de publicar. ¿Continuar?')) return
      await handleSaveAll()
    }
    setPublishing(true)
    try {
      const res = await publishWeekSchedules(businessId, isoYear, isoWeek, 'all', currentUserUid)
      if (res.success) {
        toast.success(`${res.count} horario(s) publicado(s)`)
        await loadAll()
      } else {
        toast.error(res.error || 'Error al publicar')
      }
    } finally {
      setPublishing(false)
    }
  }

  // ----- CRUD Plantillas -----
  const handleSaveTemplate = async (data) => {
    try {
      const isNew = !data.id
      const res = isNew
        ? await createShiftTemplate(businessId, data)
        : await updateShiftTemplate(businessId, data.id, data)
      if (res.success) {
        toast.success(isNew ? 'Plantilla creada' : 'Plantilla actualizada')
        setEditingTemplate(null)
        const tplRes = await listShiftTemplates(businessId)
        if (tplRes.success) setTemplates(tplRes.data)
      } else {
        toast.error(res.error || 'Error')
      }
    } catch (e) {
      toast.error('Error guardando plantilla')
    }
  }

  const handleDeleteTemplate = async (tid) => {
    if (!confirm('¿Eliminar plantilla? Los horarios ya asignados con esta plantilla seguirán funcionando.')) return
    const res = await deleteShiftTemplate(businessId, tid)
    if (res.success) {
      toast.success('Plantilla eliminada')
      setTemplates((prev) => prev.filter((t) => t.id !== tid))
    } else {
      toast.error('Error eliminando plantilla')
    }
  }

  // Total de horas SOLO de la sucursal activa, para mostrar al lado de cada empleado.
  // El campo sch.totalHours del doc sigue siendo el total real (todas las sucursales);
  // este cálculo solo afecta el número visible en la UI según el filtro de sucursal.
  const calculateBranchHours = (daysObj, branchId) => {
    if (!daysObj) return 0
    const filtered = {}
    for (const key of DAY_KEYS) {
      const d = daysObj[key]
      if (d && cellBranchId(d) === branchId) filtered[key] = d
    }
    return calculateWeekHours(filtered)
  }

  // ----- Render -----
  const totalDirty = dirtyUsers.size
  const totalEmployees = employees.length
  const publishedCount = Object.values(schedules).filter((s) => s.publishedAt).length

  // displayRows: array mixto de empleados + headers de sección por área cuando
  // sortBy === 'department'. Cada item tiene { type: 'header'|'employee', ... }
  // para que el tbody los renderice diferenciadamente. Empleados sin
  // department van al final agrupados como "Sin área".
  const displayRows = useMemo(() => {
    if (sortBy !== 'department') {
      return employees.map(emp => ({ type: 'employee', emp }))
    }
    // Agrupar
    const byDept = new Map()
    for (const emp of employees) {
      const dept = (emp.department || '').trim()
      const key = dept || '__NO_AREA__'
      if (!byDept.has(key)) byDept.set(key, { name: dept || 'Sin área', items: [] })
      byDept.get(key).items.push(emp)
    }
    // Ordenar grupos alfabéticamente (Sin área al final)
    const groups = Array.from(byDept.entries())
      .sort(([ka, ga], [kb, gb]) => {
        if (ka === '__NO_AREA__') return 1
        if (kb === '__NO_AREA__') return -1
        return ga.name.localeCompare(gb.name, 'es', { sensitivity: 'base' })
      })
    // Aplanar a fila tipo header + empleados
    const rows = []
    for (const [, g] of groups) {
      rows.push({ type: 'header', name: g.name, count: g.items.length })
      // Empleados dentro de un grupo: alfabético por displayName
      const sorted = [...g.items].sort((a, b) =>
        (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '', 'es', { sensitivity: 'base' })
      )
      for (const emp of sorted) rows.push({ type: 'employee', emp })
    }
    return rows
  }, [employees, sortBy])

  // Etiquetas de cabecera según la vista.
  const monthLabel = `${MONTHS_ES[monthIndex]} ${monthYear}`
  const selDate = weekDates[DAY_KEYS.indexOf(selectedDayKey)] || weekDates[0]
  const selectedDayLabel = selDate
    ? selDate.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '')
    : ''

  const emptyEmployeesBlock = (
    <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-sm text-gray-500">
      No hay empleados. Agregá personal desde &quot;Gestión de Usuarios&quot; para asignarles horarios.
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-center gap-2 flex-wrap">
          {viewMode === 'daily' ? (
            <>
              {/* Detalle de un día (zoom): volver a la vista de origen + navegación de semana */}
              <button
                onClick={backFromDaily}
                className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50 rounded-lg"
                title={dailyOrigin === 'weekly' ? 'Volver a la vista semanal' : 'Volver a la vista mensual'}
              >
                <ChevronLeft className="w-4 h-4" /> {dailyOrigin === 'weekly' ? 'Semana' : 'Mes'}
              </button>
              <div className="flex items-center gap-2 px-2">
                <Calendar className="w-4 h-4 text-primary-600" />
                <div className="text-sm">
                  <div className="font-semibold text-gray-900 capitalize">{selectedDayLabel}</div>
                  <div className="text-xs text-gray-500">Semana {isoWeek} · {isoYear}</div>
                </div>
              </div>
              <button onClick={goPrev} className="p-2 rounded-lg hover:bg-gray-100" title="Semana anterior">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goNext} className="p-2 rounded-lg hover:bg-gray-100" title="Semana siguiente">
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : viewMode === 'month' ? (
            <>
              {/* Navegación de mes */}
              <button onClick={goPrevMonth} className="p-2 rounded-lg hover:bg-gray-100" title="Mes anterior">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-3">
                <Calendar className="w-4 h-4 text-primary-600" />
                <div className="text-sm font-semibold text-gray-900 min-w-[120px]">{monthLabel}</div>
              </div>
              <button onClick={goNextMonth} className="p-2 rounded-lg hover:bg-gray-100" title="Mes siguiente">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={goThisMonth}
                className="ml-1 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-lg"
              >
                Hoy
              </button>
            </>
          ) : (
            <>
              {/* Navegación de semana (vista semanal) */}
              <button onClick={goPrev} className="p-2 rounded-lg hover:bg-gray-100" title="Semana anterior">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-3">
                <Calendar className="w-4 h-4 text-primary-600" />
                <div className="text-sm">
                  <div className="font-semibold text-gray-900">Semana {isoWeek} · {isoYear}</div>
                  <div className="text-xs text-gray-500">{formatRange(monday, sunday)}</div>
                </div>
              </div>
              <button onClick={goNext} className="p-2 rounded-lg hover:bg-gray-100" title="Semana siguiente">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={goThis}
                className="ml-2 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-lg"
              >
                Hoy
              </button>
            </>
          )}

          {/* Toggle Mes / Semana — oculto en el detalle diario (es un zoom, se sale con "Mes") */}
          {viewMode !== 'daily' && (
            <div className="ml-2 flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === 'month' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Mes
              </button>
              <button
                onClick={() => setViewMode('weekly')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === 'weekly' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Semana
              </button>
            </div>
          )}
        </div>

        {/* Herramientas de edición (semana/día). En la vista mensual (overview) se
            ocultan: el mes es sólo para navegar, se edita al hacer zoom a un día. */}
        {viewMode !== 'month' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowTemplateManager((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border ${
              showTemplateManager ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Plantillas <span className="text-xs text-gray-400">({templates.length})</span>
          </button>
          <button
            onClick={handleCopyPrevious}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            title="Copiar el horario de la semana anterior a todos"
          >
            <Copy className="w-3.5 h-3.5" />
            Copiar semana anterior
          </button>
          {/* Selector de ordenamiento — agrupa por área si hay departamentos */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-sm rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5"
            title="Cómo ordenar los empleados en la tabla y el PDF"
          >
            <option value="name">Ordenar: Nombre</option>
            <option value="department">Agrupar por área</option>
          </select>
          {/* PDF: con una sola sucursal es un botón directo; con varias se
              convierte en un menú que agrupa las dos formas de exportar. */}
          {branches && branches.length > 1 ? (
            <div className="relative" ref={pdfMenuRef}>
              <button
                onClick={() => setShowPdfMenu((v) => !v)}
                disabled={printing || employees.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                title="Exportar horario a PDF"
              >
                {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                PDF
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showPdfMenu ? 'rotate-180' : ''}`} />
              </button>
              {showPdfMenu && (
                <div className="absolute right-0 z-50 mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                  <button
                    onClick={() => { setShowPdfMenu(false); handlePrintPdf() }}
                    disabled={printing || employees.length === 0}
                    className="w-full flex items-start gap-2 px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <FileDown className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                    <span>
                      <span className="block font-medium">Esta sucursal</span>
                      <span className="block text-[11px] text-gray-400">Solo {selectedBranchName || 'la sucursal actual'}</span>
                    </span>
                  </button>
                  <button
                    onClick={() => { setShowPdfMenu(false); handlePrintPerBranch() }}
                    disabled={printing || employees.length === 0}
                    className="w-full flex items-start gap-2 px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <FileDown className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                    <span>
                      <span className="block font-medium">Una por sucursal</span>
                      <span className="block text-[11px] text-gray-400">Genera {branches.length} PDFs separados</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handlePrintPdf}
              disabled={printing || employees.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Descargar el horario en PDF"
            >
              {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              PDF
            </button>
          )}

          {/* Separador: herramientas (izq.) vs. acciones principales (der.) */}
          <div className="hidden sm:block w-px h-6 bg-gray-200 mx-1" />

          <button
            onClick={handlePublish}
            disabled={publishing || totalEmployees === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Publicar ({publishedCount}/{totalEmployees})
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving || totalDirty === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar {totalDirty > 0 && <span className="bg-white text-primary-700 text-[10px] px-1.5 rounded-full">{totalDirty}</span>}
          </button>
        </div>
        )}
      </div>

      {/* Plantillas (collapsable) */}
      {showTemplateManager && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary-600" />
              Plantillas de turno
            </h4>
            <button
              onClick={() => setEditingTemplate({ name: '', startTime: '08:00', endTime: '17:00', breakMinutes: 0, color: PALETTE[0], isRest: false })}
              className="flex items-center gap-1.5 px-3 py-1 text-sm text-primary-700 hover:bg-primary-50 rounded-lg"
            >
              <Plus className="w-4 h-4" /> Nueva plantilla
            </button>
          </div>

          {templates.length === 0 && !editingTemplate && (
            <p className="text-sm text-gray-500 italic">No hay plantillas. Creá una para asignar turnos rápido.</p>
          )}

          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50"
              >
                <span className="w-3 h-3 rounded-full" style={{ background: t.color || '#fbbf24' }} />
                <span className="text-sm font-medium">{t.name}</span>
                <span className="text-xs text-gray-500">{t.startTime}-{t.endTime}</span>
                {t.breakMinutes > 0 && (
                  <span className="text-xs text-gray-400 flex items-center gap-0.5">
                    <Coffee className="w-3 h-3" />{t.breakMinutes}m
                  </span>
                )}
                {t.defaultBranchId && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium"
                    title="Sucursal por defecto al aplicar esta plantilla"
                  >
                    📍 {branches.find(b => b.id === t.defaultBranchId)?.name || 'Sucursal'}
                  </span>
                )}
                <button
                  onClick={() => setEditingTemplate({ ...t })}
                  className="text-gray-400 hover:text-primary-600 ml-1"
                  title="Editar"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteTemplate(t.id)}
                  className="text-gray-400 hover:text-red-600"
                  title="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {editingTemplate && (
            <TemplateForm
              template={editingTemplate}
              branches={branches}
              onSave={handleSaveTemplate}
              onCancel={() => setEditingTemplate(null)}
            />
          )}
        </div>
      )}

      {/* Vistas */}
      {viewMode === 'month' ? (
        /* Vista mensual (overview navegable): tocar un día hace zoom al detalle */
        employees.length === 0 ? emptyEmployeesBlock : (
          <ScheduleMonthOverview
            year={monthYear}
            monthIndex={monthIndex}
            employees={employees}
            selectedBranchId={selectedBranchId}
            data={monthData}
            loading={monthLoading}
            onSelectDay={zoomToDay}
          />
        )
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando horarios...
        </div>
      ) : employees.length === 0 ? (
        emptyEmployeesBlock
      ) : viewMode === 'daily' ? (
        /* Vista timeline diaria */
        <DailyTimeline
          rows={displayRows}
          schedules={schedules}
          dirtyUsers={dirtyUsers}
          weekDates={weekDates}
          selectedDayKey={selectedDayKey}
          onSelectDay={setSelectedDayKey}
          templates={templates}
          editingCell={editingCell}
          setEditingCell={setEditingCell}
          popoverRef={popoverRef}
          assignTemplate={assignTemplate}
          setRest={setRest}
          setRecovery={setRecovery}
          clearCell={clearCell}
          setCustom={setCustom}
          updateCellTimes={updateCellTimes}
          selectedBranchId={selectedBranchId}
          onEmployeeClick={setDetailEmployee}
        />
      ) : (
        /* Grid semanal */
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-2 sm:px-4 py-3 font-medium text-gray-600 text-xs uppercase sticky left-0 bg-gray-50 z-10 min-w-[120px] sm:min-w-[180px]">
                    Empleado
                  </th>
                  {DAY_KEYS.map((dk, i) => {
                    const date = weekDates[i]
                    const isToday = date.toDateString() === new Date().toDateString()
                    return (
                      <th key={dk} className={`px-1 py-1 min-w-[100px] sm:min-w-[120px] ${isToday ? 'bg-primary-50' : ''}`}>
                        <button
                          type="button"
                          onClick={() => zoomToDay(date, 'weekly')}
                          title={`Ver el ${DAY_LABELS[dk]} ${formatDayShort(date)} en detalle`}
                          className={`w-full text-center px-1 sm:px-2 py-2 rounded-lg font-medium text-xs uppercase transition-colors hover:bg-primary-100/70 focus:bg-primary-100/70 focus:outline-none ${isToday ? 'text-primary-700' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                          <div>{DAY_LABELS[dk]}</div>
                          <div className="text-[10px] text-gray-400 normal-case font-normal">{formatDayShort(date)}</div>
                        </button>
                      </th>
                    )
                  })}
                  <th className="text-right px-2 sm:px-4 py-3 font-medium text-gray-600 text-xs uppercase min-w-[70px] sm:min-w-[80px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, rowIdx) => {
                  // Header de sección (sólo cuando sortBy === 'department')
                  if (row.type === 'header') {
                    return (
                      <tr key={`hdr-${row.name}-${rowIdx}`} className="bg-gray-50 border-y border-gray-200">
                        <td colSpan={DAY_KEYS.length + 2} className="sticky left-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 bg-gray-50">
                          {row.name} <span className="text-gray-400 font-normal normal-case">· {row.count} empleado{row.count !== 1 ? 's' : ''}</span>
                        </td>
                      </tr>
                    )
                  }
                  const emp = row.emp
                  const sch = schedules[emp.id] || { days: {}, totalHours: 0 }
                  const isDirty = dirtyUsers.has(emp.id)
                  const initials = (emp.displayName || emp.email || '?')
                    .split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                  return (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-2 sm:px-4 py-2 sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {initials || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setDetailEmployee(emp)}
                                className="font-medium text-gray-900 hover:text-primary-700 hover:underline truncate max-w-[90px] sm:max-w-[140px] text-xs sm:text-sm text-left"
                                title="Ver horario del mes"
                              >
                                {emp.displayName || 'Sin nombre'}
                              </button>
                              {isDirty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" title="Cambios sin guardar" />}
                            </div>
                            {emp.jobTitle && <div className="hidden sm:block text-[11px] text-gray-500 truncate max-w-[140px]">{emp.jobTitle}</div>}
                          </div>
                        </div>
                      </td>
                      {DAY_KEYS.map((dk) => {
                        const rawCell = sch.days?.[dk]
                        // Solo se considera "asignada" si pertenece a la sucursal activa.
                        // Si no coincide, la celda se renderiza como vacía (pero la data
                        // sigue ahí — al cambiar de sucursal vuelve a aparecer).
                        const cell = (rawCell && cellBranchId(rawCell) === selectedBranchId) ? rawCell : null
                        return (
                          <td key={dk} className="px-1.5 py-1.5 text-center align-middle relative">
                            <ScheduleCell
                              cell={cell}
                              onClick={(e) => setEditingCell({ userId: emp.id, dayKey: dk })}
                              isEditing={editingCell?.userId === emp.id && editingCell?.dayKey === dk}
                            />
                            {editingCell?.userId === emp.id && editingCell?.dayKey === dk && (
                              <CellPopover
                                ref={popoverRef}
                                templates={templates}
                                cell={cell}
                                onPickTemplate={(t) => assignTemplate(emp.id, dk, t)}
                                onRest={() => setRest(emp.id, dk)}
                                onRecovery={() => setRecovery(emp.id, dk)}
                                onClear={() => clearCell(emp.id, dk)}
                                onCustom={(s, e, b) => setCustom(emp.id, dk, s, e, b)}
                                onClose={() => setEditingCell(null)}
                              />
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2 text-right">
                        {(() => {
                          const branchHours = calculateBranchHours(sch.days, selectedBranchId)
                          return (
                            <span className={`font-semibold ${branchHours > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                              {branchHours.toFixed(1)}h
                            </span>
                          )
                        })()}
                        {sch.publishedAt && (
                          <div className="text-[10px] text-emerald-600">Publicado</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: horario mensual de un colaborador (se abre al click en su nombre) */}
      <CollaboratorScheduleModal
        isOpen={!!detailEmployee}
        onClose={() => setDetailEmployee(null)}
        businessId={businessId}
        employee={detailEmployee}
        branches={branches}
      />
    </div>
  )
}

// -------- Sub-componentes --------

function ScheduleCell({ cell, onClick }) {
  if (!cell) {
    return (
      <button
        onClick={onClick}
        className="w-full h-12 rounded-md border border-dashed border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors text-gray-300 hover:text-primary-600 text-xs"
      >
        +
      </button>
    )
  }
  if (cell.rest) {
    return (
      <button
        onClick={onClick}
        className="w-full h-12 rounded-md border border-gray-200 bg-gray-100 text-gray-500 text-xs font-medium hover:bg-gray-200"
      >
        Descanso
      </button>
    )
  }
  if (cell.recovery) {
    return (
      <button
        onClick={onClick}
        className="w-full h-12 rounded-md border border-orange-200 bg-orange-50 text-orange-700 text-xs font-medium hover:bg-orange-100"
        title="Día de recuperación (no suma a las horas semanales)"
      >
        Recuperación
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className="w-full h-12 rounded-md border text-xs font-semibold transition-shadow hover:shadow-sm flex flex-col items-center justify-center px-1"
      style={{
        background: (cell.color || '#fbbf24') + '20',
        borderColor: (cell.color || '#fbbf24') + '60',
        color: '#1f2937',
      }}
    >
      <span className="leading-tight">{cell.start} - {cell.end}</span>
      {cell.breakMinutes > 0 && (
        <span className="text-[10px] text-gray-500 leading-none mt-0.5">−{cell.breakMinutes}m</span>
      )}
    </button>
  )
}

const CellPopover = forwardRef(({ templates, cell, onPickTemplate, onRest, onRecovery, onClear, onCustom, onClose }, ref) => {
  // Si ya hay un turno asignado (no descanso ni recuperación), abrimos directo
  // en modo edición personalizado para que el usuario pueda ajustar tiempos y
  // refrigerio en un click.
  const hasExistingShift = !!(cell && cell.start && cell.end && !cell.rest && !cell.recovery)
  const [customMode, setCustomMode] = useState(hasExistingShift)
  const [start, setStart] = useState(cell?.start || '08:00')
  const [end, setEnd] = useState(cell?.end || '17:00')
  const [breakMin, setBreakMin] = useState(cell?.breakMinutes || 0)

  // Atajo: tecla Supr / Delete con el popover abierto → eliminar el turno.
  // Solo si hay celda asignada y el foco NO está en un input (para no interferir
  // cuando el usuario está editando hora o minutos de refrigerio).
  useEffect(() => {
    if (!cell) return
    const handleKey = (e) => {
      if (e.key !== 'Delete') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      onClear()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [cell, onClear])

  // Resumen en vivo del turno personalizado. Soporta turnos que cruzan la
  // medianoche (fin <= inicio, p. ej. 22:00–05:00): se interpretan como que
  // terminan al día siguiente, y así el usuario ve la duración real y un aviso.
  const sMin = timeToMinutes(start)
  let eMin = timeToMinutes(end)
  const crossesMidnight = eMin <= sMin
  if (crossesMidnight) eMin += 24 * 60
  const shiftNetHours = Math.max(0, eMin - sMin - (breakMin || 0)) / 60

  return (
    <div
      ref={ref}
      className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 w-[min(16rem,calc(100vw-2rem))] sm:w-64 bg-white border border-gray-200 rounded-lg shadow-xl py-1 text-left"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-1 border-b border-gray-100">
        <span className="text-[11px] uppercase text-gray-400 font-semibold">Asignar turno</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {customMode ? (
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-0.5">Inicio</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-0.5">Fin</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase mb-0.5 flex items-center gap-1">
              <Coffee className="w-3 h-3" /> Refrigerio (min)
            </label>
            <input
              type="number"
              min="0"
              step="15"
              value={breakMin}
              onChange={(e) => setBreakMin(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
            />
          </div>

          {/* Resumen en vivo: duración + aviso de cruce de medianoche */}
          <div className="flex items-center justify-between text-[11px] pt-0.5">
            <span className="text-gray-500">Duración</span>
            <span className="font-semibold text-gray-900">{shiftNetHours.toFixed(1)} h</span>
          </div>
          {crossesMidnight && (
            <div className="flex items-center gap-1.5 text-[11px] text-primary-700 bg-primary-50 border border-primary-100 rounded px-2 py-1">
              <ChevronRight className="w-3 h-3 flex-shrink-0" />
              <span>Cruza la medianoche · termina al día siguiente <span className="font-semibold">(+1)</span></span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setCustomMode(false)}
              className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              Volver
            </button>
            <button
              onClick={() => onCustom(start, end, breakMin)}
              className="flex-1 px-3 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
            >
              Aplicar
            </button>
          </div>
        </div>
      ) : (
        <>
          {templates.length > 0 && (
            <div className="max-h-48 overflow-y-auto py-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onPickTemplate(t)}
                  className="w-full px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2 text-sm"
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color || '#fbbf24' }} />
                  <span className="font-medium flex-1 text-left truncate">{t.name}</span>
                  <span className="text-xs text-gray-500">{t.startTime}-{t.endTime}</span>
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 py-1">
            <button
              onClick={() => setCustomMode(true)}
              className="w-full px-3 py-1.5 hover:bg-gray-50 text-sm text-left flex items-center gap-2 text-primary-700"
            >
              <Edit2 className="w-3.5 h-3.5" /> Turno personalizado
            </button>
            <button
              onClick={onRest}
              className="w-full px-3 py-1.5 hover:bg-gray-50 text-sm text-left flex items-center gap-2 text-gray-700"
            >
              <Coffee className="w-3.5 h-3.5" /> Descanso
            </button>
            <button
              onClick={onRecovery}
              className="w-full px-3 py-1.5 hover:bg-orange-50 text-sm text-left flex items-center gap-2 text-orange-700"
              title="No suma a las horas semanales, pero queda visible en el horario"
            >
              <Coffee className="w-3.5 h-3.5" /> Recuperación
            </button>
            {cell && (
              <button
                onClick={onClear}
                className="w-full px-3 py-1.5 hover:bg-red-50 text-sm text-left flex items-center gap-2 text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="flex-1">Quitar turno</span>
                <kbd className="text-[10px] px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-gray-500 font-mono">Supr</kbd>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
})

function TemplateForm({ template, branches = [], onSave, onCancel }) {
  const [data, setData] = useState({
    id: template.id || null,
    name: template.name || '',
    startTime: template.startTime || '08:00',
    endTime: template.endTime || '17:00',
    breakMinutes: template.breakMinutes || 0,
    color: template.color || PALETTE[0],
    isRest: template.isRest || false,
    // Sucursal por defecto. Si está, se aplica al asignar la plantilla en vez
    // del filtro activo del planner. '' = sin asignar (usa filtro activo).
    defaultBranchId: template.defaultBranchId || '',
  })

  const submit = () => {
    if (!data.name.trim()) { alert('Ponele un nombre a la plantilla'); return }
    onSave(data)
  }

  return (
    <div className="mt-4 border border-primary-200 bg-primary-50/40 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="font-medium text-sm">{data.id ? 'Editar plantilla' : 'Nueva plantilla'}</h5>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Nombre</label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => setData((p) => ({ ...p, name: e.target.value }))}
          placeholder="Ej: Mañana 8-17"
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Inicio</label>
          <input
            type="time"
            value={data.startTime}
            onChange={(e) => setData((p) => ({ ...p, startTime: e.target.value }))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Fin</label>
          <input
            type="time"
            value={data.endTime}
            onChange={(e) => setData((p) => ({ ...p, endTime: e.target.value }))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Descanso (min)</label>
          <input
            type="number"
            min="0"
            value={data.breakMinutes}
            onChange={(e) => setData((p) => ({ ...p, breakMinutes: Number(e.target.value) || 0 }))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Color</label>
        <div className="flex gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setData((p) => ({ ...p, color: c }))}
              className={`w-6 h-6 rounded-full border-2 ${data.color === c ? 'border-gray-900' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      {/* Sucursal por defecto (opcional). Si se elige, al aplicar la plantilla
          se asigna esa sucursal automáticamente sin importar el filtro activo. */}
      {branches && branches.length > 0 && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">Sucursal por defecto (opcional)</label>
          <select
            value={data.defaultBranchId}
            onChange={(e) => setData((p) => ({ ...p, defaultBranchId: e.target.value }))}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
          >
            <option value="">— Usar la sucursal del filtro activo —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <p className="text-[10px] text-gray-500 mt-1">
            Útil para plantillas como "Mañana Mall" que siempre van a esa sucursal.
          </p>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          className="flex-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
        >
          {data.id ? 'Guardar cambios' : 'Crear plantilla'}
        </button>
      </div>
    </div>
  )
}

// ===================== Vista timeline diaria (cinta continua) =====================
// La vista "Día" es una LÍNEA DE TIEMPO CONTINUA de los 7 días de la semana. Cada
// día ocupa 24 h sobre un mismo eje horizontal, de modo que un turno que cruza la
// medianoche (p. ej. 22:00–05:00) fluye sin cortes hacia el día siguiente. Se recorre
// arrastrando con el mouse (drag-to-pan) o deslizando en táctil; las flechas del
// encabezado cambian de semana. La edición (asignar, mover, redimensionar) se conserva
// por día: cada acción se mapea al dayKey correspondiente según la posición horizontal.

function DailyTimeline({
  rows, schedules, dirtyUsers, weekDates, selectedDayKey, onSelectDay,
  templates, editingCell, setEditingCell, popoverRef,
  assignTemplate, setRest, setRecovery, clearCell, setCustom, updateCellTimes, selectedBranchId,
  onEmployeeClick,
}) {
  const scrollRef = useRef(null)
  // Evita re-centrar el scroll en cada edición: sólo se reposiciona cuando cambia
  // la semana, el día ancla o la sucursal (no al mover/editar una celda).
  const lastScrollKeyRef = useRef('')

  const isToday = (d) => d && d.toDateString() === new Date().toDateString()
  const todayIdx = weekDates.findIndex((d) => isToday(d))
  const anchorIdx = Math.max(0, DAY_KEYS.indexOf(selectedDayKey))
  // Clave estable de la semana (cambia al navegar de semana) → re-centra el scroll.
  const weekKey = weekDates[0]?.toDateString() || ''

  // Cola overnight del domingo: cuánto se extiende el último turno más allá del fin
  // de la semana, para no recortarlo (tope 12 h).
  const tailMin = useMemo(() => {
    let tail = 0
    for (const row of rows) {
      if (row?.type !== 'employee') continue
      const c = schedules[row.emp.id]?.days?.sun
      if (!c || c.rest || c.recovery || !c.start || !c.end) continue
      if (cellBranchId(c) !== selectedBranchId) continue
      const s = timeToMinutes(c.start)
      const e = timeToMinutes(c.end)
      if (e <= s) tail = Math.max(tail, e) // 'e' = minutos dentro del lunes siguiente
    }
    return Math.min(tail, 12 * 60)
  }, [rows, schedules, selectedBranchId])

  const totalMin = 7 * DAY_MIN + tailMin
  const canvasW = xOfMin(totalMin)
  const hourTicks = Math.ceil(totalMin / 60)

  // ----- Auto-scroll al día ancla (mostrando sus horas de trabajo, no la madrugada) -----
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const key = `${weekKey}|${selectedDayKey}|${selectedBranchId}`
    if (lastScrollKeyRef.current === key) return // ya centrado para esta semana/día/sucursal
    lastScrollKeyRef.current = key
    let earliest = 7 * 60 // fallback 07:00 si el día no tiene turnos
    for (const row of rows) {
      if (row?.type !== 'employee') continue
      const c = schedules[row.emp.id]?.days?.[selectedDayKey]
      if (!c || c.rest || c.recovery || !c.start) continue
      if (cellBranchId(c) !== selectedBranchId) continue
      earliest = Math.min(earliest, timeToMinutes(c.start))
    }
    const idx = Math.max(0, DAY_KEYS.indexOf(selectedDayKey))
    el.scrollLeft = Math.max(0, xOfMin(idx * DAY_MIN + Math.max(0, earliest - 60)))
  }, [schedules, rows, selectedDayKey, weekKey, selectedBranchId])

  // ----- Drag de la barra (mover / redimensionar) sobre el eje continuo -----
  const [dragState, setDragState] = useState(null)
  const dragStateRef = useRef(null)
  dragStateRef.current = dragState
  const wasDraggedRef = useRef(false)
  const SNAP_MIN = 30
  const HANDLE_PX = 10

  const minutesToTime = (mins) => {
    const total = ((mins % DAY_MIN) + DAY_MIN) % DAY_MIN
    const h = Math.floor(total / 60)
    const m = total % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  const beginDrag = (e, emp, dk, di, cell, mode) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const dayBase = di * DAY_MIN
    const origStart = dayBase + timeToMinutes(cell.start)
    let origEnd = dayBase + timeToMinutes(cell.end)
    if (origEnd <= origStart) origEnd += DAY_MIN // cruza medianoche
    let didMove = false
    const captureTarget = e.currentTarget
    const pointerId = e.pointerId
    try { captureTarget.setPointerCapture(pointerId) } catch { /* pointer capture opcional */ }

    const compute = (clientX) => {
      const dxSnap = Math.round(minOfX(clientX - startX) / SNAP_MIN) * SNAP_MIN
      let s = origStart
      let en = origEnd
      if (mode === 'move') {
        s = origStart + dxSnap; en = origEnd + dxSnap
        // El turno se mantiene en SU día: el inicio no sale de [00:00, 24:00) de ese día.
        const lo = dayBase
        const hiStart = dayBase + DAY_MIN - SNAP_MIN
        if (s < lo) { const d = lo - s; s += d; en += d }
        if (s > hiStart) { const d = s - hiStart; s -= d; en -= d }
      } else if (mode === 'resize-left') {
        s = Math.max(dayBase, Math.min(origStart + dxSnap, origEnd - SNAP_MIN))
      } else if (mode === 'resize-right') {
        en = Math.min(dayBase + DAY_MIN + 12 * 60, Math.max(origEnd + dxSnap, origStart + SNAP_MIN))
      }
      return { start: minutesToTime(s), end: minutesToTime(en) }
    }

    const onMove = (mv) => {
      if (!didMove && Math.abs(mv.clientX - startX) > 3) didMove = true
      setDragState({ userId: emp.id, dayKey: dk, ...compute(mv.clientX) })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try { captureTarget.releasePointerCapture(pointerId) } catch { /* pointer capture opcional */ }
      const latest = dragStateRef.current
      if (didMove && latest && updateCellTimes) {
        updateCellTimes(emp.id, dk, latest.start, latest.end)
        wasDraggedRef.current = true
        setTimeout(() => { wasDraggedRef.current = false }, 0)
      }
      setDragState(null)
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // ----- Pan con mouse: arrastrar el fondo para recorrer el tiempo -----
  // En táctil se usa el scroll nativo (swipe), por eso el pan manual es sólo mouse.
  const didPanRef = useRef(false)
  const beginPan = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if (e.target.closest('[data-bar="1"]')) return // las barras manejan su propio drag
    const el = scrollRef.current
    if (!el) return
    const startX = e.clientX
    const startScroll = el.scrollLeft
    didPanRef.current = false
    const onMove = (mv) => {
      const dx = mv.clientX - startX
      if (Math.abs(dx) > 3) didPanRef.current = true
      el.scrollLeft = startScroll - dx
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setTimeout(() => { didPanRef.current = false }, 0)
    }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Abre el popover de una celda anclando su posición horizontal (clamp para no salir).
  const openCell = (emp, dk, leftPx) => {
    setEditingCell({ userId: emp.id, dayKey: dk, leftPx: Math.max(140, Math.min(leftPx, canvasW - 140)) })
  }

  // Click en zona vacía del track → asigna turno al día correspondiente a esa x.
  const handleTrackClick = (e, emp) => {
    if (didPanRef.current) return
    if (e.target.dataset.role !== 'track') return
    const rect = e.currentTarget.getBoundingClientRect()
    const di = Math.min(6, Math.max(0, Math.floor(minOfX(e.clientX - rect.left) / DAY_MIN)))
    openCell(emp, DAY_KEYS[di], di * DAY_W + DAY_W / 2)
  }

  // Rejilla de fondo (sin DOM extra): línea marcada por día + línea tenue por hora.
  const gridStyle = {
    backgroundImage:
      `repeating-linear-gradient(to right, ${TL_DAY_LINE} 0, ${TL_DAY_LINE} 1px, transparent 1px, transparent ${DAY_W}px),` +
      `repeating-linear-gradient(to right, ${TL_HOUR_LINE} 0, ${TL_HOUR_LINE} 1px, transparent 1px, transparent ${PX_PER_HOUR}px)`,
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Chips de día — saltan (auto-scroll) a ese día dentro de la cinta */}
      <div className="border-b border-gray-100 p-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-gray-500 mr-1 uppercase font-semibold hidden sm:inline">Ir a:</span>
        {DAY_KEYS.map((dk, i) => {
          const date = weekDates[i]
          const isSel = selectedDayKey === dk
          const hoy = isToday(date)
          return (
            <button
              key={dk}
              onClick={() => onSelectDay(dk)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1 ${
                isSel ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span>{DAY_LABELS[dk]}</span>
              <span className={`text-[10px] ${isSel ? 'opacity-90' : 'text-gray-500'}`}>
                {date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '')}
              </span>
              {hoy && <span className={`text-[9px] uppercase font-bold ${isSel ? 'text-white' : 'text-primary-600'}`}>HOY</span>}
            </button>
          )
        })}
        <span className="ml-auto hidden md:flex items-center gap-1 text-[11px] text-gray-400">
          <MoveHorizontal className="w-3.5 h-3.5" /> Arrastra para recorrer los días
        </span>
      </div>

      {/* Cinta continua (scroll horizontal + drag-to-pan) */}
      <div ref={scrollRef} className="overflow-x-auto timeline-scrollbar" onPointerDown={beginPan}>
        <div className="relative" style={{ width: TL_NAME_W + canvasW }}>
          {/* Encabezado pegajoso: banda de días (arriba) + horas (abajo) */}
          <div className="flex sticky top-0 z-20 bg-gray-50 border-b border-gray-200" style={{ height: 40 }}>
            <div
              className="flex-shrink-0 sticky left-0 z-10 bg-gray-50 border-r border-gray-200 flex items-end px-3 pb-1 text-[11px] font-medium text-gray-600 uppercase"
              style={{ width: TL_NAME_W }}
            >
              Empleado
            </div>
            <div className="relative flex-shrink-0" style={{ width: canvasW }}>
              {DAY_KEYS.map((dk, i) => {
                const date = weekDates[i]
                const hoy = isToday(date)
                const isAnchor = i === anchorIdx
                return (
                  <div
                    key={dk}
                    className={`absolute top-0 h-5 flex items-center gap-1 px-2 text-[10px] font-semibold border-r border-gray-200 overflow-hidden ${
                      hoy ? 'text-primary-700 bg-primary-50/70' : isAnchor ? 'text-gray-900 bg-amber-50/60' : 'text-gray-500'
                    }`}
                    style={{ left: i * DAY_W, width: DAY_W }}
                  >
                    <span className="capitalize truncate">{date.toLocaleDateString('es-PE', { weekday: 'long' })}</span>
                    <span className="text-gray-400 font-normal">{date.getDate()}</span>
                    {hoy && <span className="text-[8px] uppercase font-bold text-primary-600">HOY</span>}
                  </div>
                )
              })}
              {Array.from({ length: hourTicks + 1 }, (_, h) => {
                if (h % 2 !== 0) return null // etiqueta cada 2 h para no saturar
                const boundary = h % 24 === 0
                return (
                  <div
                    key={h}
                    className={`absolute bottom-0.5 -translate-x-1/2 text-[9px] whitespace-nowrap ${boundary ? 'text-gray-500 font-semibold' : 'text-gray-400'}`}
                    style={{ left: xOfMin(h * 60) }}
                  >
                    {String(h % 24).padStart(2, '0')}:00
                  </div>
                )
              })}
            </div>
          </div>

          {/* Filas (con headers de sección si se agrupa por área) */}
          {rows.map((row, rowIdx) => {
            if (row.type === 'header') {
              return (
                <div key={`hdr-${row.name}-${rowIdx}`} className="flex border-y border-gray-200 bg-gray-50">
                  <div className="flex-shrink-0 sticky left-0 z-10 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600" style={{ width: TL_NAME_W }}>
                    {row.name}
                    <span className="text-gray-400 font-normal normal-case"> · {row.count}</span>
                  </div>
                  <div className="flex-shrink-0" style={{ width: canvasW }} />
                </div>
              )
            }
            const emp = row.emp
            const sch = schedules[emp.id] || { days: {} }
            const isDirty = dirtyUsers.has(emp.id)
            const initials = (emp.displayName || emp.email || '?')
              .split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
            const editDk = editingCell?.userId === emp.id ? editingCell.dayKey : null
            const editRaw = editDk ? sch.days?.[editDk] : null
            const editCell = (editRaw && cellBranchId(editRaw) === selectedBranchId) ? editRaw : null

            return (
              <div key={emp.id} className="flex border-b border-gray-100 hover:bg-gray-50/40">
                {/* Nombre (columna pegajosa) */}
                <div className="flex-shrink-0 sticky left-0 z-10 bg-white border-r border-gray-200 px-2 sm:px-3 py-3 flex items-center gap-2" style={{ width: TL_NAME_W }}>
                  <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {initials || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEmployeeClick?.(emp)}
                        className="font-medium text-gray-900 hover:text-primary-700 hover:underline truncate text-sm text-left"
                        title="Ver horario del mes"
                      >
                        {emp.displayName || 'Sin nombre'}
                      </button>
                      {isDirty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" title="Cambios sin guardar" />}
                    </div>
                    {emp.jobTitle && <div className="hidden sm:block text-[10px] text-gray-500 truncate">{emp.jobTitle}</div>}
                  </div>
                </div>

                {/* Track continuo de los 7 días */}
                <div
                  className="relative flex-shrink-0 cursor-pointer"
                  style={{ width: canvasW, height: 56, ...gridStyle }}
                  data-role="track"
                  onClick={(e) => handleTrackClick(e, emp)}
                >
                  {/* Resaltado del día de hoy y del día ancla */}
                  {todayIdx >= 0 && (
                    <div className="absolute inset-y-0 bg-primary-50/50 pointer-events-none" style={{ left: todayIdx * DAY_W, width: DAY_W }} />
                  )}
                  {anchorIdx !== todayIdx && (
                    <div className="absolute inset-y-0 bg-amber-50/40 pointer-events-none" style={{ left: anchorIdx * DAY_W, width: DAY_W }} />
                  )}

                  {/* Barras: una por día con turno (los overnight se dibujan contiguos) */}
                  {DAY_KEYS.map((dk, di) => {
                    const raw = sch.days?.[dk]
                    const cell = (raw && cellBranchId(raw) === selectedBranchId) ? raw : null
                    if (!cell) return null
                    const dayLeft = di * DAY_W
                    if (cell.rest || cell.recovery) {
                      const isRest = !!cell.rest
                      return (
                        <div
                          key={dk}
                          className="absolute inset-y-3 flex items-center justify-center pointer-events-none"
                          style={{ left: dayLeft, width: DAY_W }}
                        >
                          <button
                            type="button"
                            data-bar="1"
                            onClick={(ev) => { ev.stopPropagation(); openCell(emp, dk, dayLeft + DAY_W / 2) }}
                            className={`pointer-events-auto px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 border ${
                              isRest ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-orange-50 border-orange-200 text-orange-700'
                            }`}
                          >
                            <Coffee className="w-3 h-3" /> {isRest ? 'Descanso' : 'Recup.'}
                          </button>
                        </div>
                      )
                    }
                    if (!cell.start || !cell.end) return null
                    const isDraggingThis = dragState?.userId === emp.id && dragState?.dayKey === dk
                    const pc = isDraggingThis ? { ...cell, start: dragState.start, end: dragState.end } : cell
                    const sMin = timeToMinutes(pc.start)
                    let eMin = timeToMinutes(pc.end)
                    if (eMin <= sMin) eMin += DAY_MIN // cruza medianoche
                    const left = xOfMin(di * DAY_MIN + sMin)
                    const width = xOfMin(eMin - sMin)
                    const dur = eMin - sMin
                    const breakMin = cell.breakMinutes || 0
                    const hasBreak = breakMin > 0 && breakMin < dur
                    const breakLeftPct = hasBreak ? ((dur - breakMin) / 2) / dur * 100 : 0
                    const breakWidthPct = hasBreak ? breakMin / dur * 100 : 0
                    return (
                      <div
                        key={dk}
                        data-bar="1"
                        role="button"
                        tabIndex={0}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          if (wasDraggedRef.current) return
                          openCell(emp, dk, left)
                        }}
                        onPointerDown={(ev) => {
                          if (ev.pointerType === 'mouse' && ev.button !== 0) return
                          const r = ev.currentTarget.getBoundingClientRect()
                          const rel = ev.clientX - r.left
                          let mode = 'move'
                          if (rel < HANDLE_PX) mode = 'resize-left'
                          else if (rel > r.width - HANDLE_PX) mode = 'resize-right'
                          beginDrag(ev, emp, dk, di, pc, mode)
                        }}
                        onMouseMove={(ev) => {
                          if (dragStateRef.current) return
                          const r = ev.currentTarget.getBoundingClientRect()
                          const rel = ev.clientX - r.left
                          ev.currentTarget.style.cursor = (rel < HANDLE_PX || rel > r.width - HANDLE_PX) ? 'ew-resize' : 'grab'
                        }}
                        className="absolute top-2 bottom-2 rounded-md border-2 flex items-center text-xs font-semibold transition-shadow hover:shadow-md select-none overflow-hidden touch-none"
                        style={{
                          left,
                          width,
                          background: (cell.color || '#fbbf24') + '40',
                          borderColor: (cell.color || '#fbbf24'),
                          color: '#1f2937',
                          cursor: 'grab',
                        }}
                      >
                        <span className="px-2 truncate pointer-events-none">{pc.start} – {pc.end}</span>
                        {hasBreak && (
                          <div
                            className="absolute top-0 bottom-0 bg-gray-900/25 border-l border-r border-gray-700/40 flex items-center justify-center text-[10px] text-gray-900 pointer-events-none overflow-hidden gap-0.5"
                            style={{ left: `${breakLeftPct}%`, width: `${breakWidthPct}%` }}
                            title={`Refrigerio: ${breakMin} min`}
                          >
                            <Coffee className="w-2.5 h-2.5 flex-shrink-0" />
                            <span className="whitespace-nowrap font-medium">{breakMin}m</span>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Popover de edición (anclado a la posición del día/celda) */}
                  {editDk && (
                    <div className="absolute top-full mt-1 z-30 -translate-x-1/2" style={{ left: editingCell.leftPx ?? (anchorIdx * DAY_W + DAY_W / 2) }}>
                      <CellPopover
                        ref={popoverRef}
                        templates={templates}
                        cell={editCell}
                        onPickTemplate={(t) => assignTemplate(emp.id, editDk, t)}
                        onRest={() => setRest(emp.id, editDk)}
                        onRecovery={() => setRecovery(emp.id, editDk)}
                        onClear={() => clearCell(emp.id, editDk)}
                        onCustom={(s, e, b) => setCustom(emp.id, editDk, s, e, b)}
                        onClose={() => setEditingCell(null)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer: leyenda + ayuda */}
      <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1">
          <MoveHorizontal className="w-3.5 h-3.5 text-gray-400" /> Arrastra o desliza para recorrer los días · los turnos cruzan la medianoche sin cortes
        </span>
        <span className="text-gray-300 hidden sm:inline">·</span>
        <span className="hidden sm:inline">Toca un espacio vacío para asignar · arrastra una barra para mover o redimensionar</span>
        <span className="text-gray-300 hidden lg:inline">·</span>
        <span className="hidden lg:inline">Usa las flechas de arriba para cambiar de semana</span>
      </div>
    </div>
  )
}
