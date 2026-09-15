/**
 * ENTREGA Y COMPROBANTE DE UN PEDIDO DEL CATÁLOGO.
 *
 * Pedido de CITEX (1-set-2026): que el comprador elija cómo recibe su pedido
 * (envío a domicilio, recojo en uno de los locales o envío a provincia por
 * agencia) y si quiere boleta (DNI) o factura (RUC y razón social), y que el
 * POS lo herede al cobrar el pedido. Sirve a cualquier tienda: todo nace
 * apagado y cada negocio lo prende en Configuración > Mi Catálogo Online. Un
 * negocio que no toca nada sigue con su checkout de siempre: la dirección de
 * entrega y nada más.
 *
 * Un solo criterio para el carrito (components/catalog/CartDrawer), Pedidos
 * Online con su ticket y su PDF, y el POS al cobrar el pedido.
 *
 * Campos del negocio:
 *   catalogAllowDelivery   envío a domicilio (por defecto sí)
 *   catalogDeliveryLabel   su nombre ("Envío en Lima"); vacío = "Envío a domicilio"
 *   catalogPickupEnabled   recojo en tienda, en uno de...
 *   catalogPickupPoints    [{ id, nombre, direccion }]
 *   catalogAgencyEnabled   envío a provincia por agencia, con...
 *   catalogAgencies        ['Shalom', 'Olva Courier', ...]
 *   catalogAskReceipt      pedir boleta o factura
 *
 * Campos del pedido (businesses/{id}/orders):
 *   entrega      { modo, etiqueta, puntoRecojo?: { nombre, direccion }, agencia?, destino?, dniRecoge? }
 *   comprobante  { tipo: 'boleta'|'factura', documentoTipo?: 'DNI'|'CE'|'RUC', documentoNumero?, razonSocial?, direccionFiscal? }
 */

export const ENTREGA = { DOMICILIO: 'domicilio', RECOJO: 'recojo', AGENCIA: 'agencia' }
export const COMPROBANTE = { BOLETA: 'boleta', FACTURA: 'factura' }

export const ETIQUETA_DOMICILIO = 'Envío a domicilio'
export const ETIQUETA_RECOJO = 'Recojo en tienda'
export const ETIQUETA_AGENCIA = 'Envío a provincia por agencia'

/** SUNAT: desde S/ 700 la boleta tiene que identificar al comprador. */
export const BOLETA_CON_DOCUMENTO_DESDE = 700

const texto = (v) => String(v ?? '').trim()
const sinEspacios = (v) => texto(v).replace(/\s+/g, '').toUpperCase()

/** Los locales de recojo tal como se guardan: sin filas vacías y con id. */
export function limpiarPuntosDeRecojo(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((p, i) => ({ id: texto(p?.id) || `local-${i + 1}`, nombre: texto(p?.nombre), direccion: texto(p?.direccion) }))
    .filter((p) => p.nombre || p.direccion)
}

/** Los locales de recojo del negocio. */
export const puntosDeRecojo = (business) => limpiarPuntosDeRecojo(business?.catalogPickupPoints)

/**
 * Las agencias con las que trabaja el negocio, sin repetidas. Acepta la lista
 * guardada o el texto separado por comas del formulario.
 */
export function separarAgencias(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor ?? '').split(/[,\n]/)
  const vistas = new Set()
  return lista.map(texto).filter((a) => {
    const clave = a.toLowerCase()
    if (!a || vistas.has(clave)) return false
    vistas.add(clave)
    return true
  })
}

export const agenciasDeEnvio = (business) => separarAgencias(business?.catalogAgencies)

/**
 * Las formas de entrega que ve el comprador de una tienda (el restaurante
 * tiene las suyas: mesa, para llevar y delivery). Siempre queda al menos una:
 * si el negocio apagó todo, sigue el envío a domicilio de siempre.
 */
export function opcionesDeEntrega(business) {
  const recojo = business?.catalogPickupEnabled === true && puntosDeRecojo(business).length > 0
  const agencia = business?.catalogAgencyEnabled === true
  const domicilio = business?.catalogAllowDelivery !== false || (!recojo && !agencia)
  const opciones = []
  if (domicilio) opciones.push({ id: ENTREGA.DOMICILIO, etiqueta: texto(business?.catalogDeliveryLabel) || ETIQUETA_DOMICILIO })
  if (recojo) opciones.push({ id: ENTREGA.RECOJO, etiqueta: ETIQUETA_RECOJO })
  if (agencia) opciones.push({ id: ENTREGA.AGENCIA, etiqueta: ETIQUETA_AGENCIA })
  return opciones
}

/**
 * ¿El negocio configuró algo más que el envío de siempre? Solo entonces el
 * pedido guarda su `entrega` y el mensaje de WhatsApp la nombra: quien no tocó
 * nada sigue viendo sus pedidos y sus mensajes exactamente como antes.
 */
export function entregaConfigurada(business) {
  const opciones = opcionesDeEntrega(business)
  return opciones.length > 1 || opciones[0]?.id !== ENTREGA.DOMICILIO || !!texto(business?.catalogDeliveryLabel)
}

/** El tipo de pedido de siempre (lo leen la cocina, los reportes y el POS). */
export const tipoDePedido = (modo) => (modo === ENTREGA.RECOJO ? 'takeaway' : 'delivery')

/** Qué falta en la entrega elegida; '' si está completa. */
export function problemaDeEntrega({ modo, direccion, punto, agencia, destino, dniRecoge } = {}) {
  if (modo === ENTREGA.DOMICILIO && !texto(direccion)) return 'Ingresa la dirección de entrega'
  if (modo === ENTREGA.RECOJO && !punto) return 'Elige el local donde vas a recoger tu pedido'
  if (modo === ENTREGA.AGENCIA) {
    if (!texto(agencia)) return 'Elige la agencia de envío'
    if (!texto(destino)) return 'Escribe la ciudad de destino'
    const dni = sinEspacios(dniRecoge)
    if (!/^\d{8}$/.test(dni) && !/^[A-Z0-9]{9,12}$/.test(dni)) return 'Escribe el DNI de quien recoge en la agencia'
  }
  return ''
}

/** La entrega tal como se guarda en el pedido. */
export function entregaDelPedido({ opcion, punto, agencia, destino, dniRecoge } = {}) {
  if (!opcion) return null
  const base = { modo: opcion.id, etiqueta: opcion.etiqueta }
  if (opcion.id === ENTREGA.RECOJO && punto) {
    return { ...base, puntoRecojo: { nombre: punto.nombre, direccion: punto.direccion } }
  }
  if (opcion.id === ENTREGA.AGENCIA) {
    return { ...base, agencia: texto(agencia), destino: texto(destino), dniRecoge: sinEspacios(dniRecoge) }
  }
  return base
}

const esRuc = (n) => /^(10|15|16|17|20)\d{9}$/.test(n)

/**
 * El comprobante que pidió el comprador, validado y listo para guardarse.
 * La boleta pide DNI solo desde S/ 700 (SUNAT); antes es opcional.
 * @returns {{ problema: string, comprobante: object|null }}
 */
export function comprobanteDelPedido({ tipo, numero, razonSocial, direccionFiscal } = {}, { totalEnSoles = 0 } = {}) {
  const n = sinEspacios(numero)
  if (tipo === COMPROBANTE.FACTURA) {
    if (!esRuc(n)) return { problema: 'Para la factura escribe un RUC válido de 11 dígitos', comprobante: null }
    if (texto(razonSocial).length < 3) return { problema: 'Para la factura escribe la razón social', comprobante: null }
    return {
      problema: '',
      comprobante: {
        tipo: COMPROBANTE.FACTURA,
        documentoTipo: 'RUC',
        documentoNumero: n,
        razonSocial: texto(razonSocial),
        ...(texto(direccionFiscal) && { direccionFiscal: texto(direccionFiscal) }),
      },
    }
  }
  if (!n) {
    if (Number(totalEnSoles) >= BOLETA_CON_DOCUMENTO_DESDE) {
      return { problema: `Para una boleta desde S/ ${BOLETA_CON_DOCUMENTO_DESDE} escribe tu DNI`, comprobante: null }
    }
    return { problema: '', comprobante: { tipo: COMPROBANTE.BOLETA } }
  }
  if (/^\d{8}$/.test(n)) return { problema: '', comprobante: { tipo: COMPROBANTE.BOLETA, documentoTipo: 'DNI', documentoNumero: n } }
  if (/^\d{11}$/.test(n)) return { problema: 'Con RUC, elige factura', comprobante: null }
  if (/^[A-Z0-9]{9,12}$/.test(n)) return { problema: '', comprobante: { tipo: COMPROBANTE.BOLETA, documentoTipo: 'CE', documentoNumero: n } }
  return { problema: 'El DNI tiene 8 dígitos', comprobante: null }
}

/** La entrega en una línea, para Pedidos Online, su ticket y su PDF. */
export function textoDeEntrega(entrega) {
  if (!entrega?.modo) return ''
  if (entrega.modo === ENTREGA.RECOJO) {
    const p = entrega.puntoRecojo || {}
    const donde = [p.nombre, p.direccion].filter(Boolean).join(' · ')
    return donde ? `${ETIQUETA_RECOJO}: ${donde}` : ETIQUETA_RECOJO
  }
  if (entrega.modo === ENTREGA.AGENCIA) {
    const partes = [
      entrega.agencia,
      entrega.destino && `destino ${entrega.destino}`,
      entrega.dniRecoge && `recoge DNI ${entrega.dniRecoge}`,
    ].filter(Boolean)
    return `${entrega.etiqueta || ETIQUETA_AGENCIA}${partes.length ? `: ${partes.join(' · ')}` : ''}`
  }
  return entrega.etiqueta || ETIQUETA_DOMICILIO
}

/** El comprobante pedido en una línea: "Factura · RUC ... · Razón social" o "Boleta · DNI ...". */
export function textoDeComprobante(comprobante) {
  if (!comprobante?.tipo) return ''
  if (comprobante.tipo === COMPROBANTE.FACTURA) {
    return ['Factura', comprobante.documentoNumero && `RUC ${comprobante.documentoNumero}`, comprobante.razonSocial]
      .filter(Boolean)
      .join(' · ')
  }
  return comprobante.documentoNumero ? `Boleta · ${comprobante.documentoTipo || 'DNI'} ${comprobante.documentoNumero}` : 'Boleta'
}

/** El título del mensaje de WhatsApp: el nombre de la entrega elegida, o el de siempre. */
export function tituloDeWhatsApp({ entrega, orderType } = {}) {
  if (entrega?.etiqueta) return entrega.etiqueta.toUpperCase()
  return orderType === 'delivery' ? 'DELIVERY' : 'PARA RECOGER'
}

/** Las líneas que suma al mensaje de WhatsApp (con los emojis del resto del mensaje). */
export function lineasDeWhatsApp({ entrega, comprobante } = {}) {
  const lineas = []
  if (entrega?.modo === ENTREGA.RECOJO) {
    const p = entrega.puntoRecojo || {}
    lineas.push(`🏬 *Recojo en:* ${[p.nombre, p.direccion].filter(Boolean).join(' - ')}`)
  } else if (entrega?.modo === ENTREGA.AGENCIA) {
    lineas.push(`🚚 *Agencia:* ${entrega.agencia}`)
    lineas.push(`📍 *Destino:* ${entrega.destino}`)
    lineas.push(`🆔 *DNI de quien recoge:* ${entrega.dniRecoge}`)
  }
  if (comprobante?.tipo) lineas.push(`🧾 *Comprobante:* ${textoDeComprobante(comprobante)}`)
  return lineas
}

/**
 * El cliente que hereda el POS (o la cotización) al cobrar el pedido. Con
 * factura, el comprobante sale a nombre de la razón social y con su dirección
 * fiscal; con boleta, a nombre de quien pidió y con su dirección de entrega,
 * como siempre.
 */
export function clienteDelPedido(order = {}) {
  const c = order.comprobante
  const esFactura = c?.tipo === COMPROBANTE.FACTURA
  return {
    name: esFactura ? (c.razonSocial || order.customerName || '') : (order.customerName || ''),
    businessName: esFactura ? (c.razonSocial || '') : '',
    documentType: c?.documentoTipo || '',
    documentNumber: c?.documentoNumero || '',
    email: order.customerEmail || '',
    phone: order.customerPhone || '',
    address: esFactura ? (c.direccionFiscal || '') : (order.customerAddress || ''),
    coords: order.customerCoords || null,
  }
}
