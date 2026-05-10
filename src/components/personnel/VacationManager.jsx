import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Loader2, Check, X, Calendar, Clock, Palmtree, FileText,
  AlertCircle, History, ChevronRight, ChevronDown,
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import Modal from '@/components/ui/Modal'
import {
  listRequests,
  createRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  calculateBalance,
  getOnVacationToday,
  TIMEOFF_TYPES,
  TIMEOFF_STATUSES,
  getTimeOffTypeInfo,
  getTimeOffStatusInfo,
  calcDaysBetween,
} from '@/services/timeOffService'

// --- helpers ---
const toDate = (v) => {
  if (!v) return null
  if (v.toDate && typeof v.toDate === 'function') return v.toDate()
  if (v instanceof Date) return v
  return new Date(v)
}
const fmtDate = (v) => {
  const d = toDate(v)
  if (!d) return '-'
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '')
}
const fmtRange = (s, e) => `${fmtDate(s)} – ${fmtDate(e)}`

const COLOR_CLASSES = {
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-700',
}

export default function VacationManager({ businessId, employees, currentUser }) {
  const toast = useToast()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [historyEmployeeId, setHistoryEmployeeId] = useState(null) // empleado cuyo historial se muestra
  const [decisionRequest, setDecisionRequest] = useState(null) // solicitud que se está aprobando/rechazando
  const [decisionAction, setDecisionAction] = useState(null) // 'approve' | 'reject'
  const [decisionNote, setDecisionNote] = useState('')
  const [submittingDecision, setSubmittingDecision] = useState(false)

  const loadRequests = async () => {
    if (!businessId) return
    setLoading(true)
    try {
      const res = await listRequests(businessId)
      if (res.success) setRequests(res.data)
    } catch (e) {
      toast.error('Error cargando solicitudes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  // ----- Cómputos derivados -----

  const employeesById = useMemo(() => {
    const map = new Map()
    employees.forEach((e) => map.set(e.id, e))
    return map
  }, [employees])

  const requestsByUser = useMemo(() => {
    const map = new Map()
    for (const r of requests) {
      if (!map.has(r.userId)) map.set(r.userId, [])
      map.get(r.userId).push(r)
    }
    return map
  }, [requests])

  const pendingRequests = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests])
  const onVacationToday = useMemo(() => getOnVacationToday(requests), [requests])

  // ----- Acciones -----

  const handleOpenDecision = (request, action) => {
    setDecisionRequest(request)
    setDecisionAction(action)
    setDecisionNote('')
  }

  const submitDecision = async () => {
    if (!decisionRequest || !decisionAction) return
    setSubmittingDecision(true)
    try {
      const fn = decisionAction === 'approve' ? approveRequest : rejectRequest
      const res = await fn(
        businessId,
        decisionRequest.id,
        decisionNote,
        currentUser?.uid || null,
        currentUser?.displayName || currentUser?.email || null
      )
      if (res.success) {
        toast.success(decisionAction === 'approve' ? 'Solicitud aprobada' : 'Solicitud rechazada')
        setDecisionRequest(null)
        setDecisionAction(null)
        setDecisionNote('')
        await loadRequests()
      } else {
        toast.error(res.error || 'Error')
      }
    } finally {
      setSubmittingDecision(false)
    }
  }

  const handleCancel = async (request) => {
    if (!confirm(`¿Cancelar la solicitud de ${request.userName}?`)) return
    const res = await cancelRequest(businessId, request.id)
    if (res.success) {
      toast.success('Solicitud cancelada')
      await loadRequests()
    } else {
      toast.error('Error al cancelar')
    }
  }

  // ----- Render -----

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando solicitudes...
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-sm text-gray-500">
        Agregá personal desde "Gestión de Usuarios" para gestionar sus vacaciones.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats top */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Solicitudes pendientes"
          value={pendingRequests.length}
          color="amber"
        />
        <StatCard
          icon={<Palmtree className="w-5 h-5" />}
          label="De vacaciones hoy"
          value={onVacationToday.length}
          color="emerald"
        />
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white rounded-xl p-4 text-left flex items-center justify-between transition-colors"
        >
          <div>
            <div className="text-xs uppercase tracking-wide opacity-80">Acción rápida</div>
            <div className="text-base font-semibold mt-0.5">Crear permiso / vacaciones</div>
          </div>
          <Plus className="w-6 h-6 opacity-90" />
        </button>
      </div>

      {/* Solicitudes pendientes */}
      {pendingRequests.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700" />
            <span className="text-sm font-semibold text-amber-900">
              Solicitudes pendientes ({pendingRequests.length})
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingRequests.map((r) => {
              const typeInfo = getTimeOffTypeInfo(r.type)
              return (
                <div key={r.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{r.userName || 'Sin nombre'}</span>
                      <span className={`text-[11px] uppercase font-semibold px-2 py-0.5 rounded-full ${COLOR_CLASSES[typeInfo.color]}`}>
                        {typeInfo.label}
                      </span>
                      <span className="text-sm text-gray-700">
                        {fmtRange(r.startDate, r.endDate)} <span className="text-gray-500">({r.daysCount} día{r.daysCount !== 1 ? 's' : ''})</span>
                      </span>
                    </div>
                    {r.reason && (
                      <p className="text-sm text-gray-600 mt-1 italic">"{r.reason}"</p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1">
                      Solicitada {fmtDate(r.requestedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenDecision(r, 'reject')}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
                    >
                      <X className="w-3.5 h-3.5" /> Rechazar
                    </button>
                    <button
                      onClick={() => handleOpenDecision(r, 'approve')}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    >
                      <Check className="w-3.5 h-3.5" /> Aprobar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabla por empleado */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-600" />
            Saldo de vacaciones por empleado
          </h4>
          <span className="text-xs text-gray-500">Año {new Date().getFullYear()}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="text-left px-4 py-2.5">Empleado</th>
                <th className="text-center px-4 py-2.5">Días/año</th>
                <th className="text-center px-4 py-2.5">Gozados</th>
                <th className="text-center px-4 py-2.5">Pendientes</th>
                <th className="text-center px-4 py-2.5">Disponibles</th>
                <th className="text-right px-4 py-2.5">Historial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((emp) => {
                const empReqs = requestsByUser.get(emp.id) || []
                const balance = calculateBalance(emp, empReqs)
                const showHistory = historyEmployeeId === emp.id
                const initials = (emp.displayName || emp.email || '?')
                  .split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

                return (
                  <FragmentBlock key={emp.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {initials || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{emp.displayName || 'Sin nombre'}</div>
                            {emp.jobTitle && (
                              <div className="text-[11px] text-gray-500 truncate">{emp.jobTitle}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {balance.total > 0 ? <span className="font-medium">{balance.total}</span> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={balance.taken > 0 ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                          {balance.taken}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={balance.pending > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400'}>
                          {balance.pending}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-bold ${balance.available > 5 ? 'text-emerald-700' : balance.available > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                          {balance.available}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => setHistoryEmployeeId(showHistory ? null : emp.id)}
                          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded"
                        >
                          {showHistory ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <History className="w-3.5 h-3.5" />
                          {empReqs.length}
                        </button>
                      </td>
                    </tr>
                    {showHistory && (
                      <tr className="bg-gray-50/40">
                        <td colSpan={6} className="px-4 py-3">
                          <EmployeeHistory
                            requests={empReqs}
                            onCancel={handleCancel}
                          />
                        </td>
                      </tr>
                    )}
                  </FragmentBlock>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Crear solicitud */}
      {showCreateModal && (
        <CreateRequestModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          businessId={businessId}
          employees={employees}
          currentUser={currentUser}
          onCreated={async () => {
            setShowCreateModal(false)
            await loadRequests()
          }}
        />
      )}

      {/* Modal: Decisión (aprobar/rechazar) */}
      {decisionRequest && (
        <Modal
          isOpen={!!decisionRequest}
          onClose={() => !submittingDecision && setDecisionRequest(null)}
          title={decisionAction === 'approve' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
          maxWidth="md"
        >
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-medium">{decisionRequest.userName}</p>
              <p className="text-gray-600">
                {getTimeOffTypeInfo(decisionRequest.type).label} · {fmtRange(decisionRequest.startDate, decisionRequest.endDate)}{' '}
                ({decisionRequest.daysCount} día{decisionRequest.daysCount !== 1 ? 's' : ''})
              </p>
              {decisionRequest.reason && (
                <p className="text-gray-500 italic mt-1">"{decisionRequest.reason}"</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nota {decisionAction === 'reject' ? '(motivo del rechazo)' : '(opcional)'}
              </label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                rows={2}
                placeholder={decisionAction === 'reject' ? 'Explicale al empleado por qué no se aprueba...' : 'Una nota interna o un mensaje al empleado'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDecisionRequest(null)}
                disabled={submittingDecision}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitDecision}
                disabled={submittingDecision}
                className={`flex-1 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                  decisionAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {submittingDecision ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : decisionAction === 'approve' ? (
                  <><Check className="w-4 h-4" /> Aprobar</>
                ) : (
                  <><X className="w-4 h-4" /> Rechazar</>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ----- Sub-componentes -----

const FragmentBlock = ({ children }) => <>{children}</>

function StatCard({ icon, label, value, color }) {
  const cls = COLOR_CLASSES[color] || COLOR_CLASSES.gray
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-lg ${cls}`}>{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
        <div className="text-2xl font-bold text-gray-900 mt-0.5">{value}</div>
      </div>
    </div>
  )
}

function EmployeeHistory({ requests, onCancel }) {
  if (!requests || requests.length === 0) {
    return <p className="text-xs text-gray-500 italic">Sin solicitudes registradas.</p>
  }
  return (
    <div className="space-y-1.5">
      {requests.map((r) => {
        const t = getTimeOffTypeInfo(r.type)
        const s = getTimeOffStatusInfo(r.status)
        return (
          <div key={r.id} className="flex items-center justify-between text-xs bg-white rounded-md p-2 border border-gray-100">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded ${COLOR_CLASSES[t.color]} text-[10px] font-semibold uppercase`}>
                {t.label}
              </span>
              <span>{fmtRange(r.startDate, r.endDate)}</span>
              <span className="text-gray-400">({r.daysCount}d)</span>
              {r.reason && <span className="text-gray-500 italic">"{r.reason}"</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${COLOR_CLASSES[s.color]}`}>
                {s.label}
              </span>
              {r.status === 'pending' && (
                <button
                  onClick={() => onCancel(r)}
                  className="text-gray-400 hover:text-red-600"
                  title="Cancelar solicitud"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CreateRequestModal({ isOpen, onClose, businessId, employees, currentUser, onCreated }) {
  const toast = useToast()
  const [userId, setUserId] = useState(employees[0]?.id || '')
  const [type, setType] = useState('vacation')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const employee = employees.find((e) => e.id === userId)
  const days = startDate && endDate ? calcDaysBetween(startDate, endDate) : 0

  const handleSubmit = async () => {
    if (!userId || !type || !startDate || !endDate) {
      toast.error('Completá todos los campos')
      return
    }
    setSubmitting(true)
    try {
      const res = await createRequest(businessId, {
        userId,
        userName: employee?.displayName || employee?.email || 'Empleado',
        type,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        requestedByUid: currentUser?.uid,
        requestedByName: currentUser?.displayName || currentUser?.email,
      })
      if (res.success) {
        toast.success('Solicitud creada en estado pendiente')
        onCreated && onCreated()
      } else {
        toast.error(res.error || 'Error al crear')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crear solicitud" maxWidth="md">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Empleado</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName || e.email}{e.jobTitle ? ` · ${e.jobTitle}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {TIMEOFF_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`px-3 py-2 text-sm rounded-lg border-2 text-left transition-colors ${
                  type === t.value
                    ? 'border-primary-500 bg-primary-50 text-primary-900'
                    : 'border-gray-200 hover:border-gray-300'
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
          <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
            Total: <strong>{days} día{days !== 1 ? 's' : ''}</strong>
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
            Crear solicitud
          </button>
        </div>
      </div>
    </Modal>
  )
}
