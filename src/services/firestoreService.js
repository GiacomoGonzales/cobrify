import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  runTransaction,
  onSnapshot,
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase'
import { generatePetId, normalizePets } from '@/utils/petUtils'

/**
 * Servicio para interactuar con Firestore
 */

// ==================== FACTURAS ====================

/**
 * Crear una nueva factura
 */
export const createInvoice = async (userId, invoiceData) => {
  try {
    // Usar subcolección: businesses/{userId}/invoices
    const docRef = await addDoc(collection(db, 'businesses', userId, 'invoices'), {
      ...invoiceData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear factura:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear factura con generación de número atómica
 * Esta función garantiza que el número se genera Y la factura se crea en una sola transacción.
 * Si la factura no se crea, el número NO se incrementa (evita saltos en la numeración).
 *
 * @param {string} userId - ID del negocio
 * @param {Object} invoiceData - Datos de la factura (SIN number, series, correlativeNumber)
 * @param {string} documentType - Tipo de documento (factura, boleta, nota_venta, etc.)
 * @param {string} warehouseId - ID del almacén (opcional, compatibilidad)
 * @param {string} branchId - ID de la sucursal (opcional, prioritario)
 */
export const createInvoiceWithNumber = async (userId, invoiceData, documentType, warehouseId = null, branchId = null) => {
  try {
    const businessRef = doc(db, 'businesses', userId)
    const invoicesCollection = collection(db, 'businesses', userId, 'invoices')
    // Generar ID del documento de factura antes de la transacción
    const newInvoiceRef = doc(invoicesCollection)

    const result = await runTransaction(db, async (transaction) => {
      // 1. Leer el documento del negocio para obtener el contador
      const businessSnap = await transaction.get(businessRef)

      if (!businessSnap.exists()) {
        throw new Error('Negocio no encontrado')
      }

      const data = businessSnap.data()
      let typeData = null
      let seriesPath = ''

      // Buscar la serie correcta (misma lógica que getNextDocumentNumber)
      // 1. Primero intentar con branchSeries (sucursales - nuevo sistema)
      if (branchId && data.branchSeries && data.branchSeries[branchId]) {
        const branchSeries = data.branchSeries[branchId]
        if (branchSeries[documentType]) {
          typeData = branchSeries[documentType]
          seriesPath = `branchSeries.${branchId}.${documentType}`
        }
      }

      // 2. Fallback a warehouseSeries (compatibilidad hacia atrás)
      if (!typeData && warehouseId && data.warehouseSeries && data.warehouseSeries[warehouseId]) {
        const warehouseSeries = data.warehouseSeries[warehouseId]
        if (warehouseSeries[documentType]) {
          typeData = warehouseSeries[documentType]
          seriesPath = `warehouseSeries.${warehouseId}.${documentType}`
        }
      }

      // 3. Fallback a series globales si no hay series específicas
      if (!typeData && data.series && data.series[documentType]) {
        typeData = data.series[documentType]
        seriesPath = `series.${documentType}`
      }

      if (!typeData) {
        throw new Error(`Series no configuradas para ${documentType}`)
      }

      // 2. Calcular siguiente número
      const nextNumber = (typeData.lastNumber || 0) + 1
      const formattedNumber = `${typeData.serie}-${String(nextNumber).padStart(8, '0')}`

      // 3. Crear la factura con el número generado
      const completeInvoiceData = {
        ...invoiceData,
        number: formattedNumber,
        series: typeData.serie,
        correlativeNumber: nextNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      // 4. Ejecutar ambas operaciones en la misma transacción
      // - Actualizar el contador
      transaction.update(businessRef, {
        [`${seriesPath}.lastNumber`]: nextNumber,
        updatedAt: serverTimestamp(),
      })
      // - Crear la factura
      transaction.set(newInvoiceRef, completeInvoiceData)

      return {
        id: newInvoiceRef.id,
        number: formattedNumber,
        series: typeData.serie,
        correlativeNumber: nextNumber,
      }
    })

    return {
      success: true,
      ...result
    }
  } catch (error) {
    console.error('Error al crear factura con número:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener facturas recientes (por rango de fechas) - optimizado para Dashboard
 * @param {string} userId - ID del negocio
 * @param {Date} sinceDate - Fecha desde la cual obtener facturas
 */
export const getRecentInvoices = async (userId, sinceDate) => {
  try {
    const q = query(
      collection(db, 'businesses', userId, 'invoices'),
      where('createdAt', '>=', sinceDate),
      orderBy('createdAt', 'desc')
    )
    const querySnapshot = await getDocs(q)
    const invoices = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: invoices }
  } catch (error) {
    console.error('Error al obtener facturas recientes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener facturas paginadas (más recientes primero). Para cuentas grandes:
 * evita descargar las 20k+ facturas de una. Usa solo el índice de createdAt
 * (single-field, existe por defecto) → sin índices compuestos que desplegar.
 *
 * @param {string} userId
 * @param {{ pageSize?: number, startAfterDoc?: any }} options
 * @returns {{ success, data, lastDoc, hasMore }}
 */
export const getInvoicesPage = async (userId, { pageSize = 100, startAfterDoc = null, sinceDate = null } = {}) => {
  try {
    // sinceDate: rango sobre el MISMO campo del orderBy (createdAt) → sigue
    // usando el índice single-field, sin índices compuestos que desplegar.
    const constraints = []
    if (sinceDate) constraints.push(where('createdAt', '>=', sinceDate))
    constraints.push(orderBy('createdAt', 'desc'))
    if (startAfterDoc) constraints.push(startAfter(startAfterDoc))
    constraints.push(limit(pageSize))
    const q = query(collection(db, 'businesses', userId, 'invoices'), ...constraints)
    const snap = await getDocs(q)
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    return {
      success: true,
      data,
      lastDoc: snap.docs[snap.docs.length - 1] || null,
      hasMore: snap.docs.length === pageSize,
    }
  } catch (error) {
    console.error('Error al obtener facturas paginadas:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Obtener facturas de un usuario
 */
export const getInvoices = async userId => {
  try {
    // Usar subcolección - ya no necesita filtro por userId
    const querySnapshot = await getDocs(collection(db, 'businesses', userId, 'invoices'))
    const invoices = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar en el cliente por fecha de creación (más reciente primero)
    invoices.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: invoices }
  } catch (error) {
    console.error('Error al obtener facturas:', error)
    return { success: false, error: error.message }
  }
}

// ==================== SALDO A FAVOR (STORE CREDIT) ====================

/**
 * Calcula el saldo a favor disponible de un cliente: suma de las notas de
 * crédito marcadas como `storeCredit` (saldo a favor) menos lo ya redimido.
 * Devuelve también el detalle de cada NC ordenado por antigüedad (FIFO) para
 * consumirlas de la más vieja a la más nueva.
 *
 * Se filtra por `documentType` (un solo filtro de igualdad → no requiere índice
 * compuesto) y el resto (storeCredit, documento, saldo) se evalúa en cliente.
 *
 * @param {string} businessId
 * @param {string} documentNumber - Documento del cliente (DNI/RUC)
 * @returns {Promise<{success:boolean, data?:{total:number, notes:Array}, error?:string}>}
 */
export const getCustomerStoreCredit = async (businessId, documentNumber) => {
  try {
    const docNum = (documentNumber || '').trim()
    if (!businessId || !docNum) return { success: true, data: { total: 0, notes: [] } }

    const invoicesRef = collection(db, 'businesses', businessId, 'invoices')
    const q = query(invoicesRef, where('documentType', '==', 'nota_credito'))
    const snapshot = await getDocs(q)

    const notes = []
    snapshot.docs.forEach(d => {
      const nc = { id: d.id, ...d.data() }
      if (!nc.storeCredit) return
      if (nc.customer?.documentNumber !== docNum) return
      if (nc.status === 'voided') return
      if (nc.sunatStatus === 'rejected') return
      const creditTotal = Number(nc.creditTotal ?? nc.total) || 0
      const redeemed = Number(nc.creditRedeemed) || 0
      const available = Math.round((creditTotal - redeemed) * 100) / 100
      if (available <= 0) return
      notes.push({
        id: nc.id,
        number: nc.number,
        creditTotal,
        redeemed,
        available,
        currency: nc.currency || 'PEN',
        issueDate: nc.issueDate || nc.createdAt || null,
      })
    })

    // FIFO: más antigua primero
    notes.sort((a, b) => {
      const ta = a.issueDate?.seconds ?? (a.issueDate ? new Date(a.issueDate).getTime() / 1000 : 0)
      const tb = b.issueDate?.seconds ?? (b.issueDate ? new Date(b.issueDate).getTime() / 1000 : 0)
      return ta - tb
    })

    const total = Math.round(notes.reduce((s, n) => s + n.available, 0) * 100) / 100
    return { success: true, data: { total, notes } }
  } catch (error) {
    console.error('Error al obtener saldo a favor del cliente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Redime (consume) saldo a favor del cliente por `amount`, tomando de sus notas
 * de crédito FIFO (más antiguas primero). En cada NC incrementa `creditRedeemed`
 * y agrega un registro a `creditRedemptions` con la venta donde se aplicó.
 * Re-lee cada NC fresh antes de actualizar para no pisar redenciones concurrentes.
 *
 * @param {string} businessId
 * @param {string} documentNumber
 * @param {number} amount - Monto a consumir
 * @param {{invoiceId?:string, invoiceNumber?:string}} saleInfo
 * @returns {Promise<{success:boolean, data?:{applied:number, redeemedFrom:Array}, error?:string}>}
 */
export const redeemStoreCredit = async (businessId, documentNumber, amount, saleInfo = {}) => {
  try {
    let toApply = Math.round((Number(amount) || 0) * 100) / 100
    if (toApply <= 0) return { success: true, data: { applied: 0, redeemedFrom: [] } }

    const creditRes = await getCustomerStoreCredit(businessId, documentNumber)
    if (!creditRes.success) return creditRes
    const notes = creditRes.data.notes

    const redeemedFrom = []
    const nowIso = new Date().toISOString()
    for (const note of notes) {
      if (toApply <= 0) break
      const ncRef = doc(db, 'businesses', businessId, 'invoices', note.id)
      const snap = await getDoc(ncRef)
      if (!snap.exists()) continue
      const data = snap.data()
      const prevRedeemed = Number(data.creditRedeemed) || 0
      const creditTotal = Number(data.creditTotal ?? data.total) || 0
      const freshAvailable = Math.round((creditTotal - prevRedeemed) * 100) / 100
      const realTake = Math.round(Math.min(freshAvailable, toApply) * 100) / 100
      if (realTake <= 0) continue
      const redemption = {
        invoiceId: saleInfo.invoiceId || null,
        invoiceNumber: saleInfo.invoiceNumber || '',
        amount: realTake,
        date: nowIso,
      }
      await updateDoc(ncRef, {
        creditRedeemed: Math.round((prevRedeemed + realTake) * 100) / 100,
        creditRedemptions: [...(Array.isArray(data.creditRedemptions) ? data.creditRedemptions : []), redemption],
        updatedAt: serverTimestamp(),
      })
      redeemedFrom.push({ noteId: note.id, noteNumber: note.number, amount: realTake })
      toApply = Math.round((toApply - realTake) * 100) / 100
    }

    const applied = Math.round(redeemedFrom.reduce((s, r) => s + r.amount, 0) * 100) / 100
    return { success: true, data: { applied, redeemedFrom } }
  } catch (error) {
    console.error('Error al redimir saldo a favor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener facturas de un usuario filtradas por sucursal
 * @param {string} userId - ID del negocio
 * @param {string|null} branchId - ID de la sucursal (null para sucursal principal)
 * @param {Date|null} sinceDate - Fecha desde la cual obtener facturas (opcional, para optimización)
 */
export const getInvoicesByBranch = async (userId, branchId = null, sinceDate = null) => {
  try {
    const invoicesRef = collection(db, 'businesses', userId, 'invoices')

    // Si hay fecha, hacer DOS queries:
    //   1. Facturas creadas dentro de la sesión.
    //   2. Facturas anteriores con un pago registrado dentro de la sesión
    //      (campo `lastPaymentDate`, sellado por handleRegisterPayment).
    // Luego se mergean por id. Esto asegura que pagos parciales cobrados en una
    // sesión posterior aparezcan en el cuadre de ese día.
    let docs = []
    if (sinceDate) {
      const q1 = query(invoicesRef, where('createdAt', '>=', sinceDate), orderBy('createdAt', 'desc'))
      const q2 = query(invoicesRef, where('lastPaymentDate', '>=', sinceDate), orderBy('lastPaymentDate', 'desc'))
      const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)])
      const seen = new Set()
      for (const d of [...s1.docs, ...s2.docs]) {
        if (!seen.has(d.id)) {
          seen.add(d.id)
          docs.push(d)
        }
      }
    } else {
      const querySnapshot = await getDocs(invoicesRef)
      docs = querySnapshot.docs
    }

    // Filtrar por branchId en el cliente
    const invoices = docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter(invoice => {
        if (branchId) {
          return invoice.branchId === branchId
        } else {
          return !invoice.branchId
        }
      })

    // Ordenar por fecha de creación (más reciente primero)
    invoices.sort((a, b) => {
      const aSec = a.createdAt?.seconds ?? 0
      const bSec = b.createdAt?.seconds ?? 0
      return bSec - aSec
    })

    return { success: true, data: invoices }
  } catch (error) {
    console.error('Error al obtener facturas por sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una factura
 */
export const updateInvoice = async (userId, invoiceId, updates) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'invoices', invoiceId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar factura:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una factura
 */
export const deleteInvoice = async (userId, invoiceId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'invoices', invoiceId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar factura:', error)
    return { success: false, error: error.message }
  }
}

// ==================== CLIENTES ====================

/**
 * Crear un nuevo cliente
 */
export const createCustomer = async (userId, customerData) => {
  try {
    // Auto-corregir tipo de documento si hay mismatch con la longitud
    let correctedData = { ...customerData }
    if (customerData.documentNumber) {
      const docLen = customerData.documentNumber.length
      if (docLen === 11 && customerData.documentType === 'DNI') {
        // RUC guardado como DNI - corregir
        correctedData.documentType = 'RUC'
      } else if (docLen === 8 && customerData.documentType === 'RUC') {
        // DNI guardado como RUC - corregir
        correctedData.documentType = 'DNI'
      }
    }

    // Usar subcolección: businesses/{userId}/customers
    const docRef = await addDoc(collection(db, 'businesses', userId, 'customers'), {
      ...correctedData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear cliente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener clientes de un usuario
 */
export const getCustomers = async userId => {
  try {
    // Usar subcolección - ya no necesita filtro por userId
    const querySnapshot = await getDocs(collection(db, 'businesses', userId, 'customers'))
    const customers = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: customers }
  } catch (error) {
    console.error('Error al obtener clientes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un cliente
 */
export const updateCustomer = async (userId, customerId, updates) => {
  try {
    // Auto-corregir tipo de documento si hay mismatch con la longitud
    let correctedUpdates = { ...updates }
    if (updates.documentNumber) {
      const docLen = updates.documentNumber.length
      if (docLen === 11 && updates.documentType === 'DNI') {
        correctedUpdates.documentType = 'RUC'
      } else if (docLen === 8 && updates.documentType === 'RUC') {
        correctedUpdates.documentType = 'DNI'
      }
    }

    const docRef = doc(db, 'businesses', userId, 'customers', customerId)
    await updateDoc(docRef, {
      ...correctedUpdates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar cliente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un cliente
 */
export const deleteCustomer = async (userId, customerId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'customers', customerId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar cliente:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Buscar cliente por número de documento
 */
export const getCustomerByDocumentNumber = async (userId, documentNumber) => {
  try {
    const customersRef = collection(db, 'businesses', userId, 'customers')
    const q = query(customersRef, where('documentNumber', '==', documentNumber))
    const querySnapshot = await getDocs(q)

    if (querySnapshot.empty) {
      return { success: true, data: null }
    }

    const customerDoc = querySnapshot.docs[0]
    return {
      success: true,
      data: { id: customerDoc.id, ...customerDoc.data() }
    }
  } catch (error) {
    console.error('Error al buscar cliente por documento:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Crear o actualizar cliente automáticamente desde una venta
 * Si el cliente ya existe (por documentNumber), actualiza sus datos
 * Si no existe, lo crea
 */
export const upsertCustomerFromSale = async (userId, customerData) => {
  try {
    // No guardar clientes genéricos (sin documento real)
    if (!customerData.documentNumber ||
        customerData.documentNumber === '00000000' ||
        customerData.documentNumber.trim() === '') {
      return { success: true, skipped: true, reason: 'Cliente genérico sin documento' }
    }

    // Buscar si el cliente ya existe
    const existingResult = await getCustomerByDocumentNumber(userId, customerData.documentNumber)

    if (!existingResult.success) {
      return existingResult
    }

    // Helper: agrega una mascota al array de pets si su nombre aún no está presente.
    // Devuelve el array actualizado o null si no hubo cambios.
    const addPetIfNew = (existingPets, petName) => {
      const trimmed = (petName || '').trim()
      if (!trimmed) return null
      const current = Array.isArray(existingPets) ? existingPets : []
      const alreadyExists = current.some(p => (p.name || '').trim().toLowerCase() === trimmed.toLowerCase())
      if (alreadyExists) return null
      return [...current, { id: generatePetId(), name: trimmed, species: '', breed: '', age: '', weight: '', notes: '' }]
    }

    if (existingResult.data) {
      // Cliente existe - actualizar solo si hay datos nuevos más completos
      const existing = existingResult.data
      const updates = {}

      // Actualizar campos solo si el nuevo dato tiene valor y el existente no
      if (customerData.name && !existing.name) updates.name = customerData.name
      if (customerData.businessName && !existing.businessName) updates.businessName = customerData.businessName
      if (customerData.email && !existing.email) updates.email = customerData.email
      if (customerData.phone && !existing.phone) updates.phone = customerData.phone
      if (customerData.address && !existing.address) updates.address = customerData.address

      // Mascota: si la venta trae petName y aún no existe en pets[], agregarla.
      // Normalizamos primero para migrar campo legacy petName del cliente al array pets.
      // petName puede traer VARIAS mascotas separadas por coma (selección múltiple
      // del POS). Las separamos y agregamos cada una solo si es nueva, para no crear
      // una mascota fantasma con el nombre concatenado ("A, B").
      if (customerData.petName) {
        const normalized = normalizePets(existing)
        const names = customerData.petName.split(',').map(s => s.trim()).filter(Boolean)
        let pets = normalized
        let changed = false
        for (const name of names) {
          const result = addPetIfNew(pets, name)
          if (result) { pets = result; changed = true }
        }
        if (changed) {
          updates.pets = pets
        }
      }

      // Solo actualizar si hay cambios
      if (Object.keys(updates).length > 0) {
        await updateCustomer(userId, existing.id, updates)
        return { success: true, updated: true, id: existing.id }
      }

      return { success: true, exists: true, id: existing.id }
    } else {
      // Cliente no existe - crearlo
      // Auto-detectar tipo de documento si no viene especificado
      const autoDocType = customerData.documentNumber?.length === 11 ? 'RUC' : 'DNI'
      const newCustomerData = {
        documentType: customerData.documentType || autoDocType,
        documentNumber: customerData.documentNumber,
        name: customerData.name || '',
        businessName: customerData.businessName || '',
        email: customerData.email || '',
        phone: customerData.phone || '',
        address: customerData.address || '',
        source: 'auto_from_sale' // Marcar que fue creado automáticamente
      }

      // Si la venta trae nombre(s) de mascota (pueden venir varios separados por coma
      // por la selección múltiple del POS), los registramos como mascotas del cliente.
      if (customerData.petName && customerData.petName.trim()) {
        const names = customerData.petName.split(',').map(s => s.trim()).filter(Boolean)
        if (names.length > 0) {
          newCustomerData.pets = names.map(name => ({
            id: generatePetId(),
            name,
            species: '',
            breed: '',
            age: '',
            weight: '',
            notes: '',
          }))
        }
      }

      const createResult = await createCustomer(userId, newCustomerData)
      return { success: true, created: true, id: createResult.id }
    }
  } catch (error) {
    console.error('Error al crear/actualizar cliente desde venta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener estadísticas de clientes (pedidos y totales)
 */
export const getCustomersWithStats = async userId => {
  try {
    // Obtener clientes
    const customersResult = await getCustomers(userId)
    if (!customersResult.success) {
      return customersResult
    }

    // Obtener facturas
    const invoicesResult = await getInvoices(userId)
    if (!invoicesResult.success) {
      return invoicesResult
    }

    const customers = customersResult.data || []
    const invoices = invoicesResult.data || []

    // PERF: en cuentas grandes (20k+ facturas, 2k+ clientes) el cálculo anterior
    // era O(clientes × facturas) = decenas de millones de comparaciones (colgaba
    // la página). Ahora recorremos las facturas UNA sola vez (O(n)) acumulando en
    // dos Maps (por customerId y por documentNumber) y luego asignamos a cada
    // cliente con lookups O(1).
    const byId = new Map()
    const byDoc = new Map()
    for (const inv of invoices) {
      const total = inv.total || 0
      if (inv.customerId) {
        const cur = byId.get(inv.customerId) || { count: 0, total: 0 }
        cur.count += 1; cur.total += total
        byId.set(inv.customerId, cur)
      }
      const invDoc = inv.customer?.documentNumber
      if (invDoc && invDoc !== '00000000' && invDoc !== '') {
        const cur = byDoc.get(invDoc) || { count: 0, total: 0 }
        cur.count += 1; cur.total += total
        byDoc.set(invDoc, cur)
      }
    }

    const customersWithStats = customers.map(customer => {
      // Preferir vinculación directa por customerId; si no, por documentNumber.
      // (No sumamos ambos para no duplicar cuando la factura trae los dos.)
      const stat = byId.get(customer.id)
        || (customer.documentNumber && customer.documentNumber !== '00000000' && customer.documentNumber !== ''
              ? byDoc.get(customer.documentNumber)
              : null)
        || { count: 0, total: 0 }
      return {
        ...customer,
        ordersCount: stat.count,
        totalSpent: stat.total,
      }
    })

    return { success: true, data: customersWithStats }
  } catch (error) {
    console.error('Error al obtener clientes con estadísticas:', error)
    return { success: false, error: error.message }
  }
}

// ==================== PRODUCTOS ====================

/**
 * Crear un nuevo producto
 */
export const createProduct = async (userId, productData) => {
  try {
    // Usar subcolección: businesses/{userId}/products
    const docRef = await addDoc(collection(db, 'businesses', userId, 'products'), {
      ...productData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear producto:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener productos de un usuario
 */
export const getProducts = async (userId, options = {}) => {
  try {
    const {
      limit: limitCount = null,
      lastDoc = null,
      searchTerm = null,
      category = null
    } = options

    // Usar subcolección
    let q = collection(db, 'businesses', userId, 'products')

    // Si hay límite, crear query con paginación
    if (limitCount) {
      const constraints = []

      // Ordenar por nombre para paginación consistente
      constraints.push(orderBy('name', 'asc'))

      // Si hay un último documento, continuar desde ahí
      if (lastDoc) {
        constraints.push(startAfter(lastDoc))
      }

      // Aplicar límite
      constraints.push(limit(limitCount))

      q = query(q, ...constraints)
    }

    const querySnapshot = await getDocs(q)
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Devolver también el último documento para la siguiente página
    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1]

    return {
      success: true,
      data: products,
      lastDoc: lastVisible,
      hasMore: querySnapshot.docs.length === limitCount
    }
  } catch (error) {
    console.error('Error al obtener productos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Suscripción en TIEMPO REAL al catálogo de productos (onSnapshot).
 * Mantiene el POS/listados sincronizados al instante con ediciones/renombres de
 * productos hechos desde otra pestaña o dispositivo. Devuelve la función de
 * desuscripción (llamarla en el cleanup del efecto).
 */
export const subscribeToProducts = (userId, callback) => {
  try {
    const q = collection(db, 'businesses', userId, 'products')
    return onSnapshot(
      q,
      (snapshot) => {
        const products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        callback({ success: true, data: products })
      },
      (error) => {
        console.error('Error en el listener de productos:', error)
        callback({ success: false, error: error.message })
      }
    )
  } catch (error) {
    console.error('Error al suscribirse a productos:', error)
    callback({ success: false, error: error.message })
    return () => {}
  }
}

/**
 * Actualizar un producto
 */
export const updateProduct = async (userId, productId, updates) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'products', productId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar producto:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar stock de un producto usando transacción de Firestore (atómico)
 * Evita race conditions cuando dos ventas simultáneas descuentan stock del mismo producto
 */
export const updateProductStockTransaction = async (userId, productId, warehouseId, quantity, extraUpdates = {}, variantSku = null, serialToMarkSold = null, allowNegative = false, batchRestores = null) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'products', productId)
    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(docRef)
      if (!productDoc.exists()) throw new Error('Producto no encontrado')

      const product = productDoc.data()
      if (product.trackStock === false) return

      // Si hay que marcar series como vendidas, computarlo desde el estado FRESCO del producto.
      // Acepta un objeto único o un array para permitir consolidar varias series en una sola
      // transacción (evita race conditions al vender N series del mismo producto en una venta).
      let finalExtraUpdates = extraUpdates
      const serialsToMark = Array.isArray(serialToMarkSold)
        ? serialToMarkSold
        : (serialToMarkSold ? [serialToMarkSold] : [])
      if (serialsToMark.length > 0 && product.serials?.length > 0) {
        const updatedSerials = product.serials.map(s => {
          const match = serialsToMark.find(stm => stm.serialNumber === s.serialNumber)
          if (!match) return s
          // Restauración (anulación de venta): volver a disponible
          if (match.restore) {
            return { ...s, status: 'available', saleId: null, saleDate: null }
          }
          // Venta normal: marcar como vendido
          return { ...s, status: 'sold', saleId: match.saleId || null, saleDate: match.saleDate }
        })
        finalExtraUpdates = { ...extraUpdates, serials: updatedSerials }
      }

      // Restaurar (o re-descontar, con cantidades negativas) lotes DENTRO de la
      // transacción desde el estado FRESCO del producto. Positivas: anulación de venta
      // (devolver al lote). Negativas: anulación de NC (quitar del lote lo que la NC
      // devolvió). El caller pasa el desglose por lote — batchBreakdown de la venta o
      // el lote único del item — en vez de un array batches[] precalculado: con 2+
      // líneas del mismo producto en el comprobante, el precalculado venía de un
      // snapshot stale y cada línea pisaba la restauración de lotes de la anterior.
      if (Array.isArray(batchRestores) && batchRestores.length > 0 &&
          ((product.batches?.length > 0) || product.trackExpiration)) {
        const normalizeBn = (s) => String(s || '').trim().toLowerCase()
        const updatedBatches = [...(product.batches || [])]
        for (const br of batchRestores) {
          const brQty = br.quantity || 0
          const brLot = br.lotNumber || br.batchNumber
          if (!brQty || !brLot) continue
          // Mismo criterio de matching que el descuento en venta: número normalizado y
          // mismo almacén (lotes legacy sin warehouseId, o venta sin almacén, matchean).
          const idx = updatedBatches.findIndex(b =>
            normalizeBn(b.lotNumber || b.batchNumber || b.id) === normalizeBn(brLot) &&
            (!b.warehouseId || !warehouseId || b.warehouseId === warehouseId)
          )
          if (idx >= 0) {
            updatedBatches[idx] = { ...updatedBatches[idx], quantity: Math.max(0, (updatedBatches[idx].quantity || 0) + brQty) }
          } else if (brQty > 0) {
            // El lote se agotó y fue removido de batches[]: recrearlo para no
            // descuadrar el total vs el detalle por lote al anular. (Si es un
            // descuento y el lote ya no existe, no hay nada que quitar.)
            updatedBatches.push({
              batchNumber: brLot,
              lotNumber: brLot,
              quantity: brQty,
              warehouseId: warehouseId || null,
              ...(br.expirationDate ? { expirationDate: br.expirationDate } : {}),
            })
          }
        }
        finalExtraUpdates = { ...finalExtraUpdates, batches: updatedBatches }

        // Actualizar fecha de vencimiento más próxima / lote a nivel producto
        const activeBatches = updatedBatches.filter(b => (b.quantity || 0) > 0 && (b.expirationDate || b.expiryDate))
        if (activeBatches.length > 0) {
          activeBatches.sort((a, b) => {
            const dateA = (a.expirationDate || a.expiryDate)?.toDate?.() || new Date(a.expirationDate || a.expiryDate || '2099-12-31')
            const dateB = (b.expirationDate || b.expiryDate)?.toDate?.() || new Date(b.expirationDate || b.expiryDate || '2099-12-31')
            return dateA - dateB
          })
          finalExtraUpdates.expirationDate = activeBatches[0].expirationDate || activeBatches[0].expiryDate
          finalExtraUpdates.batchNumber = activeBatches[0].lotNumber || activeBatches[0].batchNumber
        }
      }

      // Producto con variantes: actualizar stock a nivel de variante
      if (product.hasVariants && variantSku && product.variants?.length > 0) {
        const variants = [...product.variants]
        const variantIndex = variants.findIndex(v => v.sku === variantSku)
        if (variantIndex === -1) {
          console.warn(`Variante ${variantSku} no encontrada en producto ${productId}`)
          return
        }

        const variant = { ...variants[variantIndex] }
        const variantWS = [...(variant.warehouseStocks || [])]
        const existingIdx = variantWS.findIndex(ws => ws.warehouseId === warehouseId)

        if (existingIdx >= 0) {
          const newVariantWsStock = (variantWS[existingIdx].stock || 0) + quantity
          variantWS[existingIdx] = { ...variantWS[existingIdx], stock: allowNegative ? newVariantWsStock : Math.max(0, newVariantWsStock) }
        } else if (quantity > 0 || allowNegative) {
          // Crear entrada (positiva; o negativa si se permite vender sin stock)
          variantWS.push({ warehouseId, stock: quantity, minStock: 0 })
        }

        variant.warehouseStocks = variantWS
        variant.stock = variantWS.reduce((sum, ws) => sum + (ws.stock || 0), 0)
        variants[variantIndex] = variant

        // Sincronizar stock a nivel producto: suma de todas las variantes
        // Esto evita desincronización entre product.stock y suma(variants[].stock)
        const aggregatedByWarehouse = {}
        variants.forEach(v => {
          const vws = v.warehouseStocks || []
          vws.forEach(ws => {
            if (!ws.warehouseId) return
            aggregatedByWarehouse[ws.warehouseId] = (aggregatedByWarehouse[ws.warehouseId] || 0) + (ws.stock || 0)
          })
        })
        // Preservar metadata existente (minStock, etc.) y agregar/actualizar almacenes con stock real
        const existingProductWS = product.warehouseStocks || []
        const productWarehouseStocks = []
        const seenWarehouseIds = new Set()
        existingProductWS.forEach(ws => {
          if (!ws.warehouseId) return
          seenWarehouseIds.add(ws.warehouseId)
          productWarehouseStocks.push({
            ...ws,
            stock: aggregatedByWarehouse[ws.warehouseId] || 0,
          })
        })
        Object.entries(aggregatedByWarehouse).forEach(([whId, stock]) => {
          if (seenWarehouseIds.has(whId)) return
          productWarehouseStocks.push({ warehouseId: whId, stock, minStock: 0 })
        })
        const productTotalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0)

        transaction.update(docRef, {
          variants,
          stock: productTotalStock,
          warehouseStocks: productWarehouseStocks,
          ...finalExtraUpdates,
          updatedAt: serverTimestamp(),
        })
        return
      }

      // Producto normal: actualizar stock a nivel de producto
      const warehouseStocks = [...(product.warehouseStocks || [])]
      const currentGeneralStock = product.stock || 0

      let newStock, newWarehouseStocks

      if (warehouseStocks.length === 0 && !warehouseId) {
        newStock = allowNegative ? (currentGeneralStock + quantity) : Math.max(0, currentGeneralStock + quantity)
        newWarehouseStocks = []
      } else {
        const existingIndex = warehouseStocks.findIndex(ws => ws.warehouseId === warehouseId)
        if (existingIndex >= 0) {
          const wsStock = (warehouseStocks[existingIndex].stock || 0) + quantity
          warehouseStocks[existingIndex] = { ...warehouseStocks[existingIndex], stock: allowNegative ? wsStock : Math.max(0, wsStock) }
        } else if (quantity > 0) {
          warehouseStocks.push({ warehouseId, stock: quantity, minStock: 0 })
        } else if (quantity < 0 && warehouseStocks.length === 0) {
          newStock = allowNegative ? (currentGeneralStock + quantity) : Math.max(0, currentGeneralStock + quantity)
          newWarehouseStocks = []
        } else if (quantity < 0 && allowNegative && warehouseId) {
          // Vender sin stock: el almacén indicado no tenía entrada previa, crear una negativa
          warehouseStocks.push({ warehouseId, stock: quantity, minStock: 0 })
        } else if (quantity < 0) {
          let remaining = Math.abs(quantity)
          for (let i = 0; i < warehouseStocks.length && remaining > 0; i++) {
            const ws = warehouseStocks[i].stock || 0
            const deduct = Math.min(ws, remaining)
            if (deduct > 0) {
              warehouseStocks[i] = { ...warehouseStocks[i], stock: ws - deduct }
              remaining -= deduct
            }
          }
        }

        if (newWarehouseStocks === undefined) {
          newWarehouseStocks = warehouseStocks
          newStock = warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
        }
      }

      transaction.update(docRef, {
        stock: newStock,
        warehouseStocks: newWarehouseStocks,
        ...finalExtraUpdates,
        updatedAt: serverTimestamp(),
      })
    })
    return { success: true }
  } catch (error) {
    console.error('Error en transacción de stock:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Transferencia ATÓMICA de stock de un producto entre dos almacenes.
 * Hace la salida del origen y la entrada al destino en UNA sola transacción que lee
 * el producto FRESCO y mueve warehouseStocks + lotes (del lote indicado, FEFO implícito
 * por lote) + series + variantes juntos. Evita: (a) stock evaporado si fallaba el 2º paso
 * (antes eran 2 transacciones), (b) clobber de lotes por snapshot viejo (varios lotes del
 * mismo producto en la misma operación), (c) descuadre lote↔warehouseStocks.
 * @param {object} options - { variantSku, batchNumber, isNoLot, serialNumbers, allowNegative }
 */
export const transferProductStockTransaction = async (userId, productId, fromWarehouseId, toWarehouseId, quantity, options = {}) => {
  const { variantSku = null, batchNumber = null, isNoLot = false, serialNumbers = [], allowNegative = true } = options
  // DESCARGA de stock: toWarehouseId null/vacío = el stock sale del origen y no
  // entra a ningún lado (se descarta). Mismo recorrido que el traslado —
  // variantes, lotes y series — pero sin la pata de entrada.
  const isDischarge = !toWarehouseId
  if (!fromWarehouseId || (!isDischarge && fromWarehouseId === toWarehouseId)) {
    return { success: false, error: 'Almacén origen/destino inválido' }
  }
  try {
    const docRef = doc(db, 'businesses', userId, 'products', productId)
    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(docRef)
      if (!productDoc.exists()) throw new Error('Producto no encontrado')
      const product = productDoc.data()
      if (product.trackStock === false) return

      const updateData = { updatedAt: serverTimestamp() }

      // --- VARIANTES: mover en variant.warehouseStocks y reagregar a nivel producto ---
      if (product.hasVariants && variantSku && product.variants?.length > 0) {
        const variants = [...product.variants]
        const vIdx = variants.findIndex(v => v.sku === variantSku)
        if (vIdx === -1) { console.warn(`Variante ${variantSku} no encontrada en ${productId}`); return }
        const variant = { ...variants[vIdx] }
        const vws = [...(variant.warehouseStocks || [])]
        const moveWs = (whId, delta) => {
          const i = vws.findIndex(ws => ws.warehouseId === whId)
          if (i >= 0) { const s = (vws[i].stock || 0) + delta; vws[i] = { ...vws[i], stock: allowNegative ? s : Math.max(0, s) } }
          else { vws.push({ warehouseId: whId, stock: delta, minStock: 0 }) }
        }
        moveWs(fromWarehouseId, -quantity)
        if (!isDischarge) moveWs(toWarehouseId, quantity)
        variant.warehouseStocks = vws
        variant.stock = vws.reduce((sum, ws) => sum + (ws.stock || 0), 0)
        variants[vIdx] = variant

        const agg = {}
        variants.forEach(v => (v.warehouseStocks || []).forEach(ws => { if (ws.warehouseId) agg[ws.warehouseId] = (agg[ws.warehouseId] || 0) + (ws.stock || 0) }))
        const existingPWS = product.warehouseStocks || []
        const pws = []; const seen = new Set()
        existingPWS.forEach(ws => { if (!ws.warehouseId) return; seen.add(ws.warehouseId); pws.push({ ...ws, stock: agg[ws.warehouseId] || 0 }) })
        Object.entries(agg).forEach(([w, st]) => { if (!seen.has(w)) pws.push({ warehouseId: w, stock: st, minStock: 0 }) })
        updateData.variants = variants
        updateData.warehouseStocks = pws
        updateData.stock = variants.reduce((sum, v) => sum + (v.stock || 0), 0)
        transaction.update(docRef, updateData)
        return
      }

      // --- NORMAL: warehouseStocks (salida + entrada) ---
      const ws = [...(product.warehouseStocks || [])]
      const moveWs = (whId, delta) => {
        const i = ws.findIndex(x => x.warehouseId === whId)
        if (i >= 0) { const s = (ws[i].stock || 0) + delta; ws[i] = { ...ws[i], stock: allowNegative ? s : Math.max(0, s) } }
        else { ws.push({ warehouseId: whId, stock: delta, minStock: 0 }) }
      }
      moveWs(fromWarehouseId, -quantity)
      if (!isDischarge) moveWs(toWarehouseId, quantity)
      updateData.warehouseStocks = ws
      updateData.stock = ws.reduce((sum, x) => sum + (x.stock || 0), 0)

      // --- LOTES: mover el lote indicado del origen al destino (datos FRESCOS) ---
      if (!isNoLot && batchNumber && Array.isArray(product.batches) && product.batches.length > 0) {
        let batches = product.batches.map(b => ({ ...b }))
        const bId = (b) => b.lotNumber || b.batchNumber || b.id
        const srcBatch = batches.find(b => bId(b) === batchNumber && (b.warehouseId === fromWarehouseId || !b.warehouseId))
        if (srcBatch) {
          srcBatch.quantity = (srcBatch.quantity || 0) - quantity
          srcBatch.warehouseId = srcBatch.warehouseId || fromWarehouseId
        }
        // En una descarga el lote solo se reduce en el origen: no hay lote destino.
        if (!isDischarge) {
          const destBatch = batches.find(b => bId(b) === batchNumber && b.warehouseId === toWarehouseId)
          if (destBatch) {
            destBatch.quantity = (destBatch.quantity || 0) + quantity
          } else {
            const meta = srcBatch || {}
            batches.push({
              ...meta,
              id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              batchNumber: meta.batchNumber || batchNumber,
              lotNumber: meta.lotNumber || batchNumber,
              quantity,
              warehouseId: toWarehouseId,
            })
          }
        }
        updateData.batches = batches.filter(b => (b.quantity || 0) > 0)
      }

      // --- SERIES: cambiar warehouseId del origen al destino. En una descarga la
      // serie no se mueve: se marca 'discarded' para que deje de estar disponible
      // (sin borrarla, así queda el rastro de qué se descargó y cuándo).
      if (serialNumbers && serialNumbers.length > 0 && Array.isArray(product.serials)) {
        const wanted = new Set(serialNumbers)
        updateData.serials = product.serials.map(s => {
          const match = wanted.has(s.serialNumber) && s.status === 'available' && (s.warehouseId === fromWarehouseId || !s.warehouseId)
          if (!match) return s
          return isDischarge
            ? { ...s, status: 'discarded', dischargedAt: new Date().toISOString() }
            : { ...s, warehouseId: toWarehouseId }
        })
      }

      transaction.update(docRef, updateData)
    })
    return { success: true }
  } catch (error) {
    console.error('Error en transferencia atómica de stock:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un producto
 * Verifica que el producto no tenga stock antes de eliminarlo
 */
export const deleteProduct = async (userId, productId) => {
  try {
    // Primero obtener el producto para verificar el stock
    const productRef = doc(db, 'businesses', userId, 'products', productId)
    const productSnap = await getDoc(productRef)

    if (!productSnap.exists()) {
      return { success: false, error: 'Producto no encontrado' }
    }

    const product = productSnap.data()

    // Verificar si el producto tiene stock
    // 1. Verificar stock general
    const generalStock = product.stock || 0

    // 2. Verificar stock en almacenes (si existe warehouseStocks)
    let warehouseStock = 0
    if (product.warehouseStocks && Array.isArray(product.warehouseStocks)) {
      warehouseStock = product.warehouseStocks.reduce((sum, ws) => sum + (ws.stock || 0), 0)
    }

    // El stock total es el mayor entre el general y la suma de almacenes
    // (algunos productos pueden tener discrepancias)
    const totalStock = Math.max(generalStock, warehouseStock)

    // Si tiene stock, no permitir eliminar
    if (totalStock > 0) {
      return {
        success: false,
        error: `No se puede eliminar el producto porque tiene ${totalStock} unidad(es) en stock. Primero debes ajustar el inventario a 0.`
      }
    }

    // Si no tiene stock, proceder con la eliminación
    await deleteDoc(productRef)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar producto:', error)
    return { success: false, error: error.message }
  }
}

// ==================== SKU AUTOMÁTICO ====================

export const getNextSkuNumber = async (businessId) => {
  const counterRef = doc(db, 'businesses', businessId, 'counters', 'sku')
  try {
    const newNumber = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef)
      let currentNumber = 0
      if (counterDoc.exists()) {
        currentNumber = counterDoc.data().lastNumber || 0
      }
      const nextNumber = currentNumber + 1
      transaction.set(counterRef, { lastNumber: nextNumber }, { merge: true })
      return nextNumber
    })
    return `PROD-${String(newNumber).padStart(4, '0')}`
  } catch (error) {
    console.error('Error obteniendo siguiente SKU:', error)
    const timestamp = Date.now().toString().slice(-6)
    return `PROD-${timestamp}`
  }
}

// ==================== CONFIGURACIÓN DE EMPRESA ====================

/**
 * Guardar configuración de empresa
 */
export const saveCompanySettings = async (userId, settings) => {
  try {
    // Ahora la configuración está en businesses/{userId}
    const docRef = doc(db, 'businesses', userId)

    // Intentar actualizar
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      await updateDoc(docRef, {
        ...settings,
        updatedAt: serverTimestamp(),
      })
    } else {
      // Si no existe, usar setDoc para crear con ID específico
      await setDoc(docRef, {
        ...settings,
        ownerId: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Error al guardar configuración:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener configuración de empresa
 */
export const getCompanySettings = async userId => {
  try {
    // Ahora la configuración está en businesses/{userId}
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return { success: true, data: docSnap.data() }
    } else {
      return { success: true, data: null }
    }
  } catch (error) {
    console.error('Error al obtener configuración:', error)
    return { success: false, error: error.message }
  }
}

// ==================== SERIES DE DOCUMENTOS ====================

/**
 * Obtener o crear series de documentos para un usuario
 */
export const getDocumentSeries = async userId => {
  try {
    // Las series ahora están en businesses/{userId}
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      return { success: true, data: data.series || null }
    } else {
      // Si no existe el negocio, devolver null
      return { success: true, data: null }
    }
  } catch (error) {
    console.error('Error al obtener series:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar series de documentos
 */
export const updateDocumentSeries = async (userId, seriesData) => {
  try {
    // Las series ahora están en businesses/{userId}
    const docRef = doc(db, 'businesses', userId)
    await updateDoc(docRef, {
      series: seriesData,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar series:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Convertir una Nota de Venta a Boleta o Factura
 * - Crea un nuevo comprobante con los datos de la nota de venta
 * - NO descuenta stock (ya fue descontado en la venta original)
 * - Marca la nota de venta como convertida
 * - Retorna el nuevo comprobante para enviarlo a SUNAT si es necesario
 */
export const convertNotaVentaToComprobante = async (userId, notaVentaId, customerData = null, targetDocumentType = 'boleta') => {
  try {
    // 1. Obtener la nota de venta
    const notaRef = doc(db, 'businesses', userId, 'invoices', notaVentaId)
    const notaSnap = await getDoc(notaRef)

    if (!notaSnap.exists()) {
      return { success: false, error: 'Nota de venta no encontrada' }
    }

    const notaVenta = { id: notaSnap.id, ...notaSnap.data() }

    // 2. Verificar que sea una nota de venta
    if (notaVenta.documentType !== 'nota_venta') {
      return { success: false, error: 'El documento no es una nota de venta' }
    }

    // 3. Verificar que no haya sido convertida antes
    if (notaVenta.convertedTo) {
      return { success: false, error: `Esta nota ya fue convertida a ${notaVenta.convertedTo.type || 'comprobante'} ${notaVenta.convertedTo.number || ''}` }
    }

    // 4. Verificar que no esté anulada
    if (notaVenta.status === 'voided') {
      return { success: false, error: 'No se puede convertir una nota de venta anulada' }
    }

    // 5. Obtener siguiente número de comprobante
    const numberResult = await getNextDocumentNumber(userId, targetDocumentType)
    if (!numberResult.success) {
      return { success: false, error: `Error al obtener número de ${targetDocumentType}: ` + numberResult.error }
    }

    // 6. Preparar datos del cliente (usar los proporcionados o los originales)
    const customer = customerData || notaVenta.customer || {
      name: 'VARIOS',
      documentType: 'DNI',
      documentNumber: '00000000'
    }

    // 7. Crear el nuevo comprobante
    const comprobanteData = {
      // Datos del documento
      documentType: targetDocumentType,
      number: numberResult.number,
      series: numberResult.series,
      correlativeNumber: numberResult.correlativeNumber,

      // Datos del cliente
      customer: {
        name: customer.name || 'VARIOS',
        ...(targetDocumentType === 'factura' ? { businessName: customer.businessName || customer.name || 'VARIOS' } : {}),
        documentType: customer.documentType || (targetDocumentType === 'factura' ? 'RUC' : 'DNI'),
        documentNumber: customer.documentNumber || (targetDocumentType === 'factura' ? '00000000000' : '00000000'),
        address: customer.address || '',
        email: customer.email || '',
        phone: customer.phone || '',
      },

      // Copiar items de la nota de venta
      items: notaVenta.items || [],

      // Copiar totales
      subtotal: notaVenta.subtotal || 0,
      tax: notaVenta.tax || 0,
      igv: notaVenta.igv || notaVenta.tax || 0,
      total: notaVenta.total || 0,
      discount: notaVenta.discount || 0,

      // Copiar montos por tipo de afectación tributaria
      opGravadas: notaVenta.opGravadas || notaVenta.subtotal || 0,
      opExoneradas: notaVenta.opExoneradas || 0,
      opInafectas: notaVenta.opInafectas || 0,

      // Copiar configuración de impuestos
      taxConfig: notaVenta.taxConfig || null,

      // Estado
      status: 'completed',
      sunatStatus: 'pending', // Pendiente de envío a SUNAT

      // Datos de pago
      paymentMethod: notaVenta.paymentMethod || 'Efectivo',
      paymentStatus: 'paid',

      // Referencia a la nota de venta original
      convertedFrom: {
        type: 'nota_venta',
        id: notaVentaId,
        number: notaVenta.number,
      },

      // Metadata
      notes: notaVenta.notes || '',
      sellerId: notaVenta.sellerId || null,
      sellerName: notaVenta.sellerName || null,

      // Flag para indicar que NO debe descontar stock
      skipStockDeduction: true,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    // 8. Guardar el comprobante
    const comprobanteRef = await addDoc(collection(db, 'businesses', userId, 'invoices'), comprobanteData)

    // 9. Actualizar la nota de venta para marcarla como convertida
    await updateDoc(notaRef, {
      convertedTo: {
        type: targetDocumentType,
        id: comprobanteRef.id,
        number: numberResult.number,
        convertedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    })

    return {
      success: true,
      comprobanteId: comprobanteRef.id,
      comprobanteNumber: numberResult.number,
      // Aliases para compatibilidad
      boletaId: comprobanteRef.id,
      boletaNumber: numberResult.number,
      comprobante: {
        id: comprobanteRef.id,
        ...comprobanteData,
      }
    }
  } catch (error) {
    console.error('Error al convertir nota de venta:', error)
    return { success: false, error: error.message }
  }
}

// Alias para compatibilidad
export const convertNotaVentaToBoleta = convertNotaVentaToComprobante

/**
 * Marcar una nota de venta como convertida a comprobante
 */
export const markNotaVentaAsConverted = async (businessId, notaVentaId, comprobanteType, comprobanteId, comprobanteNumber) => {
  try {
    const notaRef = doc(db, 'businesses', businessId, 'invoices', notaVentaId)
    await updateDoc(notaRef, {
      convertedTo: {
        type: comprobanteType,
        id: comprobanteId,
        number: comprobanteNumber,
        convertedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al marcar nota de venta como convertida:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener siguiente número de documento
 * @param {string} userId - ID del negocio
 * @param {string} documentType - Tipo de documento (factura, boleta, etc.)
 * @param {string} warehouseId - ID del almacén (compatibilidad hacia atrás)
 * @param {string} branchId - ID de la sucursal (nuevo, prioritario sobre warehouseId)
 */
export const getNextDocumentNumber = async (userId, documentType, warehouseId = null, branchId = null) => {
  try {
    const docRef = doc(db, 'businesses', userId)

    // Usar transacción atómica para evitar números duplicados
    const result = await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef)

      if (!docSnap.exists()) {
        throw new Error('Negocio no encontrado')
      }

      const data = docSnap.data()
      let typeData = null
      let seriesPath = ''

      // 1. Primero intentar con branchSeries (sucursales - nuevo sistema)
      if (branchId && data.branchSeries && data.branchSeries[branchId]) {
        const branchSeries = data.branchSeries[branchId]
        if (branchSeries[documentType]) {
          typeData = branchSeries[documentType]
          seriesPath = `branchSeries.${branchId}.${documentType}`
        }
      }

      // 2. Fallback a warehouseSeries (compatibilidad hacia atrás)
      if (!typeData && warehouseId && data.warehouseSeries && data.warehouseSeries[warehouseId]) {
        const warehouseSeries = data.warehouseSeries[warehouseId]
        if (warehouseSeries[documentType]) {
          typeData = warehouseSeries[documentType]
          seriesPath = `warehouseSeries.${warehouseId}.${documentType}`
        }
      }

      // 3. Fallback a series globales si no hay series específicas
      if (!typeData && data.series && data.series[documentType]) {
        typeData = data.series[documentType]
        seriesPath = `series.${documentType}`
      }

      if (!typeData) {
        throw new Error(`Series no configuradas para ${documentType}`)
      }

      const nextNumber = (typeData.lastNumber || 0) + 1
      const formattedNumber = `${typeData.serie}-${String(nextNumber).padStart(8, '0')}`

      // Actualizar el último número de forma atómica
      transaction.update(docRef, {
        [`${seriesPath}.lastNumber`]: nextNumber,
        updatedAt: serverTimestamp(),
      })

      return {
        number: formattedNumber,
        series: typeData.serie,
        correlativeNumber: nextNumber,
        warehouseId: warehouseId,
        branchId: branchId
      }
    })

    return {
      success: true,
      ...result
    }
  } catch (error) {
    console.error('Error al obtener siguiente número:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener series de un almacén específico
 */
export const getWarehouseSeries = async (userId, warehouseId) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    const data = docSnap.data()

    if (data.warehouseSeries && data.warehouseSeries[warehouseId]) {
      return { success: true, data: data.warehouseSeries[warehouseId] }
    }

    // Si no hay series específicas, devolver null
    return { success: true, data: null }
  } catch (error) {
    console.error('Error al obtener series del almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar series de un almacén específico
 */
export const updateWarehouseSeries = async (userId, warehouseId, seriesData) => {
  try {
    const docRef = doc(db, 'businesses', userId)

    await updateDoc(docRef, {
      [`warehouseSeries.${warehouseId}`]: seriesData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar series del almacén:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todas las series por almacén
 */
export const getAllWarehouseSeries = async (userId) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    const data = docSnap.data()
    return {
      success: true,
      data: data.warehouseSeries || {},
      globalSeries: data.series || {}
    }
  } catch (error) {
    console.error('Error al obtener series por almacén:', error)
    return { success: false, error: error.message }
  }
}

// ==================== BRANCH SERIES (SUCURSALES) ====================

/**
 * Obtener series de una sucursal específica
 */
export const getBranchSeriesFS = async (userId, branchId) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    const data = docSnap.data()

    if (data.branchSeries && data.branchSeries[branchId]) {
      return { success: true, data: data.branchSeries[branchId] }
    }

    // Si no hay series específicas, devolver null
    return { success: true, data: null }
  } catch (error) {
    console.error('Error al obtener series de la sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar series de una sucursal específica
 */
export const updateBranchSeriesFS = async (userId, branchId, seriesData) => {
  try {
    const docRef = doc(db, 'businesses', userId)

    await updateDoc(docRef, {
      [`branchSeries.${branchId}`]: seriesData,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar series de la sucursal:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todas las series por sucursal
 */
export const getAllBranchSeriesFS = async (userId) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Negocio no encontrado' }
    }

    const data = docSnap.data()
    return {
      success: true,
      data: data.branchSeries || {},
      globalSeries: data.series || {}
    }
  } catch (error) {
    console.error('Error al obtener series por sucursal:', error)
    return { success: false, error: error.message }
  }
}

// ==================== SUNAT INTEGRATION ====================

/**
 * Enviar factura/boleta a SUNAT
 */
export const sendInvoiceToSunat = async (userId, invoiceId) => {
  try {
    console.log(`📤 Enviando factura ${invoiceId} a SUNAT...`)

    // Obtener token de autenticación del usuario actual
    const user = auth.currentUser
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const idToken = await user.getIdToken()

    // Determinar URL de la Cloud Function (emulador o producción)
    const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

    const functionUrl = useEmulator
      ? 'http://127.0.0.1:5001/cobrify-395fe/us-central1/sendInvoiceToSunat'
      : 'https://us-central1-cobrify-395fe.cloudfunctions.net/sendInvoiceToSunat'

    console.log(`🌐 Llamando a: ${functionUrl}`)

    // Llamar a la Cloud Function con fetch
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        userId,
        invoiceId,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Error HTTP Response:', errorText)
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('✅ Respuesta de SUNAT:', result)

    return {
      success: result.success,
      status: result.status,
      message: result.message,
      observations: result.observations || [],
    }
  } catch (error) {
    console.error('❌ Error al enviar a SUNAT:', error)

    return {
      success: false,
      error: error.message || 'Error al enviar a SUNAT',
    }
  }
}

/**
 * Enviar Nota de Crédito a SUNAT
 * Usa una Cloud Function independiente para no afectar facturas/boletas
 */
export const sendCreditNoteToSunat = async (userId, creditNoteId) => {
  try {
    console.log(`📤 Enviando Nota de Crédito ${creditNoteId} a SUNAT...`)

    // Obtener token de autenticación del usuario actual
    const user = auth.currentUser
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const idToken = await user.getIdToken()

    // Determinar URL de la Cloud Function (emulador o producción)
    const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

    const functionUrl = useEmulator
      ? 'http://127.0.0.1:5001/cobrify-395fe/us-central1/sendCreditNoteToSunat'
      : 'https://us-central1-cobrify-395fe.cloudfunctions.net/sendCreditNoteToSunat'

    console.log(`🌐 Llamando a: ${functionUrl}`)

    // Llamar a la Cloud Function con fetch
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        userId,
        creditNoteId,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Error HTTP Response:', errorText)
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('✅ Respuesta de SUNAT (NC):', result)

    return {
      success: result.success,
      status: result.status,
      message: result.message,
      observations: result.observations || [],
    }
  } catch (error) {
    console.error('❌ Error al enviar NC a SUNAT:', error)

    return {
      success: false,
      error: error.message || 'Error al enviar nota de crédito a SUNAT',
    }
  }
}

// ==================== PROVEEDORES ====================

/**
 * Crear un nuevo proveedor
 */
export const createSupplier = async (userId, supplierData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', userId, 'suppliers'), {
      ...supplierData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear proveedor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener proveedores de un usuario
 */
export const getSuppliers = async userId => {
  try {
    const querySnapshot = await getDocs(collection(db, 'businesses', userId, 'suppliers'))
    const suppliers = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))
    return { success: true, data: suppliers }
  } catch (error) {
    console.error('Error al obtener proveedores:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un proveedor
 */
export const updateSupplier = async (userId, supplierId, updates) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'suppliers', supplierId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar proveedor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un proveedor
 */
export const deleteSupplier = async (userId, supplierId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'suppliers', supplierId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar proveedor:', error)
    return { success: false, error: error.message }
  }
}

// ==================== COMPRAS ====================

/**
 * Crear una nueva compra/orden de compra
 */
export const createPurchase = async (userId, purchaseData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', userId, 'purchases'), {
      ...purchaseData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una compra por ID
 */
export const getPurchase = async (userId, purchaseId) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'purchases', purchaseId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Compra no encontrada' }
    }

    return {
      success: true,
      data: { id: docSnap.id, ...docSnap.data() }
    }
  } catch (error) {
    console.error('Error al obtener compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener compras de un usuario
 */
export const getPurchases = async (userId, { sinceDate = null } = {}) => {
  try {
    // PERF: con sinceDate (Flujo de Caja, por periodo) trae solo compras desde
    // esa fecha. Sin sinceDate = todas (compatibilidad con Compras/Historial).
    const ref = collection(db, 'businesses', userId, 'purchases')
    const querySnapshot = sinceDate
      ? await getDocs(query(ref, where('createdAt', '>=', sinceDate), orderBy('createdAt', 'desc')))
      : await getDocs(ref)
    const purchases = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar por fecha de creación (más reciente primero)
    purchases.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: purchases }
  } catch (error) {
    console.error('Error al obtener compras:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una compra
 */
export const updatePurchase = async (userId, purchaseId, updates) => {
  try {
    const docRef = doc(db, 'businesses', userId, 'purchases', purchaseId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar compra:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una compra
 */
export const deletePurchase = async (userId, purchaseId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'purchases', purchaseId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar compra:', error)
    return { success: false, error: error.message }
  }
}

// ==================== CATEGORÍAS ====================

/**
 * Obtener categorías de productos
 */
export const getProductCategories = async userId => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      return { success: true, data: data.productCategories || [] }
    } else {
      return { success: true, data: [] }
    }
  } catch (error) {
    console.error('Error al obtener categorías:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Guardar categorías de productos
 */
export const saveProductCategories = async (userId, categories) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    await updateDoc(docRef, {
      productCategories: categories,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al guardar categorías:', error)
    return { success: false, error: error.message }
  }
}

// ==================== MARCAS ====================

/**
 * Obtener marcas administradas del negocio.
 * Cada marca: { id, name }
 */
export const getProductBrands = async userId => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      return { success: true, data: data.productBrands || [] }
    } else {
      return { success: true, data: [] }
    }
  } catch (error) {
    console.error('Error al obtener marcas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Guardar todas las marcas (reemplaza el array completo).
 */
export const saveProductBrands = async (userId, brands) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    await updateDoc(docRef, {
      productBrands: brands,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al guardar marcas:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener categorías de ingredientes (insumos)
 */
export const getIngredientCategories = async userId => {
  try {
    const docRef = doc(db, 'businesses', userId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      return { success: true, data: data.ingredientCategories || [] }
    } else {
      return { success: true, data: [] }
    }
  } catch (error) {
    console.error('Error al obtener categorías de ingredientes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Guardar categorías de ingredientes (insumos)
 */
export const saveIngredientCategories = async (userId, categories) => {
  try {
    const docRef = doc(db, 'businesses', userId)
    await updateDoc(docRef, {
      ingredientCategories: categories,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al guardar categorías de ingredientes:', error)
    return { success: false, error: error.message }
  }
}

// ==================== CONTROL DE CAJA ====================

/**
 * Obtener sesión de caja actual (abierta)
 * @param {string} userId - ID del negocio
 * @param {string|null} branchId - ID de la sucursal (null = Sucursal Principal)
 * @param {string|null} userUid - Firebase UID del usuario (para filtrar caja por usuario)
 */
export const getCashRegisterSession = async (userId, branchId = null, userUid = null) => {
  try {
    // Construir query base
    let q
    if (branchId) {
      // Sucursal específica
      q = query(
        collection(db, 'businesses', userId, 'cashSessions'),
        where('status', '==', 'open'),
        where('branchId', '==', branchId)
      )
    } else {
      // Sucursal Principal (sin branchId o branchId = null)
      q = query(
        collection(db, 'businesses', userId, 'cashSessions'),
        where('status', '==', 'open')
      )
    }
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return { success: true, data: null }
    }

    // Filtrar resultados si es sucursal principal (sin branchId)
    let filteredDocs = snapshot.docs
    if (!branchId) {
      filteredDocs = snapshot.docs.filter(doc => {
        const data = doc.data()
        return !data.branchId || data.branchId === null
      })
    }

    // Filtrar por usuario
    if (userUid) {
      // Buscar sesión de un usuario específico (sub-usuario independiente)
      filteredDocs = filteredDocs.filter(doc => {
        const data = doc.data()
        if (data.openedByUserId) return data.openedByUserId === userUid
        // Sesiones antiguas sin openedByUserId pertenecen al owner
        return userUid === userId
      })
    } else {
      // userUid = null → buscar sesión global (sin openedByUserId o del owner)
      // Excluir sesiones de sub-usuarios independientes
      filteredDocs = filteredDocs.filter(doc => {
        const data = doc.data()
        return !data.openedByUserId || data.openedByUserId === userId
      })
    }

    if (filteredDocs.length === 0) {
      return { success: true, data: null }
    }

    // Si hay múltiples sesiones abiertas (no debería pasar), tomar la más reciente
    let mostRecentSession = filteredDocs[0]
    filteredDocs.forEach(doc => {
      const currentOpenedAt = doc.data().openedAt?.toDate?.() || new Date(0)
      const mostRecentOpenedAt = mostRecentSession.data().openedAt?.toDate?.() || new Date(0)
      if (currentOpenedAt > mostRecentOpenedAt) {
        mostRecentSession = doc
      }
    })

    return {
      success: true,
      data: {
        id: mostRecentSession.id,
        ...mostRecentSession.data(),
      },
    }
  } catch (error) {
    console.error('Error al obtener sesión de caja:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todas las sesiones de caja abiertas en una sucursal
 * @param {string} businessId - ID del negocio
 * @param {string|null} branchId - ID de la sucursal (null = Sucursal Principal)
 * @returns {Promise<{success: boolean, data?: Array}>}
 */
export const getOpenCashSessions = async (businessId, branchId = null) => {
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'cashSessions'),
      where('status', '==', 'open')
    )
    const snapshot = await getDocs(q)

    // Filtrar por sucursal en el cliente
    const sessions = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(session => {
        if (branchId) {
          return session.branchId === branchId
        } else {
          return !session.branchId || session.branchId === null
        }
      })

    return { success: true, data: sessions }
  } catch (error) {
    console.error('Error al obtener sesiones abiertas:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Abrir caja
 * @param {string} userId - ID del negocio
 * @param {number} openingAmount - Monto inicial
 * @param {string|null} branchId - ID de la sucursal (null = Sucursal Principal)
 * @param {string|null} userUid - Firebase UID del usuario que abre la caja
 * @param {string|null} userName - Nombre del usuario que abre la caja
 */
export const openCashRegister = async (userId, openingAmount, branchId = null, userUid = null, userName = null, openingAmountUSD = 0, openingAmountYape = 0) => {
  try {
    // Verificar que no haya una caja abierta para esta sucursal Y este usuario
    const currentSession = await getCashRegisterSession(userId, branchId, userUid)
    if (currentSession.success && currentSession.data) {
      return { success: false, error: 'Ya hay una caja abierta para esta sucursal' }
    }

    const sessionData = {
      openingAmount,
      status: 'open',
      openedAt: serverTimestamp(),
      openedBy: userId,
      createdAt: serverTimestamp(),
    }

    // Multi-divisa: si el negocio activó USD y el cajero declaró saldo en
    // dólares, guardamos también openingAmountUSD. Si vale 0, no se guarda
    // para mantener limpios los docs de cajas PEN-only.
    if (Number(openingAmountUSD) > 0) {
      sessionData.openingAmountUSD = Number(openingAmountUSD)
    }

    // Yape: monto inicial declarado en la billetera digital. Sólo se persiste
    // si > 0 (negocios que no usan Yape no contaminan sus docs con el campo).
    // Cajas legacy sin este campo → tratar como 0 al leer.
    if (Number(openingAmountYape) > 0) {
      sessionData.openingAmountYape = Number(openingAmountYape)
    }

    // Solo agregar branchId si no es null (sucursal adicional)
    if (branchId) {
      sessionData.branchId = branchId
    }

    // Guardar datos del usuario que abre la caja
    if (userUid) {
      sessionData.openedByUserId = userUid
      sessionData.openedByName = userName || ''
    }

    const docRef = await addDoc(collection(db, 'businesses', userId, 'cashSessions'), sessionData)

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al abrir caja:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cerrar caja
 * @param {string} userId - ID del negocio
 * @param {string} sessionId - ID de la sesión de caja
 * @param {object} closingData - Datos de cierre
 * @param {string|null} userUid - Firebase UID del usuario que cierra la caja
 * @param {string|null} userName - Nombre del usuario que cierra la caja
 */
export const closeCashRegister = async (userId, sessionId, closingData, userUid = null, userName = null) => {
  try {
    // Verificar que la sesión no esté ya cerrada (protección contra doble clic)
    const sessionRef = doc(db, 'businesses', userId, 'cashSessions', sessionId)
    const sessionSnap = await getDoc(sessionRef)
    if (sessionSnap.exists() && sessionSnap.data().status === 'closed') {
      return { success: true, alreadyClosed: true }
    }

    const { cash, card, transfer, yape, plin, rappi, pedidosYa, diDiFood, totalSales, salesCash, salesCard, salesTransfer, salesYape, salesPlin, salesRappi, salesPedidosYa, salesDiDiFood, totalIncome, totalExpense, totalIncomeYape, totalExpenseYape, expectedAmount, difference, expectedAmountYape, differenceYape, invoiceCount, deferredPayments, deferredTotal, usd } = closingData
    const closingAmount = cash + card + transfer + (yape || 0) + (plin || 0) + (rappi || 0) + (pedidosYa || 0) + (diDiFood || 0)

    const updateData = {
      closingAmount,
      closingCash: cash,
      closingCard: card,
      closingTransfer: transfer,
      closingYape: yape || 0,
      closingPlin: plin || 0,
      closingRappi: rappi || 0,
      closingPedidosYa: pedidosYa || 0,
      closingDiDiFood: diDiFood || 0,
      status: 'closed',
      closedAt: serverTimestamp(),
      closedBy: userId,
      // Datos adicionales para historial
      totalSales: totalSales || 0,
      salesCash: salesCash || 0,
      salesCard: salesCard || 0,
      salesTransfer: salesTransfer || 0,
      salesYape: salesYape || 0,
      salesPlin: salesPlin || 0,
      salesRappi: salesRappi || 0,
      salesPedidosYa: salesPedidosYa || 0,
      salesDiDiFood: salesDiDiFood || 0,
      totalIncome: totalIncome || 0,
      totalExpense: totalExpense || 0,
      expectedAmount: expectedAmount || 0,
      difference: difference || 0,
      invoiceCount: invoiceCount || 0,
      // Pagos cobrados en esta sesión sobre comprobantes emitidos en sesiones previas
      deferredPayments: deferredPayments || [],
      deferredTotal: deferredTotal || 0,
      // Yape: ingresos/gastos en la billetera y cálculo separado de cierre.
      // Sólo se persiste si hay algún flujo Yape, para mantener limpios los
      // docs de cajas que no usan Yape.
      ...((totalIncomeYape || totalExpenseYape || expectedAmountYape || (yape || 0) > 0) ? {
        totalIncomeYape: totalIncomeYape || 0,
        totalExpenseYape: totalExpenseYape || 0,
        expectedAmountYape: expectedAmountYape || 0,
        differenceYape: differenceYape || 0,
      } : {}),
    }

    // Multi-divisa: si vino bloque USD con datos, lo guardamos como objeto
    // anidado. Las sesiones legacy (PEN-only) no tienen este campo y todo
    // sigue funcionando idéntico.
    if (usd && typeof usd === 'object') {
      const usdClosingAmount = (usd.cash || 0) + (usd.card || 0) + (usd.transfer || 0) + (usd.yape || 0) + (usd.plin || 0) + (usd.rappi || 0) + (usd.pedidosYa || 0) + (usd.diDiFood || 0)
      updateData.usd = {
        openingAmount: usd.openingAmount || 0,
        closingAmount: usdClosingAmount,
        closingCash: usd.cash || 0,
        closingCard: usd.card || 0,
        closingTransfer: usd.transfer || 0,
        closingYape: usd.yape || 0,
        closingPlin: usd.plin || 0,
        closingRappi: usd.rappi || 0,
        closingPedidosYa: usd.pedidosYa || 0,
        closingDiDiFood: usd.diDiFood || 0,
        totalSales: usd.totalSales || 0,
        salesCash: usd.salesCash || 0,
        salesCard: usd.salesCard || 0,
        salesTransfer: usd.salesTransfer || 0,
        salesYape: usd.salesYape || 0,
        salesPlin: usd.salesPlin || 0,
        salesRappi: usd.salesRappi || 0,
        salesPedidosYa: usd.salesPedidosYa || 0,
        salesDiDiFood: usd.salesDiDiFood || 0,
        totalIncome: usd.totalIncome || 0,
        totalExpense: usd.totalExpense || 0,
        expectedAmount: usd.expectedAmount || 0,
        difference: usd.difference || 0,
      }
    }

    // Guardar datos del usuario que cierra la caja
    if (userUid) {
      updateData.closedByUserId = userUid
      updateData.closedByName = userName || ''
    }

    await updateDoc(sessionRef, updateData)

    return { success: true }
  } catch (error) {
    console.error('Error al cerrar caja:', error)
    return { success: false, error: error.message }
  }
}

/**
 * TEMPORAL: Actualizar sesión de caja cerrada (para correcciones)
 * TODO: Quitar esta función cuando ya no sea necesaria
 */
export const updateCashSession = async (userId, sessionId, updateData) => {
  try {
    const { closingCash, closingCard, closingTransfer, closingYape, closingPlin, closingRappi, closingPedidosYa, closingDiDiFood, openingAmount } = updateData
    const closingAmount = (closingCash || 0) + (closingCard || 0) + (closingTransfer || 0) + (closingYape || 0) + (closingPlin || 0) + (closingRappi || 0) + (closingPedidosYa || 0) + (closingDiDiFood || 0)

    // Recalcular diferencia - Efectivo esperado = apertura + ventas en efectivo + ingresos - egresos
    const expectedAmount = (openingAmount || 0) + (updateData.salesCash || 0) + (updateData.totalIncome || 0) - (updateData.totalExpense || 0)
    const difference = (closingCash || 0) - expectedAmount

    await updateDoc(doc(db, 'businesses', userId, 'cashSessions', sessionId), {
      closingAmount,
      closingCash: closingCash || 0,
      closingCard: closingCard || 0,
      closingTransfer: closingTransfer || 0,
      closingYape: closingYape || 0,
      closingPlin: closingPlin || 0,
      closingRappi: closingRappi || 0,
      closingPedidosYa: closingPedidosYa || 0,
      closingDiDiFood: closingDiDiFood || 0,
      openingAmount: openingAmount || 0,
      expectedAmount,
      difference,
      updatedAt: serverTimestamp(),
    })

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar sesión de caja:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Agregar movimiento de caja
 */
export const addCashMovement = async (userId, sessionId, movementData) => {
  try {
    const payload = {
      sessionId,
      type: movementData.type, // 'income' o 'expense'
      amount: movementData.amount,
      description: movementData.description,
      category: movementData.category || 'Otros',
      createdAt: serverTimestamp(),
      createdBy: userId,
    }
    // Multi-divisa: si vino currency='USD', persistirlo. PEN no se guarda
    // (default implícito) para mantener compatibilidad con movimientos legacy.
    if (movementData.currency === 'USD') {
      payload.currency = 'USD'
    }
    // Método de fondo: 'cash' (default, efectivo) o 'yape'. Sólo se persiste
    // si es distinto de 'cash' para que movimientos legacy sigan funcionando
    // sin tocar (se interpretan como cash al leer).
    if (movementData.method && movementData.method !== 'cash') {
      payload.method = movementData.method
    }
    const docRef = await addDoc(collection(db, 'businesses', userId, 'cashMovements'), payload)

    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al agregar movimiento:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener movimientos de una sesión
 */
export const getCashMovements = async (userId, sessionId) => {
  try {
    const q = query(
      collection(db, 'businesses', userId, 'cashMovements'),
      where('sessionId', '==', sessionId)
    )
    const snapshot = await getDocs(q)

    // Ordenar en el cliente para evitar índice compuesto
    const movements = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA // Más reciente primero
      })

    return { success: true, data: movements }
  } catch (error) {
    console.error('Error al obtener movimientos:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener registros de mesas cerradas sin comprobante en un rango de fechas
 */
export const getClosedWithoutReceipt = async (businessId, startDate, endDate) => {
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'tableCloseWithoutReceipt'),
      where('createdAt', '>=', startDate),
      ...(endDate ? [where('createdAt', '<=', endDate)] : [])
    )
    const snapshot = await getDocs(q)
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dA = a.createdAt?.toDate?.() || new Date(0)
        const dB = b.createdAt?.toDate?.() || new Date(0)
        return dB - dA
      })
    return { success: true, data: records }
  } catch (error) {
    console.error('Error al obtener cierres sin comprobante:', error)
    return { success: false, data: [] }
  }
}

/**
 * Guardar snapshot de precuenta (foto de la orden al imprimir precuenta)
 */
export const savePrecuentaSnapshot = async (businessId, data) => {
  try {
    const docRef = await addDoc(
      collection(db, 'businesses', businessId, 'precuentaSnapshots'),
      { ...data, createdAt: serverTimestamp() }
    )
    return { success: true, data: { id: docRef.id } }
  } catch (error) {
    console.error('Error al guardar snapshot de precuenta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener snapshot de precuenta por orderId
 */
export const getPrecuentaSnapshot = async (businessId, orderId) => {
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'precuentaSnapshots'),
      where('orderId', '==', orderId)
    )
    const snapshot = await getDocs(q)
    if (snapshot.empty) return { success: true, data: null }
    // Retornar el más reciente
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dA = a.createdAt?.toDate?.() || new Date(0)
        const dB = b.createdAt?.toDate?.() || new Date(0)
        return dB - dA
      })
    return { success: true, data: records[0] }
  } catch (error) {
    console.error('Error al obtener snapshot de precuenta:', error)
    return { success: false, data: null }
  }
}

/**
 * Registrar modificación de orden después de precuenta
 */
export const saveOrderModification = async (businessId, data) => {
  try {
    await addDoc(
      collection(db, 'businesses', businessId, 'orderModifiedAfterPrecuenta'),
      { ...data, createdAt: serverTimestamp() }
    )
    return { success: true }
  } catch (error) {
    console.error('Error al registrar modificación post-precuenta:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener modificaciones de órdenes después de precuenta en un rango de fechas
 */
export const getOrderModificationsAfterPrecuenta = async (businessId, startDate, endDate) => {
  try {
    const q = query(
      collection(db, 'businesses', businessId, 'orderModifiedAfterPrecuenta'),
      where('createdAt', '>=', startDate),
      ...(endDate ? [where('createdAt', '<=', endDate)] : [])
    )
    const snapshot = await getDocs(q)
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dA = a.createdAt?.toDate?.() || new Date(0)
        const dB = b.createdAt?.toDate?.() || new Date(0)
        return dB - dA
      })
    return { success: true, data: records }
  } catch (error) {
    console.error('Error al obtener modificaciones post-precuenta:', error)
    return { success: false, data: [] }
  }
}

/**
 * Obtener todos los movimientos de caja (para Flujo de Caja)
 */
export const getAllCashMovements = async (userId, sinceDate = null) => {
  try {
    // PERF: si se pasa sinceDate, traer solo los movimientos desde esa fecha
    // (Flujo de Caja es por periodo → no necesita el historial completo). Sin
    // sinceDate el comportamiento es el de siempre (todos), por compatibilidad.
    const ref = collection(db, 'businesses', userId, 'cashMovements')
    const snapshot = sinceDate
      ? await getDocs(query(ref, where('createdAt', '>=', sinceDate), orderBy('createdAt', 'desc')))
      : await getDocs(ref)

    const movements = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA
      })

    return { success: true, data: movements }
  } catch (error) {
    console.error('Error al obtener todos los movimientos:', error)
    return { success: false, error: error.message }
  }
}

// ==================== MOVIMIENTOS FINANCIEROS (Flujo de Caja) ====================

/**
 * Crear un movimiento financiero (para Flujo de Caja)
 */
export const createFinancialMovement = async (userId, movementData) => {
  try {
    const docRef = await addDoc(collection(db, 'businesses', userId, 'financialMovements'), {
      ...movementData,
      createdAt: serverTimestamp(),
      createdBy: userId,
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear movimiento financiero:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener todos los movimientos financieros
 */
export const getFinancialMovements = async (userId, sinceDate = null) => {
  try {
    // PERF: con sinceDate trae solo movimientos desde esa fecha (Reportes es por
    // período). Filtra por createdAt (fecha de registro): un movimiento registrado
    // hace mucho con `date` manual reciente quedaría fuera — caso raro y mismo
    // criterio que getPurchases/getAllCashMovements. Sin sinceDate = todos.
    const ref = collection(db, 'businesses', userId, 'financialMovements')
    const snapshot = sinceDate
      ? await getDocs(query(ref, where('createdAt', '>=', sinceDate), orderBy('createdAt', 'desc')))
      : await getDocs(ref)

    const movements = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const dateA = a.date?.toDate?.() || a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.date?.toDate?.() || b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA
      })

    return { success: true, data: movements }
  } catch (error) {
    console.error('Error al obtener movimientos financieros:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un movimiento financiero
 */
export const updateFinancialMovement = async (userId, movementId, movementData) => {
  try {
    await updateDoc(doc(db, 'businesses', userId, 'financialMovements', movementId), {
      ...movementData,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar movimiento financiero:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un movimiento financiero
 */
export const deleteFinancialMovement = async (userId, movementId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'financialMovements', movementId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar movimiento financiero:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar un movimiento de caja
 */
export const updateCashMovement = async (userId, movementId, movementData) => {
  try {
    const updatePayload = {
      type: movementData.type,
      amount: movementData.amount,
      description: movementData.description,
      category: movementData.category || 'Otros',
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    }
    // Método de fondo: persistir si vino y es distinto de 'cash'. Si vino 'cash'
    // (o no vino), borrar el campo previo si existía con deleteField. Por
    // simplicidad guardamos null en lugar de borrar — el reader trata null/missing como 'cash'.
    if (movementData.method !== undefined) {
      updatePayload.method = movementData.method && movementData.method !== 'cash' ? movementData.method : null
    }
    await updateDoc(doc(db, 'businesses', userId, 'cashMovements', movementId), updatePayload)

    return { success: true }
  } catch (error) {
    console.error('Error al actualizar movimiento:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar un movimiento de caja
 */
export const deleteCashMovement = async (userId, movementId) => {
  try {
    await deleteDoc(doc(db, 'businesses', userId, 'cashMovements', movementId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar movimiento:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener historial de sesiones de caja cerradas
 */
// Historial de cierres de caja con PAGINACIÓN (cursor) y filtro por rango de fechas.
// El filtro por sucursal/usuario es client-side (no se puede en el server porque las
// sesiones "globales" no tienen branchId), así que traemos lotes y seguimos pidiendo
// hasta juntar `limit` resultados reales — así nunca se cortan cierres viejos por el filtro.
// Devuelve { data, lastDoc, hasMore }. Para la siguiente página pasar startAfterDoc: lastDoc.
export const getCashRegisterHistory = async (userId, options = {}) => {
  try {
    const {
      limit: pageSize = 30,
      branchId = null,
      userUid = null,
      startAfterDoc = null,   // DocumentSnapshot de una llamada previa (paginación)
      dateFrom = null,        // Date/Timestamp → closedAt >=
      dateTo = null,          // Date/Timestamp → closedAt <=
    } = options

    const matchesFilters = (session) => {
      if (branchId) {
        if (session.branchId !== branchId) return false
      } else {
        if (session.branchId) return false
      }
      if (userUid === 'global') {
        if (session.openedByUserId && session.openedByUserId !== userId) return false
      } else if (userUid) {
        if (session.openedByUserId) {
          if (session.openedByUserId !== userUid) return false
        } else {
          if (userUid !== userId) return false
        }
      }
      return true
    }

    const BATCH = Math.max(30, pageSize) * 3 // sobre-traer por el filtro client-side
    const collected = []
    let cursor = startAfterDoc
    let lastReturnedSnap = startAfterDoc
    let exhausted = false

    for (let iter = 0; iter < 25 && collected.length < pageSize && !exhausted; iter++) {
      const constraints = [where('status', '==', 'closed')]
      if (dateFrom) constraints.push(where('closedAt', '>=', dateFrom))
      if (dateTo) constraints.push(where('closedAt', '<=', dateTo))
      constraints.push(orderBy('closedAt', 'desc'))
      if (cursor) constraints.push(startAfter(cursor))
      constraints.push(limit(BATCH))

      const snapshot = await getDocs(
        query(collection(db, 'businesses', userId, 'cashSessions'), ...constraints)
      )
      if (snapshot.empty) { exhausted = true; break }

      for (const d of snapshot.docs) {
        if (collected.length >= pageSize) break
        const session = { id: d.id, ...d.data() }
        if (matchesFilters(session)) {
          collected.push(session)
          lastReturnedSnap = d // cursor = último ITEM devuelto (no salta los no-devueltos)
        }
      }
      cursor = snapshot.docs[snapshot.docs.length - 1]
      if (snapshot.docs.length < BATCH) exhausted = true
    }

    return {
      success: true,
      data: collected,
      lastDoc: lastReturnedSnap,
      hasMore: !exhausted && collected.length >= pageSize,
    }
  } catch (error) {
    console.error('Error al obtener historial de caja:', error)
    return { success: false, error: error.message }
  }
}

// ==================== GUÍAS DE REMISIÓN ====================

/**
 * Crear una nueva guía de remisión
 */
export const createDispatchGuide = async (businessId, guideData) => {
  try {
    // Obtener siguiente número usando branchSeries si hay sucursal
    const numberResult = await getNextDocumentNumber(
      businessId,
      'guia_remision',
      null,
      guideData.branchId || null
    )

    if (!numberResult.success) {
      throw new Error(numberResult.error || 'Error al obtener número de serie')
    }

    const guideNumber = numberResult.number
    const seriesPrefix = numberResult.series
    const newCorrelative = numberResult.correlativeNumber

    // Crear la guía en la subcolección
    const guideToSave = {
      ...guideData,
      number: guideNumber,
      series: seriesPrefix,
      correlative: newCorrelative,
      status: 'pending', // pending, sent, accepted, rejected
      sunatStatus: 'pending', // pending, sent, accepted, rejected
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      businessId: businessId,
    }

    const docRef = await addDoc(
      collection(db, 'businesses', businessId, 'dispatchGuides'),
      guideToSave
    )

    return {
      success: true,
      id: docRef.id,
      number: guideNumber,
      guide: { id: docRef.id, ...guideToSave }
    }
  } catch (error) {
    console.error('Error al crear guía de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener guías de remisión de un negocio
 */
export const getDispatchGuides = async (businessId) => {
  try {
    const querySnapshot = await getDocs(
      collection(db, 'businesses', businessId, 'dispatchGuides')
    )

    const guides = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar por fecha de creación (más reciente primero)
    guides.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: guides }
  } catch (error) {
    console.error('Error al obtener guías de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una guía de remisión por ID
 */
export const getDispatchGuide = async (businessId, guideId) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'dispatchGuides', guideId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Guía no encontrada' }
    }

    return {
      success: true,
      data: { id: docSnap.id, ...docSnap.data() }
    }
  } catch (error) {
    console.error('Error al obtener guía de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una guía de remisión
 */
export const updateDispatchGuide = async (businessId, guideId, updates) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'dispatchGuides', guideId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar guía de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una guía de remisión
 */
export const deleteDispatchGuide = async (businessId, guideId) => {
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'dispatchGuides', guideId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar guía de remisión:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar Guía de Remisión a SUNAT
 *
 * Esta función es INDEPENDIENTE de sendInvoiceToSunat para no afectar
 * el flujo existente de facturas y boletas.
 *
 * IMPORTANTE: Las GRE usan endpoints DIFERENTES a las facturas/boletas
 *
 * @param {string} businessId - ID del negocio
 * @param {string} guideId - ID de la guía de remisión
 * @returns {Promise<Object>} Resultado del envío
 */
export const sendDispatchGuideToSunat = async (businessId, guideId) => {
  try {
    console.log(`🚛 Enviando Guía de Remisión ${guideId} a SUNAT...`)

    // Obtener token de autenticación del usuario actual
    const user = auth.currentUser
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const idToken = await user.getIdToken()

    // Determinar URL de la Cloud Function (emulador o producción)
    const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

    const functionUrl = useEmulator
      ? 'http://127.0.0.1:5001/cobrify-395fe/us-central1/sendDispatchGuideToSunatFn'
      : 'https://senddispatchguidetosunatfn-tb5ph5ddsq-uc.a.run.app'

    console.log(`🌐 [GRE] Llamando a: ${functionUrl}`)

    // Llamar a la Cloud Function con fetch
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        businessId,
        guideId,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [GRE] Error HTTP Response:', errorText)
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('✅ [GRE] Respuesta de SUNAT:', result)

    return {
      success: result.success,
      accepted: result.accepted,
      method: result.method,
      responseCode: result.responseCode,
      description: result.description,
      error: result.error,
      guideNumber: result.guideNumber,
      sunatStatus: result.sunatStatus,
    }
  } catch (error) {
    console.error('❌ [GRE] Error al enviar guía a SUNAT:', error)

    return {
      success: false,
      error: error.message || 'Error al enviar guía de remisión a SUNAT',
    }
  }
}

// ==================== GUÍAS DE REMISIÓN TRANSPORTISTA ====================

/**
 * Crear una nueva guía de remisión transportista
 */
export const createCarrierDispatchGuide = async (businessId, guideData) => {
  try {
    // Obtener siguiente número usando branchSeries si hay sucursal
    const numberResult = await getNextDocumentNumber(
      businessId,
      'guia_transportista',
      null,
      guideData.branchId || null
    )

    if (!numberResult.success) {
      throw new Error(numberResult.error || 'Error al obtener número de serie')
    }

    const guideNumber = numberResult.number
    const seriesPrefix = numberResult.series
    const newCorrelative = numberResult.correlativeNumber

    // Crear la guía en la subcolección
    const guideToSave = {
      ...guideData,
      number: guideNumber,
      series: seriesPrefix,
      correlative: newCorrelative,
      documentType: '31', // 31 = GRE Transportista
      status: 'pending',
      sunatStatus: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      businessId: businessId,
    }

    const docRef = await addDoc(
      collection(db, 'businesses', businessId, 'carrierDispatchGuides'),
      guideToSave
    )

    return {
      success: true,
      id: docRef.id,
      number: guideNumber,
      guide: { id: docRef.id, ...guideToSave }
    }
  } catch (error) {
    console.error('Error al crear guía de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Guardar borrador de guía de remisión transportista
 */
export const saveCarrierDispatchGuideDraft = async (businessId, guideData, draftId = null) => {
  try {
    const guideToSave = {
      ...guideData,
      documentType: '31', // 31 = GRE Transportista
      status: 'draft',
      sunatStatus: null,
      updatedAt: serverTimestamp(),
      businessId: businessId,
    }

    if (draftId) {
      // Actualizar borrador existente
      const docRef = doc(db, 'businesses', businessId, 'carrierDispatchGuides', draftId)
      await updateDoc(docRef, guideToSave)
      return {
        success: true,
        id: draftId,
        guide: { id: draftId, ...guideToSave }
      }
    } else {
      // Crear nuevo borrador
      guideToSave.createdAt = serverTimestamp()
      const docRef = await addDoc(
        collection(db, 'businesses', businessId, 'carrierDispatchGuides'),
        guideToSave
      )
      return {
        success: true,
        id: docRef.id,
        guide: { id: docRef.id, ...guideToSave }
      }
    }
  } catch (error) {
    console.error('Error al guardar borrador de guía transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener guías de remisión transportista de un negocio
 */
export const getCarrierDispatchGuides = async (businessId) => {
  try {
    const querySnapshot = await getDocs(
      collection(db, 'businesses', businessId, 'carrierDispatchGuides')
    )

    const guides = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Ordenar por fecha de creación (más reciente primero)
    guides.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return b.createdAt.seconds - a.createdAt.seconds
    })

    return { success: true, data: guides }
  } catch (error) {
    console.error('Error al obtener guías de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Obtener una guía de remisión transportista por ID
 */
export const getCarrierDispatchGuide = async (businessId, guideId) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'carrierDispatchGuides', guideId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return { success: false, error: 'Guía no encontrada' }
    }

    return {
      success: true,
      data: { id: docSnap.id, ...docSnap.data() }
    }
  } catch (error) {
    console.error('Error al obtener guía de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Actualizar una guía de remisión transportista
 */
export const updateCarrierDispatchGuide = async (businessId, guideId, updates) => {
  try {
    const docRef = doc(db, 'businesses', businessId, 'carrierDispatchGuides', guideId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar guía de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Eliminar una guía de remisión transportista (borradores)
 */
export const deleteCarrierDispatchGuide = async (businessId, guideId) => {
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'carrierDispatchGuides', guideId))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar guía de remisión transportista:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Enviar Guía de Remisión Transportista a SUNAT
 *
 * @param {string} businessId - ID del negocio
 * @param {string} guideId - ID de la guía de remisión transportista
 * @returns {Promise<Object>} Resultado del envío
 */
export const sendCarrierDispatchGuideToSunat = async (businessId, guideId) => {
  try {
    console.log(`🚚 Enviando GRE Transportista ${guideId} a SUNAT...`)

    // Obtener token de autenticación del usuario actual
    const user = auth.currentUser
    if (!user) {
      throw new Error('Usuario no autenticado')
    }

    const idToken = await user.getIdToken()

    // Determinar URL de la Cloud Function (emulador o producción)
    const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

    const functionUrl = useEmulator
      ? 'http://127.0.0.1:5001/cobrify-395fe/us-central1/sendCarrierDispatchGuideToSunatFn'
      : 'https://sendcarrierdispatchguidetosunatfn-tb5ph5ddsq-uc.a.run.app'

    console.log(`🌐 [GRE-T] Llamando a: ${functionUrl}`)

    // Llamar a la Cloud Function con fetch
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        businessId,
        guideId,
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [GRE-T] Error HTTP Response:', errorText)
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('✅ [GRE-T] Respuesta de SUNAT:', result)

    return {
      success: result.success,
      accepted: result.accepted,
      method: result.method,
      responseCode: result.responseCode,
      description: result.description,
      error: result.error,
      guideNumber: result.guideNumber,
      sunatStatus: result.sunatStatus,
    }
  } catch (error) {
    console.error('❌ [GRE-T] Error al enviar guía transportista a SUNAT:', error)

    return {
      success: false,
      error: error.message || 'Error al enviar guía de remisión transportista a SUNAT',
    }
  }
}

// ==================== PRÉSTAMOS ====================

// Obtener todos los préstamos
export const getLoans = async (businessId) => {
  try {
    const loansRef = collection(db, 'businesses', businessId, 'loans')
    const q = query(loansRef, orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    const loans = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    return { success: true, data: loans }
  } catch (error) {
    console.error('Error al obtener préstamos:', error)
    return { success: false, error: error.message }
  }
}

// Crear un préstamo
export const createLoan = async (businessId, loanData) => {
  try {
    const loansRef = collection(db, 'businesses', businessId, 'loans')
    const docRef = await addDoc(loansRef, {
      ...loanData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error al crear préstamo:', error)
    return { success: false, error: error.message }
  }
}

// Actualizar un préstamo
export const updateLoan = async (businessId, loanId, loanData) => {
  try {
    const loanRef = doc(db, 'businesses', businessId, 'loans', loanId)
    await updateDoc(loanRef, {
      ...loanData,
      updatedAt: serverTimestamp()
    })
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar préstamo:', error)
    return { success: false, error: error.message }
  }
}

// Eliminar un préstamo
export const deleteLoan = async (businessId, loanId) => {
  try {
    const loanRef = doc(db, 'businesses', businessId, 'loans', loanId)
    await deleteDoc(loanRef)
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar préstamo:', error)
    return { success: false, error: error.message }
  }
}
