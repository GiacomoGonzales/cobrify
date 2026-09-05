import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  conFechaDeEmision,
  createInvoiceWithNumber,
  getCompanySettings,
  getProducts,
  sendInvoiceToSunat,
  upsertCustomerFromSale,
} from '@/services/firestoreService'
import { consultarDNI, consultarRUC } from '@/services/documentLookupService'
import { enviarArchivo } from '@/services/whatsappChatService'
import { PLANS } from '@/services/subscriptionService'
import { normalizeText } from '@/lib/utils'

/**
 * Emitir un comprobante desde el chat y mandarlo por WhatsApp.
 *
 * El emisor es la propia cuenta de negocio del admin (`businesses/{uid}`):
 * la misma que usa desde el POS, con sus series, sus productos (los planes)
 * y su QPse. No hay un emisor aparte: si lo hubiera, lo emitido desde acá
 * no aparecería en Ventas, ni se podría anular, ni saldría en los reportes.
 *
 * Todo lo que hace ya existía en otra pantalla; esto solo lo encadena:
 * crear con número (POS) → SUNAT (Cloud Function) → PDF (el generador de
 * Ventas) → enviar (el clip del chat).
 */

export const ETIQUETA_TIPO = { factura: 'Factura', boleta: 'Boleta', nota_venta: 'Nota de venta' }

/** Los mismos métodos de cobro que ofrece el panel. */
export const METODOS_DE_COBRO = ['Yape', 'Plin', 'Transferencia', 'Efectivo', 'Tarjeta']

export const soloDigitos = (valor) => String(valor || '').replace(/\D/g, '')

/** Con RUC es factura, con DNI boleta, sin documento nota de venta. */
export const tipoPorDocumento = (documento) => {
  const d = soloDigitos(documento)
  if (d.length === 11) return 'factura'
  if (d.length === 8) return 'boleta'
  return 'nota_venta'
}

const r2 = (n) => Number((Number(n) || 0).toFixed(2))

/** La fecha de hoy en Lima, como la guarda el POS (`YYYY-MM-DD`). */
const hoyEnLima = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * Configuración y catálogo del emisor. Sin RUC o sin series no se puede
 * emitir, y es mejor decirlo al abrir la ventana que al apretar el botón.
 */
export const cargarEmisor = async (uid) => {
  const [ajustes, productos] = await Promise.all([getCompanySettings(uid), getProducts(uid)])
  const negocio = ajustes.success ? ajustes.data : null
  if (!negocio) throw new Error('Tu usuario no tiene una cuenta de negocio desde la cual emitir')
  if (!negocio.ruc || !negocio.series) throw new Error('Tu cuenta no tiene RUC o series configuradas')

  const lista = (productos.success ? productos.data : [])
    .filter((p) => p.isActive !== false && p.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))

  return {
    ajustes: negocio,
    productos: lista,
    igvRate: Number(negocio.emissionConfig?.taxConfig?.igvRate) || 18,
  }
}

/**
 * El producto que corresponde al plan del cliente: el que cuesta lo que el
 * plan cuesta en el catálogo. Si ya pagó alguna vez es una renovación, y de
 * cada plan hay una versión "(Renovación)" con el mismo precio.
 *
 * Sin coincidencia no se adivina: se deja que el admin elija.
 */
export const productoSugerido = (productos, ficha) => {
  const precioDelPlan = PLANS[ficha?.plan]?.totalPrice
  if (!(precioDelPlan > 0)) return null
  const candidatos = productos.filter((p) => Math.abs(Number(p.price) - precioDelPlan) < 0.01)
  if (!candidatos.length) return null
  const esRenovacion = (ficha?.pagos?.length || 0) > 0
  const deRenovacion = (p) => normalizeText(p.name).includes('renovaci')
  return candidatos.find((p) => deRenovacion(p) === esRenovacion) || candidatos[0]
}

/**
 * Busca el nombre y la dirección en SUNAT (RUC) o RENIEC (DNI).
 * @returns {Promise<{nombre: string, direccion: string}|null>} null si no se encontró
 */
export const completarCliente = async (documento) => {
  const d = soloDigitos(documento)
  if (d.length === 11) {
    const r = await consultarRUC(d)
    return r.success ? { nombre: r.data.razonSocial || '', direccion: r.data.direccion || '' } : null
  }
  if (d.length === 8) {
    const r = await consultarDNI(d)
    return r.success ? { nombre: r.data.nombreCompleto || '', direccion: '' } : null
  }
  return null
}

/**
 * Los importes del comprobante a partir de lo que se escribe en la ventana.
 *
 * Los precios del emisor llevan el IGV INCLUIDO, como en su POS: 29.90 es lo
 * que paga el cliente, y de ahí salen 25.34 de base y 4.56 de IGV. La casilla
 * "IGV aparte" es para el caso contrario, el de los resellers que pagan el
 * impuesto encima del saldo: 500 + 90 = 590.
 */
export const desglose = ({ precio, cantidad, igvAparte, igvRate }) => {
  const factor = 1 + (Number(igvRate) || 18) / 100
  const n = Math.max(1, Math.floor(Number(cantidad) || 1))
  const unitario = igvAparte ? r2((Number(precio) || 0) * factor) : r2(precio)
  const total = r2(unitario * n)
  const base = r2(total / factor)
  return { unitario, cantidad: n, total, base, igv: r2(total - base) }
}

/**
 * El documento tal como lo espera el resto del sistema: misma forma que el
 * POS y que la emisión masiva (`comprobanteDesdeOperacion`). Los nombres
 * importan: el XML lee `unitPrice`, no `price`; con el nombre equivocado el
 * importe sale NaN y SUNAT rechaza.
 */
export const armarComprobante = ({ tipo, cliente, producto, desglose: d, metodo, igvRate, emisor, conversacionId }) => {
  const documento = soloDigitos(cliente.documento)
  const conDocumento = documento.length === 11 || documento.length === 8
  const nombre = cliente.nombre?.trim() || 'Cliente General'
  return {
    documentType: tipo,
    issueDate: hoyEnLima(),
    currency: 'PEN',
    customer: {
      documentType: documento.length === 11 ? 'RUC' : 'DNI',
      // Sin documento va el genérico del POS, que es lo que SUNAT acepta en
      // una boleta y lo que `upsertCustomerFromSale` sabe ignorar.
      documentNumber: conDocumento ? documento : '00000000',
      name: nombre,
      businessName: documento.length === 11 ? nombre : '',
      address: cliente.direccion?.trim() || '',
      email: cliente.email || '',
      phone: cliente.telefono || '',
    },
    items: [{
      productId: producto.id,
      code: producto.code || '',
      name: producto.name,
      ...(producto.description ? { description: producto.description } : {}),
      quantity: d.cantidad,
      unitPrice: d.unitario,
      unit: producto.unit || 'ZZ',
      taxAffectation: producto.taxAffectation || '10',
      igvRate,
      // La línea va con IGV incluido, como en el POS; la base va abajo.
      subtotal: r2(d.unitario * d.cantidad),
    }],
    subtotal: d.base,
    igv: d.igv,
    total: d.total,
    igvRate,
    paymentMethod: metodo,
    paymentType: 'contado',
    paymentStatus: 'completed',
    amountPaid: d.total,
    balance: 0,
    payments: [{ method: metodo, amount: d.total }],
    hasDetraction: false,
    // La nota de venta no va a SUNAT. Lo demás queda 'pending', que es el
    // estado que la Cloud Function acepta para enviar y el que los reintentos
    // automáticos vigilan si el envío se cae a medio camino.
    sunatStatus: tipo === 'nota_venta' ? 'not_applicable' : 'pending',
    sunatResponse: null,
    sunatSentAt: null,
    createdBy: emisor.uid,
    createdByName: emisor.displayName || emisor.email || 'Admin',
    createdByEmail: emisor.email || '',
    source: 'chat',
    whatsappConversationId: conversacionId,
  }
}

/** Crea el comprobante con el número siguiente de la serie. */
export const emitirComprobante = async (uid, datos) => {
  const r = await createInvoiceWithNumber(uid, datos, datos.documentType)
  if (!r.success) throw new Error(r.error || 'No se pudo emitir el comprobante')
  // El cliente entra a la lista de Clientes del emisor, como en el POS. Si
  // esto falla no se corta nada: el comprobante ya existe.
  upsertCustomerFromSale(uid, datos.customer).catch(() => {})
  return { id: r.id, number: r.number }
}

/**
 * Manda el comprobante a SUNAT y traduce la respuesta a un solo estado.
 *
 * 'pendiente' es un fallo pasajero (SUNAT o QPse no respondieron): el
 * documento queda 'pending' y los reintentos automáticos lo vuelven a mandar.
 * 'rechazado' es definitivo y viene con el motivo.
 * @returns {Promise<{estado: 'aceptado'|'rechazado'|'pendiente'|'error', mensaje: string}>}
 */
export const enviarASunat = async (uid, invoiceId) => {
  const r = await sendInvoiceToSunat(uid, invoiceId)
  if (r.status === 'rejected') return { estado: 'rechazado', mensaje: r.message || r.error || 'SUNAT rechazó el comprobante' }
  if (r.status === 'pending') return { estado: 'pendiente', mensaje: r.message || 'SUNAT no respondió' }
  if (r.success) return { estado: 'aceptado', mensaje: r.message || '' }
  return { estado: 'error', mensaje: r.error || r.message || 'No se pudo enviar a SUNAT' }
}

/**
 * El comprobante tal como quedó guardado. Se relee después de SUNAT para
 * que el PDF lleve lo que la respuesta le agregó (el hash, por ejemplo).
 */
export const leerComprobante = async (uid, invoiceId) => {
  const snap = await getDoc(doc(db, 'businesses', uid, 'invoices', invoiceId))
  if (!snap.exists()) throw new Error('El comprobante no se encontró')
  return conFechaDeEmision({ id: snap.id, ...snap.data() })
}

/**
 * El número que va a salir, para mostrarlo antes de emitir. Es el siguiente
 * de la serie global (el emisor no numera por sucursal); si alguien emite
 * desde el POS en ese mismo instante, el real será el siguiente.
 */
export const numeroProbable = (ajustes, tipo) => {
  const serie = ajustes?.series?.[tipo]
  if (!serie?.serie) return '—'
  return `${serie.serie}-${String((Number(serie.lastNumber) || 0) + 1).padStart(8, '0')}`
}

/** El texto que acompaña al PDF en la conversación. */
export const textoDelEnvio = (comprobante) =>
  `${ETIQUETA_TIPO[comprobante.documentType] || 'Comprobante'} ${comprobante.number} por S/ ${r2(comprobante.total).toFixed(2)}. Gracias por tu pago`

/**
 * Arma el PDF en el navegador y lo manda como documento en la conversación,
 * por el mismo camino que un adjunto del clip. Deja anotado en el comprobante
 * cuándo y a qué conversación se mandó.
 *
 * El generador del PDF se carga recién acá: son 3.400 líneas que el chat no
 * necesita hasta que alguien emite.
 */
export const enviarPdfPorWhatsapp = async ({ uid, comprobante, ajustes, conversacionId, idToken }) => {
  const { getInvoicePDFBlob } = await import('@/utils/pdfGenerator')
  const blob = await getInvoicePDFBlob(comprobante, ajustes, null, [])
  const etiqueta = ETIQUETA_TIPO[comprobante.documentType] || 'Comprobante'
  const archivo = new File([blob], `${etiqueta} ${comprobante.number}.pdf`, { type: 'application/pdf' })

  const r = await enviarArchivo(conversacionId, archivo, textoDelEnvio(comprobante), idToken)

  await updateDoc(doc(db, 'businesses', uid, 'invoices', comprobante.id), {
    whatsappConversationId: conversacionId,
    whatsappMessageId: r?.waMessageId || null,
    whatsappSentAt: serverTimestamp(),
  }).catch(() => {})
  return r
}
