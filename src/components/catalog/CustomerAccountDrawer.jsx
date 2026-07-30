import { useState, useEffect } from 'react'
import { X, Loader2, MapPin, Package, User, Plus, Trash2, Check, Star } from 'lucide-react'
import {
  getCatalogCustomerOrders,
  saveCatalogCustomerAddress,
  deleteCatalogCustomerAddress,
  updateCatalogCustomerProfile,
} from '@/services/catalogCustomerService'
import { formatCurrency } from '@/lib/utils'

/**
 * Panel "Mi cuenta" del comprador (Ola 2): pedidos, direcciones y datos.
 * Mismo patrón de drawer que el detalle de producto: pantalla completa en
 * móvil, panel lateral derecho en escritorio.
 */

const ORDER_STATUS_LABEL = {
  pending: 'Pendiente',
  preparing: 'En preparación',
  ready: 'Listo',
  dispatched: 'En camino',
  completed: 'Entregado',
  cancelled: 'Cancelado',
}

const ORDER_STATUS_STYLE = {
  pending: 'bg-amber-100 text-amber-700',
  preparing: 'bg-blue-100 text-blue-700',
  ready: 'bg-indigo-100 text-indigo-700',
  dispatched: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const fmtDate = (value) => {
  if (!value) return ''
  const d = value.toDate ? value.toDate() : new Date(value)
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CustomerAccountDrawer({
  isOpen,
  onClose,
  businessId,
  user,
  profile,
  onProfileChange,
  accent = '#10B981',
  currency = 'PEN',
  initialTab = 'orders',
}) {
  const [tab, setTab] = useState(initialTab) // orders | addresses | data
  const [orders, setOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // Formulario de dirección
  const [editingAddress, setEditingAddress] = useState(null) // null | {} | {...}
  const [savingAddress, setSavingAddress] = useState(false)

  // Datos personales
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [savingData, setSavingData] = useState(false)
  const [dataSaved, setDataSaved] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setTab(initialTab)
  }, [isOpen, initialTab])

  useEffect(() => {
    if (!isOpen) return
    setName(profile?.name || '')
    setPhone(profile?.phone || '')
  }, [isOpen, profile])

  // Cargar pedidos solo al abrir la pestaña (no en cada apertura del panel)
  useEffect(() => {
    if (!isOpen || tab !== 'orders' || !businessId || !user?.uid) return
    let cancelled = false
    setLoadingOrders(true)
    getCatalogCustomerOrders(businessId, user.uid).then(result => {
      if (cancelled) return
      setOrders(result.success ? result.data : [])
      setLoadingOrders(false)
    })
    return () => { cancelled = true }
  }, [isOpen, tab, businessId, user?.uid])

  if (!isOpen) return null

  const addresses = profile?.addresses || []

  const handleSaveAddress = async (e) => {
    e.preventDefault()
    if (!editingAddress?.address?.trim()) return
    setSavingAddress(true)
    const result = await saveCatalogCustomerAddress(businessId, user.uid, editingAddress, addresses)
    setSavingAddress(false)
    if (result.success) {
      onProfileChange?.({ ...profile, addresses: result.addresses })
      setEditingAddress(null)
    }
  }

  const handleDeleteAddress = async (id) => {
    const result = await deleteCatalogCustomerAddress(businessId, user.uid, id, addresses)
    if (result.success) onProfileChange?.({ ...profile, addresses: result.addresses })
  }

  const handleSaveData = async (e) => {
    e.preventDefault()
    setSavingData(true)
    setDataSaved(false)
    const result = await updateCatalogCustomerProfile(businessId, user.uid, {
      name: name.trim(),
      phone: phone.trim(),
    })
    setSavingData(false)
    if (result.success) {
      onProfileChange?.({ ...profile, name: name.trim(), phone: phone.trim() })
      setDataSaved(true)
      setTimeout(() => setDataSaved(false), 2500)
    }
  }

  const TABS = [
    { id: 'orders', label: 'Pedidos', icon: Package },
    { id: 'addresses', label: 'Direcciones', icon: MapPin },
    { id: 'data', label: 'Mis datos', icon: User },
  ]

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="catalog-drawer-panel absolute inset-0 md:inset-y-0 md:left-auto md:right-0 w-full md:max-w-md bg-white shadow-2xl flex flex-col">
        {/* Encabezado */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                {profile?.name || user?.displayName || 'Mi cuenta'}
              </h2>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
            <button onClick={onClose} className="p-1.5 -mr-1.5 text-gray-400 hover:text-gray-600" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Pestañas */}
          <div className="flex gap-1 mt-4 -mb-3">
            {TABS.map(t => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    active ? '' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  style={active ? { borderColor: accent, color: accent } : {}}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto catalog-scrollbar p-5">
          {/* ---------- PEDIDOS ---------- */}
          {tab === 'orders' && (
            loadingOrders ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-10">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Aún no tienes pedidos con esta cuenta</p>
                <p className="text-xs text-gray-400 mt-1">
                  Los pedidos que hagas con tu sesión iniciada aparecerán aquí
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <div key={order.id} className="border border-gray-200 rounded-xl p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          Pedido {order.orderNumber || order.id.slice(0, 6).toUpperCase()}
                        </p>
                        <p className="text-xs text-gray-500">{fmtDate(order.createdAt)}</p>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ORDER_STATUS_STYLE[order.status] || 'bg-gray-100 text-gray-600'}`}>
                        {ORDER_STATUS_LABEL[order.status] || order.status}
                      </span>
                    </div>
                    {Array.isArray(order.items) && order.items.length > 0 && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                        {order.items.map(i => `${i.quantity}× ${i.name || i.productName}`).join(', ')}
                      </p>
                    )}
                    <p className="text-sm font-bold text-gray-900 mt-2">
                      {formatCurrency(order.total || 0, currency)}
                    </p>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ---------- DIRECCIONES ---------- */}
          {tab === 'addresses' && (
            <div className="space-y-3">
              {editingAddress ? (
                <form onSubmit={handleSaveAddress} className="space-y-3 border border-gray-200 rounded-xl p-4">
                  <input
                    type="text"
                    placeholder="Nombre (Casa, Trabajo...)"
                    value={editingAddress.label || ''}
                    onChange={e => setEditingAddress({ ...editingAddress, label: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                  <textarea
                    required
                    rows={2}
                    placeholder="Dirección completa"
                    value={editingAddress.address || ''}
                    onChange={e => setEditingAddress({ ...editingAddress, address: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none"
                  />
                  <input
                    type="text"
                    placeholder="Referencia (opcional)"
                    value={editingAddress.reference || ''}
                    onChange={e => setEditingAddress({ ...editingAddress, reference: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!editingAddress.isDefault}
                      onChange={e => setEditingAddress({ ...editingAddress, isDefault: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    Usar como predeterminada
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingAddress(null)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingAddress}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                      style={{ backgroundColor: accent }}
                    >
                      {savingAddress && <Loader2 className="w-4 h-4 animate-spin" />}
                      Guardar
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setEditingAddress({ isDefault: addresses.length === 0 })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-gray-300 text-gray-600 hover:border-gray-400"
                >
                  <Plus className="w-4 h-4" />
                  Agregar dirección
                </button>
              )}

              {addresses.length === 0 && !editingAddress && (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Guarda tus direcciones</p>
                  <p className="text-xs text-gray-400 mt-1">Se completan solas al hacer un pedido</p>
                </div>
              )}

              {addresses.map(addr => (
                <div key={addr.id} className="border border-gray-200 rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                        {addr.label}
                        {addr.isDefault && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${accent}15`, color: accent }}>
                            <Star className="w-2.5 h-2.5" /> Principal
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">{addr.address}</p>
                      {addr.reference && <p className="text-xs text-gray-400 mt-0.5">{addr.reference}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => setEditingAddress(addr)}
                        className="text-xs font-medium hover:underline"
                        style={{ color: accent }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        aria-label="Eliminar dirección"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ---------- MIS DATOS ---------- */}
          {tab === 'data' && (
            <form onSubmit={handleSaveData} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Celular</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Correo</label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-3 py-2.5 border border-gray-200 bg-gray-50 rounded-xl text-sm text-gray-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">El correo no se puede cambiar</p>
              </div>
              <button
                type="submit"
                disabled={savingData}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: accent }}
              >
                {savingData && <Loader2 className="w-4 h-4 animate-spin" />}
                {dataSaved && <Check className="w-4 h-4" />}
                {dataSaved ? 'Guardado' : 'Guardar cambios'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
