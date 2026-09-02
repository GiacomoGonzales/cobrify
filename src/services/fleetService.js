import { db } from '@/lib/firebase'
import {
  collection, doc, addDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { normalizePlate } from '@/utils/vehiclePlate'

/**
 * CONDUCTORES Y VEHÍCULOS guardados, para no re-teclearlos en cada guía.
 *
 * Pedido de JMC: los datos del conductor y de su vehículo se escribían a mano
 * en CADA guía de remisión —placa, autorización MTC, TUCE, documento, nombres,
 * licencia—, y siempre son los mismos tres o cuatro. Ahora se guardan una vez y
 * se eligen de una lista.
 *
 * SON DOS LISTAS SEPARADAS, no "un conductor con su vehículo": en la calle un
 * conductor maneja distintas unidades y una unidad la manejan distintos
 * conductores. La guía ya admite varios de cada uno por separado, así que
 * atarlos acá sería inventar una relación que el documento no tiene.
 *
 * Los campos son EXACTAMENTE los que pide el XML de SUNAT, con dos agregados
 * que no viajan al comprobante pero evitan un rechazo: el vencimiento de la
 * licencia y el de la TUCE. Emitir con una licencia vencida es un problema que
 * se descubre tarde y caro.
 */

const driversRef = (businessId) => collection(db, 'businesses', businessId, 'drivers')
const vehiclesRef = (businessId) => collection(db, 'businesses', businessId, 'vehicles')

/** Texto limpio para guardar: sin espacios de más, y recortado. */
const limpio = (v, max = 100) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Deja UNO solo marcado como "el de siempre".
 *
 * Se hace en lote: marcar dos por descuido dejaría el selector eligiendo
 * cualquiera de los dos según el orden en que hayan vuelto de la base.
 */
const dejarUnicoPredeterminado = async (ref, id) => {
  const snap = await getDocs(ref)
  const lote = writeBatch(db)
  let hayCambios = false
  snap.forEach((d) => {
    const esteEsDefault = d.id === id
    if (!!d.data().isDefault !== esteEsDefault) {
      lote.update(d.ref, { isDefault: esteEsDefault })
      hayCambios = true
    }
  })
  if (hayCambios) await lote.commit()
}

// ─────────────────────────────── CONDUCTORES ───────────────────────────────

export const getDrivers = async (businessId) => {
  try {
    const snap = await getDocs(query(driversRef(businessId), orderBy('createdAt', 'desc')))
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al cargar conductores:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export const createDriver = async (businessId, datos) => {
  try {
    const nombre = limpio(datos.name, 80)
    if (!nombre) return { success: false, error: 'Escribe el nombre del conductor' }
    const doc_ = limpio(datos.documentNumber, 15).replace(/\s/g, '')
    if (!doc_) return { success: false, error: 'Escribe el documento del conductor' }
    if (!limpio(datos.license, 20)) return { success: false, error: 'Escribe la licencia de conducir' }

    const nuevo = {
      documentType: datos.documentType || '1',
      documentNumber: doc_,
      name: nombre,
      lastName: limpio(datos.lastName, 80),
      license: limpio(datos.license, 20).toUpperCase(),
      licenseExpiry: datos.licenseExpiry || '',
      phone: limpio(datos.phone, 20),
      notes: limpio(datos.notes, 200),
      isDefault: !!datos.isDefault,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    const ref = await addDoc(driversRef(businessId), nuevo)
    if (nuevo.isDefault) await dejarUnicoPredeterminado(driversRef(businessId), ref.id)
    return { success: true, id: ref.id }
  } catch (error) {
    console.error('Error al crear conductor:', error)
    return { success: false, error: error.message }
  }
}

export const updateDriver = async (businessId, id, datos) => {
  try {
    const cambios = { updatedAt: serverTimestamp() }
    if (datos.documentType !== undefined) cambios.documentType = datos.documentType || '1'
    if (datos.documentNumber !== undefined) cambios.documentNumber = limpio(datos.documentNumber, 15).replace(/\s/g, '')
    if (datos.name !== undefined) cambios.name = limpio(datos.name, 80)
    if (datos.lastName !== undefined) cambios.lastName = limpio(datos.lastName, 80)
    if (datos.license !== undefined) cambios.license = limpio(datos.license, 20).toUpperCase()
    if (datos.licenseExpiry !== undefined) cambios.licenseExpiry = datos.licenseExpiry || ''
    if (datos.phone !== undefined) cambios.phone = limpio(datos.phone, 20)
    if (datos.notes !== undefined) cambios.notes = limpio(datos.notes, 200)
    if (datos.status !== undefined) cambios.status = datos.status
    if (datos.isDefault !== undefined) cambios.isDefault = !!datos.isDefault

    await updateDoc(doc(driversRef(businessId), id), cambios)
    if (datos.isDefault) await dejarUnicoPredeterminado(driversRef(businessId), id)
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar conductor:', error)
    return { success: false, error: error.message }
  }
}

export const deleteDriver = async (businessId, id) => {
  try {
    await deleteDoc(doc(driversRef(businessId), id))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar conductor:', error)
    return { success: false, error: error.message }
  }
}

// ─────────────────────────────── VEHÍCULOS ───────────────────────────────

export const getVehicles = async (businessId) => {
  try {
    const snap = await getDocs(query(vehiclesRef(businessId), orderBy('createdAt', 'desc')))
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('Error al cargar vehículos:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export const createVehicle = async (businessId, datos) => {
  try {
    // La placa se normaliza con el mismo criterio que usa la guía
    // (src/utils/vehiclePlate.js): si acá se guardara de otra forma, el dato
    // elegido de la lista no sería el que SUNAT espera.
    const placa = normalizePlate(datos.plate || '')
    if (!placa) return { success: false, error: 'Escribe la placa del vehículo' }

    const nuevo = {
      plate: placa,
      nickname: limpio(datos.nickname, 40),
      mtcEntity: limpio(datos.mtcEntity, 60),
      mtcAuthorization: limpio(datos.mtcAuthorization, 40),
      tuce: limpio(datos.tuce, 40),
      tuceExpiry: datos.tuceExpiry || '',
      notes: limpio(datos.notes, 200),
      isDefault: !!datos.isDefault,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    const ref = await addDoc(vehiclesRef(businessId), nuevo)
    if (nuevo.isDefault) await dejarUnicoPredeterminado(vehiclesRef(businessId), ref.id)
    return { success: true, id: ref.id }
  } catch (error) {
    console.error('Error al crear vehículo:', error)
    return { success: false, error: error.message }
  }
}

export const updateVehicle = async (businessId, id, datos) => {
  try {
    const cambios = { updatedAt: serverTimestamp() }
    if (datos.plate !== undefined) cambios.plate = normalizePlate(datos.plate || '')
    if (datos.nickname !== undefined) cambios.nickname = limpio(datos.nickname, 40)
    if (datos.mtcEntity !== undefined) cambios.mtcEntity = limpio(datos.mtcEntity, 60)
    if (datos.mtcAuthorization !== undefined) cambios.mtcAuthorization = limpio(datos.mtcAuthorization, 40)
    if (datos.tuce !== undefined) cambios.tuce = limpio(datos.tuce, 40)
    if (datos.tuceExpiry !== undefined) cambios.tuceExpiry = datos.tuceExpiry || ''
    if (datos.notes !== undefined) cambios.notes = limpio(datos.notes, 200)
    if (datos.status !== undefined) cambios.status = datos.status
    if (datos.isDefault !== undefined) cambios.isDefault = !!datos.isDefault

    await updateDoc(doc(vehiclesRef(businessId), id), cambios)
    if (datos.isDefault) await dejarUnicoPredeterminado(vehiclesRef(businessId), id)
    return { success: true }
  } catch (error) {
    console.error('Error al actualizar vehículo:', error)
    return { success: false, error: error.message }
  }
}

export const deleteVehicle = async (businessId, id) => {
  try {
    await deleteDoc(doc(vehiclesRef(businessId), id))
    return { success: true }
  } catch (error) {
    console.error('Error al eliminar vehículo:', error)
    return { success: false, error: error.message }
  }
}
