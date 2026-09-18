/**
 * DIAGNÓSTICO DE LA APP: qué le pasa al POS cuando la app se va a segundo
 * plano y vuelve. Pedido de Giacomo el 17-set-2026.
 *
 * Por qué existe: en Mandil y en Vapores y Delicias, desde iPads, una mesa
 * quedó sellada con la boleta de otra venta (commit 2a45b066). El iPad era el
 * DISPARADOR: la app "vuelve a medias" —el tipo de comprobante dice una cosa y
 * por dentro es otra, el carrito vuelve y la mesa no— y el cajero la "arregla"
 * a ciegas. Antes de tocar más nada hay que VER qué pasa en el local, con
 * datos, en vez de apilar teorías (tres ya cayeron al mirar la evidencia).
 *
 * Una app puede volver de cuatro maneras, y cada una deja rastros distintos:
 *
 *   1. SIN RECARGAR: solo estaba pausada y el JS siguió vivo. Se compara la
 *      foto de antes de dormir con la de ahora (`vuelta-con-cambios`).
 *   2. RECARGA PROPIA: la app se recarga a sí misma. AppLifecycleManager lo
 *      hace en iOS tras 5 min en segundo plano —en un restaurante, TODO el
 *      día— y también la actualización automática. Quien recarga llama antes
 *      a `marcarRecargaPropia`, así que al arrancar se sabe que fue ella.
 *   3. RECARGA DEL SISTEMA: iOS mató el proceso web por memoria y Capacitor lo
 *      recargó en silencio (WebViewDelegationHandler: `reset()` + `reload()`,
 *      sin avisar a nadie). Se ve como una navegación 'reload' sin marca.
 *   4. RELANZADA: el sistema cerró la app entera y al abrirla arrancó de cero
 *      (navegación 'navigate') con la foto de antes todavía guardada.
 *
 * En los cuatro se compara la FOTO del POS de antes de dormir con la de
 * después, y lo que importa queda en `businesses/{id}/diagnosticosApp` para
 * leerlo desde la ficha del admin.
 *
 * Lo de este archivo es puro (se prueba en node); quien escucha los eventos es
 * components/DiagnosticoApp.jsx y quien escribe, diagnosticoAppService.js.
 */

export const CLAVE_FOTO = 'cobrify:diag:antesDeDormir'
export const CLAVE_RECARGA_PROPIA = 'cobrify:diag:recargaPropia'

// Una foto más vieja que esto ya no dice nada del arranque de ahora.
export const VIGENCIA_FOTO_MS = 12 * 60 * 60 * 1000
// La marca de recarga propia se escribe un instante antes de recargar.
export const VIGENCIA_MARCA_MS = 60 * 1000

// ── El estado del POS, publicado por el propio POS ─────────────────────────
// Un simple valor de módulo: el POS lo actualiza cuando cambia algo que
// importa y lo pone en null al desmontarse. Fuera del POS no hay foto.
let estadoDelPOS = null
export const publicarEstadoDelPOS = (estado) => { estadoDelPOS = estado }
export const leerEstadoDelPOS = () => estadoDelPOS

// ── Almacenamiento que sobrevive a la recarga ──────────────────────────────
// localStorage y no sessionStorage: cuando iOS mata el proceso web, lo de
// sesión no está garantizado, y es justo el caso que se quiere ver.
export function guardar(clave, valor, almacen = globalThis.localStorage) {
  try { almacen?.setItem(clave, JSON.stringify(valor)) } catch { /* sin almacenamiento: sin diagnóstico */ }
}

export function leerYBorrar(clave, almacen = globalThis.localStorage) {
  try {
    const crudo = almacen?.getItem(clave)
    if (crudo == null) return null
    almacen.removeItem(clave)
    return JSON.parse(crudo)
  } catch {
    return null
  }
}

/** Se llama un instante antes de que la app se recargue a sí misma. */
export function marcarRecargaPropia(motivo, extra = {}, almacen = globalThis.localStorage) {
  guardar(CLAVE_RECARGA_PROPIA, { motivo, at: Date.now(), ...extra }, almacen)
}

/** 'navigate', 'reload', 'back_forward' o null si el navegador no lo sabe. */
export function tipoDeNavegacion(perf = globalThis.performance) {
  try {
    return perf?.getEntriesByType?.('navigation')?.[0]?.type || null
  } catch {
    return null
  }
}

const tieneAlgoEnCurso = (pos) => Boolean(pos && ((pos.items || 0) > 0 || pos.orden || pos.mesa))

/**
 * Qué fue este arranque. null = uno normal, nada que comparar.
 *
 * @param {{navegacion: string|null, foto: object|null, marca: object|null,
 *          actualizacionAutomatica?: boolean, ahora: number}} datos
 * @returns {{tipo: string, motivo: string|null, segundosDormida: number|null} | null}
 */
export function clasificarArranque({ navegacion, foto, marca, actualizacionAutomatica = false, ahora }) {
  if (!foto?.at || ahora - foto.at > VIGENCIA_FOTO_MS) return null
  const segundosDormida = Math.round((ahora - foto.at) / 1000)

  if (marca?.at && ahora - marca.at <= VIGENCIA_MARCA_MS) {
    return { tipo: 'recarga-propia', motivo: marca.motivo || null, segundosDormida }
  }
  if (actualizacionAutomatica) {
    return { tipo: 'recarga-propia', motivo: 'actualizacion-automatica', segundosDormida }
  }
  if (navegacion === 'navigate') {
    return { tipo: 'relanzada', motivo: null, segundosDormida }
  }
  // 'reload' o 'back_forward' sin marca propia: la recargó el sistema.
  return { tipo: 'recarga-del-sistema', motivo: navegacion || null, segundosDormida }
}

/**
 * ¿Vale la pena guardarlo? En la app nativa, SIEMPRE: cuántas veces el iPad
 * se recarga es justo lo que se está midiendo. En el navegador, cerrar una
 * pestaña y abrir otra es normal: solo si había una venta o una mesa a medias.
 */
export function debeRegistrarse(clasificacion, { nativa, foto }) {
  if (!clasificacion) return false
  if (nativa) return true
  return tieneAlgoEnCurso(foto?.pos)
}

const nombreDeMesa = (pos) => (pos?.mesa ? `MESA ${pos.mesa}` : pos?.orden ? 'una orden' : 'ninguna')
const tipoLegible = (t) => ({
  boleta: 'boleta', factura: 'factura', nota_venta: 'nota de venta',
})[t] || (t ? t : 'sin elegir')

/**
 * Qué cambió en el POS entre la foto de antes de dormir y la de después, en
 * palabras. Vacío = volvió igual. Es lo que se lee en la ficha del admin.
 */
export function diferencias(antes, despues) {
  if (!antes && !despues) return []
  if (antes && !despues) return ['el POS ya no estaba abierto al volver']
  if (!antes && despues) return []
  const cambios = []
  if ((antes.orden || null) !== (despues.orden || null) || (antes.mesa || null) !== (despues.mesa || null)) {
    cambios.push(`la mesa cambió: ${nombreDeMesa(antes)} → ${nombreDeMesa(despues)}`)
  }
  if ((antes.tipo || null) !== (despues.tipo || null)) {
    cambios.push(`el comprobante cambió: ${tipoLegible(antes.tipo)} → ${tipoLegible(despues.tipo)}`)
  }
  if ((antes.items || 0) !== (despues.items || 0) || Number(antes.total || 0) !== Number(despues.total || 0)) {
    cambios.push(`el carrito cambió: ${antes.items || 0} productos (S/ ${Number(antes.total || 0).toFixed(2)}) → ${despues.items || 0} (S/ ${Number(despues.total || 0).toFixed(2)})`)
  }
  if ((antes.emisor || 'principal') !== (despues.emisor || 'principal')) {
    cambios.push(`el RUC cambió: ${antes.emisor || 'principal'} → ${despues.emisor || 'principal'}`)
  }
  return cambios
}

/** La foto del POS que se guarda: sin datos del cliente, solo lo que hace falta comparar. */
export function fotoDelPOS({ documentType, cart = [], total = 0, tableData = null, pendingOrderId = null, emisorId = null }) {
  return {
    tipo: documentType || null,
    items: cart.length,
    total: Math.round((Number(total) || 0) * 100) / 100,
    mesa: tableData?.tableNumber ?? null,
    orden: pendingOrderId || null,
    emisor: emisorId || 'principal',
    productos: cart.slice(0, 10).map(i => ({ n: String(i.name || '').slice(0, 60), c: Number(i.quantity) || 0 })),
  }
}
