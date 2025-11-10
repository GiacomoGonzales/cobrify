import { useState } from 'react'
import { Edit, Plus, Minus, Trash2, Loader2, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { removeOrderItem, updateOrderItemQuantity } from '@/services/orderService'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { useDemoRestaurant } from '@/contexts/DemoRestaurantContext'

export default function EditOrderItemsModal({ isOpen, onClose, table, order, onSuccess }) {
  const { getBusinessId } = useAppContext()
  const demoContext = useDemoRestaurant()
  const toast = useToast()

  const [isUpdating, setIsUpdating] = useState(false)
  const [updatingItemIndex, setUpdatingItemIndex] = useState(null)

  const handleUpdateQuantity = async (itemIndex, currentQuantity, delta) => {
    // Verificar si está en modo demo
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    const newQuantity = currentQuantity + delta
    if (newQuantity < 1) return // No permitir cantidades menores a 1

    setUpdatingItemIndex(itemIndex)
    setIsUpdating(true)
    try {
      const result = await updateOrderItemQuantity(getBusinessId(), order.id, itemIndex, newQuantity)
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

  const handleRemoveItem = async (itemIndex) => {
    // Verificar si está en modo demo
    if (demoContext) {
      toast.info('Esta función no está disponible en modo demo. Regístrate para usar todas las funcionalidades.')
      return
    }

    if (!confirm('¿Estás seguro de eliminar este item?')) return

    setUpdatingItemIndex(itemIndex)
    setIsUpdating(true)
    try {
      const result = await removeOrderItem(getBusinessId(), order.id, itemIndex)
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

  const calculateTotals = () => {
    if (!order || !order.items) return { subtotal: 0, igv: 0, total: 0 }

    const total = order.items.reduce((sum, item) => sum + item.total, 0)
    const subtotal = total / 1.18
    const igv = total - subtotal
    return { subtotal, igv, total }
  }

  if (!table || !order) return null

  const totals = calculateTotals()

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Edit className="w-5 h-5" />
          <div>
            <div className="text-lg font-bold">Editar Orden - Mesa {table.number}</div>
            <div className="text-sm font-normal text-gray-600">
              Mozo: {table.waiter} | Orden: {order.orderNumber || '#' + order.id.slice(-6)}
            </div>
          </div>
        </div>
      }
      size="lg"
    >
      <div className="flex flex-col h-[500px]">
        {/* Lista de items */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {order.items && order.items.length > 0 ? (
            order.items.map((item, index) => (
              <div key={index} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="text-sm text-gray-500">
                      S/ {item.price.toFixed(2)} c/u
                    </div>
                  </div>
                  <Button
                    onClick={() => handleRemoveItem(index)}
                    disabled={isUpdating}
                    variant="outline"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    {updatingItemIndex === index && isUpdating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdateQuantity(index, item.quantity, -1)}
                      disabled={isUpdating || item.quantity <= 1}
                      className="w-8 h-8 p-0"
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-12 text-center font-medium text-lg">
                      {updatingItemIndex === index && isUpdating ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      ) : (
                        item.quantity
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdateQuantity(index, item.quantity, 1)}
                      disabled={isUpdating}
                      className="w-8 h-8 p-0"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="font-bold text-gray-900 text-lg">
                    S/ {item.total.toFixed(2)}
                  </div>
                </div>

                {item.notes && (
                  <div className="mt-2 text-xs text-gray-600 bg-orange-50 px-2 py-1 rounded">
                    Nota: {item.notes}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">
              No hay items en esta orden
            </div>
          )}
        </div>

        {/* Totales */}
        {order.items && order.items.length > 0 && (
          <div className="border-t pt-4 space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">S/ {totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">IGV (18%):</span>
              <span className="font-medium">S/ {totals.igv.toFixed(2)}</span>
            </div>
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
  )
}
