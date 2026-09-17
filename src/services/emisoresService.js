import { db } from '@/lib/firebase'
import { collection, deleteField, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getEmissionSecrets, saveEmissionSecrets } from './emissionSecretsService'
import { TIPOS_DE_SERIE_DE_EMISOR } from '../../functions/src/utils/emisorDelComprobante.js'

/**
 * Los RUC adicionales de una cuenta ("Varios RUC").
 *
 * Cada emisor es un doc de `businesses/{id}/emisores/{eid}` con los MISMOS
 * nombres de campo que el doc del negocio (ruc, businessName, address,
 * emissionConfig…), para que el negocio efectivo que reciben el XML y las
 * impresoras sea el negocio con el emisor encima y nada más. Sus credenciales
 * viven en `emisores/{eid}/secrets/emission`, y sus series en el doc del
 * negocio, en `emisorSeries.{eid}`, calcadas de `branchSeries`: es lo que la
 * transacción de numeración ya sabe leer y lo que el negocio puede escribir
 * (el doc del emisor solo lo escribe el admin).
 *
 * El RUC principal NO es un emisor: es el negocio.
 */

const coleccion = (businessId) => collection(db, 'businesses', businessId, 'emisores')
const refDeEmisor = (businessId, emisorId) => doc(db, 'businesses', businessId, 'emisores', emisorId)

/** Todos los emisores de la cuenta, ordenados; `soloActivos` para el POS. */
export async function getEmisores(businessId, { soloActivos = false } = {}) {
  try {
    const snap = await getDocs(coleccion(businessId))
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => !soloActivos || e.activo !== false)
      // Sin orderBy en la consulta: un índice menos, y son dos o tres docs.
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.ruc || '').localeCompare(String(b.ruc || '')))
    return { success: true, data: lista }
  } catch (error) {
    console.error('Error al cargar los emisores:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/** Un id nuevo, generado en el cliente para poder escribir doc, secretos y series con él. */
export function nuevoIdDeEmisor(businessId) {
  return doc(coleccion(businessId)).id
}

/**
 * Guarda un emisor entero: su doc, sus credenciales y sus series.
 *
 * @param {object} datos     campos públicos (misma forma que el negocio)
 * @param {object} secretos  { sunat, qpse, emissionConfig: { sunat, qpse } }
 * @param {object} series    { factura: 'F101', boleta: 'B101', … }
 */
export async function guardarEmisor(businessId, emisorId, datos, secretos, series) {
  try {
    const ref = refDeEmisor(businessId, emisorId)
    const existente = await getDoc(ref)
    await setDoc(
      ref,
      {
        ...datos,
        actualizadoEn: serverTimestamp(),
        ...(existente.exists() ? {} : { creadoEn: serverTimestamp() }),
      },
      { merge: true }
    )
    if (secretos) await saveEmissionSecrets(businessId, secretos, { emisorId })
    if (series) await guardarSeriesDeEmisor(businessId, emisorId, series)
    return { success: true, id: emisorId }
  } catch (error) {
    console.error('Error al guardar el emisor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Las series del emisor, en el doc del negocio.
 *
 * El contador se CONSERVA si la serie no cambió: guardar la ficha de un emisor
 * que ya emitió no puede devolver su numeración a cero. Una serie nueva
 * empieza en 1, que es lo que SUNAT espera de una serie que nunca se usó.
 */
export async function guardarSeriesDeEmisor(businessId, emisorId, series) {
  const businessRef = doc(db, 'businesses', businessId)
  const snap = await getDoc(businessRef)
  const actuales = snap.data()?.emisorSeries?.[emisorId] || {}
  const cambios = {}
  for (const tipo of TIPOS_DE_SERIE_DE_EMISOR) {
    const serie = String(series?.[tipo] || '').trim().toUpperCase()
    if (!serie) continue
    const actual = actuales[tipo]
    const lastNumber = actual && actual.serie === serie ? actual.lastNumber || 0 : 0
    cambios[`emisorSeries.${emisorId}.${tipo}`] = { serie, lastNumber }
  }
  if (Object.keys(cambios).length > 0) await updateDoc(businessRef, cambios)
}

/**
 * Las series de un emisor TAL CUAL se editaron, con su contador.
 *
 * Es la versión para el DUEÑO (Configuración › Series), que también puede
 * corregir el "último número", igual que con las suyas y las de sus sucursales
 * —por ejemplo cuando SUNAT le rechazó comprobantes y hay que reanudar en otro
 * correlativo—. `guardarSeriesDeEmisor`, la del admin, solo toca la serie y
 * conserva el contador: ahí se está dando de alta el RUC, no arreglando su
 * numeración.
 *
 * Quien llama valida antes que la serie no choque con nada de la cuenta
 * (`seriesRepetidas`): acá solo se escribe.
 */
export async function actualizarSeriesDeEmisor(businessId, emisorId, series) {
  try {
    const limpias = {}
    for (const tipo of TIPOS_DE_SERIE_DE_EMISOR) {
      const serie = String(series?.[tipo]?.serie || '').trim().toUpperCase()
      if (!serie) continue
      limpias[tipo] = { serie, lastNumber: Number(series[tipo]?.lastNumber) || 0 }
    }
    await updateDoc(doc(db, 'businesses', businessId), { [`emisorSeries.${emisorId}`]: limpias })
    return { success: true }
  } catch (error) {
    console.error('Error al guardar las series del emisor:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Las series del NEGOCIO (el RUC principal), desde la ficha del admin.
 *
 * Mismo trato que las de un emisor: si la serie no cambió se conserva su
 * contador, y una serie nueva empieza en 1. Solo los siete comprobantes de
 * venta; las guías y las cotizaciones no tienen formato definido y se siguen
 * cambiando desde Configuración › Series del cliente.
 */
export async function guardarSeriesDelNegocio(businessId, series) {
  try {
    const businessRef = doc(db, 'businesses', businessId)
    const snap = await getDoc(businessRef)
    const actuales = snap.data()?.series || {}
    const cambios = {}
    for (const tipo of TIPOS_DE_SERIE_DE_EMISOR) {
      const serie = String(series?.[tipo] || '').trim().toUpperCase()
      if (!serie) continue
      const actual = actuales[tipo]
      const lastNumber = actual && actual.serie === serie ? actual.lastNumber || 0 : 0
      cambios[`series.${tipo}`] = { serie, lastNumber }
    }
    if (Object.keys(cambios).length > 0) await updateDoc(businessRef, cambios)
    return { success: true }
  } catch (error) {
    console.error('Error al guardar las series del negocio:', error)
    return { success: false, error: error.message }
  }
}

/**
 * La serie propia de UNA PERSONA dentro de UN RUC adicional.
 *
 * Vive en `emisorUserSeries.{emisorId}.{uid}` y manda sobre la del RUC cuando
 * esa persona emite con él (ver utils/serieParaNumerar). Es el equivalente de
 * `userSeries` del RUC principal: dos cajeros con series distintas vendiendo
 * con la misma empresa.
 *
 * Quien llama valida antes que ninguna choque con el resto de la cuenta.
 */
export async function actualizarSeriesDePersonaEnRuc(businessId, emisorId, uid, series) {
  try {
    const limpias = {}
    for (const tipo of TIPOS_DE_SERIE_DE_EMISOR) {
      const serie = String(series?.[tipo]?.serie || '').trim().toUpperCase()
      if (!serie) continue
      limpias[tipo] = { serie, lastNumber: Number(series[tipo]?.lastNumber) || 0 }
    }
    await updateDoc(doc(db, 'businesses', businessId), { [`emisorUserSeries.${emisorId}.${uid}`]: limpias })
    return { success: true }
  } catch (error) {
    console.error('Error al guardar las series de la persona en el RUC:', error)
    return { success: false, error: error.message }
  }
}

/** Quitarlas: esa persona vuelve a emitir con las series del RUC. */
export async function quitarSeriesDePersonaEnRuc(businessId, emisorId, uid) {
  try {
    await updateDoc(doc(db, 'businesses', businessId), { [`emisorUserSeries.${emisorId}.${uid}`]: deleteField() })
    return { success: true }
  } catch (error) {
    console.error('Error al quitar las series de la persona en el RUC:', error)
    return { success: false, error: error.message }
  }
}

/** Lo que el negocio tiene guardado de series, para validar que ninguna se repita. */
export async function getSeriesDelNegocio(businessId) {
  const snap = await getDoc(doc(db, 'businesses', businessId))
  const d = snap.data() || {}
  return {
    series: d.series || {},
    branchSeries: d.branchSeries || {},
    warehouseSeries: d.warehouseSeries || {},
    emisorSeries: d.emisorSeries || {},
    emisorUserSeries: d.emisorUserSeries || {},
  }
}

/** Apagar un emisor lo saca del POS; sus comprobantes siguen siendo suyos. No se borra. */
export async function cambiarActivoDeEmisor(businessId, emisorId, activo) {
  try {
    await updateDoc(refDeEmisor(businessId, emisorId), { activo: activo === true, actualizadoEn: serverTimestamp() })
    return { success: true }
  } catch (error) {
    console.error('Error al cambiar el estado del emisor:', error)
    return { success: false, error: error.message }
  }
}

export const getSecretosDeEmisor = (businessId, emisorId) => getEmissionSecrets(businessId, {}, { emisorId })
