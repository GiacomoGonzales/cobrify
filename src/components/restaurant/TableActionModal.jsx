import { useState } from 'react'
import { Users, Clock, CheckCircle, XCircle, Loader2, UserPlus, ShoppingCart, Edit, Receipt, UserCheck, Printer } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'

export default function TableActionModal({
  isOpen,
  onClose,
  table,
  onOccupy,
  onRelease,
  onReserve,
  onCancelReservation,
  onAddItems,
  onEditOrder,
  onSplitBill,
  onTransferTable,
  onPrintPreBill,
  waiters = [],
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [action, setAction] = useState(null) // 'occupy', 'release', 'reserve', 'cancel', 'transfer'

  // Form states
  const [selectedWaiter, setSelectedWaiter] = useState('')
  const [reservationTime, setReservationTime] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  if (!table) return null

  const handleClose = () => {
    setAction(null)
    setSelectedWaiter('')
    setReservationTime('')
    setCustomerName('')
    setCustomerPhone('')
    onClose()
  }

  const handleOccupy = async () => {
    if (!selectedWaiter) {
      alert('Por favor selecciona un mozo')
      return
    }

    setIsLoading(true)
    try {
      const waiter = waiters.find(w => w.id === selectedWaiter)
      await onOccupy(table.id, {
        waiterId: waiter.id,
        waiterName: waiter.name,
      })
      handleClose()
    } catch (error) {
      console.error('Error al ocupar mesa:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRelease = () => {
    // No cerrar el modal, solo llamar a onRelease que abrirá el CloseTableModal
    if (onRelease) {
      onRelease(table.id)
    }
  }

  const handleReserve = async () => {
    if (!reservationTime || !customerName) {
      alert('Por favor completa todos los campos requeridos')
      return
    }

    setIsLoading(true)
    try {
      await onReserve(table.id, {
        reservedFor: reservationTime,
        reservedBy: customerName,
        customerPhone: customerPhone,
      })
      handleClose()
    } catch (error) {
      console.error('Error al reservar mesa:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelReservation = async () => {
    if (!window.confirm('¿Cancelar la reserva de esta mesa?')) return

    setIsLoading(true)
    try {
      await onCancelReservation(table.id)
      handleClose()
    } catch (error) {
      console.error('Error al cancelar reserva:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTransfer = async () => {
    if (!selectedWaiter) {
      alert('Por favor selecciona un mozo')
      return
    }

    setIsLoading(true)
    try {
      const waiter = waiters.find(w => w.id === selectedWaiter)
      await onTransferTable(table.id, {
        waiterId: waiter.id,
        waiterName: waiter.name,
      })
      handleClose()
    } catch (error) {
      console.error('Error al transferir mesa:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const renderContent = () => {
    // Vista inicial - mostrar opciones según estado
    if (!action) {
      return (
        <div className="space-y-4">
          {/* Info de la mesa */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold text-gray-900">
                  Mesa {table.number}
                </div>
                <Badge
                  variant={
                    table.status === 'available'
                      ? 'success'
                      : table.status === 'occupied'
                      ? 'danger'
                      : 'warning'
                  }
                >
                  {table.status === 'available' && 'Disponible'}
                  {table.status === 'occupied' && 'Ocupada'}
                  {table.status === 'reserved' && 'Reservada'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Users className="w-5 h-5" />
                <span className="font-medium">{table.capacity} personas</span>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              Zona: <span className="font-medium">{table.zone}</span>
            </div>
          </div>

          {/* Acciones según estado */}
          <div className="space-y-3">
            {table.status === 'available' && (
              <>
                <Button
                  onClick={() => setAction('occupy')}
                  className="w-full bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-5 h-5" />
                  Ocupar Mesa
                </Button>
                <Button
                  onClick={() => setAction('reserve')}
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2"
                >
                  <Clock className="w-5 h-5" />
                  Reservar Mesa
                </Button>
              </>
            )}

            {table.status === 'occupied' && (
              <>
                {/* Info de ocupación */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Mozo:</span>
                    <span className="font-medium text-gray-900">{table.waiter}</span>
                  </div>
                  {table.startTime && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Hora inicio:</span>
                      <span className="font-medium text-gray-900">
                        {table.startTime.toDate
                          ? table.startTime.toDate().toLocaleTimeString('es-PE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : table.startTime}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Consumo:</span>
                    <span className="font-bold text-gray-900">
                      S/ {(table.amount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => {
                      if (onAddItems) onAddItems()
                    }}
                    variant="outline"
                    className="flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    Agregar Items
                  </Button>
                  <Button
                    onClick={() => {
                      if (onEditOrder) onEditOrder()
                    }}
                    variant="outline"
                    className="flex items-center justify-center gap-2"
                  >
                    <Edit className="w-5 h-5" />
                    Editar Orden
                  </Button>
                </div>

                <Button
                  onClick={() => {
                    if (onPrintPreBill) onPrintPreBill()
                  }}
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2"
                >
                  <Printer className="w-5 h-5" />
                  Imprimir Precuenta
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => {
                      if (onSplitBill) onSplitBill()
                    }}
                    variant="outline"
                    className="flex items-center justify-center gap-2"
                  >
                    <Receipt className="w-5 h-5" />
                    Dividir Cuenta
                  </Button>
                  <Button
                    onClick={() => setAction('transfer')}
                    variant="outline"
                    className="flex items-center justify-center gap-2"
                  >
                    <UserCheck className="w-5 h-5" />
                    Transferir Mesa
                  </Button>
                </div>

                <Button
                  onClick={() => setAction('release')}
                  className="w-full bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Cerrar Cuenta
                </Button>
              </>
            )}

            {table.status === 'reserved' && (
              <>
                {/* Info de reserva */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
                  {table.reservedBy && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cliente:</span>
                      <span className="font-medium text-gray-900">{table.reservedBy}</span>
                    </div>
                  )}
                  {table.reservedFor && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Hora:</span>
                      <span className="font-medium text-gray-900">{table.reservedFor}</span>
                    </div>
                  )}
                </div>

                <Button
                  onClick={() => setAction('occupy')}
                  className="w-full bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-5 h-5" />
                  Ocupar Mesa (Cliente llegó)
                </Button>

                <Button
                  onClick={() => setAction('cancel')}
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center justify-center gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  Cancelar Reserva
                </Button>
              </>
            )}
          </div>
        </div>
      )
    }

    // Formulario para ocupar mesa
    if (action === 'occupy') {
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Vas a ocupar la <strong>Mesa {table.number}</strong>. Asigna un mozo para comenzar la
              atención.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar Mozo *
            </label>
            <Select
              value={selectedWaiter}
              onChange={(e) => setSelectedWaiter(e.target.value)}
              required
            >
              <option value="">-- Seleccionar mozo --</option>
              {waiters
                .filter((w) => w.status === 'active')
                .map((waiter) => (
                  <option key={waiter.id} value={waiter.id}>
                    {waiter.name} ({waiter.code})
                  </option>
                ))}
            </Select>
            {waiters.filter((w) => w.status === 'active').length === 0 && (
              <p className="text-sm text-red-600 mt-2">
                No hay mozos activos disponibles. Crea mozos primero.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setAction(null)} className="flex-1">
              Atrás
            </Button>
            <Button
              onClick={handleOccupy}
              disabled={isLoading || !selectedWaiter}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Ocupando...
                </>
              ) : (
                'Ocupar Mesa'
              )}
            </Button>
          </div>
        </div>
      )
    }

    // Formulario para transferir mesa
    if (action === 'transfer') {
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Vas a transferir la <strong>Mesa {table.number}</strong> a otro mozo.
            </p>
            {table.waiter && (
              <p className="text-sm text-blue-800 mt-2">
                Mozo actual: <strong>{table.waiter}</strong>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar Nuevo Mozo *
            </label>
            <Select
              value={selectedWaiter}
              onChange={(e) => setSelectedWaiter(e.target.value)}
              required
            >
              <option value="">-- Seleccionar mozo --</option>
              {waiters
                .filter((w) => w.status === 'active' && w.id !== table.waiterId)
                .map((waiter) => (
                  <option key={waiter.id} value={waiter.id}>
                    {waiter.name} ({waiter.code})
                  </option>
                ))}
            </Select>
            {waiters.filter((w) => w.status === 'active' && w.id !== table.waiterId).length === 0 && (
              <p className="text-sm text-amber-600 mt-2">
                No hay otros mozos activos disponibles para transferir.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setAction(null)} className="flex-1">
              Atrás
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={isLoading || !selectedWaiter}
              className="flex-1 bg-primary-600 hover:bg-primary-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Transfiriendo...
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4 mr-2" />
                  Transferir Mesa
                </>
              )}
            </Button>
          </div>
        </div>
      )
    }

    // Formulario para reservar mesa
    if (action === 'reserve') {
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Reserva la <strong>Mesa {table.number}</strong> para un horario específico.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Cliente *
            </label>
            <Input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ej: Juan Pérez"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Teléfono (opcional)
            </label>
            <Input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Ej: 987654321"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hora de Reserva *
            </label>
            <Input
              type="time"
              value={reservationTime}
              onChange={(e) => setReservationTime(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setAction(null)} className="flex-1">
              Atrás
            </Button>
            <Button
              onClick={handleReserve}
              disabled={isLoading}
              className="flex-1 bg-yellow-600 hover:bg-yellow-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Reservando...
                </>
              ) : (
                'Reservar Mesa'
              )}
            </Button>
          </div>
        </div>
      )
    }

    // Confirmación para liberar mesa
    if (action === 'release') {
      return (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800">
              ¿Cerrar la cuenta de la <strong>Mesa {table.number}</strong>?
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Mozo:</span>
              <span className="font-medium text-gray-900">{table.waiter}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Consumo total:</span>
              <span className="font-bold text-green-600 text-lg">
                S/ {(table.amount || 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleRelease}
              disabled={isLoading}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cerrando...
                </>
              ) : (
                'Cerrar Cuenta'
              )}
            </Button>
          </div>
        </div>
      )
    }

    // Confirmación para cancelar reserva
    if (action === 'cancel') {
      return (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              ¿Cancelar la reserva de la <strong>Mesa {table.number}</strong>?
            </p>
          </div>

          {table.reservedBy && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Cliente:</span>
                <span className="font-medium text-gray-900">{table.reservedBy}</span>
              </div>
              {table.reservedFor && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Hora:</span>
                  <span className="font-medium text-gray-900">{table.reservedFor}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setAction(null)} className="flex-1">
              Atrás
            </Button>
            <Button
              onClick={handleCancelReservation}
              disabled={isLoading}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelando...
                </>
              ) : (
                'Cancelar Reserva'
              )}
            </Button>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={action ? '' : `Mesa ${table?.number || ''}`}
      size="md"
    >
      {renderContent()}
    </Modal>
  )
}
