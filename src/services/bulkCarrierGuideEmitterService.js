/**
 * EMISIÓN MASIVA — motor de emisión del lote de GRE TRANSPORTISTA.
 *
 * EN SERIE Y CON RITMO, nunca en ráfaga: la lección de LA PATOTA es que meter
 * decenas de envíos seguidos contra SUNAT despierta al WAF (504 selectivos que
 * dejan documentos en el limbo). Una guía a la vez, con pausa entre envíos.
 *
 * IDEMPOTENTE por archivo+operación: cada guía creada lleva un `bulkKey`
 * (huella del archivo + número de operación). Si el usuario vuelve a subir el
 * mismo archivo y emite de nuevo — porque se cortó la luz a mitad del lote —
 * las operaciones que ya tienen guía se OMITEN en lugar de duplicarse.
 *
 * La creación usa createCarrierDispatchGuide (numeración atómica de
 * 'guia_transportista') y el envío la MISMA Cloud Function del botón
 * individual: cero caminos nuevos hacia SUNAT.
 */
import { collection, query, where, limit, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { createCarrierDispatchGuide, sendCarrierDispatchGuideToSunat } from './firestoreService'

/** Pausa entre envíos a SUNAT. */
const PAUSA_ENTRE_ENVIOS_MS = 2500

/**
 * Huella corta y estable de un texto (djb2 en base36). No es criptográfica ni
 * lo necesita: solo evita que el MISMO archivo re-emita la MISMA operación.
 */
export const huellaDe = (texto) => {
  let h = 5381
  const s = String(texto)
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Huella del lote: nombre del archivo + contenido normalizado de las operaciones. */
export const huellaDelLote = (nombreArchivo, operaciones) =>
  huellaDe(nombreArchivo + '|' + JSON.stringify(operaciones.map((o) => [o.nOperacion, o.guia])))

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Emite el lote de guías transportista, una por una.
 *
 * @param {string} businessId
 * @param {Array}  operaciones - SOLO las operaciones sin errores del parser
 * @param {object} opts
 * @param {string}   opts.loteKey     - huella del archivo (huellaDelLote)
 * @param {string}   [opts.mtcRegistration] - registro MTC del negocio (de su configuración)
 * @param {string}   [opts.branchId]  - sucursal activa (numeración por sede)
 * @param {Function} [opts.onProgress] - ({ indice, total, nOperacion, etapa, numero }) por paso
 * @param {Function} [opts.debeCancelar] - () => boolean; se consulta entre guías
 * @returns {Promise<{resultados: Array, resumen: object}>}
 *
 * Cada resultado: { nOperacion, numero, estado, mensaje }
 *   estado: 'aceptada' | 'rechazada' | 'error_envio' | 'error_creacion' | 'omitida' | 'cancelada'
 * Una guía creada cuyo envío falla QUEDA CREADA con sunatStatus pending: se
 * reenvía desde la pantalla de GRE Transportista, nunca se duplica desde acá.
 */
export async function emitirLoteGreTransportista(businessId, operaciones, {
  loteKey,
  mtcRegistration = '',
  branchId = null,
  onProgress = null,
  debeCancelar = null,
} = {}) {
  const resultados = []
  const total = operaciones.length
  const ref = collection(db, 'businesses', businessId, 'carrierDispatchGuides')

  for (let i = 0; i < total; i++) {
    const op = operaciones[i]
    const avisar = (etapa, extra = {}) => {
      try { onProgress?.({ indice: i, total, nOperacion: op.nOperacion, etapa, ...extra }) } catch { /* la UI nunca frena el lote */ }
    }

    if (debeCancelar?.()) {
      resultados.push({ nOperacion: op.nOperacion, numero: null, estado: 'cancelada', mensaje: 'Cancelado por el usuario antes de emitir esta guía.' })
      continue
    }

    const bulkKey = `gret_${loteKey}_${op.nOperacion}`

    try {
      // ── Idempotencia: ¿esta operación de este archivo ya tiene guía? ──
      avisar('verificando')
      const previa = await getDocs(query(ref, where('bulkKey', '==', bulkKey), limit(1)))
      if (!previa.empty) {
        const g = previa.docs[0].data()
        resultados.push({
          nOperacion: op.nOperacion,
          numero: g.number || null,
          estado: 'omitida',
          mensaje: `Ya se emitió antes desde este mismo archivo (${g.number || 'sin número'}). No se duplica.`,
        })
        avisar('omitida', { numero: g.number })
        continue
      }

      // ── Crear la guía (numeración atómica) ──
      avisar('creando')
      const creacion = await createCarrierDispatchGuide(businessId, {
        ...op.guia,
        mtcRegistration,
        ...(branchId ? { branchId } : {}),
        bulkKey,
        bulkSource: 'excel',
      })
      if (!creacion.success) {
        resultados.push({ nOperacion: op.nOperacion, numero: null, estado: 'error_creacion', mensaje: creacion.error || 'No se pudo crear la guía.' })
        avisar('error', { mensaje: creacion.error })
        continue
      }

      // ── Enviar a SUNAT (la misma función del botón individual) ──
      avisar('enviando', { numero: creacion.number })
      const envio = await sendCarrierDispatchGuideToSunat(businessId, creacion.id)

      if (envio.success && envio.accepted) {
        resultados.push({ nOperacion: op.nOperacion, numero: creacion.number, estado: 'aceptada', mensaje: envio.description || 'Aceptada por SUNAT.' })
        avisar('aceptada', { numero: creacion.number })
      } else if (envio.success && !envio.accepted) {
        resultados.push({ nOperacion: op.nOperacion, numero: creacion.number, estado: 'rechazada', mensaje: envio.description || envio.error || 'Rechazada por SUNAT.' })
        avisar('rechazada', { numero: creacion.number, mensaje: envio.description })
      } else {
        // La guía existe con estado pending: se reintenta desde GRE
        // Transportista. Reintentar acá arriesgaría el resto del lote.
        resultados.push({
          nOperacion: op.nOperacion,
          numero: creacion.number,
          estado: 'error_envio',
          mensaje: `${envio.error || 'No se pudo enviar.'} La guía ${creacion.number} quedó creada: reenvíala desde GRE Transportista.`,
        })
        avisar('error', { numero: creacion.number, mensaje: envio.error })
      }
    } catch (e) {
      console.error(`[LoteGRE-T] Operación ${op.nOperacion}:`, e)
      resultados.push({ nOperacion: op.nOperacion, numero: null, estado: 'error_creacion', mensaje: e.message || 'Error inesperado.' })
      avisar('error', { mensaje: e.message })
    }

    // Ritmo: pausa entre guías (no después de la última)
    if (i < total - 1) await esperar(PAUSA_ENTRE_ENVIOS_MS)
  }

  const cuenta = (estado) => resultados.filter((r) => r.estado === estado).length
  return {
    resultados,
    resumen: {
      total,
      aceptadas: cuenta('aceptada'),
      rechazadas: cuenta('rechazada'),
      conError: cuenta('error_envio') + cuenta('error_creacion'),
      omitidas: cuenta('omitida'),
      canceladas: cuenta('cancelada'),
    },
  }
}
