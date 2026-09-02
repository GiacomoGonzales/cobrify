/**
 * Código de cliente y rubro.
 *
 * El código es un correlativo para personas (tú, tu equipo, el cliente): se
 * asigna UNA vez, arranca en 1000001 y no cambia aunque cambie el nombre, el
 * RUC, el dueño o el plan. No reemplaza el uid: es para leerlo y dictarlo.
 *
 * Vive en el servidor (Admin SDK) a propósito: lo entrega una transacción
 * sobre `contadores/clientes`, así dos altas al mismo tiempo nunca reciben el
 * mismo número. El cliente no puede escribirlo (ver firestore.rules).
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { rubros } = require('../data/rubros.json')

export const PRIMER_CODIGO_CLIENTE = 1000001

/** Siguiente código libre. Úsalo dentro de una transacción `tx`. */
export async function siguienteCodigoCliente(db, tx) {
  const ref = db.collection('contadores').doc('clientes')
  const snap = await tx.get(ref)
  const ultimo = snap.exists ? Number(snap.data().ultimo || 0) : 0
  const siguiente = Math.max(ultimo + 1, PRIMER_CODIGO_CLIENTE)
  tx.set(ref, { ultimo: siguiente, actualizadoEn: new Date() }, { merge: true })
  return siguiente
}

/** Sin tildes y en mayúsculas, que es como compara SUNAT. */
export const normalizarTexto = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()

/**
 * Propone un rubro a partir del texto de actividad económica de SUNAT.
 * Devuelve el id del rubro o null si nada calza (queda "sin clasificar").
 * Los patrones más específicos van antes en el catálogo; "otro-comercio"
 * (VENTA AL POR MENOR) va al final para no ganarle a ferretería o ropa.
 */
export function sugerirRubro(actividadSunat) {
  const texto = normalizarTexto(actividadSunat)
  if (!texto) return null
  for (const r of rubros) {
    if (r.id === 'otro-comercio') continue
    if (r.patronesSunat.some((p) => texto.includes(normalizarTexto(p)))) return r.id
  }
  const generico = rubros.find((r) => r.id === 'otro-comercio')
  if (generico && generico.patronesSunat.some((p) => texto.includes(normalizarTexto(p)))) return generico.id
  return null
}

export const catalogoRubros = rubros
