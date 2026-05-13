import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  where,
  increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { createOrder, completeOrder, addOrderItems } from './orderService'

/**
 * Servicio para gestión de mesas de restaurante
 */

// =====================================================
// TABLES (Mesas)
// =====================================================

/**
 * Obtener todas las mesas de un negocio
 */
export const getTables = async (businessId) => {
  try {
    const tablesRef = collection(db, 'businesses', businessId, 'tables')
    const q = query(tablesRef, orderBy('number', 'asc'))
    const snapshot = await getDocs(q)

    const tables = []
    snapshot.forEach((doc) => {
      tables.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: tables }
  } catch (error) {
    console.error('Error al obtener mesas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una mesa específica
 */
export const getTable = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)

    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }

    return { success: true, data: { id: tableSnap.id, ...tableSnap.data() } }
  } catch (error) {
    console.error('Error al obtener mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear una nueva mesa
 */
export const createTable = async (businessId, tableData) => {
  try {
    const tablesRef = collection(db, 'businesses', businessId, 'tables')

    const newTable = {
      number: tableData.number,
      capacity: tableData.capacity || 4,
      zone: tableData.zone || 'Salón Principal',
      status: 'available', // available, occupied, reserved, maintenance
      isActive: true,
      // Datos de ocupación (null cuando está disponible)
      currentOrder: null,
      waiter: null,
      waiterId: null,
      startTime: null,
      amount: 0,
      // Datos de reserva (null cuando no está reservada)
      reservedFor: null,
      reservedBy: null,
      reservationTime: null,
      // Metadata
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(tablesRef, newTable)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una mesa
 */
export const updateTable = async (businessId, tableId, tableData) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)

    await updateDoc(tableRef, {
      ...tableData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una mesa
 */
export const deleteTable = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    await deleteDoc(tableRef)

    return { success: true }
  } catch (error) {
    console.error('Error al eliminar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Ocupar una mesa (asignar mozo y abrir orden automáticamente)
 */
export const occupyTable = async (businessId, tableId, occupyData) => {
  try {
    // Obtener datos de la mesa
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)

    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }

    const tableData = tableSnap.data()

    // Crear una orden automáticamente
    const orderResult = await createOrder(businessId, {
      tableId: tableId,
      tableNumber: tableData.number,
      waiterId: occupyData.waiterId,
      waiterName: occupyData.waiterName,
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
      customerName: occupyData.customerName || null,
      customerPhone: occupyData.customerPhone || null,
      notes: occupyData.notes || '',
    })

    if (!orderResult.success) {
      return { success: false, error: 'Error al crear orden: ' + orderResult.error }
    }

    const orderId = orderResult.id

    // Actualizar la mesa con la información de ocupación
    await updateDoc(tableRef, {
      status: 'occupied',
      currentOrder: orderId,
      waiter: occupyData.waiterName,
      waiterId: occupyData.waiterId,
      startTime: serverTimestamp(),
      amount: 0,
      updatedAt: serverTimestamp(),
    })

    // Actualizar métricas del mozo (incrementar mesas activas)
    if (occupyData.waiterId) {
      const waiterRef = doc(db, 'businesses', businessId, 'waiters', occupyData.waiterId)
      await updateDoc(waiterRef, {
        activeTables: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(err => {
        console.warn('No se pudo actualizar métricas del mozo:', err)
        // No fallar si no se puede actualizar las métricas
      })
    }

    return { success: true, orderId }
  } catch (error) {
    console.error('Error al ocupar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Liberar una mesa (cerrar orden y completarla).
 * Si la mesa pertenece a un grupo (fusión), libera TODAS las mesas del grupo.
 */
export const releaseTable = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)

    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }

    const tableData = tableSnap.data()

    // Determinar el conjunto de mesas a liberar.
    // Si la mesa está agrupada, recolectar todas las mesas del grupo (incluyendo esta).
    let tablesToRelease = [{ id: tableId, ...tableData }]
    if (tableData.groupId) {
      try {
        const groupQuery = query(
          collection(db, 'businesses', businessId, 'tables'),
          where('groupId', '==', tableData.groupId)
        )
        const groupSnap = await getDocs(groupQuery)
        const collected = []
        groupSnap.forEach((d) => collected.push({ id: d.id, ...d.data() }))
        if (collected.length > 0) tablesToRelease = collected
      } catch (err) {
        console.warn('No se pudo cargar el grupo de mesas, liberando solo la mesa solicitada:', err)
      }
    }

    // PRIMERO: liberar todas las mesas inmediatamente (UI rápida)
    await Promise.all(
      tablesToRelease.map((t) =>
        updateDoc(doc(db, 'businesses', businessId, 'tables', t.id), {
          status: 'available',
          currentOrder: null,
          waiter: null,
          waiterId: null,
          startTime: null,
          amount: 0,
          groupId: null,
          isGroupPrimary: false,
          groupTableNumbers: null,
          allItemsServed: false,
          // Limpiar marca de precuenta impresa (la próxima ocupación de
          // la mesa arranca sin el indicador).
          preBillPrintedAt: null,
          updatedAt: serverTimestamp(),
        }).catch((err) => console.warn(`No se pudo liberar mesa ${t.id}:`, err))
      )
    )

    // DESPUÉS: completar orden(es) y métricas en paralelo (no bloquea)
    const backgroundTasks = []

    // Completar la orden compartida (la primaria del grupo o la única)
    const primaryOrderId =
      tablesToRelease.find((t) => t.isGroupPrimary)?.currentOrder || tableData.currentOrder
    if (primaryOrderId) {
      backgroundTasks.push(
        completeOrder(businessId, primaryOrderId).catch((err) => {
          console.warn('No se pudo completar la orden:', err)
        })
      )
    }

    // Actualizar métricas de cada mozo único de las mesas liberadas
    const waiterCounts = new Map()
    tablesToRelease.forEach((t) => {
      if (t.waiterId) {
        waiterCounts.set(t.waiterId, (waiterCounts.get(t.waiterId) || 0) + 1)
      }
    })
    waiterCounts.forEach((count, waiterId) => {
      const waiterRef = doc(db, 'businesses', businessId, 'waiters', waiterId)
      backgroundTasks.push(
        updateDoc(waiterRef, {
          activeTables: increment(-count),
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          console.warn('No se pudo actualizar métricas del mozo:', err)
        })
      )
    })

    if (backgroundTasks.length > 0) {
      Promise.all(backgroundTasks).catch(() => {})
    }

    return { success: true, data: { releasedCount: tablesToRelease.length } }
  } catch (error) {
    console.error('Error al liberar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Reservar una mesa
 */
export const reserveTable = async (businessId, tableId, reservationData) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)

    await updateDoc(tableRef, {
      status: 'reserved',
      reservedFor: reservationData.reservedFor, // Hora de la reserva
      reservedBy: reservationData.reservedBy, // Nombre del cliente
      reservationTime: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al reservar mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cancelar reserva de una mesa
 */
export const cancelReservation = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)

    await updateDoc(tableRef, {
      status: 'available',
      reservedFor: null,
      reservedBy: null,
      reservationTime: null,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al cancelar reserva:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar el monto de consumo de una mesa
 */
export const updateTableAmount = async (businessId, tableId, amount) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)

    await updateDoc(tableRef, {
      amount: amount,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar monto:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar el estado de "todos los platos servidos" de una mesa.
 * Usado para que la grilla muestre un indicador visual cuando el mesero
 * marcó todos los ítems del pedido como servidos.
 */
export const updateTableServedStatus = async (businessId, tableId, allItemsServed) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    await updateDoc(tableRef, {
      allItemsServed: !!allItemsServed,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar estado de servido:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Marcar una mesa como "precuenta impresa". Se llama desde handlePrintPreBill
 * después de imprimir exitosamente, para que la grilla muestre un indicador
 * sutil al mozo de que la mesa ya pidió la cuenta y está por liberarse.
 *
 * Si la mesa pertenece a un grupo (fusión), marca a TODAS las mesas del
 * grupo (porque la precuenta es una sola para todo el grupo).
 *
 * Se limpia automáticamente en releaseTable() al liberar la mesa.
 */
export const markPreBillPrinted = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)
    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }
    const tableData = tableSnap.data()

    // Determinar el conjunto de mesas a marcar (incluyendo agrupadas).
    let tablesToMark = [tableId]
    if (tableData.groupId) {
      try {
        const groupQuery = query(
          collection(db, 'businesses', businessId, 'tables'),
          where('groupId', '==', tableData.groupId)
        )
        const groupSnap = await getDocs(groupQuery)
        const ids = []
        groupSnap.forEach((d) => ids.push(d.id))
        if (ids.length > 0) tablesToMark = ids
      } catch (err) {
        console.warn('No se pudo cargar grupo, marcando solo la mesa solicitada:', err)
      }
    }

    await Promise.all(
      tablesToMark.map((id) =>
        updateDoc(doc(db, 'businesses', businessId, 'tables', id), {
          preBillPrintedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((err) => console.warn(`No se pudo marcar precuenta en mesa ${id}:`, err))
      )
    )
    return { success: true, data: { markedCount: tablesToMark.length } }
  } catch (error) {
    console.error('Error al marcar precuenta impresa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Mover una orden a otra mesa
 */
export const moveOrderToTable = async (businessId, sourceTableId, destinationTableId) => {
  try {
    // Obtener datos de la mesa origen
    const sourceTableRef = doc(db, 'businesses', businessId, 'tables', sourceTableId)
    const sourceTableSnap = await getDoc(sourceTableRef)

    if (!sourceTableSnap.exists()) {
      return { success: false, error: 'Mesa origen no encontrada' }
    }

    const sourceTableData = sourceTableSnap.data()

    if (sourceTableData.status !== 'occupied') {
      return { success: false, error: 'La mesa origen no está ocupada' }
    }

    if (!sourceTableData.currentOrder) {
      return { success: false, error: 'La mesa origen no tiene una orden activa' }
    }

    // Obtener datos de la mesa destino
    const destTableRef = doc(db, 'businesses', businessId, 'tables', destinationTableId)
    const destTableSnap = await getDoc(destTableRef)

    if (!destTableSnap.exists()) {
      return { success: false, error: 'Mesa destino no encontrada' }
    }

    const destTableData = destTableSnap.data()

    if (destTableData.status !== 'available') {
      return { success: false, error: 'La mesa destino no está disponible' }
    }

    // Actualizar la orden con la nueva mesa
    const orderRef = doc(db, 'businesses', businessId, 'orders', sourceTableData.currentOrder)
    await updateDoc(orderRef, {
      tableId: destinationTableId,
      tableNumber: destTableData.number,
      updatedAt: serverTimestamp(),
    })

    // Ocupar la mesa destino con los datos de la orden
    await updateDoc(destTableRef, {
      status: 'occupied',
      currentOrder: sourceTableData.currentOrder,
      waiter: sourceTableData.waiter,
      waiterId: sourceTableData.waiterId,
      startTime: sourceTableData.startTime,
      amount: sourceTableData.amount,
      updatedAt: serverTimestamp(),
    })

    // Liberar la mesa origen (sin completar la orden)
    await updateDoc(sourceTableRef, {
      status: 'available',
      currentOrder: null,
      waiter: null,
      waiterId: null,
      startTime: null,
      amount: 0,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al mover orden a otra mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Dividir mesa: mover items seleccionados de una mesa a otra
 * Si la mesa destino está disponible, la ocupa con una nueva orden
 * Si la mesa destino ya está ocupada, agrega los items a la orden existente
 */
export const splitTableItems = async (businessId, sourceTableId, destTableId, splitItems, sourceWaiter) => {
  try {
    // Obtener datos de la mesa origen
    const sourceTableRef = doc(db, 'businesses', businessId, 'tables', sourceTableId)
    const sourceTableSnap = await getDoc(sourceTableRef)

    if (!sourceTableSnap.exists()) {
      return { success: false, error: 'Mesa origen no encontrada' }
    }

    const sourceTableData = sourceTableSnap.data()

    if (sourceTableData.status !== 'occupied' || !sourceTableData.currentOrder) {
      return { success: false, error: 'La mesa origen no tiene una orden activa' }
    }

    // Obtener datos de la mesa destino
    const destTableRef = doc(db, 'businesses', businessId, 'tables', destTableId)
    const destTableSnap = await getDoc(destTableRef)

    if (!destTableSnap.exists()) {
      return { success: false, error: 'Mesa destino no encontrada' }
    }

    const destTableData = destTableSnap.data()

    if (destTableData.status !== 'available' && destTableData.status !== 'occupied') {
      return { success: false, error: 'La mesa destino no está disponible ni ocupada' }
    }

    // Obtener la orden origen
    const sourceOrderRef = doc(db, 'businesses', businessId, 'orders', sourceTableData.currentOrder)
    const sourceOrderSnap = await getDoc(sourceOrderRef)

    if (!sourceOrderSnap.exists()) {
      return { success: false, error: 'Orden origen no encontrada' }
    }

    const sourceOrderData = sourceOrderSnap.data()
    const allItems = sourceOrderData.items || []

    // Separar items: los que se mueven y los que se quedan
    let itemsToMove, itemsToKeep
    if (splitItems && splitItems.itemsToMove && splitItems.itemsToKeep) {
      // Nuevo formato: items pre-construidos con cantidades parciales
      itemsToMove = splitItems.itemsToMove
      itemsToKeep = splitItems.itemsToKeep
    } else {
      // Legacy: índices simples
      itemsToMove = splitItems.map(i => allItems[i]).filter(Boolean)
      itemsToKeep = allItems.filter((_, i) => !splitItems.includes(i))
    }

    if (itemsToMove.length === 0) {
      return { success: false, error: 'No se seleccionaron items para mover' }
    }

    if (itemsToKeep.length === 0) {
      return { success: false, error: 'No puedes mover todos los items. Usa "Cambiar Mesa" en su lugar.' }
    }

    // Obtener configuración fiscal del negocio
    const businessRef = doc(db, 'businesses', businessId)
    const businessSnap = await getDoc(businessRef)
    const taxConfig = businessSnap.exists() && businessSnap.data().emissionConfig?.taxConfig
      ? businessSnap.data().emissionConfig.taxConfig
      : { igvRate: 18, igvExempt: false }
    const igvRate = taxConfig.igvRate || 18
    const igvMultiplier = 1 + (igvRate / 100)

    // Recalcular totales de la orden origen (items que quedan)
    const sourceTotal = itemsToKeep.reduce((sum, item) => sum + (item.total || item.price * item.quantity), 0)
    const sourceSubtotal = taxConfig.igvExempt ? sourceTotal : sourceTotal / igvMultiplier
    const sourceTax = taxConfig.igvExempt ? 0 : sourceTotal - sourceSubtotal

    // Actualizar la orden origen con los items restantes
    await updateDoc(sourceOrderRef, {
      items: itemsToKeep,
      subtotal: sourceSubtotal,
      tax: sourceTax,
      total: sourceTotal,
      updatedAt: serverTimestamp(),
    })

    // Actualizar monto en la mesa origen
    await updateDoc(sourceTableRef, {
      amount: sourceTotal,
      updatedAt: serverTimestamp(),
    })

    // Manejar mesa destino
    if (destTableData.status === 'occupied' && destTableData.currentOrder) {
      // Mesa destino ya ocupada: agregar items a la orden existente
      const result = await addOrderItems(businessId, destTableData.currentOrder, itemsToMove.map(item => ({
        ...item,
        printedToKitchen: item.printedToKitchen || false,
      })))

      if (!result.success) {
        return { success: false, error: 'Error al agregar items a la mesa destino: ' + result.error }
      }
    } else {
      // Mesa destino disponible: crear nueva orden y ocupar
      const destTotal = itemsToMove.reduce((sum, item) => sum + (item.total || item.price * item.quantity), 0)
      const destSubtotal = taxConfig.igvExempt ? destTotal : destTotal / igvMultiplier
      const destTax = taxConfig.igvExempt ? 0 : destTotal - destSubtotal

      const orderResult = await createOrder(businessId, {
        tableId: destTableId,
        tableNumber: destTableData.number,
        waiterId: sourceWaiter?.waiterId || sourceTableData.waiterId,
        waiterName: sourceWaiter?.waiterName || sourceTableData.waiter,
        items: itemsToMove,
        subtotal: destSubtotal,
        tax: destTax,
        total: destTotal,
      })

      if (!orderResult.success) {
        return { success: false, error: 'Error al crear orden en mesa destino: ' + orderResult.error }
      }

      // Ocupar la mesa destino
      await updateDoc(destTableRef, {
        status: 'occupied',
        currentOrder: orderResult.id,
        waiter: sourceWaiter?.waiterName || sourceTableData.waiter,
        waiterId: sourceWaiter?.waiterId || sourceTableData.waiterId,
        startTime: serverTimestamp(),
        amount: destTotal,
        updatedAt: serverTimestamp(),
      })

      // Actualizar métricas del mozo
      const waiterId = sourceWaiter?.waiterId || sourceTableData.waiterId
      if (waiterId) {
        const waiterRef = doc(db, 'businesses', businessId, 'waiters', waiterId)
        await updateDoc(waiterRef, {
          activeTables: increment(1),
          updatedAt: serverTimestamp(),
        }).catch(err => {
          console.warn('No se pudo actualizar métricas del mozo:', err)
        })
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error al dividir mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Fusionar una o más mesas en una mesa principal creando un GRUPO de mesas.
 *
 * Comportamiento:
 *  - Las mesas origen NO se liberan. Quedan ocupadas y pasan a ser parte del grupo.
 *  - Todas las mesas del grupo apuntan al mismo currentOrder (la orden de la mesa principal).
 *  - Todas las mesas del grupo muestran el mismo monto total (la cuenta combinada).
 *  - La mesa principal lleva isGroupPrimary=true; las demás isGroupPrimary=false.
 *  - El groupId es el id de la mesa principal (estable y simple).
 *  - Los ítems de cada orden origen se mueven a la orden principal preservando flags de cocina.
 *  - Las órdenes origen quedan marcadas como 'merged' (status closed + mergedInto + paid:true) para
 *    que no aparezcan como activas, pero se conservan para auditoría.
 *  - El mozo de cada mesa fusionada se actualiza al de la mesa principal (la mesa pertenece al grupo).
 *  - Si una mesa fuente ya pertenecía a otro grupo (anidado), se "aplana": todas sus mesas se
 *    unen al nuevo grupo principal.
 *  - Si la mesa principal está DISPONIBLE, se ocupa primero (requiere options.waiterData).
 *  - Las mesas origen pueden estar OCUPADAS o DISPONIBLES (las disponibles se ocupan al unirse al grupo).
 *  - Mesas reservadas no se pueden fusionar.
 *
 * @param {string} businessId
 * @param {string} primaryTableId - mesa que conserva la cuenta del grupo
 * @param {string[]} sourceTableIds - mesas que se fusionan al grupo
 * @param {object} [options]
 * @param {{waiterId: string, waiterName: string}} [options.waiterData] - requerido si la principal está disponible
 * @returns {Promise<{success: boolean, data?: {groupId, totalTables, mergedItems}, error?: string}>}
 */
export const mergeTables = async (businessId, primaryTableId, sourceTableIds, options = {}) => {
  try {
    if (!Array.isArray(sourceTableIds) || sourceTableIds.length === 0) {
      return { success: false, error: 'No se seleccionaron mesas para fusionar' }
    }
    if (sourceTableIds.includes(primaryTableId)) {
      return { success: false, error: 'La mesa principal no puede fusionarse consigo misma' }
    }

    // 1. Validar mesa principal
    const primaryTableRef = doc(db, 'businesses', businessId, 'tables', primaryTableId)
    let primaryTableSnap = await getDoc(primaryTableRef)
    if (!primaryTableSnap.exists()) {
      return { success: false, error: 'Mesa principal no encontrada' }
    }
    let primaryTableData = primaryTableSnap.data()

    if (primaryTableData.status === 'reserved') {
      return { success: false, error: 'La mesa principal está reservada. Cancela la reserva o márcala como ocupada primero.' }
    }
    if (primaryTableData.status !== 'occupied' && primaryTableData.status !== 'available') {
      return { success: false, error: `La mesa principal no se puede fusionar (estado: ${primaryTableData.status})` }
    }
    if (primaryTableData.groupId && !primaryTableData.isGroupPrimary) {
      return { success: false, error: 'Esta mesa pertenece a un grupo. Fusiona desde la mesa principal del grupo.' }
    }

    // 1.b Si la principal está disponible, primero la ocupamos (necesitamos crear su orden).
    if (primaryTableData.status === 'available') {
      const waiter = options?.waiterData
      if (!waiter?.waiterId || !waiter?.waiterName) {
        return { success: false, error: 'Para fusionar mesas vacías debes indicar el mozo del grupo' }
      }
      const occupyResult = await occupyTable(businessId, primaryTableId, {
        waiterId: waiter.waiterId,
        waiterName: waiter.waiterName,
      })
      if (!occupyResult.success) {
        return { success: false, error: 'No se pudo crear la orden de la mesa principal: ' + occupyResult.error }
      }
      // Releemos el snapshot ahora que está ocupada
      primaryTableSnap = await getDoc(primaryTableRef)
      primaryTableData = primaryTableSnap.data()
    }

    if (!primaryTableData.currentOrder) {
      return { success: false, error: 'La mesa principal no tiene orden activa' }
    }

    const primaryOrderRef = doc(db, 'businesses', businessId, 'orders', primaryTableData.currentOrder)
    const primaryOrderSnap = await getDoc(primaryOrderRef)
    if (!primaryOrderSnap.exists()) {
      return { success: false, error: 'Orden de la mesa principal no encontrada' }
    }
    const primaryOrderData = primaryOrderSnap.data()
    const primaryOrderId = primaryTableData.currentOrder
    const groupId = primaryTableId

    // 2. Leer y validar mesas origen. Aceptan estado 'occupied' o 'available'.
    const sourcesMap = new Map() // tableId -> { tableRef, tableData }

    const enqueueSourceTable = async (tableId) => {
      if (sourcesMap.has(tableId)) return
      if (tableId === primaryTableId) return
      const srcRef = doc(db, 'businesses', businessId, 'tables', tableId)
      const srcSnap = await getDoc(srcRef)
      if (!srcSnap.exists()) {
        throw new Error(`Mesa origen ${tableId} no encontrada`)
      }
      const srcData = srcSnap.data()
      if (srcData.status === 'reserved') {
        throw new Error(`Mesa ${srcData.number || tableId} está reservada`)
      }
      if (srcData.status !== 'occupied' && srcData.status !== 'available') {
        throw new Error(`Mesa ${srcData.number || tableId} no se puede fusionar (estado: ${srcData.status})`)
      }
      sourcesMap.set(tableId, { tableId, tableRef: srcRef, tableData: srcData })
    }

    for (const srcId of sourceTableIds) {
      await enqueueSourceTable(srcId)
    }

    // Aplanar grupos: si una source es primaria de otro grupo, traer sus secundarias.
    //  (Una secundaria de otro grupo se rechaza arriba porque enqueueSourceTable no la deja entrar
    //   si su groupId no coincide; pero la regla está garantizada por el filtro del modal.)
    const additionalIds = []
    for (const [, src] of sourcesMap) {
      if (src.tableData.groupId && src.tableData.isGroupPrimary && src.tableData.groupId !== groupId) {
        const groupQuery = query(
          collection(db, 'businesses', businessId, 'tables'),
          where('groupId', '==', src.tableData.groupId)
        )
        const groupSnap = await getDocs(groupQuery)
        groupSnap.forEach((d) => {
          if (d.id !== src.tableId && d.id !== primaryTableId) additionalIds.push(d.id)
        })
      }
    }
    for (const id of additionalIds) {
      await enqueueSourceTable(id)
    }

    const sources = Array.from(sourcesMap.values())

    // 3. Cargar las órdenes origen únicas SOLO de las mesas ocupadas (las disponibles no tienen orden).
    const seenOrderIds = new Set([primaryOrderId])
    const uniqueOrderSources = [] // { tableData, orderRef, orderId, orderData }
    for (const src of sources) {
      if (src.tableData.status !== 'occupied') continue
      const oid = src.tableData.currentOrder
      if (!oid) continue
      if (seenOrderIds.has(oid)) continue
      seenOrderIds.add(oid)
      const oRef = doc(db, 'businesses', businessId, 'orders', oid)
      const oSnap = await getDoc(oRef)
      if (oSnap.exists()) {
        uniqueOrderSources.push({
          tableData: src.tableData,
          orderRef: oRef,
          orderId: oid,
          orderData: oSnap.data(),
        })
      }
    }

    // 4. Recolectar ítems preservando flags de cocina
    const mergedItems = []
    uniqueOrderSources.forEach((src) => {
      const srcItems = src.orderData.items || []
      srcItems.forEach((item) => {
        mergedItems.push({
          ...item,
          itemId: item.itemId || `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          mergedFromTableNumber: src.tableData.number,
          mergedFromOrderId: src.orderId,
        })
      })
    })

    const updatedItems = [...(primaryOrderData.items || []), ...mergedItems]

    // 5. Recalcular totales
    const businessRef = doc(db, 'businesses', businessId)
    const businessSnap = await getDoc(businessRef)
    const taxConfig = businessSnap.exists() && businessSnap.data().emissionConfig?.taxConfig
      ? businessSnap.data().emissionConfig.taxConfig
      : { igvRate: 18, igvExempt: false }
    const igvRate = taxConfig.igvRate || 18
    const igvMultiplier = 1 + (igvRate / 100)
    const total = updatedItems.reduce((sum, it) => sum + (it.total || (it.price * it.quantity) || 0), 0)
    const subtotal = taxConfig.igvExempt ? total : total / igvMultiplier
    const tax = taxConfig.igvExempt ? 0 : total - subtotal

    // 6. Construir lista completa de tableIds del grupo (incluye la principal)
    const allGroupTableIds = [primaryTableId, ...sources.map((s) => s.tableId)]
    const allGroupTableNumbers = [primaryTableData.number, ...sources.map((s) => s.tableData.number)]

    // 7. Actualizar orden principal
    await updateDoc(primaryOrderRef, {
      items: updatedItems,
      subtotal,
      tax,
      total,
      overallStatus: 'active',
      linkedTableIds: allGroupTableIds,
      linkedTableNumbers: allGroupTableNumbers,
      mergedFromTables: [
        ...(primaryOrderData.mergedFromTables || []),
        ...uniqueOrderSources.map((s) => ({
          tableNumber: s.tableData.number,
          orderId: s.orderId,
          mergedAt: new Date(),
          itemCount: (s.orderData.items || []).length,
        })),
      ],
      updatedAt: serverTimestamp(),
    })

    // 8. Mesa principal: marcar como primaria del grupo
    await updateDoc(primaryTableRef, {
      groupId,
      isGroupPrimary: true,
      groupTableNumbers: allGroupTableNumbers,
      amount: total,
      allItemsServed: false,
      updatedAt: serverTimestamp(),
    })

    // 9. Procesar cada mesa origen.
    //    Casos:
    //      A) Estaba OCUPADA  → quedará vinculada al grupo, su orden previa se cierra (mergedInto),
    //         se ajustan métricas de mozos si cambia de dueño.
    //      B) Estaba DISPONIBLE → se ocupa por primera vez como parte del grupo, se incrementa
    //         activeTables del mozo principal.
    for (const src of sources) {
      const wasOccupied = src.tableData.status === 'occupied'
      const previousOrderId = wasOccupied ? src.tableData.currentOrder : null
      const previousWaiterId = wasOccupied ? src.tableData.waiterId : null

      try {
        await updateDoc(src.tableRef, {
          status: 'occupied',
          currentOrder: primaryOrderId,
          groupId,
          isGroupPrimary: false,
          groupTableNumbers: allGroupTableNumbers,
          waiter: primaryTableData.waiter || null,
          waiterId: primaryTableData.waiterId || null,
          startTime: wasOccupied ? src.tableData.startTime : serverTimestamp(),
          amount: total,
          allItemsServed: false,
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        console.warn(`No se pudo agrupar la mesa ${src.tableId}:`, err)
      }

      // Cerrar la orden previa de la mesa (si era ocupada y no la principal)
      if (previousOrderId && previousOrderId !== primaryOrderId) {
        try {
          const oRef = doc(db, 'businesses', businessId, 'orders', previousOrderId)
          await updateDoc(oRef, {
            status: 'closed',
            paid: true,
            mergedInto: primaryOrderId,
            mergedIntoTableNumber: primaryTableData.number,
            mergedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        } catch (err) {
          console.warn(`No se pudo cerrar la orden previa ${previousOrderId}:`, err)
        }
      }

      // Métricas de mozo según el caso
      if (wasOccupied) {
        // Si cambia de mozo: -1 al original, +1 al principal
        if (previousWaiterId && previousWaiterId !== primaryTableData.waiterId) {
          try {
            const oldWaiterRef = doc(db, 'businesses', businessId, 'waiters', previousWaiterId)
            await updateDoc(oldWaiterRef, {
              activeTables: increment(-1),
              updatedAt: serverTimestamp(),
            })
          } catch (err) {
            console.warn('No se pudo decrementar mesas activas del mozo previo:', err)
          }
          if (primaryTableData.waiterId) {
            try {
              const newWaiterRef = doc(db, 'businesses', businessId, 'waiters', primaryTableData.waiterId)
              await updateDoc(newWaiterRef, {
                activeTables: increment(1),
                updatedAt: serverTimestamp(),
              })
            } catch (err) {
              console.warn('No se pudo incrementar mesas activas del mozo principal:', err)
            }
          }
        }
      } else {
        // La mesa no estaba ocupada: ahora cuenta como una mesa más para el mozo principal
        if (primaryTableData.waiterId) {
          try {
            const wRef = doc(db, 'businesses', businessId, 'waiters', primaryTableData.waiterId)
            await updateDoc(wRef, {
              activeTables: increment(1),
              updatedAt: serverTimestamp(),
            })
          } catch (err) {
            console.warn('No se pudo incrementar mesas activas del mozo principal:', err)
          }
        }
      }
    }

    return {
      success: true,
      data: {
        groupId,
        totalTables: allGroupTableIds.length,
        mergedItems: mergedItems.length,
        sourcesCount: sources.length,
      },
    }
  } catch (error) {
    console.error('Error al fusionar mesas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Separar una mesa de su grupo (deshacer fusión para esa mesa específica).
 *
 * Reglas:
 *  - Si la mesa NO pertenece a ningún grupo → no-op con error informativo.
 *  - Si la mesa es secundaria del grupo → se libera (queda available); su consumo individual no se
 *    recupera (los items ya fueron contabilizados en la cuenta principal del grupo).
 *  - Si la mesa es PRIMARIA del grupo y quedan más de una mesa → la primaria queda intacta con la
 *    cuenta; las demás se liberan.
 *  - Si solo queda 1 mesa en el grupo después de remover esta → el grupo se disuelve (se limpian
 *    los campos de grupo en la mesa restante).
 *
 * @param {string} businessId
 * @param {string} tableId - mesa a separar del grupo
 * @returns {Promise<{success: boolean, data?: {dissolved: boolean}, error?: string}>}
 */
export const unmergeTable = async (businessId, tableId) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)
    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }
    const tableData = tableSnap.data()
    if (!tableData.groupId) {
      return { success: false, error: 'Esta mesa no pertenece a ningún grupo' }
    }

    // Cargar todas las mesas del grupo
    const groupQuery = query(
      collection(db, 'businesses', businessId, 'tables'),
      where('groupId', '==', tableData.groupId)
    )
    const groupSnap = await getDocs(groupQuery)
    const groupTables = []
    groupSnap.forEach((d) => groupTables.push({ id: d.id, ...d.data() }))

    const isPrimary = tableData.isGroupPrimary === true
    const primary = isPrimary ? { id: tableId, ...tableData } : groupTables.find((t) => t.isGroupPrimary)

    if (isPrimary) {
      // Liberar todas las mesas secundarias y dejar la primaria como mesa simple
      const secondaries = groupTables.filter((t) => t.id !== tableId)
      for (const sec of secondaries) {
        try {
          const sRef = doc(db, 'businesses', businessId, 'tables', sec.id)
          await updateDoc(sRef, {
            status: 'available',
            currentOrder: null,
            waiter: null,
            waiterId: null,
            startTime: null,
            amount: 0,
            groupId: null,
            isGroupPrimary: false,
            groupTableNumbers: null,
            allItemsServed: false,
            updatedAt: serverTimestamp(),
          })
        } catch (err) {
          console.warn(`No se pudo liberar mesa secundaria ${sec.id}:`, err)
        }
        if (sec.waiterId) {
          try {
            const wRef = doc(db, 'businesses', businessId, 'waiters', sec.waiterId)
            await updateDoc(wRef, {
              activeTables: increment(-1),
              updatedAt: serverTimestamp(),
            })
          } catch (err) {
            console.warn('No se pudo actualizar métricas del mozo:', err)
          }
        }
      }
      // Disolver el grupo en la primaria
      await updateDoc(tableRef, {
        groupId: null,
        isGroupPrimary: false,
        groupTableNumbers: null,
        updatedAt: serverTimestamp(),
      })
      // Limpiar referencias de grupo en la orden
      if (tableData.currentOrder) {
        try {
          const oRef = doc(db, 'businesses', businessId, 'orders', tableData.currentOrder)
          await updateDoc(oRef, {
            linkedTableIds: [tableId],
            linkedTableNumbers: [tableData.number],
            updatedAt: serverTimestamp(),
          })
        } catch (err) {
          console.warn('No se pudo actualizar orden al disolver grupo:', err)
        }
      }
      return { success: true, data: { dissolved: true } }
    }

    // Caso: separar una mesa secundaria. La liberamos y actualizamos el grupo restante.
    try {
      await updateDoc(tableRef, {
        status: 'available',
        currentOrder: null,
        waiter: null,
        waiterId: null,
        startTime: null,
        amount: 0,
        groupId: null,
        isGroupPrimary: false,
        groupTableNumbers: null,
        allItemsServed: false,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn(`No se pudo liberar la mesa ${tableId}:`, err)
    }
    if (tableData.waiterId) {
      try {
        const wRef = doc(db, 'businesses', businessId, 'waiters', tableData.waiterId)
        await updateDoc(wRef, {
          activeTables: increment(-1),
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        console.warn('No se pudo decrementar métricas del mozo:', err)
      }
    }

    // Quedan: primaria + (secundarias - esta). Si solo queda la primaria → disolver grupo.
    const remaining = groupTables.filter((t) => t.id !== tableId)
    const remainingNumbers = remaining.map((t) => t.number)
    if (remaining.length <= 1 && primary) {
      const primaryRef = doc(db, 'businesses', businessId, 'tables', primary.id)
      await updateDoc(primaryRef, {
        groupId: null,
        isGroupPrimary: false,
        groupTableNumbers: null,
        updatedAt: serverTimestamp(),
      })
      if (primary.currentOrder) {
        try {
          const oRef = doc(db, 'businesses', businessId, 'orders', primary.currentOrder)
          await updateDoc(oRef, {
            linkedTableIds: [primary.id],
            linkedTableNumbers: [primary.number],
            updatedAt: serverTimestamp(),
          })
        } catch (err) {
          console.warn('No se pudo actualizar orden al disolver grupo:', err)
        }
      }
      return { success: true, data: { dissolved: true } }
    }

    // Si quedan ≥2 mesas, actualizar la lista de números en cada mesa restante y en la orden
    for (const t of remaining) {
      try {
        const tRef = doc(db, 'businesses', businessId, 'tables', t.id)
        await updateDoc(tRef, {
          groupTableNumbers: remainingNumbers,
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        console.warn('No se pudo actualizar groupTableNumbers:', err)
      }
    }
    if (primary?.currentOrder) {
      try {
        const oRef = doc(db, 'businesses', businessId, 'orders', primary.currentOrder)
        await updateDoc(oRef, {
          linkedTableIds: remaining.map((t) => t.id),
          linkedTableNumbers: remainingNumbers,
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        console.warn('No se pudo actualizar orden:', err)
      }
    }
    return { success: true, data: { dissolved: false } }
  } catch (error) {
    console.error('Error al separar mesa del grupo:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Transferir una mesa a otro mozo
 */
export const transferTable = async (businessId, tableId, transferData) => {
  try {
    const tableRef = doc(db, 'businesses', businessId, 'tables', tableId)
    const tableSnap = await getDoc(tableRef)

    if (!tableSnap.exists()) {
      return { success: false, error: 'Mesa no encontrada' }
    }

    const tableData = tableSnap.data()

    if (tableData.status !== 'occupied') {
      return { success: false, error: 'Solo se pueden transferir mesas ocupadas' }
    }

    // Actualizar la mesa con el nuevo mozo
    await updateDoc(tableRef, {
      waiter: transferData.waiterName,
      waiterId: transferData.waiterId,
      updatedAt: serverTimestamp(),
    })

    // Si hay una orden asociada, también actualizar el mozo en la orden
    if (tableData.currentOrder) {
      const orderRef = doc(db, 'businesses', businessId, 'orders', tableData.currentOrder)
      await updateDoc(orderRef, {
        waiterName: transferData.waiterName,
        waiterId: transferData.waiterId,
        updatedAt: serverTimestamp(),
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Error al transferir mesa:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener mesas por zona
 */
export const getTablesByZone = async (businessId, zone) => {
  try {
    const tablesRef = collection(db, 'businesses', businessId, 'tables')
    const q = query(
      tablesRef,
      where('zone', '==', zone),
      orderBy('number', 'asc')
    )
    const snapshot = await getDocs(q)

    const tables = []
    snapshot.forEach((doc) => {
      tables.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: tables }
  } catch (error) {
    console.error('Error al obtener mesas por zona:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener mesas por estado
 */
export const getTablesByStatus = async (businessId, status) => {
  try {
    const tablesRef = collection(db, 'businesses', businessId, 'tables')
    const q = query(
      tablesRef,
      where('status', '==', status),
      orderBy('number', 'asc')
    )
    const snapshot = await getDocs(q)

    const tables = []
    snapshot.forEach((doc) => {
      tables.push({ id: doc.id, ...doc.data() })
    })

    return { success: true, data: tables }
  } catch (error) {
    console.error('Error al obtener mesas por estado:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener estadísticas de mesas
 */
export const getTablesStats = async (businessId) => {
  try {
    const result = await getTables(businessId)
    if (!result.success) {
      return result
    }

    const tables = result.data
    const stats = {
      total: tables.length,
      available: tables.filter(t => t.status === 'available').length,
      occupied: tables.filter(t => t.status === 'occupied').length,
      reserved: tables.filter(t => t.status === 'reserved').length,
      maintenance: tables.filter(t => t.status === 'maintenance').length,
      totalCapacity: tables.reduce((sum, t) => sum + (t.capacity || 0), 0),
      totalAmount: tables
        .filter(t => t.status === 'occupied')
        .reduce((sum, t) => sum + (t.amount || 0), 0),
    }

    return { success: true, data: stats }
  } catch (error) {
    console.error('Error al obtener estadísticas de mesas:', error)
    return { success: false, error: error.message }
  }
}

export default {
  getTables,
  getTable,
  createTable,
  updateTable,
  deleteTable,
  occupyTable,
  releaseTable,
  reserveTable,
  cancelReservation,
  updateTableAmount,
  moveOrderToTable,
  transferTable,
  getTablesByZone,
  getTablesByStatus,
  getTablesStats,
}
