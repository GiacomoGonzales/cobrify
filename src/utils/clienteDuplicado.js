/**
 * Un documento identifica a UN cliente.
 *
 * Un negocio registró dos veces el mismo RUC porque el local tenía otro nombre
 * comercial: "GRUPO GASTRONÓMICO MADAM" y "LOS POLLITOS" con el RUC
 * 20613631993 (8-set-2026). Con dos fichas, el historial de compras, la deuda
 * y los pagos pendientes quedan partidos en dos, y al emitir se elige una de
 * las dos sin criterio. Para eso están las SEDES de la ficha: varios nombres
 * comerciales y direcciones bajo un mismo RUC.
 *
 * Hay documentos que NO identifican a nadie y pueden repetirse cuantas veces
 * haga falta: el vacío, que es la ficha de contacto sin documento que abre una
 * cita o una atención, y el 00000000 del consumidor final de una boleta.
 *
 * El criterio se usa en los dos lados: el formulario avisa al instante contra
 * la lista que ya tiene cargada, y `createCustomer` es la guarda de verdad,
 * porque un cliente también nace desde cotizaciones, la agenda veterinaria y
 * la importación de Excel.
 */
import { esRuc } from './documentType'

/** El documento con el que se compara: sin espacios, puntos ni guiones. */
export function documentoDeCliente(cliente) {
  const crudo = typeof cliente === 'string' ? cliente : cliente?.documentNumber
  return String(crudo || '').replace(/[\s.-]/g, '').trim()
}

/** Falso para el vacío y para los que son todo ceros. */
export function identificaAUnCliente(documento) {
  const d = documentoDeCliente(documento)
  return d.length > 0 && !/^0+$/.test(d)
}

/**
 * El cliente ya registrado con ese mismo documento, o null.
 *
 * `idQueSeEdita` deja fuera la ficha que se está editando: volver a guardarla
 * no es duplicarla.
 */
export function clienteConElMismoDocumento(clientes, documento, idQueSeEdita = null) {
  if (!identificaAUnCliente(documento)) return null
  const buscado = documentoDeCliente(documento)
  const lista = Array.isArray(clientes) ? clientes : []
  return lista.find((c) => c && c.id !== idQueSeEdita && documentoDeCliente(c) === buscado) || null
}

/**
 * Qué decirle a quien intenta guardar el duplicado. Con RUC se le ofrece la
 * salida real, que es la sede, en vez de solo negarle el guardado.
 */
export function avisoDeDuplicado(existente) {
  const nombre = String(existente?.businessName || existente?.name || '').trim()
  const quien = nombre ? `: ${nombre}` : ''
  if (esRuc(existente?.documentType, documentoDeCliente(existente))) {
    return `Ya tienes un cliente con ese RUC${quien}. Si es otro local o nombre comercial del mismo cliente, agrégalo en su ficha, en "Sedes y direcciones de entrega", en vez de crear otra ficha.`
  }
  return `Ya tienes un cliente con ese documento${quien}. Abre su ficha para editarla en vez de crear otra.`
}
