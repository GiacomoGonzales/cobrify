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

import { normalizarTexto, rubroPorActividad, sugerirRubroDeCuenta } from '../data/clasificador.js'

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

/**
 * Las reglas para adivinar el rubro viven en `../data/clasificador.js`, junto
 * al catálogo, porque las usa también el admin en el navegador. Aquí solo se
 * les pasa el catálogo ya cargado.
 */
export { normalizarTexto }

/**
 * Propone un rubro a partir del texto de actividad económica de SUNAT.
 * Se mantiene por si algún día conseguimos esa actividad de otra fuente:
 * apiperu.dev no la entrega. Devuelve el id del rubro o null.
 */
export const sugerirRubro = (actividadSunat) => rubroPorActividad(rubros, actividadSunat)

/** La sugerencia buena: nombre del negocio + modo (+ actividad si la hubiera). */
export const sugerirRubroDeNegocio = (negocio) => sugerirRubroDeCuenta(rubros, negocio)

export const catalogoRubros = rubros
