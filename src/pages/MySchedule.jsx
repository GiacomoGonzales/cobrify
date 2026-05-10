import { useEffect, useMemo, useState } from 'react'
import {
  Calendar, Clock, Palmtree, Plus, Loader2, MapPin, Coffee,
  CheckCircle2, XCircle, AlertCircle, History,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Modal from '@/components/ui/Modal'
import {
  getWeekSchedule,
  getIsoWeek,
  addWeeks,
  getWeekDates,
  DAY_KEYS,
  DAY_LABELS,
  calculateWeekHours,
} from '@/services/scheduleService'
import {
  listRequests,
  createRequest,
  cancelRequest,
  calculateBalance,
  TIMEOFF_TYPES,
  getTimeOffTypeInfo,
  getTimeOffStatusInfo,
  calcDaysBetween,
} from '@/services/timeOffService'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const COLOR_CLASSES = {
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-700',
}

const toDate = (v) => {
  if (!v) return null
  if (v.toDate && typeof v.toDate === 'function') return v.toDate()
  if (v instanceof Date) return v
  return new Date(v)
}

const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const dateInRange = (date, start, end) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  return d >= s && d <= e
}

const fmtDay = (d) => d.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'short' }).replace(/\./g, '')
const fmtRange = (s, e) => {
  const sd = toDate(s); const ed = toDate(e)
  if (!sd || !ed) return '-'
  return `${sd.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} – ${ed.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`.replace(/\./g, '')
}

export default function MySchedule() {
  const { user, getBusinessId, isBusinessOwner, isAdmin } = useAppContext()
  const toast = useToast()

  const businessId = getBusinessId?.()
  const uid = user?.uid

  // Estados
  const [loading, setLoading] = useState(true)
  const [personnel, setPersonnel] = useState({})
  const [activeWeekTab, setActiveWeekTab] = useState('current') // 'current' | 'next'
  const [scheduleCurrent, setScheduleCurrent] = useState(null)
  const [scheduleNext, setScheduleNext] = useState(null)
  const [requests, setRequests] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)

  const today = new Date()
  const isoCurrent = useMemo(() => getIsoWeek(today), [])
  const isoNext = useMemo(() => addWeeks(isoCurrent.isoYear, isoCurrent.isoWeek, 1), [isoCurrent])

  const loadAll = async () => {
    if (!businessId || !uid) return
    setLoading(true)
    try {
      // Datos personnel del propio user
      const userSnap = await getDoc(doc(db, 'users', uid))
      const userData = userSnap.exists() ? userSnap.data() : {}
      setPersonnel(userData.personnel || {})

      // Horarios
      const [curr, next] = await Promise.all([
        getWeekSchedule(businessId, uid, isoCurrent.isoYear, isoCurrent.isoWeek),
        getWeekSchedule(businessId, uid, isoNext.isoYear, isoNext.isoWeek),
      ])
      setScheduleCurrent(curr.success ? curr.data : null)
      setScheduleNext(next.success ? next.data : null)

      // Solicitudes propias
      const reqs = await listRequests(businessId, { userId: uid })
      if (reqs.success) setRequests(reqs.data)
    } catch (e) {
      console.error(e)
      toast.error('Error cargando tu portal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, uid])

  // ----- Cómputos -----

  const employeeShape = useMemo(() => ({
    vacationDaysPerYear: personnel.vacationDaysPerYear,
    personnel,
  }), [personnel])

  const balance = useMemo(() => calculateBalance(employeeShape, requests), [employeeShape, requests])

  const activeSchedule = activeWeekTab === 'current' ? scheduleCurrent : scheduleNext
  const activeIso = activeWeekTab === 'current' ? isoCurrent : isoNext
  const activeWeekDates = useMemo(() => getWeekDates(activeIso.isoYear, activeIso.isoWeek), [activeIso])
  const activeTotal = activeSchedule?.totalHours ?? calculateWeekHours(activeSchedule?.days || {})
  const isPublished = !!activeSchedule?.publishedAt

  // Mapa: para cada fecha, ¿hay una solicitud aprobada que la cubre?
  const approvedForDate = (date) => {
    return requests.find((r) => {
      if (r.status !== 'approved') return false
      const s = toDate(r.startDate); const e = toDate(r.endDate)
      if (!s || !e) return false
      return dateInRange(date, s, e)
    })
  }

  const recentRequests = useMemo(() => requests.slice(0, 5), [requests])

  // ----- Render -----

  if (isBusinessOwner || isAdmin) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-sm text-blue-900">
        <p className="font-semibold mb-1">Esta página es para empleados.</p>
        <p>Como dueño/administrador, gestioná los horarios y vacaciones desde "Personal" → tabs Horarios y Vacaciones.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando tu portal...
      </div>
    )
  }

  const initials = (user?.displayName || user?.email || '?')
    .split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary-600 to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl font-bold">
              {initials}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">Mi portal personal</p>
              <h1 className="text-2xl font-bold">¡Hola, {user?.displayName || user?.email?.split('@')[0]}!</h1>
              <p className="text-sm opacity-90">
                {personnel.jobTitle || 'Sin cargo asignado'}
                {personnel.department ? ` · ${personnel.department}` : ''}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-2.5 text-center min-w-[100px]">
              <p className="text-[10px] uppercase tracking-wider opacity-80">Horas / sem</p>
              <p className="text-lg font-bold mt-0.5">
                {personnel.weeklyHours ?? activeTotal.toFixed(0)}h
              </p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-2.5 text-center min-w-[100px]">
              <p className="text-[10px] uppercase tracking-wider opacity-80">Vacaciones</p>
              <p className="text-lg font-bold mt-0.5">{balance.available}d</p>
              {balance.pending > 0 && (
                <p className="text-[10px] opacity-80">+{balance.pending} pend.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Agenda semanal */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary-600" />
              Mi agenda
            </h3>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setActiveWeekTab('current')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  activeWeekTab === 'current' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                }`}
              >
                Esta semana
              </button>
              <button
                onClick={() => setActiveWeekTab('next')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  activeWeekTab === 'next' ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                }`}
              >
                Próxima semana
              </button>
            </div>
          </div>

          {!activeSchedule && (
            <div className="p-8 text-center text-sm text-gray-500">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              Tu horario para esta semana aún no está publicado.
            </div>
          )}

          {activeSchedule && !isPublished && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Horario en borrador. Tu supervisor todavía no lo publicó.
            </div>
          )}

          {activeSchedule && (
            <div className="divide-y divide-gray-100">
              {DAY_KEYS.map((dk, i) => {
                const date = activeWeekDates[i]
                const cell = activeSchedule.days?.[dk]
                const approved = approvedForDate(date)
                const isHoy = isSameDay(date, today)

                return (
                  <DayRow
                    key={dk}
                    dayLabel={DAY_LABELS[dk]}
                    date={date}
                    cell={cell}
                    approved={approved}
                    isToday={isHoy}
                  />
                )
              })}
              <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between text-sm">
                <span className="text-gray-600">Total semana</span>
                <span className="font-bold text-gray-900">{activeTotal.toFixed(1)}h</span>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar derecho: solicitudes */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Palmtree className="w-4 h-4 text-emerald-600" />
              Permisos y vacaciones
            </h3>
            <div className="bg-emerald-50 rounded-lg p-3 mb-3 text-sm">
              <p className="text-emerald-900 font-bold text-2xl">{balance.available}<span className="text-sm font-normal ml-1">días</span></p>
              <p className="text-xs text-emerald-700">Disponibles este año</p>
              {balance.pending > 0 && (
                <p className="text-[11px] text-amber-700 mt-1">{balance.pending} día(s) en solicitudes pendientes</p>
              )}
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Solicitar permiso / vacaciones
            </button>
          </div>

          {/* Solicitudes recientes */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
              <History className="w-4 h-4 text-gray-500" />
              Mis solicitudes recientes
            </h3>
            {recentRequests.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No has hecho solicitudes aún.</p>
            ) : (
              <div className="space-y-2">
                {recentRequests.map((r) => {
                  const t = getTimeOffTypeInfo(r.type)
                  const s = getTimeOffStatusInfo(r.status)
                  const StatusIcon = r.status === 'approved' ? CheckCircle2 : r.status === 'rejected' ? XCircle : Clock
                  return (
                    <div key={r.id} className="border border-gray-100 rounded-lg p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${COLOR_CLASSES[t.color]}`}>
                          {t.label}
                        </span>
                        <span className={`text-[10px] font-semibold flex items-center gap-1 ${
                          s.color === 'emerald' ? 'text-emerald-700' : s.color === 'red' ? 'text-red-700' : s.color === 'amber' ? 'text-amber-700' : 'text-gray-700'
                        }`}>
                          <StatusIcon className="w-3 h-3" /> {s.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700">{fmtRange(r.startDate, r.endDate)} <span className="text-gray-500">({r.daysCount}d)</span></p>
                      {r.reason && <p className="text-[11px] text-gray-500 italic mt-0.5">"{r.reason}"</p>}
                      {r.decisionNote && (
                        <p className="text-[11px] text-gray-600 mt-1 bg-gray-50 rounded px-1.5 py-1 border-l-2 border-gray-300">
                          Nota: {r.decisionNote}
                        </p>
                      )}
                      {r.status === 'pending' && (
                        <button
                          onClick={async () => {
                            if (!confirm('¿Cancelar esta solicitud?')) return
                            const res = await cancelRequest(businessId, r.id)
                            if (res.success) { toast.success('Solicitud cancelada'); loadAll() }
                            else toast.error('Error al cancelar')
                          }}
                          className="text-[11px] text-red-600 hover:underline mt-1"
                        >
                          Cancelar solicitud
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal crear */}
      {showCreateModal && (
        <SelfRequestModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          businessId={businessId}
          user={user}
          balance={balance}
          onCreated={async () => {
            setShowCreateModal(false)
            await loadAll()
          }}
        />
      )}
    </div>
  )
}

function DayRow({ dayLabel, date, cell, approved, isToday }) {
  // Prioridad visual: vacación aprobada > descanso > turno > sin asignar
  const isVacation = !!approved
  const isRest = cell?.rest && !isVacation
  const isShift = !!(cell?.start && cell?.end) && !isVacation && !isRest

  let leftBorder = 'border-l-4 '
  if (isVacation) leftBorder += 'border-blue-400'
  else if (isRest) leftBorder += 'border-gray-300'
  else if (isShift) leftBorder += 'border-amber-400'
  else leftBorder += 'border-transparent'

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${leftBorder} ${isToday ? 'bg-primary-50/40' : ''}`}>
      <div className="w-16 text-xs">
        <p className={`uppercase font-semibold ${isToday ? 'text-primary-700' : 'text-gray-700'}`}>{dayLabel}</p>
        <p className="text-gray-500">{date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '')}</p>
      </div>
      <div className="flex-1 min-w-0">
        {isVacation ? (
          <div className="text-sm">
            <p className="font-medium text-blue-700 flex items-center gap-1.5">
              <Palmtree className="w-3.5 h-3.5" /> {getTimeOffTypeInfo(approved.type).label}
            </p>
            <p className="text-xs text-gray-500">Aprobado · {fmtRange(approved.startDate, approved.endDate)}</p>
          </div>
        ) : isRest ? (
          <div className="text-sm flex items-center gap-1.5 text-gray-500">
            <Coffee className="w-3.5 h-3.5" />
            Descanso libre
          </div>
        ) : isShift ? (
          <div className="text-sm">
            <p className="font-medium text-gray-900">Turno {cell.start} – {cell.end}</p>
            {cell.breakMinutes > 0 && (
              <p className="text-[11px] text-gray-500">Descanso interno: {cell.breakMinutes} min</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Sin turno asignado</p>
        )}
      </div>
      {isShift && (
        <div className="text-right text-xs text-gray-600 font-semibold">
          {(() => {
            // Calcular horas de la celda
            const [sh, sm] = (cell.start || '00:00').split(':').map(Number)
            const [eh, em] = (cell.end || '00:00').split(':').map(Number)
            let mins = (eh * 60 + em) - (sh * 60 + sm)
            if (mins <= 0) mins += 24 * 60
            mins -= cell.breakMinutes || 0
            return `${(mins / 60).toFixed(1)}h`
          })()}
        </div>
      )}
    </div>
  )
}

function SelfRequestModal({ isOpen, onClose, businessId, user, balance, onCreated }) {
  const toast = useToast()
  const [type, setType] = useState('vacation')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const days = startDate && endDate ? calcDaysBetween(startDate, endDate) : 0
  const typeInfo = TIMEOFF_TYPES.find((t) => t.value === type)
  const wouldExceed = typeInfo?.countsAgainstBalance && days > balance.available

  const handleSubmit = async () => {
    if (!type || !startDate || !endDate) { toast.error('Completá todos los campos'); return }
    setSubmitting(true)
    try {
      const res = await createRequest(businessId, {
        userId: user?.uid,
        userName: user?.displayName || user?.email || 'Empleado',
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        requestedByUid: user?.uid,
        requestedByName: user?.displayName || user?.email,
      })
      if (res.success) {
        toast.success('Solicitud enviada. Tu supervisor la revisará pronto.')
        onCreated && onCreated()
      } else {
        toast.error(res.error || 'Error al enviar')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Solicitar permiso / vacaciones" maxWidth="md">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {TIMEOFF_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`px-3 py-2 text-sm rounded-lg border-2 text-left transition-colors ${
                  type === t.value ? 'border-primary-500 bg-primary-50 text-primary-900' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {t.countsAgainstBalance ? 'Descuenta de vacaciones' : 'No descuenta'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {days > 0 && (
          <div className={`text-xs rounded-lg p-2 ${wouldExceed ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-50 text-gray-600'}`}>
            Total: <strong>{days} día{days !== 1 ? 's' : ''}</strong>
            {typeInfo?.countsAgainstBalance && (
              <span> · Te quedarían <strong>{Math.max(0, balance.available - days)}</strong> días disponibles</span>
            )}
            {wouldExceed && (
              <p className="mt-1 font-semibold">⚠️ Excede tu saldo disponible. Igualmente la podés enviar y será revisada.</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Ej: Viaje familiar, control médico, asunto personal..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Enviar solicitud
          </button>
        </div>
      </div>
    </Modal>
  )
}
