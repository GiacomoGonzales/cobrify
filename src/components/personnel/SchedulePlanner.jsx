import { useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Loader2, Save,
  Copy, Send, Edit2, Trash2, X, Tag, Coffee,
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import {
  listShiftTemplates,
  createShiftTemplate,
  updateShiftTemplate,
  deleteShiftTemplate,
  getWeekScheduleAll,
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

const PALETTE = ['#fbbf24', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6']

const formatDayShort = (d) =>
  d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '')

const formatRange = (mon, sun) =>
  `${mon.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} – ${sun.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`.replace(/\./g, '')

export default function SchedulePlanner({ businessId, employees, currentUserUid }) {
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

  // UI
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null) // null o template existente o {} para nueva
  const [editingCell, setEditingCell] = useState(null) // { userId, dayKey, anchor }
  const popoverRef = useRef(null)
  const [viewMode, setViewMode] = useState('weekly') // 'weekly' | 'daily'
  // Día seleccionado en modo diario: por defecto hoy si está en la semana, o lunes
  const [selectedDayKey, setSelectedDayKey] = useState(() => {
    const todayDow = new Date().getDay()
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][todayDow]
  })

  const weekDates = useMemo(() => getWeekDates(isoYear, isoWeek), [isoYear, isoWeek])
  const monday = weekDates[0]
  const sunday = weekDates[6]

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
    if (template.isRest) {
      setCell(userId, dayKey, { rest: true })
    } else {
      setCell(userId, dayKey, {
        templateId: template.id || null,
        start: template.startTime,
        end: template.endTime,
        breakMinutes: template.breakMinutes || 0,
        color: template.color || '#fbbf24',
      })
    }
    setEditingCell(null)
  }

  const setRest = (userId, dayKey) => {
    setCell(userId, dayKey, { rest: true })
    setEditingCell(null)
  }
  const clearCell = (userId, dayKey) => {
    setCell(userId, dayKey, null)
    setEditingCell(null)
  }
  const setCustom = (userId, dayKey, start, end) => {
    setCell(userId, dayKey, { start, end, breakMinutes: 0, color: '#94a3b8' })
    setEditingCell(null)
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

  // ----- Render -----
  const totalDirty = dirtyUsers.size
  const totalEmployees = employees.length
  const publishedCount = Object.values(schedules).filter((s) => s.publishedAt).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-center gap-2">
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

          {/* Toggle vista Diaria/Semanal */}
          <div className="ml-2 flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === 'weekly' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Semanal
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === 'daily' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Diaria
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
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
              onSave={handleSaveTemplate}
              onCancel={() => setEditingTemplate(null)}
            />
          )}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando horarios...
        </div>
      ) : employees.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-sm text-gray-500">
          No hay empleados. Agregá personal desde "Gestión de Usuarios" para asignarles horarios.
        </div>
      ) : viewMode === 'daily' ? (
        /* Vista timeline diaria */
        <DailyTimeline
          employees={employees}
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
          clearCell={clearCell}
          setCustom={setCustom}
        />
      ) : (
        /* Grid semanal */
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase sticky left-0 bg-gray-50 z-10 min-w-[180px]">
                    Empleado
                  </th>
                  {DAY_KEYS.map((dk, i) => {
                    const date = weekDates[i]
                    const isToday = date.toDateString() === new Date().toDateString()
                    return (
                      <th key={dk} className={`text-center px-3 py-3 font-medium text-xs uppercase min-w-[120px] ${isToday ? 'bg-primary-50 text-primary-700' : 'text-gray-600'}`}>
                        <div>{DAY_LABELS[dk]}</div>
                        <div className="text-[10px] text-gray-400 normal-case font-normal">{formatDayShort(date)}</div>
                      </th>
                    )
                  })}
                  <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase min-w-[80px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const sch = schedules[emp.id] || { days: {}, totalHours: 0 }
                  const isDirty = dirtyUsers.has(emp.id)
                  const initials = (emp.displayName || emp.email || '?')
                    .split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                  return (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {initials || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate max-w-[140px]">
                              {emp.displayName || 'Sin nombre'}
                              {isDirty && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" title="Cambios sin guardar" />}
                            </div>
                            {emp.jobTitle && <div className="text-[11px] text-gray-500 truncate max-w-[140px]">{emp.jobTitle}</div>}
                          </div>
                        </div>
                      </td>
                      {DAY_KEYS.map((dk) => {
                        const cell = sch.days?.[dk]
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
                                onClear={() => clearCell(emp.id, dk)}
                                onCustom={(s, e) => setCustom(emp.id, dk, s, e)}
                                onClose={() => setEditingCell(null)}
                              />
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2 text-right">
                        <span className={`font-semibold ${sch.totalHours > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                          {sch.totalHours.toFixed(1)}h
                        </span>
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

const CellPopover = forwardRef(({ templates, cell, onPickTemplate, onRest, onClear, onCustom, onClose }, ref) => {
  const [customMode, setCustomMode] = useState(false)
  const [start, setStart] = useState(cell?.start || '08:00')
  const [end, setEnd] = useState(cell?.end || '17:00')

  return (
    <div
      ref={ref}
      className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl py-1 text-left"
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
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setCustomMode(false)}
              className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              Volver
            </button>
            <button
              onClick={() => onCustom(start, end)}
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
            {cell && (
              <button
                onClick={onClear}
                className="w-full px-3 py-1.5 hover:bg-red-50 text-sm text-left flex items-center gap-2 text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" /> Quitar turno
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
})

function TemplateForm({ template, onSave, onCancel }) {
  const [data, setData] = useState({
    id: template.id || null,
    name: template.name || '',
    startTime: template.startTime || '08:00',
    endTime: template.endTime || '17:00',
    breakMinutes: template.breakMinutes || 0,
    color: template.color || PALETTE[0],
    isRest: template.isRest || false,
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
      <div className="grid grid-cols-3 gap-3">
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

// ===================== Vista timeline diaria =====================

function DailyTimeline({
  employees, schedules, dirtyUsers, weekDates, selectedDayKey, onSelectDay,
  templates, editingCell, setEditingCell, popoverRef,
  assignTemplate, setRest, clearCell, setCustom,
}) {
  // Rango horario fijo del timeline. Cubre desde 6 AM hasta 11 PM (configurable
  // a futuro). Si un turno cae fuera, se clampea visualmente.
  const MIN_HOUR = 6
  const MAX_HOUR = 23
  const HOURS = MAX_HOUR - MIN_HOUR
  const TOTAL_MIN = HOURS * 60

  // Mapeo de dayKey al date correspondiente de la semana
  const dayDate = useMemo(() => {
    const idx = DAY_KEYS.indexOf(selectedDayKey)
    return weekDates[idx] || weekDates[0]
  }, [selectedDayKey, weekDates])

  const isToday = (d) => d.toDateString() === new Date().toDateString()

  // Calcula porcentajes left/width para una celda con start/end
  const cellGeometry = (cell) => {
    if (!cell || cell.rest || !cell.start || !cell.end) return null
    let s = timeToMinutes(cell.start)
    let e = timeToMinutes(cell.end)
    if (e <= s) e += 24 * 60 // cruza medianoche
    const minStart = MIN_HOUR * 60
    const maxEnd = (MAX_HOUR + 1) * 60 // permitir tocar el límite derecho
    const sClamped = Math.max(minStart, s)
    const eClamped = Math.min(maxEnd, e)
    if (eClamped <= sClamped) return null
    const leftPct = ((sClamped - minStart) / TOTAL_MIN) * 100
    const widthPct = ((eClamped - sClamped) / TOTAL_MIN) * 100
    return { leftPct, widthPct }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Day picker */}
      <div className="border-b border-gray-100 p-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-500 mr-2 uppercase font-semibold">Día:</span>
        {DAY_KEYS.map((dk, i) => {
          const date = weekDates[i]
          const isSel = selectedDayKey === dk
          const isHoy = isToday(date)
          return (
            <button
              key={dk}
              onClick={() => onSelectDay(dk)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1 ${
                isSel
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span>{DAY_LABELS[dk]}</span>
              <span className={`text-[10px] ${isSel ? 'opacity-90' : 'text-gray-500'}`}>
                {date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '')}
              </span>
              {isHoy && (
                <span className={`ml-0.5 text-[9px] uppercase font-bold ${isSel ? 'text-white' : 'text-primary-600'}`}>
                  HOY
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Timeline */}
      <div className="overflow-x-auto">
        <div className="min-w-[900px] relative">
          {/* Header de horas */}
          <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
            <div className="w-48 flex-shrink-0 px-4 py-2 text-xs font-medium text-gray-600 uppercase">
              Empleado
            </div>
            <div className="flex-1 relative h-9">
              {Array.from({ length: HOURS + 1 }, (_, i) => {
                const hour = MIN_HOUR + i
                const leftPct = (i / HOURS) * 100
                return (
                  <div
                    key={hour}
                    className="absolute top-0 bottom-0 flex items-center text-[10px] text-gray-500 -translate-x-1/2"
                    style={{ left: `${leftPct}%` }}
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                )
              })}
            </div>
          </div>

          {/* Filas de empleados */}
          {employees.map((emp) => {
            const sch = schedules[emp.id] || { days: {}, totalHours: 0 }
            const cell = sch.days?.[selectedDayKey]
            const geo = cellGeometry(cell)
            const isDirty = dirtyUsers.has(emp.id)
            const initials = (emp.displayName || emp.email || '?')
              .split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
            const isEditingThis = editingCell?.userId === emp.id && editingCell?.dayKey === selectedDayKey

            return (
              <div key={emp.id} className="flex border-b border-gray-100 hover:bg-gray-50/50">
                {/* Nombre del empleado */}
                <div className="w-48 flex-shrink-0 px-4 py-3 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {initials || '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate text-sm">
                      {emp.displayName || 'Sin nombre'}
                      {isDirty && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" title="Cambios sin guardar" />}
                    </div>
                    {emp.jobTitle && <div className="text-[10px] text-gray-500 truncate">{emp.jobTitle}</div>}
                  </div>
                </div>

                {/* Track de horas */}
                <div
                  className="flex-1 relative cursor-pointer"
                  style={{ height: 56 }}
                  onClick={(e) => {
                    // Click en el track (no en una barra) → abre popover de creación
                    if (e.target.dataset.role === 'track') {
                      setEditingCell({ userId: emp.id, dayKey: selectedDayKey })
                    }
                  }}
                  data-role="track"
                >
                  {/* Líneas verticales por hora */}
                  {Array.from({ length: HOURS + 1 }, (_, i) => {
                    const leftPct = (i / HOURS) * 100
                    return (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-l border-gray-100"
                        style={{ left: `${leftPct}%` }}
                        data-role="track"
                      />
                    )
                  })}

                  {/* Barra del turno */}
                  {cell && cell.rest ? (
                    <div className="absolute inset-y-2 left-2 right-2 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-500"
                         onClick={(e) => { e.stopPropagation(); setEditingCell({ userId: emp.id, dayKey: selectedDayKey }) }}
                    >
                      Descanso
                    </div>
                  ) : geo ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingCell({ userId: emp.id, dayKey: selectedDayKey }) }}
                      className="absolute top-2 bottom-2 rounded-md border-2 flex items-center justify-center text-xs font-semibold transition-shadow hover:shadow-md"
                      style={{
                        left: `${geo.leftPct}%`,
                        width: `${geo.widthPct}%`,
                        background: (cell.color || '#fbbf24') + '40',
                        borderColor: (cell.color || '#fbbf24'),
                        color: '#1f2937',
                      }}
                    >
                      <span className="px-2 truncate">
                        {cell.start} – {cell.end}
                        {cell.breakMinutes > 0 && (
                          <span className="ml-1 text-[10px] opacity-70">−{cell.breakMinutes}m</span>
                        )}
                      </span>
                    </button>
                  ) : (
                    !cell && (
                      <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-300 hover:text-primary-600 transition-colors" data-role="track">
                        + Asignar turno
                      </div>
                    )
                  )}

                  {/* Popover */}
                  {isEditingThis && (
                    <div className="absolute left-1/2 top-full mt-1 z-30 -translate-x-1/2">
                      <CellPopover
                        ref={popoverRef}
                        templates={templates}
                        cell={cell}
                        onPickTemplate={(t) => assignTemplate(emp.id, selectedDayKey, t)}
                        onRest={() => setRest(emp.id, selectedDayKey)}
                        onClear={() => clearCell(emp.id, selectedDayKey)}
                        onCustom={(s, e) => setCustom(emp.id, selectedDayKey, s, e)}
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

      {/* Footer: leyenda */}
      <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500 flex flex-wrap items-center gap-3">
        <span>Horario: {String(MIN_HOUR).padStart(2,'0')}:00 – {String(MAX_HOUR).padStart(2,'0')}:00</span>
        <span className="text-gray-300">·</span>
        <span>Click en una barra para editar el turno · Click en el espacio vacío para asignar uno</span>
      </div>
    </div>
  )
}
