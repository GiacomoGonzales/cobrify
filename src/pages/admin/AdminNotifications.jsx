import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createCampaign, sendCampaign, getCampaigns, getUsersWithTokens } from '@/services/pushCampaignService'
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

const STATUS_CONFIG = {
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-700', icon: Clock },
  sending: { label: 'Enviando', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  sent: { label: 'Enviada', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  partial: { label: 'Parcial', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
  failed: { label: 'Fallida', color: 'bg-red-100 text-red-700', icon: AlertCircle }
}

const TARGET_MODES = {
  all: { label: 'Todos los usuarios', icon: Users },
  filter: { label: 'Filtrar por criterios', icon: Filter },
  manual: { label: 'Seleccionar manualmente', icon: Target }
}

const PLAN_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' }
]

const SUB_STATUS_OPTIONS = [
  { value: 'active', label: 'Activa' },
  { value: 'expired', label: 'Expirada' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'trial', label: 'Trial' }
]

const BUSINESS_MODE_OPTIONS = [
  { value: 'retail', label: 'Retail' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'transport', label: 'Transport' }
]

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
  const [filters, setFilters] = useState({ plans: [], statuses: [], businessModes: [] })
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
    setFilters({ plans: [], statuses: [], businessModes: [] })
    setManualUserIds([])
    setUserSearch('')
    setShowConfirm(false)
    setShowCreateModal(true)
  }

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
        { title, message, targetMode, filters, manualUserIds },
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
    const term = userSearch.toLowerCase()
    return usersWithTokens.filter(u =>
      u.email?.toLowerCase().includes(term) ||
      u.businessName?.toLowerCase().includes(term)
    )
  }, [usersWithTokens, userSearch])

  const canSend = title.trim() && message.trim() && (
    targetMode !== 'manual' || manualUserIds.length > 0
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={Bell}
          label="Total Campañas"
          value={stats.total}
          color="from-orange-500 to-amber-600"
        />
        <StatCard
          icon={Send}
          label="Enviadas"
          value={stats.sent}
          color="from-green-500 to-emerald-600"
        />
        <StatCard
          icon={CheckCircle}
          label="Tasa de Éxito"
          value={`${stats.successRate}%`}
          color="from-blue-500 to-cyan-600"
        />
        <StatCard
          icon={Users}
          label="Destinatarios Total"
          value={stats.totalRecipients}
          color="from-purple-500 to-violet-600"
        />
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar campañas..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadCampaigns}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nueva Campaña
            </button>
          </div>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Título</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Destino</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Destinatarios</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Enviados</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
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
                        <span className="text-green-600 font-medium">{campaign.successCount || 0}</span>
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
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Título</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value.slice(0, 100))}
                placeholder="Título de la notificación"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                maxLength={100}
              />
              <p className="text-xs text-gray-400 mt-1">{title.length}/100</p>
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mensaje</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value.slice(0, 500))}
                placeholder="Contenido de la notificación"
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                maxLength={500}
              />
              <p className="text-xs text-gray-400 mt-1">{message.length}/500</p>
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
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetMode"
                        value={key}
                        checked={targetMode === key}
                        onChange={() => handleTargetModeChange(key)}
                        className="accent-orange-500"
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
              <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                <FilterSection
                  label="Plan"
                  options={PLAN_OPTIONS}
                  selected={filters.plans}
                  onToggle={val => toggleFilter('plans', val)}
                />
                <FilterSection
                  label="Estado Suscripción"
                  options={SUB_STATUS_OPTIONS}
                  selected={filters.statuses}
                  onToggle={val => toggleFilter('statuses', val)}
                />
                <FilterSection
                  label="Modo de Negocio"
                  options={BUSINESS_MODE_OPTIONS}
                  selected={filters.businessModes}
                  onToggle={val => toggleFilter('businessModes', val)}
                />
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
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>
                {manualUserIds.length > 0 && (
                  <p className="text-sm text-orange-600 font-medium">{manualUserIds.length} usuario(s) seleccionado(s)</p>
                )}
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
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
                          className="accent-orange-500 rounded"
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

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
              {showConfirm && (
                <p className="text-sm text-orange-600 mr-auto font-medium">
                  ¿Confirmas el envío?
                </p>
              )}
              <button
                onClick={() => { setShowConfirm(false); setShowCreateModal(false) }}
                disabled={sending}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend || sending}
                className="flex items-center gap-2 px-5 py-2.5 text-sm text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {showConfirm ? 'Confirmar Envío' : 'Enviar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedCampaign && (
        <Modal onClose={() => setShowDetailModal(false)} title="Detalle de Campaña">
          <CampaignDetail campaign={selectedCampaign} />
        </Modal>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg bg-gradient-to-br ${color} shadow-md flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

function Modal({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
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
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300'
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
          <div className="mt-2 space-y-1 text-xs text-gray-500">
            {campaign.filters.plans?.length > 0 && <p>Planes: {campaign.filters.plans.join(', ')}</p>}
            {campaign.filters.statuses?.length > 0 && <p>Estados: {campaign.filters.statuses.join(', ')}</p>}
            {campaign.filters.businessModes?.length > 0 && <p>Modos: {campaign.filters.businessModes.join(', ')}</p>}
          </div>
        )}
        {campaign.targetMode === 'manual' && (
          <p className="mt-1 text-xs text-gray-500">{campaign.manualUserIds?.length || 0} usuarios seleccionados</p>
        )}
      </div>

      {/* Stats */}
      {campaign.status !== 'draft' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-xs text-blue-600">Destinatarios</p>
            <p className="text-xl font-bold text-blue-700">{campaign.totalRecipients || 0}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-xs text-purple-600">Tokens</p>
            <p className="text-xl font-bold text-purple-700">{campaign.totalTokens || 0}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xs text-green-600">Exitosos</p>
            <p className="text-xl font-bold text-green-700">{campaign.successCount || 0}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-xs text-red-600">Fallidos</p>
            <p className="text-xl font-bold text-red-700">{campaign.failureCount || 0}</p>
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
