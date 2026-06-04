import { useState, useEffect } from 'react'
import {
  Moon,
  Play,
  Loader2,
  CalendarRange,
  Plus,
  Pencil,
  Trash2,
  ClipboardCheck,
  DollarSign,
  Tag,
  Percent,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatCurrency } from '@/lib/utils'
import {
  runNightAudit,
  getNightAudits,
  getSeasonalRates,
  saveSeasonalRate,
  deleteSeasonalRate,
} from '@/services/hotelService'

const TABS = [
  { key: 'audit', label: 'Auditoría Nocturna', icon: Moon },
  { key: 'rates', label: 'Tarifas por Temporada', icon: CalendarRange },
]

const RATE_TYPE_CONFIG = {
  fixed: { label: 'Precio fijo', badge: 'primary', icon: DollarSign, description: 'Reemplaza la tarifa base por este precio' },
  multiplier: { label: 'Multiplicador', badge: 'warning', icon: Percent, description: 'Multiplica la tarifa base (ej: 1.5 = +50%)' },
  surcharge: { label: 'Recargo', badge: 'success', icon: Tag, description: 'Suma este monto a la tarifa base' },
}

// Dias de la semana (value = Date.getDay(): 0=Domingo .. 6=Sabado). Orden Lun->Dom para mostrar.
const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]
const DAY_LABEL = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' }

const EMPTY_RATE = { name: '', startDate: '', endDate: '', daysOfWeek: [], rateType: 'fixed', rate: '', notes: '' }

export default function HotelNightAudit() {
  const { user, getBusinessId, isDemoMode } = useAppContext()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('audit')
  const [isLoading, setIsLoading] = useState(true)

  // Night audit state
  const [audits, setAudits] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [auditResult, setAuditResult] = useState(null)

  // Seasonal rates state
  const [rates, setRates] = useState([])
  const [showRateModal, setShowRateModal] = useState(false)
  const [editingRate, setEditingRate] = useState(null)
  const [rateForm, setRateForm] = useState(EMPTY_RATE)
  const [isSavingRate, setIsSavingRate] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadData()
  }, [user, isDemoMode])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const businessId = getBusinessId()
      const [auditsRes, ratesRes] = await Promise.all([
        getNightAudits(businessId),
        getSeasonalRates(businessId),
      ])
      if (auditsRes.success) setAudits(auditsRes.data)
      if (ratesRes.success) setRates(ratesRes.data)
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }

  // --- Night Audit ---

  const handleRunAudit = async () => {
    setShowConfirmModal(false)
    try {
      setIsRunning(true)
      const businessId = getBusinessId()
      const result = await runNightAudit(businessId, today, user.email)
      if (result.success) {
        setAuditResult(result.data)
        toast.success('Auditoría nocturna completada')
        const auditsRes = await getNightAudits(businessId)
        if (auditsRes.success) setAudits(auditsRes.data)
      } else {
        toast.error(result.error || 'Error al ejecutar auditoría')
      }
    } catch (error) {
      console.error('Error running audit:', error)
      toast.error('Error al ejecutar auditoría')
    } finally {
      setIsRunning(false)
    }
  }

  // --- Seasonal Rates ---

  const openCreateRate = () => {
    setEditingRate(null)
    setRateForm(EMPTY_RATE)
    setShowRateModal(true)
  }

  const toggleRateDay = (day) => {
    setRateForm(prev => {
      const set = new Set(prev.daysOfWeek || [])
      if (set.has(day)) set.delete(day)
      else set.add(day)
      return { ...prev, daysOfWeek: Array.from(set).sort((a, b) => a - b) }
    })
  }

  const setWeekendDays = () => setRateForm(prev => ({ ...prev, daysOfWeek: [0, 5, 6] }))

  const openEditRate = (rate) => {
    setEditingRate(rate)
    setRateForm({
      name: rate.name || '',
      startDate: rate.startDate || '',
      endDate: rate.endDate || '',
      daysOfWeek: rate.daysOfWeek || [],
      rateType: rate.rateType || 'fixed',
      rate: rate.rate || '',
      notes: rate.notes || '',
    })
    setShowRateModal(true)
  }

  const handleSaveRate = async () => {
    const hasDateRange = rateForm.startDate && rateForm.endDate
    const hasDays = rateForm.daysOfWeek && rateForm.daysOfWeek.length > 0
    if (!rateForm.name || !rateForm.rate || (!hasDateRange && !hasDays)) {
      toast.error('Completa nombre, valor y al menos un rango de fechas o días de la semana')
      return
    }
    try {
      setIsSavingRate(true)
      const businessId = getBusinessId()
      const payload = {
        ...rateForm,
        rate: parseFloat(rateForm.rate),
        ...(editingRate ? { id: editingRate.id } : {}),
      }
      const result = await saveSeasonalRate(businessId, payload)
      if (result.success) {
        toast.success(editingRate ? 'Tarifa actualizada' : 'Tarifa creada')
        setShowRateModal(false)
        const ratesRes = await getSeasonalRates(businessId)
        if (ratesRes.success) setRates(ratesRes.data)
      } else {
        toast.error(result.error || 'Error al guardar tarifa')
      }
    } catch (error) {
      console.error('Error saving rate:', error)
      toast.error('Error al guardar tarifa')
    } finally {
      setIsSavingRate(false)
    }
  }

  const handleDeleteRate = async (rateId) => {
    try {
      setDeletingId(rateId)
      const businessId = getBusinessId()
      const result = await deleteSeasonalRate(businessId, rateId)
      if (result.success) {
        setRates(prev => prev.filter(r => r.id !== rateId))
        toast.success('Tarifa eliminada')
      } else {
        toast.error(result.error || 'Error al eliminar tarifa')
      }
    } catch (error) {
      console.error('Error deleting rate:', error)
      toast.error('Error al eliminar tarifa')
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-1">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab 1: Night Audit */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6 text-center space-y-4">
              <Moon className="w-12 h-12 mx-auto text-indigo-500" />
              <h2 className="text-xl font-semibold text-gray-800">Auditoría Nocturna</h2>
              <p className="text-gray-500">Fecha: {formatDate(today)}</p>
              <div>
                <Button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={isRunning}
                  size="lg"
                >
                  {isRunning ? (
                    <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Procesando...</>
                  ) : (
                    <><Play className="w-5 h-5 mr-2" /> Ejecutar Auditoría Nocturna</>
                  )}
                </Button>
              </div>

              {auditResult && (
                <div className="mt-2 p-4 bg-green-50 border border-green-200 rounded-lg inline-block">
                  <p className="text-green-800 font-medium">
                    <ClipboardCheck className="w-5 h-5 inline mr-1" />
                    {auditResult.processed ?? 0} reserva{(auditResult.processed ?? 0) !== 1 ? 's' : ''} procesada{(auditResult.processed ?? 0) !== 1 ? 's' : ''}
                  </p>
                  <p className="text-green-700 text-lg font-bold mt-1">
                    Total cargado: {formatCurrency(auditResult.totalCharged)}
                  </p>
                  {(auditResult.processed ?? 0) === 0 && (
                    <p className="text-green-700 text-xs mt-1">
                      No había noches pendientes por cobrar. Las reservas por hora se cobran al check-in, y las noches de las reservas por noche también se cargan al folio al hacer check-in.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audit history */}
          <Card>
            <CardHeader>
              <CardTitle>Historial de Auditorías</CardTitle>
            </CardHeader>
            <CardContent>
              {audits.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay auditorías registradas</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="py-3 px-4 font-medium">Fecha</th>
                        <th className="py-3 px-4 font-medium">Reservas</th>
                        <th className="py-3 px-4 font-medium">Total Cargado</th>
                        <th className="py-3 px-4 font-medium">Realizado por</th>
                        <th className="py-3 px-4 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audits
                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                        .map((audit, idx) => (
                          <tr key={audit.id || idx} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">{formatDate(audit.date)}</td>
                            <td className="py-3 px-4">{audit.reservationsProcessed ?? audit.processedCount ?? '-'}</td>
                            <td className="py-3 px-4 font-medium">{formatCurrency(audit.totalCharged || 0)}</td>
                            <td className="py-3 px-4 text-gray-600">{audit.performedBy || '-'}</td>
                            <td className="py-3 px-4">
                              <Badge variant="success">Completada</Badge>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Seasonal Rates */}
      {activeTab === 'rates' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Tarifas por Temporada</h2>
            <Button onClick={openCreateRate}>
              <Plus className="w-4 h-4 mr-2" /> Nueva Tarifa
            </Button>
          </div>

          {rates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <CalendarRange className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p>No hay tarifas por temporada configuradas</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rates.map(rate => {
                const config = RATE_TYPE_CONFIG[rate.rateType] || RATE_TYPE_CONFIG.fixed
                const RateIcon = config.icon
                return (
                  <Card key={rate.id} className="relative">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold text-gray-800">{rate.name}</h3>
                        <Badge variant={config.badge}>{config.label}</Badge>
                      </div>
                      {rate.startDate && rate.endDate && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <CalendarRange className="w-4 h-4" />
                          {formatDate(rate.startDate)} — {formatDate(rate.endDate)}
                        </div>
                      )}
                      {Array.isArray(rate.daysOfWeek) && rate.daysOfWeek.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <CalendarRange className="w-4 h-4" />
                          {rate.daysOfWeek.map(d => DAY_LABEL[d]).join(', ')}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-lg font-bold text-gray-800">
                        <RateIcon className="w-5 h-5 text-gray-400" />
                        {rate.rateType === 'multiplier'
                          ? `x${rate.rate}`
                          : formatCurrency(rate.rate)}
                      </div>
                      {rate.notes && (
                        <p className="text-xs text-gray-400 line-clamp-2">{rate.notes}</p>
                      )}
                      <div className="flex gap-2 pt-2 border-t border-gray-100">
                        <Button variant="outline" size="sm" onClick={() => openEditRate(rate)}>
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deletingId === rate.id}
                          onClick={() => handleDeleteRate(rate.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          {deletingId === rate.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <><Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar</>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirm Audit Modal */}
      <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="Confirmar Auditoría" size="sm">
        <div className="space-y-4">
          <p className="text-gray-600">
            Esto cargará la noche a todos los huéspedes con check-in activo. ¿Continuar?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>Cancelar</Button>
            <Button onClick={handleRunAudit}>
              <Play className="w-4 h-4 mr-2" /> Ejecutar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Rate Modal */}
      <Modal
        isOpen={showRateModal}
        onClose={() => setShowRateModal(false)}
        title={editingRate ? 'Editar Tarifa' : 'Nueva Tarifa por Temporada'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Nombre de la temporada"
            required
            placeholder="Ej: Temporada Alta, Feriado Fiestas Patrias"
            value={rateForm.name}
            onChange={e => setRateForm(prev => ({ ...prev, name: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Fecha inicio (opcional)"
              type="date"
              value={rateForm.startDate}
              onChange={e => setRateForm(prev => ({ ...prev, startDate: e.target.value }))}
            />
            <Input
              label="Fecha fin (opcional)"
              type="date"
              value={rateForm.endDate}
              onChange={e => setRateForm(prev => ({ ...prev, endDate: e.target.value }))}
            />
          </div>

          {/* Dias de la semana: para tarifas de fin de semana o dias especificos */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Días de la semana (opcional)</label>
              <button
                type="button"
                onClick={setWeekendDays}
                className="text-xs font-medium text-primary-600 hover:underline"
              >
                Fin de semana
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map(d => {
                const active = (rateForm.daysOfWeek || []).includes(d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleRateDay(d.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              Vacío = aplica todos los días del rango de fechas. Elige días (ej. Vie/Sáb/Dom) para una tarifa de fin de semana.
            </p>
          </div>
          <Select
            label="Tipo de tarifa"
            required
            value={rateForm.rateType}
            onChange={e => setRateForm(prev => ({ ...prev, rateType: e.target.value }))}
          >
            {Object.entries(RATE_TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </Select>
          {rateForm.rateType && (
            <p className="text-xs text-gray-500 -mt-2">
              {RATE_TYPE_CONFIG[rateForm.rateType]?.description}
            </p>
          )}
          <Input
            label="Valor"
            type="number"
            required
            step="0.01"
            min="0"
            placeholder={rateForm.rateType === 'multiplier' ? 'Ej: 1.5' : 'Ej: 250.00'}
            value={rateForm.rate}
            onChange={e => setRateForm(prev => ({ ...prev, rate: e.target.value }))}
          />
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none"
              rows={3}
              placeholder="Notas adicionales sobre esta tarifa..."
              value={rateForm.notes}
              onChange={e => setRateForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowRateModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveRate} disabled={isSavingRate}>
              {isSavingRate ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Guardando...</>
              ) : (
                editingRate ? 'Guardar Cambios' : 'Crear Tarifa'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
