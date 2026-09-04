/**
 * COBRANZA DE SERVICIOS (luz, agua) — datos.
 *
 * Los cálculos están aparte, en `utils/cobranzaServicios.js`, para poder
 * probarlos sin Firestore. Acá solo se guarda y se lee.
 *
 * ── Tres colecciones ────────────────────────────────────────────────────────
 * `serviceSupplies`  Un documento por SUMINISTRO, no por cliente: en el padrón
 *                    del primer negocio hay titulares con dos y tres medidores
 *                    (casa, tienda, taller). Guarda la última lectura, que es
 *                    la anterior del mes siguiente.
 * `servicePeriods`   Un documento por mes. Congela la tarifa, el mínimo y el
 *                    cargo fijo: un recibo de julio no puede cambiar de importe
 *                    porque en setiembre subió el precio.
 * `serviceReceipts`  Un documento por recibo emitido, con su correlativo y su
 *                    estado de cobranza.
 *
 * Colecciones propias, como `lendingLoans`: estos recibos no son comprobantes
 * SUNAT ni ventas, y mezclarlos con `invoices` los metería en los reportes de
 * ventas y en el Registro de Ventas.
 */
import { db } from '@/lib/firebase'
import {
  collection, doc, addDoc, setDoc, getDocs, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, writeBatch, runTransaction,
} from 'firebase/firestore'
import { CON_MEDIDOR, SIN_MEDIDOR, r1, r2 } from '@/utils/cobranzaServicios'

const ruta = (businessId, sub) => collection(db, 'businesses', businessId, sub)

/** El estado de un recibo. */
export const PENDIENTE = 'pendiente'
export const PAGADO = 'pagado'
export const ANULADO = 'anulado'

// ───────────────────────────────────────────────────────────── suministros

/**
 * Los suministros del negocio, ordenados por su número de ruta.
 *
 * El orden importa: el que toma las lecturas camina el pueblo en un orden fijo
 * y la pantalla tiene que seguirlo, o pierde tiempo buscando cada casa.
 */
export async function getSupplies(businessId, { soloActivos = true } = {}) {
  try {
    const snap = await getDocs(ruta(businessId, 'serviceSupplies'))
    let lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    if (soloActivos) lista = lista.filter(s => s.activo !== false)
    lista.sort((a, b) => {
      const oa = Number(a.orden), ob = Number(b.orden)
      if (Number.isFinite(oa) && Number.isFinite(ob) && oa !== ob) return oa - ob
      if (Number.isFinite(oa) !== Number.isFinite(ob)) return Number.isFinite(oa) ? -1 : 1
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
    })
    return { success: true, data: lista }
  } catch (error) {
    console.error('getSupplies:', error)
    return { success: false, error: error.message }
  }
}

/** Normaliza lo que llega del formulario antes de guardarlo. */
function limpiarSuministro(datos) {
  const tipo = datos.tipo === SIN_MEDIDOR ? SIN_MEDIDOR : CON_MEDIDOR
  return {
    tipo,
    nombre: String(datos.nombre || '').trim(),
    documento: String(datos.documento || '').trim(),
    telefono: String(datos.telefono || '').trim(),
    // La que se imprime en el recibo.
    direccion: String(datos.direccion || '').trim(),
    // "3-Jun", "Carretera", "Tienda 1": la referencia con la que el cobrador
    // ubica la casa. En el Excel iba en la misma columna que la dirección y
    // por eso se imprimían cosas como "Tienda 1" donde va el domicilio.
    referencia: String(datos.referencia || '').trim(),
    numeroSuministro: String(datos.numeroSuministro || '').trim(),
    orden: Number.isFinite(Number(datos.orden)) ? Number(datos.orden) : null,
    cuotaFija: tipo === SIN_MEDIDOR ? r2(datos.cuotaFija) : 0,
    ultimaLectura: tipo === CON_MEDIDOR ? r1(datos.ultimaLectura) : null,
    activo: datos.activo !== false,
    notas: String(datos.notas || '').trim(),
  }
}

export async function createSupply(businessId, datos) {
  try {
    const payload = limpiarSuministro(datos)
    if (!payload.nombre) return { success: false, error: 'Falta el nombre del usuario' }
    const ref = await addDoc(ruta(businessId, 'serviceSupplies'), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true, data: { id: ref.id, ...payload } }
  } catch (error) {
    console.error('createSupply:', error)
    return { success: false, error: error.message }
  }
}

export async function updateSupply(businessId, id, datos) {
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'serviceSupplies', id), {
      ...limpiarSuministro(datos),
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('updateSupply:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Da de baja un suministro sin borrarlo: sus recibos de meses anteriores
 * tienen que seguir existiendo.
 */
export async function deactivateSupply(businessId, id) {
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'serviceSupplies', id), {
      activo: false,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('deactivateSupply:', error)
    return { success: false, error: error.message }
  }
}

/** Solo para deshacer un alta recién hecha. */
export async function deleteSupply(businessId, id) {
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'serviceSupplies', id))
    return { success: true }
  } catch (error) {
    console.error('deleteSupply:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Alta masiva, para la carga inicial del padrón.
 *
 * En lotes de 400 porque un `writeBatch` acepta 500 operaciones: el padrón del
 * primer negocio son 179 suministros, pero otro puede traer mil.
 */
export async function createSuppliesBulk(businessId, filas) {
  try {
    const limpias = filas.map(limpiarSuministro).filter(s => s.nombre)
    for (let i = 0; i < limpias.length; i += 400) {
      const lote = writeBatch(db)
      for (const s of limpias.slice(i, i + 400)) {
        lote.set(doc(ruta(businessId, 'serviceSupplies')), {
          ...s,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      await lote.commit()
    }
    return { success: true, data: { creados: limpias.length } }
  } catch (error) {
    console.error('createSuppliesBulk:', error)
    return { success: false, error: error.message }
  }
}

// ───────────────────────────────────────────────────────────────── periodos

/**
 * El periodo se guarda con la clave del mes como ID ("2026-07").
 *
 * Así abrir dos veces el mismo mes no crea dos periodos: el segundo pisa al
 * primero en vez de duplicarlo, que es lo que pasaría con un ID automático si
 * dos personas abren el mes a la vez.
 */
export async function getPeriod(businessId, clave) {
  try {
    const snap = await getDoc(doc(db, 'businesses', businessId, 'servicePeriods', clave))
    return { success: true, data: snap.exists() ? { id: snap.id, ...snap.data() } : null }
  } catch (error) {
    console.error('getPeriod:', error)
    return { success: false, error: error.message }
  }
}

export async function getPeriods(businessId) {
  try {
    const snap = await getDocs(query(ruta(businessId, 'servicePeriods'), orderBy('__name__', 'desc')))
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('getPeriods:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Abre o actualiza el periodo con los datos del recibo mayorista.
 *
 * `merge: true` para no perder el estado ni la fecha de apertura cuando se
 * corrige el importe del recibo a mitad de mes.
 */
export async function savePeriod(businessId, clave, datos) {
  try {
    await setDoc(
      doc(db, 'businesses', businessId, 'servicePeriods', clave),
      {
        periodo: clave,
        desde: datos.desde || '',
        hasta: datos.hasta || '',
        reciboKwh: Number(datos.reciboKwh) || 0,
        reciboSoles: r2(datos.reciboSoles),
        // Congelados: los recibos ya emitidos se calcularon con estos números.
        tarifa: Number(datos.tarifa) || 0,
        minimoImporte: r2(datos.minimoImporte),
        cargoFijo: r2(datos.cargoFijo),
        vencimiento: datos.vencimiento || '',
        cerrado: datos.cerrado === true,
        updatedAt: serverTimestamp(),
        ...(datos.createdAt ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true },
    )
    return { success: true }
  } catch (error) {
    console.error('savePeriod:', error)
    return { success: false, error: error.message }
  }
}

// ───────────────────────────────────────────────────────────────── lecturas

/**
 * Las lecturas del mes, indexadas por suministro.
 *
 * Se guardan como una subcolección del periodo y no dentro del documento: 179
 * lecturas en un solo documento chocarían con el límite de 1 MB de Firestore
 * el día que el padrón crezca, y dos personas tomando lecturas a la vez se
 * pisarían la una a la otra.
 */
export async function getReadings(businessId, clave) {
  try {
    const snap = await getDocs(
      collection(db, 'businesses', businessId, 'servicePeriods', clave, 'readings'),
    )
    const porSuministro = {}
    for (const d of snap.docs) porSuministro[d.id] = { id: d.id, ...d.data() }
    return { success: true, data: porSuministro }
  } catch (error) {
    console.error('getReadings:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Guarda las lecturas tomadas y deja la última lectura en cada suministro.
 *
 * Las dos cosas van en el MISMO lote: si se guardara la lectura del periodo y
 * fallara la del suministro, el mes siguiente arrancaría desde una lectura
 * anterior vieja y cobraría el consumo dos veces.
 *
 * @param {Array} lecturas `[{ supplyId, lecturaAnterior, lecturaActual, consumo, medidorNuevo }]`
 */
export async function saveReadings(businessId, clave, lecturas) {
  try {
    const utiles = lecturas.filter(l => l?.supplyId)
    for (let i = 0; i < utiles.length; i += 200) {
      const lote = writeBatch(db)
      for (const l of utiles.slice(i, i + 200)) {
        lote.set(
          doc(db, 'businesses', businessId, 'servicePeriods', clave, 'readings', l.supplyId),
          {
            lecturaAnterior: l.lecturaAnterior === null ? null : r1(l.lecturaAnterior),
            lecturaActual: l.lecturaActual === null ? null : r1(l.lecturaActual),
            consumo: l.consumo === null ? null : r1(l.consumo),
            medidorNuevo: l.medidorNuevo === true,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        // Cada operación del lote cuenta: 200 lecturas son 400 escrituras, justo
        // debajo del límite de 500.
        if (l.lecturaActual !== null && l.lecturaActual !== undefined) {
          lote.update(doc(db, 'businesses', businessId, 'serviceSupplies', l.supplyId), {
            ultimaLectura: r1(l.lecturaActual),
            ultimoPeriodo: clave,
            updatedAt: serverTimestamp(),
          })
        }
      }
      await lote.commit()
    }
    return { success: true, data: { guardadas: utiles.length } }
  } catch (error) {
    console.error('saveReadings:', error)
    return { success: false, error: error.message }
  }
}

// ────────────────────────────────────────────────────────────────── recibos

export async function getReceipts(businessId, clave) {
  try {
    const snap = await getDocs(
      query(ruta(businessId, 'serviceReceipts'), where('periodo', '==', clave)),
    )
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    lista.sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0))
    return { success: true, data: lista }
  } catch (error) {
    console.error('getReceipts:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Emite los recibos del periodo.
 *
 * ── El correlativo ──────────────────────────────────────────────────────────
 * Los recibos van numerados de corrido, como el talonario de papel que
 * reemplazan —el primer negocio venía por el N° 133—. El número se reserva en
 * una transacción que sube el contador del negocio: si la emisión falla, los
 * números no se consumen y no quedan saltos.
 *
 * Se reserva un BLOQUE de N números de una sola vez y no uno por recibo: son
 * 179 recibos por mes, y 179 transacciones seguidas contra el mismo documento
 * se pelean entre ellas y tardan minutos.
 *
 * ── Por qué no se puede emitir dos veces ────────────────────────────────────
 * Cada recibo se guarda con un ID armado a mano —`{periodo}_{supplyId}`— en vez
 * de uno automático. Si alguien toca "Generar" dos veces, el segundo intento
 * pisa el mismo documento en lugar de crear un recibo gemelo con otro número.
 *
 * @param {Array} recibos `[{ supplyId, nombre, ..., total }]` ya calculados.
 * @param {object} opciones `{ desde }` número inicial, solo la primera vez.
 */
export async function emitReceipts(businessId, clave, recibos, { desde = null } = {}) {
  try {
    const utiles = (recibos || []).filter(r => r?.supplyId)
    if (utiles.length === 0) return { success: false, error: 'No hay recibos para emitir' }

    // Los que ya existen conservan su número: reemitir el mes no debe renumerar
    // lo que el vecino ya tiene en la mano.
    const existentes = await getReceipts(businessId, clave)
    const numeroPrevio = {}
    if (existentes.success) {
      for (const r of existentes.data) {
        if (r.estado !== ANULADO) numeroPrevio[r.supplyId] = r.numero
      }
    }
    const nuevos = utiles.filter(r => numeroPrevio[r.supplyId] === undefined)

    let primerNumero = 0
    if (nuevos.length > 0) {
      const businessRef = doc(db, 'businesses', businessId)
      primerNumero = await runTransaction(db, async (tx) => {
        const snap = await tx.get(businessRef)
        const actual = Number(snap.data()?.serviceReceiptCounter) || 0
        // `desde` solo manda la primera vez: después el contador es la verdad,
        // para que un valor viejo en un formulario no reinicie la numeración.
        const base = actual > 0 ? actual : Math.max(Number(desde) || 0, 0)
        tx.update(businessRef, { serviceReceiptCounter: base + nuevos.length })
        return base + 1
      })
    }

    let siguiente = primerNumero
    for (let i = 0; i < utiles.length; i += 400) {
      const lote = writeBatch(db)
      for (const r of utiles.slice(i, i + 400)) {
        const numero = numeroPrevio[r.supplyId] ?? siguiente++
        lote.set(
          doc(db, 'businesses', businessId, 'serviceReceipts', `${clave}_${r.supplyId}`),
          {
            periodo: clave,
            numero,
            supplyId: r.supplyId,
            tipo: r.tipo,
            nombre: r.nombre || '',
            numeroSuministro: r.numeroSuministro || '',
            direccion: r.direccion || '',
            referencia: r.referencia || '',
            lecturaAnterior: r.lecturaAnterior ?? null,
            lecturaActual: r.lecturaActual ?? null,
            consumo: r.consumo ?? null,
            tarifa: Number(r.tarifa) || 0,
            importeConsumo: r2(r.importeConsumo),
            cargoFijo: r2(r.cargoFijo),
            aplicoMinimo: r.aplicoMinimo === true,
            total: r2(r.total),
            vencimiento: r.vencimiento || '',
            estado: PENDIENTE,
            updatedAt: serverTimestamp(),
          },
          // `merge` para no borrar el cobro si el recibo ya estaba pagado y se
          // vuelve a generar el mes por otra razón.
          { merge: true },
        )
      }
      await lote.commit()
    }

    return { success: true, data: { emitidos: utiles.length, nuevos: nuevos.length } }
  } catch (error) {
    console.error('emitReceipts:', error)
    return { success: false, error: error.message }
  }
}

/** Marca un recibo como cobrado. El movimiento de caja lo hace la pantalla. */
export async function payReceipt(businessId, receiptId, { metodo, userId, userName }) {
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'serviceReceipts', receiptId), {
      estado: PAGADO,
      metodoPago: metodo || 'Efectivo',
      pagadoEn: serverTimestamp(),
      pagadoPor: userId || '',
      pagadoPorNombre: userName || '',
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('payReceipt:', error)
    return { success: false, error: error.message }
  }
}

/** Deshace un cobro mal registrado. */
export async function unpayReceipt(businessId, receiptId) {
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'serviceReceipts', receiptId), {
      estado: PENDIENTE,
      metodoPago: null,
      pagadoEn: null,
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('unpayReceipt:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Anula un recibo sin borrarlo: el número queda consumido a propósito, igual
 * que en un talonario de papel, para que la numeración no tenga huecos.
 */
export async function voidReceipt(businessId, receiptId, motivo = '') {
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'serviceReceipts', receiptId), {
      estado: ANULADO,
      motivoAnulacion: String(motivo || '').trim(),
      anuladoEn: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return { success: true }
  } catch (error) {
    console.error('voidReceipt:', error)
    return { success: false, error: error.message }
  }
}

/** Los recibos pendientes de un suministro, de cualquier mes. */
export async function getPendingReceipts(businessId, supplyId) {
  try {
    const snap = await getDocs(query(
      ruta(businessId, 'serviceReceipts'),
      where('supplyId', '==', supplyId),
      where('estado', '==', PENDIENTE),
    ))
    return { success: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (error) {
    console.error('getPendingReceipts:', error)
    return { success: false, error: error.message }
  }
}
