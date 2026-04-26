import { useState, useEffect } from 'react'
import { Users, Clock, CheckCircle, XCircle, Loader2, UserPlus, ShoppingCart, Edit, Receipt, UserCheck, Printer, ArrowRightLeft, FileText, Split, ChevronDown, ChevronUp, Check, Combine, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'

export default function TableActionModal({
  isOpen,
  onClose,
  table,
  order,
  onOccupy,
  onRelease,
  onReserve,
  onCancelReservation,
  onAddItems,
  onEditOrder,
  onSplitBill,
  onTransferTable,
  onMoveTable,
  onSplitTable,
  onMergeTables,
  onUnmergeTable,
  onOpenPrimary,
  onPrintPreBill,
  onPrintKitchenTicket,
  onToggleItemServed,
  onMarkAllServed,
  waiters = [],
  defaultWaiterId = null,
  availableTables = [],
  occupiedTables = [],
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [action, setAction] = useState(null) // 'occupy', 'release', 'reserve', 'cancel', 'transfer', 'move'

  // Form states
  const [showOrderPreview, setShowOrderPreview] = useState(true)
  const [selectedWaiter, setSelectedWaiter] = useState('')
  const [selectedDestinationTable, setSelectedDestinationTable] = useState('')
  const [reservationTime, setReservationTime] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [selectedSourcesToMerge, setSelectedSourcesToMerge] = useState([])

  // Preseleccionar mozo: prioridad al defaultWaiterId del usuario, luego al único mozo activo
  const activeWaiters = waiters.filter(w => w.status === 'active')

  useEffect(() => {
    if (action !== 'occupy' || selectedWaiter) return

    // 1. Si el usuario tiene un mozo por defecto y está entre los activos, preseleccionarlo
    if (defaultWaiterId && activeWaiters.some(w => w.id === defaultWaiterId)) {
      setSelectedWaiter(defaultWaiterId)
      return
    }

    // 2. Si solo hay un mozo activo, preseleccionarlo
    if (activeWaiters.length === 1) {
      setSelectedWaiter(activeWaiters[0].id)
    }
  }, [action, activeWaiters.length, defaultWaiterId])

  // Resetear estado cuando el modal se cierra externamente
  useEffect(() => {
    if (!isOpen) {
      setAction(null)
      setShowOrderPreview(false)
      setSelectedWaiter('')
      setSelectedDestinationTable('')
      setReservationTime('')
      setCustomerName('')
      setCustomerPhone('')
      setSelectedSourcesToMerge([])
    }
  }, [isOpen])

  if (!table) return null

  const handleClose = () => {
    setAction(null)
    setSelectedWaiter('')
    setSelectedDestinationTable('')
    setReservationTime('')
    setCustomerName('')
    setCustomerPhone('')
    setSelectedSourcesToMerge([])
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
      // No llamar handleClose() aquí - el padre (Tables.jsx) controla
      // si cierra este modal y abre el de agregar items
      setAction(null)
      setSelectedWaiter('')
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

  const handleMove = async () => {
    if (!selectedDestinationTable) {
      alert('Por favor selecciona una mesa destino')
      return
    }

    setIsLoading(true)
    try {
      const destTable = availableTables.find(t => t.id === selectedDestinationTable)
      await onMoveTable(table.id, destTable.id, destTable.number)
      handleClose()
    } catch (error) {
      console.error('Error al mover mesa:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Estado de grupo (fusión) de la mesa actual
  const isGrouped = !!table?.groupId
  const isGroupPrimary = isGrouped && table?.isGroupPrimary === true
  const groupTableNumbers = table?.groupTableNumbers || []

  // Mesas candidatas para fusionar:
  //  - distintas a la actual
  //  - estado 'occupied' o 'available' (no reservadas)
  //  - NO secundarias de otro grupo (para evitar conflictos); las primarias de otro grupo sí se aplanan
  const allCandidateTables = [...(occupiedTables || []), ...(availableTables || [])]
  const otherOccupiedTables = allCandidateTables.filter(t => {
    if (t.id === table?.id) return false
    if (t.status === 'reserved') return false
    if (!t.groupId) return true
    if (t.groupId === table?.groupId) return false // ya están en el mismo grupo
    return t.isGroupPrimary === true // permitir primarias de otros grupos (se aplana)
  })

  // ¿La mesa actual está disponible? entonces necesitamos pedir mozo en el merge
  const primaryIsAvailable = table?.status === 'available'

  const toggleMergeSource = (tableId) => {
    setSelectedSourcesToMerge(prev =>
      prev.includes(tableId) ? prev.filter(id => id !== tableId) : [...prev, tableId]
    )
  }

  const handleMerge = async () => {
    if (selectedSourcesToMerge.length === 0) {
      alert('Selecciona al menos una mesa para fusionar')
      return
    }
    // Si la mesa principal está disponible, debe seleccionar mozo (también si entre las origen hay mesas vacías)
    const selectedHasAvailable = selectedSourcesToMerge.some(id => {
      const t = otherOccupiedTables.find(x => x.id === id)
      return t && t.status === 'available'
    })
    const needsWaiter = primaryIsAvailable || (selectedHasAvailable && !table.waiterId)
    let waiterData = null
    if (primaryIsAvailable) {
      if (!selectedWaiter) {
        alert('Selecciona un mozo para el grupo')
        return
      }
      const w = activeWaiters.find(x => x.id === selectedWaiter)
      if (!w) {
        alert('Mozo no válido')
        return
      }
      waiterData = { waiterId: w.id, waiterName: w.name }
    }
    setIsLoading(true)
    try {
      await onMergeTables(table.id, selectedSourcesToMerge, waiterData)
      handleClose()
    } catch (error) {
      console.error('Error al fusionar mesas:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnmerge = async () => {
    if (!onUnmergeTable) return
    const confirmMsg = isGroupPrimary
      ? `¿Disolver el grupo? Las demás mesas (${groupTableNumbers.filter(n => n !== table.number).join(', ')}) quedarán disponibles. La cuenta seguirá en esta mesa.`
      : `¿Separar la Mesa ${table.number} del grupo? Esta mesa quedará disponible (la cuenta queda en la mesa principal).`
    if (!window.confirm(confirmMsg)) return
    setIsLoading(true)
    try {
      await onUnmergeTable(table.id)
      handleClose()
    } catch (error) {
      console.error('Error al separar mesa:', error)
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
                {onMergeTables && otherOccupiedTables.length > 0 && (
                  <Button
                    onClick={() => setAction('merge')}
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2 border-indigo-400 text-indigo-700 hover:bg-indigo-50"
                  >
                    <Combine className="w-5 h-5" />
                    Fusionar mesas (grupo)
                  </Button>
                )}
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

            {/* Vista simplificada para mesas VINCULADAS (secundarias del grupo) */}
            {table.status === 'occupied' && isGrouped && !isGroupPrimary && (
              <>
                <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-5 text-center space-y-2">
                  <Combine className="w-10 h-10 text-gray-500 mx-auto" />
                  <div className="text-lg font-semibold text-gray-800">
                    Mesa vinculada al grupo
                  </div>
                  <div className="text-sm text-gray-600">
                    Esta mesa pertenece al grupo <strong>{groupTableNumbers.join(' + ')}</strong>.
                  </div>
                  <div className="text-sm text-gray-600">
                    La cuenta y las acciones (agregar items, imprimir, cobrar) se gestionan desde la <strong>Mesa principal {groupTableNumbers[0]}</strong>.
                  </div>
                </div>

                {onOpenPrimary && (
                  <Button
                    onClick={() => onOpenPrimary(table.groupId)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center gap-2"
                  >
                    <ArrowRightLeft className="w-5 h-5" />
                    Abrir cuenta (Mesa {groupTableNumbers[0]})
                  </Button>
                )}

                {onUnmergeTable && (
                  <Button
                    onClick={handleUnmerge}
                    variant="outline"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <Split className="w-5 h-5" />
                    Separar de grupo
                  </Button>
                )}
              </>
            )}

            {/* Vista completa para mesas ocupadas normales o principales del grupo */}
            {table.status === 'occupied' && !(isGrouped && !isGroupPrimary) && (
              <>
                {/* Banner de grupo (fusión) - solo principal */}
                {isGroupPrimary && (
                  <div className="bg-indigo-50 border border-indigo-300 rounded-lg p-3 flex items-start gap-2">
                    <Combine className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-indigo-900">
                        ★ Mesa principal del grupo
                      </div>
                      <div className="text-xs text-indigo-700 mt-0.5">
                        Mesas vinculadas: {groupTableNumbers.join(' + ')} · Las acciones aquí afectan a todo el grupo.
                      </div>
                    </div>
                  </div>
                )}

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
                          : typeof table.startTime === 'string'
                          ? table.startTime
                          : table.startTime instanceof Date
                          ? table.startTime.toLocaleTimeString('es-PE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'N/A'}
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

                {/* Vista previa del pedido con tracking de "Servido" */}
                {order?.items?.length > 0 && (() => {
                  const servedCount = order.items.filter(i => i.status === 'delivered').length
                  const totalCount = order.items.length
                  const allServed = servedCount === totalCount && totalCount > 0
                  return (
                    <div className={`border rounded-lg overflow-hidden transition-colors ${allServed ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                      <button
                        onClick={() => setShowOrderPreview(!showOrderPreview)}
                        className={`w-full flex items-center justify-between px-3 py-2 transition-colors text-sm ${allServed ? 'bg-blue-50 hover:bg-blue-100' : 'bg-gray-50 hover:bg-gray-100'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-700 font-medium">
                            Pedido ({totalCount} {totalCount === 1 ? 'item' : 'items'})
                          </span>
                          <Badge variant={allServed ? 'success' : servedCount > 0 ? 'warning' : 'default'} className="text-xs">
                            Servidos: {servedCount}/{totalCount}
                          </Badge>
                        </div>
                        {showOrderPreview
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />
                        }
                      </button>
                      {showOrderPreview && (
                        <div>
                          {/* Barra de progreso + botón marcar todos */}
                          {!allServed && onMarkAllServed && (
                            <div className="px-3 py-2 bg-white border-t border-gray-200 flex items-center justify-between gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500 transition-all"
                                  style={{ width: `${totalCount > 0 ? (servedCount / totalCount) * 100 : 0}%` }}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={onMarkAllServed}
                                className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors whitespace-nowrap"
                              >
                                <Check className="w-3 h-3 inline mr-0.5" /> Marcar todos
                              </button>
                            </div>
                          )}
                          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                            {order.items.map((item, idx) => {
                              const isServed = item.status === 'delivered'
                              return (
                                <label
                                  key={item.itemId || idx}
                                  className={`flex items-center gap-2 py-2 px-3 text-sm cursor-pointer transition-colors ${isServed ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isServed}
                                    onChange={() => onToggleItemServed && onToggleItemServed(item.itemId, isServed)}
                                    disabled={!onToggleItemServed || !item.itemId}
                                    className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500 shrink-0"
                                  />
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`font-medium shrink-0 ${isServed ? 'text-green-600' : 'text-gray-400'}`}>{item.quantity}x</span>
                                    <span className={`truncate ${isServed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                      {item.name}
                                    </span>
                                  </div>
                                  <span className={`shrink-0 ml-2 ${isServed ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                                    S/ {((item.quantity || 1) * (item.price || item.unitPrice || 0)).toFixed(2)}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

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

                <div className="grid grid-cols-2 gap-3">
                  {/* Botón de comanda: si hay items no impresos, mostrar opción de solo nuevos */}
                  {(() => {
                    const unprintedCount = (table?.order?.items || []).filter(item => !item.printedToKitchen).length
                    const hasUnprinted = unprintedCount > 0 && unprintedCount < (table?.order?.items || []).length
                    return hasUnprinted ? (
                      <div className="flex flex-col gap-1">
                        <Button
                          onClick={() => { if (onPrintKitchenTicket) onPrintKitchenTicket(false) }}
                          variant="outline"
                          className="flex items-center justify-center gap-2 text-xs"
                          size="sm"
                        >
                          <FileText className="w-4 h-4" />
                          Comanda Nuevos ({unprintedCount})
                        </Button>
                        <Button
                          onClick={() => { if (onPrintKitchenTicket) onPrintKitchenTicket(true) }}
                          variant="ghost"
                          className="flex items-center justify-center gap-1 text-xs text-gray-500"
                          size="sm"
                        >
                          Reimprimir Todo
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => { if (onPrintKitchenTicket) onPrintKitchenTicket() }}
                        variant="outline"
                        className="flex items-center justify-center gap-2"
                      >
                        <FileText className="w-5 h-5" />
                        Imprimir Comanda
                      </Button>
                    )
                  })()}
                  <Button
                    onClick={() => {
                      if (onPrintPreBill) onPrintPreBill()
                    }}
                    variant="outline"
                    className="flex items-center justify-center gap-2"
                  >
                    <Printer className="w-5 h-5" />
                    Imprimir Precuenta
                  </Button>
                </div>

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
                    Transferir Mozo
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => setAction('move')}
                    variant="outline"
                    className="flex items-center justify-center gap-2"
                  >
                    <ArrowRightLeft className="w-5 h-5" />
                    Cambiar Mesa
                  </Button>
                  <Button
                    onClick={() => {
                      if (onSplitTable) onSplitTable()
                    }}
                    variant="outline"
                    className="flex items-center justify-center gap-2"
                  >
                    <Split className="w-5 h-5" />
                    Dividir Mesa
                  </Button>
                </div>

                {/* Acciones de grupo desde la principal: disolver grupo */}
                {isGroupPrimary && onUnmergeTable && (
                  <Button
                    onClick={handleUnmerge}
                    variant="outline"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 border-indigo-400 text-indigo-700 hover:bg-indigo-50"
                  >
                    <Split className="w-5 h-5" />
                    Disolver grupo
                  </Button>
                )}

                {/* Botón fusionar: solo si NO está en grupo */}
                {!isGrouped && otherOccupiedTables.length > 0 && onMergeTables && (
                  <Button
                    onClick={() => setAction('merge')}
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2 border-indigo-400 text-indigo-700 hover:bg-indigo-50"
                  >
                    <Combine className="w-5 h-5" />
                    Fusionar Mesas
                  </Button>
                )}

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
              {activeWaiters.map((waiter) => (
                <option key={waiter.id} value={waiter.id}>
                  {waiter.name} ({waiter.code})
                </option>
              ))}
            </Select>
            {activeWaiters.length === 0 && (
              <p className="text-sm text-red-600 mt-2">
                No hay mozos activos disponibles. Crea mozos primero.
              </p>
            )}
            {activeWaiters.length === 1 && (
              <p className="text-sm text-green-600 mt-2">
                Mozo preseleccionado automáticamente
              </p>
            )}
            {activeWaiters.length > 1 && defaultWaiterId && selectedWaiter === defaultWaiterId && (
              <p className="text-sm text-green-600 mt-2">
                Mozo por defecto del usuario (puedes cambiarlo)
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

    // Formulario para fusionar mesas
    if (action === 'merge') {
      const selectedSourcesData = otherOccupiedTables.filter(t => selectedSourcesToMerge.includes(t.id))
      const sumSelectedAmount = selectedSourcesData.reduce((s, t) => s + (t.amount || 0), 0)
      const projectedTotal = (table.amount || 0) + sumSelectedAmount
      const primaryWaiterId = table.waiterId
      const sourcesWithDifferentWaiter = selectedSourcesData.filter(
        t => t.status === 'occupied' && t.waiterId && t.waiterId !== primaryWaiterId
      )
      const selectedAvailableCount = selectedSourcesData.filter(t => t.status === 'available').length

      return (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <p className="text-sm text-indigo-900">
              {primaryIsAvailable ? (
                <>Vas a crear un <strong>grupo</strong> con la <strong>Mesa {table.number}</strong> como principal. Selecciona las mesas que se juntan físicamente, elige el mozo, y todas pasarán a estar ocupadas con una sola cuenta compartida.</>
              ) : (
                <>Vas a fusionar otras mesas con la <strong>Mesa {table.number}</strong> formando un <strong>grupo</strong>. Las mesas seguirán ocupadas y mostrarán la misma cuenta. Podrás separarlas o cobrar todo junto.</>
              )}
            </p>
          </div>

          {primaryIsAvailable && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mozo del grupo *
              </label>
              <Select
                value={selectedWaiter}
                onChange={(e) => setSelectedWaiter(e.target.value)}
                required
              >
                <option value="">-- Seleccionar mozo --</option>
                {activeWaiters.map((waiter) => (
                  <option key={waiter.id} value={waiter.id}>
                    {waiter.name} ({waiter.code})
                  </option>
                ))}
              </Select>
              {activeWaiters.length === 0 && (
                <p className="text-sm text-red-600 mt-2">
                  No hay mozos activos disponibles. Crea mozos primero.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selecciona las mesas a fusionar *
            </label>
            <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
              {otherOccupiedTables.map(t => {
                const checked = selectedSourcesToMerge.includes(t.id)
                const isAvail = t.status === 'available'
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMergeSource(t.id)}
                      className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">Mesa {t.number}</span>
                        {t.zone && <span className="text-xs text-gray-500">({t.zone})</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          isAvail ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {isAvail ? 'Disponible' : 'Ocupada'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {isAvail ? `Capacidad: ${t.capacity}` : `Mozo: ${t.waiter || '—'}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        {isAvail ? '—' : `S/ ${(t.amount || 0).toFixed(2)}`}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {sourcesWithDifferentWaiter.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800">
                Hay mesas ocupadas con mozo distinto al de la mesa principal ({primaryIsAvailable ? '(por elegir)' : (table.waiter || '—')}). Los ítems pasarán a esta cuenta y la mesa cambiará de mozo.
              </div>
            </div>
          )}

          {selectedSourcesToMerge.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Cuenta actual Mesa {table.number}:</span>
                <span className="font-medium text-gray-900">S/ {(table.amount || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  + Mesas a fusionar ({selectedSourcesToMerge.length}
                  {selectedAvailableCount > 0 ? `, ${selectedAvailableCount} vacía${selectedAvailableCount > 1 ? 's' : ''}` : ''}):
                </span>
                <span className="font-medium text-gray-900">S/ {sumSelectedAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                <span className="text-gray-700 font-semibold">{primaryIsAvailable ? 'Total inicial del grupo:' : 'Nuevo total:'}</span>
                <span className="font-bold text-indigo-700">S/ {projectedTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setAction(null)} className="flex-1">
              Atrás
            </Button>
            <Button
              onClick={handleMerge}
              disabled={isLoading || selectedSourcesToMerge.length === 0 || (primaryIsAvailable && !selectedWaiter)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {primaryIsAvailable ? 'Creando grupo...' : 'Fusionando...'}
                </>
              ) : (
                <>
                  <Combine className="w-4 h-4 mr-2" />
                  {primaryIsAvailable ? `Crear grupo (${selectedSourcesToMerge.length + 1})` : `Fusionar ${selectedSourcesToMerge.length || ''}`}
                </>
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
              {activeWaiters
                .filter((w) => w.id !== table.waiterId)
                .map((waiter) => (
                  <option key={waiter.id} value={waiter.id}>
                    {waiter.name} ({waiter.code})
                  </option>
                ))}
            </Select>
            {activeWaiters.filter((w) => w.id !== table.waiterId).length === 0 && (
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

    // Formulario para mover mesa
    if (action === 'move') {
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Vas a mover la orden de la <strong>Mesa {table.number}</strong> a otra mesa disponible.
            </p>
            <p className="text-xs text-blue-600 mt-1">
              La orden, el mozo y el consumo se moverán a la nueva mesa.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar Mesa Destino *
            </label>
            <Select
              value={selectedDestinationTable}
              onChange={(e) => setSelectedDestinationTable(e.target.value)}
              required
            >
              <option value="">-- Seleccionar mesa --</option>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>
                  Mesa {t.number} - {t.zone} ({t.capacity} personas)
                </option>
              ))}
            </Select>
            {availableTables.length === 0 && (
              <p className="text-sm text-amber-600 mt-2">
                No hay mesas disponibles para mover la orden.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setAction(null)} className="flex-1">
              Atrás
            </Button>
            <Button
              onClick={handleMove}
              disabled={isLoading || !selectedDestinationTable}
              className="flex-1 bg-primary-600 hover:bg-primary-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Moviendo...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Cambiar Mesa
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
      <div className={action ? 'p-6' : ''}>
        {renderContent()}
      </div>
    </Modal>
  )
}
