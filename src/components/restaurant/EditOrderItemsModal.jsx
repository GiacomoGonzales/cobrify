import { useState, useEffect } from 'react'
import { Edit, Plus, Minus, Trash2, Loader2, Gift } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { removeOrderItem, updateOrderItemQuantity, toggleItemCourtesy } from '@/services/orderService'
import OrderItemsModal from './OrderItemsModal'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function EditOrderItemsModal({ isOpen, onClose, table, order, onSuccess }) {
  const { getBusinessId, business, user } = useAppContext()
  const demoContext = useDemoRestaurant()
  const toast = useToast()

  const [isUpdating, setIsUpdating] = useState(false)
  const [updatingItemIndex, setUpdatingItemIndex] = useState(null)
  const [recargoConfig, setRecargoConfig] = useState({ enabled: false, rate: 10 })
  const [taxConfig, setTaxConfig] = useState({ igvRate: 18, igvExempt: false })

  // Modal de agregar items (reutiliza el de Mesas con categorías + grilla + modificadores)
  const [showAddItemsModal, setShowAddItemsModal] = useState(false)

  // Cargar configuración del negocio
  useEffect(() => {
    const loadConfig = async () => {
      // Primero intentar usar los datos del contexto
      if (business?.restaurantConfig) {
        setRecargoConfig({
          enabled: business.restaurantConfig.recargoConsumoEnabled ?? false,
          rate: business.restaurantConfig.recargoConsumoRate ?? 10
        })
      }
      if (business?.emissionConfig?.taxConfig) {
        setTaxConfig(business.emissionConfig.taxConfig)
      } else if (business?.taxConfig) {
        setTaxConfig(business.taxConfig)
      }

      // Si no hay datos en el contexto, cargar de Firestore
      if (!business?.restaurantConfig && !demoContext) {
        try {
          const businessId = getBusinessId()
          if (businessId) {
            const businessRef = doc(db, 'businesses', businessId)
            const businessSnap = await getDoc(businessRef)
            if (businessSnap.exists()) {
              const data = businessSnap.data()
              if (data.restaurantConfig) {
                setRecargoConfig({
                  enabled: data.restaurantConfig.recargoConsumoEnabled ?? false,
                  rate: data.restaurantConfig.recargoConsumoRate ?? 10
                })
              }
              if (data.emissionConfig?.taxConfig) {
                setTaxConfig(data.emissionConfig.taxConfig)
              } else if (data.taxConfig) {
                setTaxConfig(data.taxConfig)
              }
            }
          }
        } catch (error) {
          console.error('Error loading business config:', error)
        }
      }
    }

    if (isOpen) {
      loadConfig()
      setShowAddItemsModal(false)
    }
  }, [isOpen, business, getBusinessId, demoContext])

  const handleUpdateQuantity = async (itemIndex, currentQuantity, delta) => {
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    const newQuantity = currentQuantity + delta
    if (newQuantity < 1) return

    setUpdatingItemIndex(itemIndex)
    setIsUpdating(true)
    try {
      const result = await updateOrderItemQuantity(getBusinessId(), order.id, itemIndex, newQuantity, { uid: user?.uid, name: user?.displayName || user?.email || 'Usuario' })
      if (result.success) {
        toast.success('Cantidad actualizada')
        onSuccess()
      } else {
        toast.error('Error al actualizar cantidad: ' + result.error)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al actualizar cantidad')
    } finally {
      setIsUpdating(false)
      setUpdatingItemIndex(null)
    }
  }

  const handleToggleCourtesy = async (itemIndex, item) => {
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    const isCurrentlyCourtesy = !!item.isCourtesy
    let reason = item.courtesyReason || ''

    if (!isCurrentlyCourtesy) {
      // Marcar como cortesía: pedir motivo opcional
      const input = window.prompt('Motivo de la cortesía (opcional):', '')
      if (input === null) return // canceló
      reason = input.trim()
    } else {
      // Desmarcar: confirmar
      if (!window.confirm('¿Quitar la cortesía y restaurar el precio original?')) return
    }

    setUpdatingItemIndex(itemIndex)
    setIsUpdating(true)
    try {
      const result = await toggleItemCourtesy(getBusinessId(), order.id, itemIndex, !isCurrentlyCourtesy, {
        reason,
        markedBy: { uid: user?.uid, name: user?.displayName || user?.email || 'Usuario' },
      })
      if (result.success) {
        toast.success(isCurrentlyCourtesy ? 'Cortesía quitada' : 'Marcado como cortesía')
        onSuccess()
      } else {
        toast.error('Error al cambiar cortesía: ' + result.error)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cambiar cortesía')
    } finally {
      setIsUpdating(false)
      setUpdatingItemIndex(null)
    }
  }

  const handleRemoveItem = async (itemIndex) => {
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    if (!confirm('¿Estás seguro de eliminar este item?')) return

    setUpdatingItemIndex(itemIndex)
    setIsUpdating(true)
    try {
      const result = await removeOrderItem(getBusinessId(), order.id, itemIndex, { uid: user?.uid, name: user?.displayName || user?.email || 'Usuario' })
      if (result.success) {
        toast.success('Item eliminado')
        onSuccess()
      } else {
        toast.error('Error al eliminar item: ' + result.error)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al eliminar item')
    } finally {
      setIsUpdating(false)
      setUpdatingItemIndex(null)
    }
  }

  // Helper: descripción legible de modificadores en un item existente
  const formatModifiers = (item) => {
    // Soporta tanto el campo nuevo (modifiers) como el viejo (selectedModifiers) por compatibilidad
    const mods = item.modifiers || item.selectedModifiers
    if (!mods || mods.length === 0) return null
    return mods
      .map(m => {
        const opts = (m.options || []).map(o => o.optionName).join(', ')
        return `${m.modifierName}: ${opts}`
      })
      .join(' | ')
  }

  const calculateTotals = () => {
    if (!order || !order.items) return { subtotal: 0, igv: 0, recargo: 0, total: 0 }

    const itemsTotal = order.items.reduce((sum, item) => sum + item.total, 0)

    let recargo = 0
    if (recargoConfig.enabled) {
      recargo = itemsTotal * (recargoConfig.rate / 100)
    }

    const igvRate = taxConfig.igvRate || 18
    const baseConRecargo = itemsTotal + recargo

    let subtotal, igv, total
    if (taxConfig.igvExempt) {
      subtotal = baseConRecargo
      igv = 0
      total = baseConRecargo
    } else {
      subtotal = baseConRecargo / (1 + igvRate / 100)
      igv = baseConRecargo - subtotal
      total = baseConRecargo
    }

    return { subtotal, igv, recargo, total, itemsTotal }
  }

  if (!table || !order) return null

  const totals = calculateTotals()

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Edit className="w-5 h-5" />
          <div>
            <div className="text-lg font-bold">Editar Orden - {table?.waiter ? `Mesa ${table.number}` : (table?.number || 'Orden')}</div>
            <div className="text-sm font-normal text-gray-600">
              {table?.waiter ? `Mozo: ${table.waiter} | ` : ''}Orden: {order?.orderNumber || '#' + (order?.id?.slice(-6) || '')}
            </div>
          </div>
        </div>
      }
      size="lg"
    >
      <div className="flex flex-col h-[500px]">
        {/* Acción primaria: agregar productos (arriba, prominente) */}
        <button
          onClick={() => setShowAddItemsModal(true)}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm mb-3"
        >
          <Plus className="w-5 h-5" />
          Agregar productos
        </button>

        {/* Encabezado de lista */}
        {order.items && order.items.length > 0 && (
          <div className="flex items-center justify-between text-xs text-gray-500 uppercase tracking-wide px-2 pb-1.5 border-b border-gray-200 mb-1">
            <span>Producto</span>
            <span>Cantidad · Total</span>
          </div>
        )}

        {/* Lista compacta de items */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 mb-3">
          {order.items && order.items.length > 0 ? (
            order.items.map((item, index) => {
              const modsLabel = formatModifiers(item)
              const isRowBusy = updatingItemIndex === index && isUpdating
              const isCourtesy = !!item.isCourtesy
              const displayPriceUnit = isCourtesy && item.originalPrice !== undefined ? item.originalPrice : item.price
              const displayTotal = isCourtesy && item.originalTotal !== undefined ? item.originalTotal : item.total
              return (
                <div key={index} className={`py-2 px-2 transition-colors ${isCourtesy ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}>
                  {/* Móvil: nombre en su propia línea (completo). Desktop: nombre + controles en una sola fila */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                    {/* Nombre + precio unitario */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1.5 flex-wrap">
                        <span className={`text-sm font-medium text-gray-900 break-words sm:truncate ${isCourtesy ? 'line-through text-gray-500' : ''}`}>{item.name}</span>
                        {isCourtesy && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-600 text-white font-bold tracking-wide shrink-0">
                            CORTESÍA
                          </span>
                        )}
                      </div>
                      <div className={`text-xs text-gray-500 ${isCourtesy ? 'line-through' : ''}`}>S/ {(displayPriceUnit || 0).toFixed(2)} c/u</div>
                    </div>

                    {/* Fila de controles (en móvil va debajo del nombre) */}
                    <div className="flex items-center gap-1 sm:gap-1 shrink-0 justify-between sm:justify-end">
                      {/* Controles de cantidad */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleUpdateQuantity(index, item.quantity, -1)}
                          disabled={isUpdating || item.quantity <= 1}
                          className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium">
                          {isRowBusy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : item.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(index, item.quantity, 1)}
                          disabled={isUpdating}
                          className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Total */}
                      <div className="w-20 text-right text-sm font-semibold shrink-0">
                        {isCourtesy ? (
                          <div className="flex flex-col items-end leading-tight">
                            <span className="text-gray-400 line-through text-xs">S/ {(displayTotal || 0).toFixed(2)}</span>
                            <span className="text-green-700">S/ 0.00</span>
                          </div>
                        ) : (
                          <span className="text-gray-900">S/ {item.total.toFixed(2)}</span>
                        )}
                      </div>

                      {/* Cortesía */}
                      <button
                        onClick={() => handleToggleCourtesy(index, item)}
                        disabled={isUpdating}
                        className={`w-7 h-7 flex items-center justify-center rounded shrink-0 disabled:opacity-40 ${
                          isCourtesy
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'text-green-600 hover:bg-green-50 hover:text-green-700'
                        }`}
                        title={isCourtesy ? 'Quitar cortesía' : 'Marcar como cortesía'}
                      >
                        <Gift className="w-3.5 h-3.5" />
                      </button>

                      {/* Eliminar */}
                      <button
                        onClick={() => handleRemoveItem(index)}
                        disabled={isUpdating}
                        className="w-7 h-7 flex items-center justify-center rounded text-red-500 hover:bg-red-50 hover:text-red-700 shrink-0 disabled:opacity-40"
                        title="Eliminar"
                      >
                        {isRowBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Modificadores y notas debajo, en línea fina */}
                  {(modsLabel || item.notes || (isCourtesy && item.courtesyReason)) && (
                    <div className="ml-0 mt-1 space-y-0.5">
                      {modsLabel && (
                        <div className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded inline-block max-w-full truncate" title={modsLabel}>
                          {modsLabel}
                        </div>
                      )}
                      {item.notes && (
                        <div className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded inline-block max-w-full truncate" title={item.notes}>
                          Nota: {item.notes}
                        </div>
                      )}
                      {isCourtesy && item.courtesyReason && (
                        <div className="text-xs text-green-800 bg-green-100 px-2 py-0.5 rounded inline-block max-w-full truncate" title={item.courtesyReason}>
                          Motivo: {item.courtesyReason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              No hay items en esta orden. Pulsa "Agregar productos" para empezar.
            </div>
          )}
        </div>

        {/* Totales */}
        {order.items && order.items.length > 0 && (
          <div className="border-t pt-4 space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal productos:</span>
              <span className="font-medium">S/ {(totals.itemsTotal || 0).toFixed(2)}</span>
            </div>
            {recargoConfig.enabled && totals.recargo > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Recargo al consumo ({recargoConfig.rate}%):</span>
                <span className="font-medium">S/ {totals.recargo.toFixed(2)}</span>
              </div>
            )}
            {!taxConfig.igvExempt && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">IGV ({taxConfig.igvRate || 18}%):</span>
                <span className="font-medium">S/ {totals.igv.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total:</span>
              <span className="text-primary-600">S/ {totals.total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>

      {/* Modal de agregar items: reutiliza la UI de Mesas con categorías + grilla + modificadores */}
      <OrderItemsModal
        isOpen={showAddItemsModal}
        onClose={() => setShowAddItemsModal(false)}
        table={table}
        order={order}
        onSuccess={() => {
          setShowAddItemsModal(false)
          if (onSuccess) onSuccess()
        }}
      />
    </>
  )
}
