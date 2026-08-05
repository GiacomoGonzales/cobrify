// Qué comprobantes puede emitir el Punto de Venta.
//
// Hay TRES restricciones que se acumulan y antes vivían sueltas, repetidas en
// cada sitio del POS que decide un tipo de comprobante (estado inicial, efecto
// de corrección, default del negocio, reset tras la venta y el <select>). Con
// cinco copias, agregar una cuarta restricción significaba tocar las cinco.
//
//   1. NEGOCIO  (`businessSettings.enabledDocumentTypes`): qué emite la empresa.
//      Un negocio en el RUS no puede emitir facturas, así que las desactiva.
//   2. USUARIO  (`allowedDocumentTypes` del sub-usuario): permiso individual.
//   3. SUNAT    (`canEmitFiscal`): sin conexión solo queda la Nota de Venta,
//      que no es un comprobante electrónico.
//
// En 1 y 2, **vacío significa "todos"** — es la semántica que ya tenía el
// permiso de sub-usuario y cambiarla dejaría sin comprobantes a todos los
// negocios que nunca tocaron la opción.

export const DOCUMENT_TYPES = ['boleta', 'factura', 'nota_venta']

export const DOCUMENT_TYPE_LABELS = {
  boleta: 'Boleta de Venta',
  factura: 'Factura Electrónica',
  nota_venta: 'Nota de Venta',
}

/** Comprobantes realmente disponibles, aplicando las tres restricciones. */
export const getAvailableDocumentTypes = ({
  enabledForBusiness = null,
  allowedForUser = null,
  canEmitFiscal = true,
} = {}) => {
  let tipos = [...DOCUMENT_TYPES]

  if (Array.isArray(enabledForBusiness) && enabledForBusiness.length > 0) {
    tipos = tipos.filter(t => enabledForBusiness.includes(t))
  }
  if (Array.isArray(allowedForUser) && allowedForUser.length > 0) {
    tipos = tipos.filter(t => allowedForUser.includes(t))
  }
  // Boleta y factura son electrónicos: sin conexión SUNAT no se pueden emitir.
  if (!canEmitFiscal) {
    tipos = tipos.filter(t => t === 'nota_venta')
  }

  return tipos
}

/** ¿Este tipo está disponible? */
export const isDocumentTypeAvailable = (tipo, opciones) =>
  getAvailableDocumentTypes(opciones).includes(tipo)

/**
 * Tipo a usar cuando el deseado no está disponible.
 * Devuelve '' si no queda ninguno: el POS ya trata '' como "sin seleccionar" y
 * el checkout lo bloquea, que es preferible a forzar un tipo no permitido.
 */
export const resolveDocumentType = (deseado, opciones) => {
  const disponibles = getAvailableDocumentTypes(opciones)
  if (deseado && disponibles.includes(deseado)) return deseado
  return disponibles[0] || ''
}
