import { MODOS_NEGOCIO } from '@/utils/businessModes'
import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createCampaign, sendCampaign, getCampaigns, getUsersWithTokens, previewAudience } from '@/services/pushCampaignService'
import { DEPARTAMENTOS } from '@/data/peruUbigeos'
import { matchesPrebuilt } from '@/lib/utils'
import { buildAccountHaystack } from '@/utils/adminSearch'
import {
  Bell,
  Send,
  RefreshCw,
  Search,
  Plus,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Users,
  Smartphone,
  Target,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { Pagina, Filtros, Buscador, Boton } from '@/components/admin/ui'

const STATUS_CONFIG = {
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-700', icon: Clock },
  sending: { label: 'Enviando', color: 'bg-primary-100 text-primary-700', icon: Loader2 },
  sent: { label: 'Enviada', color: 'bg-gray-100 text-gray-700', icon: CheckCircle },
  partial: { label: 'Parcial', color: 'bg-gray-100 text-gray-700', icon: AlertCircle },
  failed: { label: 'Fallida', color: 'bg-red-100 text-red-700', icon: AlertCircle }
}

const TARGET_MODES = {
  all: { label: 'Todos los usuarios', icon: Users },
  filter: { label: 'Filtrar por criterios', icon: Filter },
  manual: { label: 'Seleccionar manualmente', icon: Target }
}

// Planes REALES del sistema. Los valores viejos (free/basic/pro/enterprise) no
// existían en ninguna suscripción, por eso filtrar por plan daba siempre cero.
const PLAN_OPTIONS = [
  { value: 'basico_mensual', label: 'Básico Mensual' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'ilimitado_mensual', label: 'Ilimitado Mensual' },
  { value: 'anual', label: 'Anual' },
  { value: 'ilimitado_anual', label: 'Ilimitado Anual' },
  { value: 'semestral', label: 'Semestral (legacy)' },
  { value: 'qpse_1_month', label: 'QPse 1 mes (legacy)' },
  { value: 'qpse_12_months', label: 'QPse 12 meses (legacy)' },
  { value: 'enterprise', label: 'Enterprise (interno)' }
]

// Estados reales: el sistema usa active/suspended (accessBlocked cuenta como suspendida)
const SUB_STATUS_OPTIONS = [
  { value: 'active', label: 'Activa' },
  { value: 'suspended', label: 'Suspendida' }
]

// Del catalogo comun: aqui faltaba `lending` y sobraba mantener la copia.
const BUSINESS_MODE_OPTIONS = MODOS_NEGOCIO.map(m => ({ value: m.id, label: m.nombre }))

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'owners', label: 'Solo cuentas principales' },
  { value: 'subusers', label: 'Solo sub-cuentas' }
]

// Plataforma del dispositivo: clave para campañas de "califica la app", que deben
// ir solo a la tienda que corresponde (Play Store vs App Store).
const PLATFORM_OPTIONS = [
  { value: 'android', label: 'Android' },
  { value: 'ios', label: 'iPhone / iPad' },
  { value: 'web', label: 'Web / PWA' }
]

// Atajos de vencimiento (incluyen las ya vencidas: días restantes <= N)
const EXPIRY_OPTIONS = [
  { value: '', label: 'Sin filtro' },
  { value: '0', label: 'Ya vencidas' },
  { value: '7', label: 'Vencen en 7 días o menos' },
  { value: '15', label: 'Vencen en 15 días o menos' },
  { value: '30', label: 'Vencen en 30 días o menos' }
]

const AGE_OPTIONS = [
  { value: '', label: 'Sin filtro' },
  { value: '3', label: '3 meses o más' },
  { value: '6', label: '6 meses o más' },
  { value: '12', label: '1 año o más' }
]

// Segmentos listos: los casos que se usan una y otra vez, a un clic. Cada uno
// deja los filtros armados y el admin puede ajustarlos después.
const SEGMENT_PRESETS = [
  {
    id: 'expiring',
    label: 'Por vencer (7 días)',
    hint: 'Recordatorio de renovación',
    icon: Clock,
    filters: { expiringInDays: '7', statuses: ['active'], accountType: 'owners' }
  },
  {
    id: 'suspended',
    label: 'Suspendidos',
    hint: 'Recuperar cuentas caídas',
    icon: AlertCircle,
    filters: { statuses: ['suspended'], accountType: 'owners' }
  },
  {
    id: 'inactive',
    label: 'Sin emitir este mes',
    hint: 'Reactivar usuarios dormidos',
    icon: Bell,
    filters: { invoicesMax: '0', statuses: ['active'], accountType: 'owners' }
  },
  {
    id: 'power',
    label: 'Usuarios intensivos',
    hint: '50+ comprobantes al mes',
    icon: CheckCircle,
    filters: { invoicesMin: '50', statuses: ['active'] }
  },
  {
    id: 'rate_android',
    label: 'Calificar en Play Store',
    hint: 'Solo Android, clientes fieles',
    icon: Smartphone,
    filters: { platforms: ['android'], statuses: ['active'], minAgeMonths: '3' }
  },
  {
    id: 'rate_ios',
    label: 'Calificar en App Store',
    hint: 'Solo iPhone, clientes fieles',
    icon: Smartphone,
    filters: { platforms: ['ios'], statuses: ['active'], minAgeMonths: '3' }
  },
  {
    id: 'annual',
    label: 'Plan anual',
    hint: 'Clientes de plan largo',
    icon: Users,
    filters: { plans: ['anual', 'ilimitado_anual'], statuses: ['active'] }
  },
  {
    id: 'monthly_upsell',
    label: 'Mensuales (para upgrade)',
    hint: 'Ofrecerles el anual',
    icon: Target,
    filters: { plans: ['mensual', 'basico_mensual'], statuses: ['active'], minAgeMonths: '3' }
  }
]

// Textos base para no escribir desde cero (el admin los edita antes de enviar)
const MESSAGE_TEMPLATES = [
  {
    id: 'rate',
    label: 'Pedir calificación',
    title: '¿Nos ayudas con una calificación?',
    message: 'Si Cobrify te facilita el día a día, déjanos tu reseña en la tienda. Nos toma 30 segundos y nos ayuda muchísimo.'
  },
  {
    id: 'renewal',
    label: 'Recordar renovación',
    title: 'Tu suscripción está por vencer',
    message: 'Renueva ahora para seguir emitiendo sin interrupciones. Escríbenos y te ayudamos en el momento.'
  },
  {
    id: 'reactivate',
    label: 'Reactivar usuario',
    title: '¿Necesitas ayuda para empezar?',
    message: 'Vimos que aún no emites comprobantes este mes. Escríbenos y te acompañamos en la configuración, sin costo.'
  },
  {
    id: 'feature',
    label: 'Anunciar novedad',
    title: 'Nueva función disponible',
    message: 'Actualiza tu app para acceder a las últimas mejoras que preparamos para tu negocio.'
  },
  {
    id: 'upgrade',
    label: 'Ofrecer plan anual',
    title: 'Paga menos con el plan anual',
    message: 'Cambia al plan anual y ahorra varios meses respecto al pago mensual. Escríbenos para hacer el cambio.'
  }
]

const WIZARD_STEPS = [
  { id: 1, label: 'Audiencia' },
  { id: 2, label: 'Mensaje' },
  { id: 3, label: 'Revisar y enviar' }
]

const EMPTY_FILTERS = {
  accountType: 'all',
  plans: [],
  statuses: [],
  businessModes: [],
  platforms: [],
  departments: [],
  expiringInDays: '',
  minAgeMonths: '',
  invoicesMin: '',
  invoicesMax: ''
}

/** Traduce los filtros a frases legibles ("Plan: Anual", "Vencen en 7 días o menos"). */
function describeFilters(f = {}) {
  const parts = []
  const labelOf = (opts, v) => opts.find(o => o.value === v)?.label || v

  if (f.accountType && f.accountType !== 'all') {
    parts.push(labelOf(ACCOUNT_TYPE_OPTIONS, f.accountType))
  }
  if (f.platforms?.length) parts.push(`Dispositivo: ${f.platforms.map(v => labelOf(PLATFORM_OPTIONS, v)).join(', ')}`)
  if (f.plans?.length) parts.push(`Plan: ${f.plans.map(v => labelOf(PLAN_OPTIONS, v)).join(', ')}`)
  if (f.statuses?.length) parts.push(`Estado: ${f.statuses.map(v => labelOf(SUB_STATUS_OPTIONS, v)).join(', ')}`)
  if (f.businessModes?.length) parts.push(`Rubro: ${f.businessModes.map(v => labelOf(BUSINESS_MODE_OPTIONS, v)).join(', ')}`)
  if (f.departments?.length) parts.push(`Ciudad: ${f.departments.join(', ')}`)
  if (f.expiringInDays != null && f.expiringInDays !== '') {
    parts.push(Number(f.expiringInDays) === 0 ? 'Ya vencidas' : `Vencen en ${f.expiringInDays} días o menos`)
  }
  if (f.minAgeMonths) parts.push(`Antigüedad: ${f.minAgeMonths} meses o más`)
  if (f.invoicesMin !== '' && f.invoicesMin != null) parts.push(`Emitieron ${f.invoicesMin} o más`)
  if (f.invoicesMax !== '' && f.invoicesMax != null) {
    parts.push(Number(f.invoicesMax) === 0 ? 'No emitieron nada este mes' : `Emitieron ${f.invoicesMax} o menos`)
  }
  return parts
}

/** Deja solo los filtros que el admin realmente usó (el resto no debe filtrar). */
function cleanFilters(f) {
  const out = {}
  if (f.accountType && f.accountType !== 'all') out.accountType = f.accountType
  for (const key of ['plans', 'statuses', 'businessModes', 'platforms', 'departments']) {
    if (f[key]?.length > 0) out[key] = f[key]
  }
  for (const key of ['expiringInDays', 'minAgeMonths', 'invoicesMin', 'invoicesMax']) {
    if (f[key] !== '' && f[key] != null && !isNaN(Number(f[key]))) out[key] = Number(f[key])
  }
  return out
}

export default function AdminNotifications() {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortDirection, setSortDirection] = useState('desc')

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState(null)

  // Create form state
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [targetMode, setTargetMode] = useState('all')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  // Vista previa de audiencia: cuántos reciben la campaña con los filtros actuales
  const [audience, setAudience] = useState(null)
  const [loadingAudience, setLoadingAudience] = useState(false)
  // Paso del asistente: 1 Audiencia · 2 Mensaje · 3 Revisar
  const [step, setStep] = useState(1)
  const [activePreset, setActivePreset] = useState(null)
  // Qué pasa al TOCAR la notificación: 'none' | 'review' | 'url'
  const [action, setAction] = useState('none')
  const [actionUrl, setActionUrl] = useState('')
  const [manualUserIds, setManualUserIds] = useState([])
  const [usersWithTokens, setUsersWithTokens] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    loadCampaigns()
  }, [])

  async function loadCampaigns() {
    setLoading(true)
    const result = await getCampaigns(100)
    if (result.success) {
      setCampaigns(result.data)
    }
    setLoading(false)
  }

  async function loadUsersWithTokens() {
    setLoadingUsers(true)
    const result = await getUsersWithTokens()
    if (result.success) {
      setUsersWithTokens(result.data)
    }
    setLoadingUsers(false)
  }

  function openCreateModal() {
    setTitle('')
    setMessage('')
    setTargetMode('all')
    setFilters(EMPTY_FILTERS)
    setManualUserIds([])
    setUserSearch('')
    setShowConfirm(false)
    setAudience(null)
    setStep(1)
    setActivePreset(null)
    setAction('none')
    setActionUrl('')
    setShowCreateModal(true)
  }

  /** Aplica un segmento listo (deja los filtros armados; el admin puede retocarlos). */
  function applyPreset(preset) {
    setTargetMode('filter')
    setFilters({ ...EMPTY_FILTERS, ...preset.filters })
    setActivePreset(preset.id)
    // Los segmentos de calificación ya dejan lista la acción de reseña: es lo
    // único que tiene sentido para esa campaña.
    if (preset.id === 'rate_android' || preset.id === 'rate_ios') setAction('review')
  }

  function applyTemplate(tpl) {
    setTitle(tpl.title)
    setMessage(tpl.message)
    if (tpl.id === 'rate') setAction('review')
  }

  /** Reenviar una campaña anterior: copia mensaje y segmentación a una nueva. */
  function duplicateCampaign(campaign) {
    setTitle(campaign.title || '')
    setMessage(campaign.message || '')
    setTargetMode(campaign.targetMode || 'all')
    setFilters({ ...EMPTY_FILTERS, ...(campaign.filters || {}) })
    setManualUserIds(campaign.manualUserIds || [])
    setAction(campaign.action || 'none')
    setActionUrl(campaign.actionUrl || '')
    setActivePreset(null)
    setShowConfirm(false)
    setAudience(null)
    setStep(1)
    setShowDetailModal(false)
    setShowCreateModal(true)
  }

  // Recalcular la audiencia cuando cambian los filtros. Se espera 500ms para no
  // llamar a la función en cada clic mientras el admin arma la segmentación.
  useEffect(() => {
    if (!showCreateModal) return
    let cancelled = false
    setLoadingAudience(true)
    const timer = setTimeout(async () => {
      const result = await previewAudience({
        targetMode,
        filters: cleanFilters(filters),
        manualUserIds
      })
      if (cancelled) return
      setAudience(result.success ? result.data : null)
      setLoadingAudience(false)
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [showCreateModal, targetMode, filters, manualUserIds])

  function handleTargetModeChange(mode) {
    setTargetMode(mode)
    if (mode === 'manual' && usersWithTokens.length === 0) {
      loadUsersWithTokens()
    }
  }

  function toggleFilter(category, value) {
    setFilters(prev => {
      const current = prev[category] || []
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      return { ...prev, [category]: updated }
    })
  }

  function toggleManualUser(userId) {
    setManualUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  async function handleSend() {
    if (!showConfirm) {
      setShowConfirm(true)
      return
    }

    setSending(true)
    try {
      const campaignResult = await createCampaign(
        {
          title, message, targetMode, filters: cleanFilters(filters), manualUserIds,
          action: action === 'none' ? null : action,
          actionUrl: action === 'url' ? actionUrl.trim() : null
        },
        user.uid,
        user.email
      )

      if (!campaignResult.success) {
        alert('Error creando campaña: ' + campaignResult.error)
        setSending(false)
        return
      }

      const sendResult = await sendCampaign(campaignResult.data.id)
      if (sendResult.success) {
        setShowCreateModal(false)
        loadCampaigns()
      } else {
        alert('Error enviando campaña: ' + sendResult.error)
      }
    } catch (error) {
      alert('Error: ' + error.message)
    }
    setSending(false)
    setShowConfirm(false)
  }

  // Stats
  const stats = useMemo(() => {
    const total = campaigns.length
    const sent = campaigns.filter(c => c.status === 'sent').length
    const totalRecipients = campaigns.reduce((sum, c) => sum + (c.totalRecipients || 0), 0)
    const totalSuccess = campaigns.reduce((sum, c) => sum + (c.successCount || 0), 0)
    const totalTokens = campaigns.reduce((sum, c) => sum + (c.totalTokens || 0), 0)
    const successRate = totalTokens > 0 ? Math.round((totalSuccess / totalTokens) * 100) : 0
    return { total, sent, totalRecipients, successRate }
  }, [campaigns])

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    let filtered = campaigns
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(c =>
        c.title?.toLowerCase().includes(term) ||
        c.message?.toLowerCase().includes(term)
      )
    }
    return filtered
  }, [campaigns, searchTerm, sortDirection])

  // Filtered users for manual selection
  const filteredUsers = useMemo(() => {
    if (!userSearch) return usersWithTokens
    // Mismo criterio que la lista de Usuarios (@/utils/adminSearch).
    return usersWithTokens.filter(u => matchesPrebuilt(userSearch, buildAccountHaystack(u)))
  }, [usersWithTokens, userSearch])

  // No dejar enviar a nadie: si la audiencia calculada es 0, el botón se bloquea
  // (antes se podía "enviar" una campaña que no le llegaba a ninguna persona).
  const canSend = title.trim() && message.trim() && (
    targetMode !== 'manual' || manualUserIds.length > 0
  ) && !loadingAudience && (audience ? audience.usuarios > 0 : true)

  return (
    <div className="space-y-4 sm:space-y-6">
      <Pagina
        resumen={`${stats.total} campañas · ${stats.sent} enviadas · ${stats.successRate} % de éxito · ${stats.totalRecipients} destinatarios`}
        acciones={
          <>
            <Boton tamano="sm" onClick={loadCampaigns} disabled={loading}>{loading ? 'Cargando…' : 'Recargar'}</Boton>
            <Boton tamano="sm" variante="primario" onClick={openCreateModal}>Nueva campaña</Boton>
          </>
        }
      />
      <Filtros>
        <Buscador ancho="w-full sm:w-80" placeholder="Título o mensaje" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </Filtros>

      {/* Campaigns Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No hay campañas</p>
            <p className="text-sm mt-1">Crea tu primera campaña de notificaciones push</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Título</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Destino</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Destinatarios</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Enviados</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCampaigns.map(campaign => {
                  const statusCfg = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft
                  const StatusIcon = statusCfg.icon
                  return (
                    <tr
                      key={campaign.id}
                      onClick={() => { setSelectedCampaign(campaign); setShowDetailModal(true) }}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {campaign.createdAt
                          ? new Date(campaign.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' })
                          : '-'
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 truncate max-w-[200px]">{campaign.title}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[200px] sm:hidden">{campaign.message}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {TARGET_MODES[campaign.targetMode]?.label || campaign.targetMode}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 hidden md:table-cell">
                        {campaign.totalRecipients || 0}
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        <span className="text-gray-700 font-medium">{campaign.successCount || 0}</span>
                        {campaign.failureCount > 0 && (
                          <span className="text-red-500 text-xs ml-1">/ {campaign.failureCount} err</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.color}`}>
                            <StatusIcon className={`w-3 h-3 ${campaign.status === 'sending' ? 'animate-spin' : ''}`} />
                            {statusCfg.label}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <Modal onClose={() => !sending && setShowCreateModal(false)} title="Nueva Campaña Push">
          <div className="space-y-5">
            {/* Indicador de pasos */}
            <div className="flex items-center gap-2">
              {WIZARD_STEPS.map((s, i) => (
                <React.Fragment key={s.id}>
                  <button
                    type="button"
                    onClick={() => { if (s.id < step) setStep(s.id) }}
                    disabled={s.id > step}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      step === s.id
                        ? 'bg-primary-600 text-white'
                        : s.id < step
                          ? 'bg-primary-50 text-primary-700 hover:bg-primary-100 cursor-pointer'
                          : 'bg-gray-100 text-gray-400 cursor-default'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                      step === s.id ? 'bg-white/20' : s.id < step ? 'bg-primary-200 text-primary-800' : 'bg-gray-200'
                    }`}>
                      {s.id < step ? '✓' : s.id}
                    </span>
                    {s.label}
                  </button>
                  {i < WIZARD_STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200" />}
                </React.Fragment>
              ))}
            </div>

            {/* ══════════ PASO 1: AUDIENCIA ══════════ */}
            {step === 1 && (<>
            {/* Segmentos listos */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Segmentos frecuentes
                <span className="font-normal text-gray-400"> — un clic y luego ajustá si querés</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SEGMENT_PRESETS.map(preset => {
                  const Icon = preset.icon
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors ${
                        activePreset === preset.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${activePreset === preset.id ? 'text-primary-600' : 'text-gray-400'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 leading-tight">{preset.label}</p>
                        <p className="text-[11px] text-gray-500">{preset.hint}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Target Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Destinatarios</label>
              <div className="space-y-2">
                {Object.entries(TARGET_MODES).map(([key, cfg]) => {
                  const Icon = cfg.icon
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        targetMode === key
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetMode"
                        value={key}
                        checked={targetMode === key}
                        onChange={() => handleTargetModeChange(key)}
                        className="accent-primary-600"
                      />
                      <Icon className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">{cfg.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Filter Options */}
            {targetMode === 'filter' && (
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                {/* Tipo de cuenta */}
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1.5">Tipo de cuenta</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ACCOUNT_TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFilters(prev => ({ ...prev, accountType: opt.value }))}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          (filters.accountType || 'all') === opt.value
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <FilterSection
                  label="Dispositivo (para campañas de calificación)"
                  options={PLATFORM_OPTIONS}
                  selected={filters.platforms}
                  onToggle={val => toggleFilter('platforms', val)}
                />
                <FilterSection
                  label="Plan"
                  options={PLAN_OPTIONS}
                  selected={filters.plans}
                  onToggle={val => toggleFilter('plans', val)}
                />
                <FilterSection
                  label="Estado de suscripción"
                  options={SUB_STATUS_OPTIONS}
                  selected={filters.statuses}
                  onToggle={val => toggleFilter('statuses', val)}
                />
                <FilterSection
                  label="Modo de negocio"
                  options={BUSINESS_MODE_OPTIONS}
                  selected={filters.businessModes}
                  onToggle={val => toggleFilter('businessModes', val)}
                />

                {/* Vencimiento y antigüedad */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-1.5">Vencimiento</p>
                    <select
                      value={filters.expiringInDays}
                      onChange={e => setFilters(prev => ({ ...prev, expiringInDays: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-1.5">Antigüedad como cliente</p>
                    <select
                      value={filters.minAgeMonths}
                      onChange={e => setFilters(prev => ({ ...prev, minAgeMonths: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {AGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Comprobantes emitidos este mes */}
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1.5">
                    Comprobantes emitidos este mes
                    <span className="font-normal text-gray-400"> (dejá vacío lo que no uses)</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Desde"
                      value={filters.invoicesMin}
                      onChange={e => setFilters(prev => ({ ...prev, invoicesMin: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <span className="text-gray-400 text-sm">a</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Hasta"
                      value={filters.invoicesMax}
                      onChange={e => setFilters(prev => ({ ...prev, invoicesMax: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Ej: "Hasta 0" encuentra a los que no emitieron nada (para reactivarlos).
                  </p>
                </div>

                {/* Ciudad (departamento del negocio) */}
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1.5">Ciudad / departamento</p>
                  <select
                    value=""
                    onChange={e => { if (e.target.value) toggleFilter('departments', e.target.value) }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Agregar departamento…</option>
                    {DEPARTAMENTOS.map(d => (
                      <option key={d.code} value={d.name} disabled={filters.departments.includes(d.name)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {filters.departments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {filters.departments.map(dep => (
                        <button
                          key={dep}
                          type="button"
                          onClick={() => toggleFilter('departments', dep)}
                          className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary-600 text-white inline-flex items-center gap-1"
                        >
                          {dep} <X className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                >
                  Limpiar todos los filtros
                </button>
              </div>
            )}

            {/* Manual User Selection */}
            {targetMode === 'manual' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar usuario por email o negocio..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                {manualUserIds.length > 0 && (
                  <p className="text-sm text-primary-600 font-medium">{manualUserIds.length} usuario(s) seleccionado(s)</p>
                )}
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">
                      No se encontraron usuarios con tokens FCM
                    </div>
                  ) : (
                    filteredUsers.map(u => (
                      <label
                        key={u.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={manualUserIds.includes(u.id)}
                          onChange={() => toggleManualUser(u.id)}
                          className="accent-primary-600 rounded"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-800 truncate">{u.email}</div>
                          <div className="text-xs text-gray-400 flex gap-2">
                            {u.businessName && <span>{u.businessName}</span>}
                            <span className="uppercase">{u.plan}</span>
                            <span className="flex items-center gap-0.5">
                              <Smartphone className="w-3 h-3" />{u.tokenCount}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            </>)}

            {/* ══════════ PASO 2: MENSAJE ══════════ */}
            {step === 2 && (<>
              {/* Plantillas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Plantillas
                  <span className="font-normal text-gray-400"> — parte de una base y editá</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {MESSAGE_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-300 text-gray-600 bg-white hover:border-primary-400 hover:text-primary-700 transition-colors"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Título</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value.slice(0, 100))}
                  placeholder="Título de la notificación"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  maxLength={100}
                />
                <p className="text-xs text-gray-400 mt-1">{title.length}/100 · en el celular se corta cerca de los 40</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mensaje</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, 500))}
                  placeholder="Contenido de la notificación"
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  maxLength={500}
                />
                <p className="text-xs text-gray-400 mt-1">{message.length}/500</p>
              </div>

              {/* Acción al tocar la notificación */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Al tocar la notificación
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'none', label: 'Solo abrir la app', hint: 'Comportamiento normal' },
                    { value: 'review', label: 'Abrir el diálogo de calificación', hint: 'Califica sin salir de la app — ideal para pedir reseñas' },
                    { value: 'url', label: 'Abrir un enlace', hint: 'Promo, formulario, landing…' }
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        action === opt.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="action"
                        checked={action === opt.value}
                        onChange={() => setAction(opt.value)}
                        className="accent-primary-600 mt-0.5"
                      />
                      <div>
                        <p className="text-sm text-gray-900">{opt.label}</p>
                        <p className="text-[11px] text-gray-500">{opt.hint}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {action === 'url' && (
                  <input
                    type="url"
                    value={actionUrl}
                    onChange={e => setActionUrl(e.target.value)}
                    placeholder="https://cobrifyperu.com/promo"
                    className="w-full mt-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                )}
                {action === 'review' && (
                  <p className="text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-2">
                    Requiere la app actualizada. Quien tenga una versión anterior recibirá la
                    notificación igual, pero al tocarla solo se abrirá la app.
                  </p>
                )}
              </div>

              {/* Vista previa: cómo se ve en el celular */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Así se verá</p>
                <NotificationPreview title={title} message={message} />
              </div>
            </>)}

            {/* ══════════ PASO 3: REVISAR ══════════ */}
            {step === 3 && (
              <div className="space-y-4">
                <NotificationPreview title={title} message={message} />

                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                  <div className="p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Destinatarios</p>
                    <p className="text-sm text-gray-900">{TARGET_MODES[targetMode]?.label}</p>
                    {targetMode === 'filter' && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {describeFilters(cleanFilters(filters)).length === 0 ? (
                          <span className="text-xs text-gray-400">Sin filtros: llega a todos los que tengan la app</span>
                        ) : describeFilters(cleanFilters(filters)).map((p, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700">{p}</span>
                        ))}
                      </div>
                    )}
                    {targetMode === 'manual' && (
                      <p className="text-xs text-gray-500 mt-1">{manualUserIds.length} usuario(s) elegidos a mano</p>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Al tocarla</p>
                    <p className="text-sm text-gray-900">
                      {action === 'review' ? 'Abre el diálogo de calificación'
                        : action === 'url' ? `Abre ${actionUrl || '(falta el enlace)'}`
                        : 'Solo abre la app'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Vista previa de audiencia: a cuántos llega ANTES de enviar */}
            <div className={`rounded-lg border p-4 ${
              audience && audience.usuarios === 0
                ? 'bg-gray-50 border-gray-200'
                : 'bg-primary-50 border-primary-200'
            }`}>
              {loadingAudience ? (
                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Calculando audiencia…
                </p>
              ) : audience ? (
                <>
                  <p className="text-sm text-gray-800">
                    Esta campaña llegará a{' '}
                    <span className="font-semibold text-lg">{audience.usuarios}</span>{' '}
                    {audience.usuarios === 1 ? 'usuario' : 'usuarios'}
                    {audience.tokens > 0 && (
                      <span className="text-gray-500"> · {audience.tokens} dispositivo{audience.tokens === 1 ? '' : 's'}</span>
                    )}
                  </p>
                  {audience.usuarios === 0 && (
                    <p className="text-xs text-gray-700 mt-1">
                      Ningún usuario cumple estos filtros. Revisá la combinación antes de enviar.
                    </p>
                  )}
                  {audience.porPlataforma && Object.keys(audience.porPlataforma).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(audience.porPlataforma).map(([plat, n]) => (
                        <span key={plat} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white text-gray-600 border border-gray-200">
                          {plat}: {n}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">No se pudo calcular la audiencia.</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
              {showConfirm && (
                <p className="text-sm text-gray-700 mr-auto font-medium">
                  ¿Confirmas el envío?
                </p>
              )}
              {step > 1 ? (
                <button
                  onClick={() => { setStep(step - 1); setShowConfirm(false) }}
                  disabled={sending}
                  className="px-4 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors mr-auto"
                >
                  Atrás
                </button>
              ) : (
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={sending}
                  className="px-4 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              )}

              {step < 3 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={
                    (step === 1 && (loadingAudience || (audience && audience.usuarios === 0) ||
                      (targetMode === 'manual' && manualUserIds.length === 0))) ||
                    (step === 2 && (!title.trim() || !message.trim()))
                  }
                  className="px-5 py-2.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!canSend || sending}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {showConfirm ? `Confirmar envío a ${audience?.usuarios ?? 0}` : 'Enviar'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedCampaign && (
        <Modal onClose={() => setShowDetailModal(false)} title="Detalle de Campaña">
          <CampaignDetail campaign={selectedCampaign} />
          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-200">
            <button
              onClick={() => setShowDetailModal(false)}
              className="px-4 py-2.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={() => duplicateCampaign(selectedCampaign)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              title="Crear una campaña nueva con este mensaje y segmentación"
            >
              <Plus className="w-4 h-4" /> Duplicar campaña
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/**
 * Cómo se verá la notificación en el celular. Sirve para detectar títulos que se
 * cortan o mensajes demasiado largos ANTES de mandárselos a cientos de personas.
 */
function NotificationPreview({ title, message }) {
  return (
    <div className="rounded-lg bg-gray-100 p-4">
      <div className="bg-white/95 rounded-lg p-3 shadow-lg max-w-sm mx-auto">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-gray-500">Cobrify</span>
              <span className="text-[11px] text-gray-400">· ahora</span>
            </div>
            <p className="text-sm font-semibold text-gray-900 leading-tight mt-0.5 break-words">
              {title || <span className="text-gray-300">Título de la notificación</span>}
            </p>
            <p className="text-xs text-gray-600 leading-snug mt-0.5 break-words line-clamp-3">
              {message || <span className="text-gray-300">Aquí va el mensaje que verá el usuario.</span>}
            </p>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 text-center mt-2">
        Vista aproximada · cada teléfono la muestra un poco distinta
      </p>
    </div>
  )
}

function Modal({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  )
}

function FilterSection({ label, options, selected, onToggle }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onToggle(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selected.includes(opt.value)
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CampaignDetail({ campaign }) {
  const statusCfg = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft
  const StatusIcon = statusCfg.icon

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${statusCfg.color}`}>
          <StatusIcon className={`w-4 h-4 ${campaign.status === 'sending' ? 'animate-spin' : ''}`} />
          {statusCfg.label}
        </span>
        <span className="text-xs text-gray-400">
          {campaign.createdAt && new Date(campaign.createdAt).toLocaleString('es-PE')}
        </span>
      </div>

      {/* Content */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-1">{campaign.title}</h4>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{campaign.message}</p>
      </div>

      {/* Target info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">Destinatarios</p>
        <p className="text-sm text-gray-700">{TARGET_MODES[campaign.targetMode]?.label || campaign.targetMode}</p>
        {campaign.targetMode === 'filter' && campaign.filters && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {describeFilters(campaign.filters).length === 0 ? (
              <span className="text-xs text-gray-400">Sin filtros</span>
            ) : describeFilters(campaign.filters).map((p, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-white text-gray-600 border border-gray-200">{p}</span>
            ))}
          </div>
        )}
        {campaign.targetMode === 'manual' && (
          <p className="mt-1 text-xs text-gray-500">{campaign.manualUserIds?.length || 0} usuarios seleccionados</p>
        )}
      </div>

      {/* Stats */}
      {campaign.status !== 'draft' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-primary-50 rounded-lg p-3 text-center">
            <p className="text-xs text-primary-600">Destinatarios</p>
            <p className="text-xl font-semibold text-primary-700">{campaign.totalRecipients || 0}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-700">Tokens</p>
            <p className="text-xl font-semibold text-gray-700">{campaign.totalTokens || 0}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-700">Exitosos</p>
            <p className="text-xl font-semibold text-gray-700">{campaign.successCount || 0}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-xs text-red-600">Fallidos</p>
            <p className="text-xl font-semibold text-red-700">{campaign.failureCount || 0}</p>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-gray-400 space-y-1 pt-2 border-t border-gray-200">
        <p>Creado por: {campaign.createdByEmail}</p>
        {campaign.sentAt && <p>Enviado: {new Date(campaign.sentAt).toLocaleString('es-PE')}</p>}
        {campaign.completedAt && <p>Completado: {new Date(campaign.completedAt).toLocaleString('es-PE')}</p>}
      </div>
    </div>
  )
}
