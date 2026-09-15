/**
 * NOTA DE VENTA FACTURADA POR PARTES.
 *
 * Un cliente vende con nota de venta (por ejemplo S/ 10,000) y la factura en
 * varias facturas o boletas hasta completarla (pedido del 12-set-2026). Cada
 * comprobante es una PARTE: una tajada proporcional de las mismas líneas de la
 * nota. La nota guarda sus partes en `facturasParciales` y lo facturado en
 * `montoFacturado`; `convertedTo` recién aparece al completarla, con
 * `porPartes: true`. Así todo lo que ya entiende "convertida = ya no suma"
 * sigue funcionando igual para una nota completa.
 *
 * Cuatro preguntas, cuatro criterios, y todos viven acá:
 *   - VENTAS (Ventas, reportes, Dashboard, Vendedores): la venta se cuenta una
 *     sola vez. La nota suma solo lo que falta facturar (`ventaPendienteDe`) y
 *     cada parte suma lo suyo.
 *   - CAJA (Control de Caja, Flujo de Caja): el dinero entró una vez, con la
 *     nota. La nota cuenta entera, aun completa, y las partes no cuentan
 *     (`cuentaEnCaja`, `convertidaDeUnaVez`).
 *   - COMISIÓN: es de la nota, que la congeló entera al venderse. Las partes no
 *     comisionan (utils/commissions): si comisionaran, una nota ya liquidada
 *     volvería a pagarse con sus partes.
 *   - STOCK: lo descontó la nota. Las partes no descuentan (skipStockDeduction)
 *     y anular una parte no devuelve nada.
 *
 * Una parte anulada queda en la lista marcada `anulada`, para que se vea que
 * existió, y deja de contar: su monto y sus cantidades vuelven a la nota.
 *
 * El Convertir de siempre (la nota entera en UN comprobante) comparte lo que
 * tiene sentido compartir: la caja cuenta al documento con el que entró la
 * plata (`cuentaEnCaja`), los productos del turno y el stock son de la nota
 * (`vieneDeUnaNota`) y la comisión pasa al comprobante (utils/commissions).
 */

const DECIMALES_CANTIDAD = 4

const redondear = (n, decimales = 2) => {
  const f = 10 ** decimales
  return Math.round((Number(n) || 0) * f) / f
}

const itemsDe = (nota) => (Array.isArray(nota?.items) ? nota.items : [])

/** El precio de una línea, leído igual que el POS al cargar la nota. */
const precioDe = (item) => Number(item?.unitPrice || item?.price || 0)

/** Las partes que cuentan: las anuladas quedan en la lista pero no suman. */
export function partesVigentes(nota) {
  const partes = Array.isArray(nota?.facturasParciales) ? nota.facturasParciales : []
  return partes.filter((p) => p && !p.anulada)
}

/** ¿Es una nota de venta con al menos una parte vigente? */
export function esNotaPorPartes(doc) {
  return doc?.documentType === 'nota_venta' && partesVigentes(doc).length > 0
}

/** ¿Este comprobante es una parte de una nota de venta? */
export function esParteDeNota(doc) {
  return doc?.convertedFrom?.type === 'nota_venta' && doc.convertedFrom.porPartes === true
}

/** ¿Este comprobante salió de una nota de venta (entera o por partes)? */
export function vieneDeUnaNota(doc) {
  return doc?.convertedFrom?.type === 'nota_venta'
}

/** Ids de las notas de las que salió este comprobante (una, varias o ninguna). */
export function notasDeOrigen(doc) {
  if (!vieneDeUnaNota(doc)) return []
  const cf = doc.convertedFrom
  return Array.isArray(cf.ids) ? cf.ids.filter(Boolean) : (cf.id ? [cf.id] : [])
}

/** ¿La nota ya está cobrada completa? (sin `paymentStatus` = venta al contado de antes) */
export function notaCobrada(doc) {
  if (doc?.status !== 'paid') return false
  return doc.paymentStatus !== 'pending' && doc.paymentStatus !== 'partial'
}

/**
 * ¿La nota se convirtió de UNA vez en un comprobante (el Convertir de siempre)?
 * Una nota completada por partes también tiene `convertedTo`, pero no es lo
 * mismo: su dinero sigue siendo el de la nota y sus partes no entran a caja.
 */
export function convertidaDeUnaVez(doc) {
  return !!doc?.convertedTo && doc.convertedTo.porPartes !== true
}

/** Lo facturado hasta ahora, en la moneda de la nota. */
export function montoFacturado(nota) {
  return redondear(partesVigentes(nota).reduce((s, p) => s + (Number(p.monto) || 0), 0))
}

/** Lo que falta facturar, en la moneda de la nota. */
export function montoPendiente(nota) {
  return Math.max(0, redondear((Number(nota?.total) || 0) - montoFacturado(nota)))
}

/** Qué parte de la nota falta facturar, de 0 a 1. */
export function fraccionPendiente(nota) {
  const total = Number(nota?.total) || 0
  if (total <= 0) return 0
  return Math.min(1, montoPendiente(nota) / total)
}

/**
 * Cuánto de este comprobante cuenta como VENTA, de 0 a 1.
 *
 * Solo cambia algo para una nota que se está facturando por partes: cuenta lo
 * que falta facturar, porque lo demás ya lo cuentan sus partes, y completa no
 * cuenta nada. Cualquier otro comprobante cuenta entero. Una nota convertida de
 * una vez la sigue excluyendo cada lector con su `convertedTo`, como siempre.
 */
export function factorDeVenta(doc) {
  if (!esNotaPorPartes(doc)) return 1
  if (doc.convertedTo) return 0
  return fraccionPendiente(doc)
}

/**
 * ¿Este comprobante cuenta en la CAJA?
 *
 * El dinero de una venta entra UNA vez. Cuando una nota se convierte en boleta
 * o factura, la caja cuenta al documento con el que entró la plata:
 *   - Una parte de una nota: no cuenta, entró con la nota.
 *   - Convertido de una nota que YA estaba cobrada: no cuenta, por lo mismo. Lo
 *     dice la marca `cobradaEnNota`, que el POS pone al convertir. Sin marca
 *     —una conversión anterior a esta regla, o una nota al crédito que recién
 *     se cobró al convertirla— cuenta él, como siempre.
 *   - Una nota convertida: cuenta si su plata entró con ella (misma marca en
 *     `convertedTo`, o completada por partes). Si no, cuenta su comprobante.
 * Así una nota cobrada en una caja ya cerrada no vuelve a sumar en la caja del
 * día en que se convierte.
 */
export function cuentaEnCaja(doc) {
  if (!doc) return false
  if (vieneDeUnaNota(doc)) {
    return doc.convertedFrom.porPartes !== true && doc.convertedFrom.cobradaEnNota !== true
  }
  if (doc.documentType === 'nota_venta' && doc.convertedTo) {
    return doc.convertedTo.porPartes === true || doc.convertedTo.cobradaEnNota === true
  }
  return true
}

/** Cantidad que falta facturar de cada línea de la nota (mismo orden que `items`). */
export function cantidadesPendientes(nota) {
  const items = itemsDe(nota)
  const facturado = items.map(() => 0)
  for (const parte of partesVigentes(nota)) {
    for (const linea of parte.lineas || []) {
      if (linea && Number.isInteger(linea.i) && linea.i >= 0 && linea.i < items.length) {
        facturado[linea.i] += Number(linea.cantidad) || 0
      }
    }
  }
  return items.map((it, i) => Math.max(0, redondear((Number(it.quantity) || 0) - facturado[i], DECIMALES_CANTIDAD)))
}

/** ¿Ya se facturaron todas las cantidades de la nota? */
export function notaCompleta(nota) {
  const pendientes = cantidadesPendientes(nota)
  return pendientes.length > 0 && pendientes.every((c) => c <= 0)
}

/** Descuento de una línea que ya se llevaron las partes vigentes. */
const descuentoFacturado = (nota, i) => partesVigentes(nota).reduce((s, parte) => (
  s + (parte.lineas || []).filter((l) => l && l.i === i).reduce((t, l) => t + (Number(l.itemDiscount) || 0), 0)
), 0)

/** Descuento GENERAL (el que se aplica al total) que ya se llevaron las partes vigentes. */
const descuentoGeneralFacturado = (nota) => partesVigentes(nota)
  .reduce((s, p) => s + (Number(p.descuentoGeneral) || 0), 0)

/** Importes del documento que se reparten igual que la venta. */
const CAMPOS_DE_MONTO = [
  'subtotal', 'subtotalBeforeDiscount', 'discount', 'igv',
  'totalInBase', 'subtotalInBase', 'igvInBase',
  'opGravadas', 'opExoneradas', 'opInafectas',
  'recargoConsumo', 'amountPaid', 'cardCommissionAmount',
]

/**
 * La nota vista como VENTA: solo lo que falta facturar, con sus cantidades,
 * importes y pagos en proporción. Es lo que suman Ventas, Reportes, el
 * Dashboard y Vendedores; lo demás lo suman sus partes, cada una en su fecha.
 *
 * Cualquier otro comprobante (o una nota sin partes) vuelve tal cual, el mismo
 * objeto. Nunca modifica el original. La comisión congelada no se toca: es de
 * la nota entera.
 */
export function ventaPendienteDe(doc) {
  const f = factorDeVenta(doc)
  if (f === 1) return doc

  const pendientes = cantidadesPendientes(doc)
  const items = itemsDe(doc).map((it, i) => {
    const q = Number(it.quantity) || 0
    const proporcion = q > 0 ? pendientes[i] / q : 0
    const descuento = Number(it.itemDiscount) || 0
    return {
      ...it,
      quantity: pendientes[i],
      ...(it.subtotal != null && { subtotal: redondear((Number(it.subtotal) || 0) * proporcion) }),
      ...(descuento > 0 && { itemDiscount: Math.max(0, redondear(descuento - descuentoFacturado(doc, i))) }),
    }
  })

  const escalar = (v) => redondear((Number(v) || 0) * f)
  const copia = { ...doc, items }
  for (const campo of CAMPOS_DE_MONTO) {
    if (doc[campo] != null && doc[campo] !== '') copia[campo] = escalar(doc[campo])
  }
  // El total y el descuento general, exactos: lo que de verdad falta.
  copia.total = f === 0 ? 0 : montoPendiente(doc)
  if (doc.globalDiscount != null) {
    copia.globalDiscount = f === 0 ? 0 : Math.max(0, redondear((Number(doc.globalDiscount) || 0) - descuentoGeneralFacturado(doc)))
  }
  if (doc.igvByRate && typeof doc.igvByRate === 'object') {
    copia.igvByRate = Object.fromEntries(Object.entries(doc.igvByRate)
      .map(([tasa, v]) => [tasa, { ...v, igv: escalar(v?.igv) }]))
  }
  for (const lista of ['payments', 'paymentHistory']) {
    if (Array.isArray(doc[lista])) copia[lista] = doc[lista].map((p) => ({ ...p, amount: escalar(p?.amount) }))
  }
  return copia
}

/**
 * Las líneas de la PRÓXIMA parte, para un monto pedido.
 *
 * Tajada proporcional: la cantidad de cada línea × monto / total de la nota,
 * sin pasarse de lo que falta de esa línea. Si el monto cubre lo pendiente, es
 * la última y toma el resto EXACTO de cada línea y de sus descuentos, así la
 * nota cierra sin céntimos sueltos. El descuento de una línea se reparte igual
 * que su cantidad, y el descuento general igual que el monto.
 *
 * El total real de la parte lo calcula el POS con estas líneas; puede diferir
 * del monto pedido en algún céntimo por el redondeo del IGV.
 *
 * @returns {{ lineas: Array<{i: number, cantidad: number, itemDiscount: number}>, ultima: boolean, descuentoGeneral: number }}
 */
export function lineasDeLaParte(nota, monto) {
  const items = itemsDe(nota)
  const total = Number(nota?.total) || 0
  const pendientes = cantidadesPendientes(nota)
  const pedido = redondear(monto)
  const ultima = pedido >= montoPendiente(nota)
  const factor = total > 0 ? pedido / total : 0

  const lineas = []
  items.forEach((it, i) => {
    const q = Number(it.quantity) || 0
    if (q <= 0) return
    const cantidad = ultima ? pendientes[i] : Math.min(pendientes[i], redondear(q * factor, DECIMALES_CANTIDAD))
    if (cantidad <= 0) return
    const descuento = Number(it.itemDiscount) || 0
    const itemDiscount = descuento <= 0 ? 0
      : ultima ? Math.max(0, redondear(descuento - descuentoFacturado(nota, i)))
        : redondear(descuento * cantidad / q)
    lineas.push({ i, cantidad, itemDiscount })
  })

  const general = Number(nota?.globalDiscount) || 0
  const descuentoGeneral = general <= 0 ? 0
    : ultima ? Math.max(0, redondear(general - descuentoGeneralFacturado(nota)))
      : redondear(general * factor)

  return { lineas, ultima, descuentoGeneral }
}

/**
 * Todo lo que el POS necesita para emitir la PRÓXIMA parte de la nota.
 *
 * `lineas` lleva además el precio de cada línea, para que el POS confirme que
 * nada cambió; `items` son las líneas de la nota con la cantidad y el descuento
 * de esta parte, listas para el carrito. `totalEstimado` es lo que debería
 * salir: el POS lo recalcula con el IGV y puede diferir en algún céntimo.
 */
export function parteParaElPOS(nota, monto) {
  const items = itemsDe(nota)
  const { lineas, ultima, descuentoGeneral } = lineasDeLaParte(nota, monto)
  const conPrecio = lineas.map((l) => ({ ...l, precio: precioDe(items[l.i]) }))
  const bruto = conPrecio.reduce((s, l) => s + l.precio * l.cantidad - (Number(l.itemDiscount) || 0), 0)
  return {
    lineas: conPrecio,
    items: conPrecio.map((l) => ({
      ...items[l.i],
      quantity: l.cantidad,
      itemDiscount: l.itemDiscount,
      subtotal: redondear(l.precio * l.cantidad),
    })),
    descuentoGeneral,
    totalEstimado: Math.max(0, redondear(bruto - descuentoGeneral)),
    ultima,
    // Número de parte único aunque haya anuladas: "Parte 3" no se repite.
    parte: (Array.isArray(nota?.facturasParciales) ? nota.facturasParciales.length : 0) + 1,
  }
}

/** Por qué esta nota NO se puede facturar por partes, o null si se puede. */
export function motivoParaNoFacturarPorPartes(nota) {
  if (!nota || nota.documentType !== 'nota_venta') return 'Solo las notas de venta se facturan por partes.'
  if (nota.status === 'cancelled' || nota.status === 'voided') return 'La nota está anulada.'
  if (convertidaDeUnaVez(nota)) return 'La nota ya se convirtió en un comprobante.'
  if (nota.convertedTo) return 'La nota ya se facturó completa.'
  if (!(Number(nota.total) > 0) || itemsDe(nota).length === 0) return 'La nota no tiene productos.'
  // El POS no hereda la moneda de la nota al convertir: una nota en dólares
  // saldría facturada en soles y la cuenta de lo pendiente no cerraría.
  if (nota.currency && nota.currency !== 'PEN') return 'Por ahora solo se facturan por partes las notas en soles.'
  if (!notaCobrada(nota)) return 'Por ahora solo se facturan por partes las notas cobradas completas.'
  return null
}

/**
 * Los campos de la nota después de sumarle una parte. Puro: lo usan la
 * transacción que la anota y las pruebas.
 *
 * @param {object} nota
 * @param {object} parte `{ id, number, documentType, monto, fecha, lineas, descuentoGeneral }`
 * @returns {{ facturasParciales: Array, montoFacturado: number, completa: boolean }}
 */
export function notaConParte(nota, parte) {
  const facturasParciales = [...(Array.isArray(nota?.facturasParciales) ? nota.facturasParciales : []), parte]
  const conLaParte = { ...nota, facturasParciales }
  return {
    facturasParciales,
    montoFacturado: montoFacturado(conLaParte),
    completa: notaCompleta(conLaParte),
  }
}

/**
 * Los campos de la nota después de anular una de sus partes (baja SUNAT,
 * anulación o nota de crédito total). La parte queda marcada, no se borra.
 *
 * @returns {{ encontrada: boolean, facturasParciales: Array, montoFacturado: number, completa: boolean }}
 */
export function notaSinParte(nota, invoiceId, anuladaAt = null) {
  let encontrada = false
  const facturasParciales = (Array.isArray(nota?.facturasParciales) ? nota.facturasParciales : []).map((p) => {
    if (p && p.id === invoiceId && !p.anulada) {
      encontrada = true
      return { ...p, anulada: true, ...(anuladaAt && { anuladaAt }) }
    }
    return p
  })
  const sinLaParte = { ...nota, facturasParciales }
  return {
    encontrada,
    facturasParciales,
    montoFacturado: montoFacturado(sinLaParte),
    completa: notaCompleta(sinLaParte),
  }
}
