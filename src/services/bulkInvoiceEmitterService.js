/**
 * EMISIÓN MASIVA — motor de emisión del lote de COMPROBANTES.
 *
 * Calcado del de GRE Transportista, que ya resolvió los problemas difíciles:
 *
 * EN SERIE Y CON RITMO, nunca en ráfaga: la lección de LA PATOTA es que meter
 * decenas de envíos seguidos contra SUNAT despierta al WAF (504 selectivos que
 * dejan documentos en el limbo). Un comprobante a la vez, con pausa entre
 * envíos.
 *
 * IDEMPOTENTE por archivo+operación: cada comprobante lleva un `bulkKey`
 * (huella del archivo + número de operación). Si se corta la luz a mitad del
 * lote y el usuario vuelve a subir el MISMO archivo, las operaciones ya
 * emitidas se OMITEN en lugar de duplicarse. Acá importa más que en guías: un
 * duplicado es una boleta de más declarada ante SUNAT.
 *
 * DESCUENTA STOCK como una venta normal del POS, con la misma Cloud Function
 * atómica (`processSaleStock` vía descontarStockDeVentaGuardada): lotes FEFO,
 * series, variantes y presentaciones se resuelven igual que en el mostrador.
 *
 * La creación usa createInvoiceWithNumber (numeración atómica por serie) y el
 * envío la MISMA función del botón individual: cero caminos nuevos a SUNAT.
 */
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { createInvoiceWithNumber, sendInvoiceToSunat } from './firestoreService'
import { getRateForDate } from './exchangeRateService'
import { calcularDetraccion } from '@/utils/peruUtils'
import { huellaDe, huellaDeContenido } from '@/utils/bulkFingerprint'
import { descontarStockDeVentaGuardada } from './saleStockDeduction'

/** Pausa entre envíos. Mismo ritmo que el lote de guías. */
const PAUSA_MS = 1200

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Método de pago: del Excel al sistema.
 *
 * La plantilla los pide en MAYÚSCULAS ('YAPE') y el control de caja clasifica
 * con un switch por la etiqueta capitalizada ('Yape'). Un valor que el switch
 * no reconoce no cae en ningún lado: el dinero desaparece del cierre sin error
 * ni aviso — que es exactamente lo que pasó con las primeras boletas de prueba.
 */
const METODO_PAGO = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  YAPE: 'Yape',
  PLIN: 'Plin',
}

/**
 * Huella de la operación: es lo que hace idempotente el reintento.
 *
 * Va sobre el CONTENIDO, no sobre el archivo. Si el usuario corrige una fila y
 * vuelve a subir el mismo Excel, esa operación cambia de huella y se emite,
 * mientras las que no tocó conservan la suya y se omiten. Con la huella vieja
 * (nombre del archivo + números de operación) un archivo corregido se veía
 * idéntico al anterior y no se emitía nada.
 */
export const huellaDeOperacion = (op) => huellaDeContenido({
  n: op.nOperacion,
  tipo: op.tipo,
  fecha: op.fechaEmision,
  moneda: op.moneda,
  cliente: [op.cliente?.documentType, op.cliente?.documentNumber, op.cliente?.name],
  items: (op.items || []).map((it) => [
    it.codigo, it.descripcion, it.cantidad, it.unidadCodigo,
    it.precioUnitario, it.taxAffectation, it.descuentoItem,
  ]),
  dsctoGlobal: op.descuentoGlobal,
  pago: [op.formaPago, op.metodoPago, op.fechaVencimiento],
  obs: op.observaciones,
})

/** Huella del archivo. Ya no manda en la idempotencia: es solo trazabilidad. */
export const huellaDelLote = (nombreArchivo, operaciones) =>
  huellaDe(`${nombreArchivo}|${operaciones.length}`)

/**
 * Arma el comprobante que espera createInvoiceWithNumber a partir de una
 * operación del parser. El parser ya calculó los totales de la vista previa;
 * acá se respetan tal cual para que lo emitido sea exactamente lo que el
 * usuario vio y aprobó antes de tocar el botón.
 */
/**
 * Quita las claves con `undefined`, en profundidad.
 *
 * Firestore rechaza el documento ENTERO ante un solo undefined, y el error no
 * dice qué campo fue: "Unsupported field value: undefined". Con un objeto
 * armado a partir de un Excel de terceros, es una red que conviene tener.
 */
function sinUndefined(valor) {
  if (Array.isArray(valor)) return valor.map(sinUndefined)
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    const limpio = {}
    for (const [k, v] of Object.entries(valor)) {
      if (v !== undefined) limpio[k] = sinUndefined(v)
    }
    return limpio
  }
  return valor
}

/**
 * Etiqueta del metodo de pago tal como la esperan el cierre de caja y los
 * reportes. Va con la mayuscula exacta del catalogo: 'YAPE' en mayusculas no
 * coincide con ningun balde y el dinero se iria a Transferencia.
 */
const metodoPagoDe = (op) => (
  op.formaPago === 'credito' && !op.metodoPago
    ? 'Crédito'
    : (METODO_PAGO[String(op.metodoPago || '').toUpperCase()] || 'Efectivo')
)

function comprobanteDesdeOperacion(op, { igvRate, bulkKey, loteKey, warehouseId, branchId, autoEnvio, tipoCambio = null }) {
  const t = op.totales
  // Descuentos por item, SIN las bonificaciones: en una bonificacion el
  // "descuento" es el precio entero del regalo, no una rebaja que el cliente
  // negocio. Sumarlo inflaria el descuento declarado del documento.
  const descuentosDeItems = op.items.reduce(
    (suma, it) => suma + (it.isBonificacion ? 0 : (Number(it.descuentoItem) || 0)),
    0,
  )
  return sinUndefined({
    documentType: op.tipo, // 'factura' | 'boleta'
    issueDate: op.fechaEmision,
    currency: op.moneda || 'PEN',
    customer: {
      documentType: op.cliente.documentType || '',
      documentNumber: op.cliente.documentNumber || '',
      name: op.cliente.name || 'Cliente varios',
      address: op.cliente.address || '',
      ...(op.cliente.email ? { email: op.cliente.email } : {}),
    },
    // OJO con los nombres: el parser trabaja en español (descripcion, cantidad,
    // precioUnitario) y el comprobante los guarda en inglés. Leer it.name o
    // it.quantity acá devuelve undefined, y Firestore rechaza el documento
    // entero con "Unsupported field value: undefined".
    items: op.items.map((it) => {
      const cantidad = Number(it.cantidad) || 0
      const precio = Number(it.precioUnitario) || 0
      const descuento = Number(it.descuentoItem) || 0
      return {
        productId: it.productId || null,
        name: it.descripcion || '',
        quantity: cantidad,
        // unitPrice, NO price: el generador del XML lee item.unitPrice. Con el
        // nombre equivocado la linea vale `cantidad * undefined` = NaN y SUNAT
        // rechaza el comprobante con "TaxAmount value 'NaN'".
        unitPrice: precio,
        unit: it.unidadCodigo || 'NIU',
        taxAffectation: it.taxAffectation || '10',
        // Bonificacion: el XML NO mira la bandera, la reconoce porque el
        // descuento iguala al total de la linea (mismo criterio que el POS).
        ...(it.isBonificacion
          ? {
              subtotal: 0,
              itemDiscount: Number((precio * cantidad).toFixed(2)),
              itemDiscountType: 'amount',
              isBonificacion: true,
            }
          : {
              subtotal: Number((precio * cantidad).toFixed(2)),
              ...(descuento ? { itemDiscount: descuento, itemDiscountType: 'amount' } : {}),
            }),
        ...(it.variantSku ? { variantSku: it.variantSku } : {}),
        ...(it.codigo ? { code: it.codigo } : {}),
      }
    }),
    // Base imponible del documento = total - IGV (gravado sin IGV + exonerado
    // + inafecto). Es lo que el PDF imprime como "Op. gravada".
    subtotal: Number((t.total - t.igv).toFixed(2)),
    igv: t.igv,
    total: t.total,
    igvRate,
    // Multi-divisa: el TC se CONGELA en el documento. Sin exchangeRate un
    // comprobante en USD se cuenta como si fuera soles en los reportes
    // (getDocumentTotalInBase asume PEN cuando no hay tasa).
    ...(op.moneda === 'USD' && Number(tipoCambio) > 0
      ? {
          exchangeRate: tipoCambio,
          subtotalInBase: Number(((t.total - t.igv) * tipoCambio).toFixed(2)),
          igvInBase: Number((t.igv * tipoCambio).toFixed(2)),
          totalInBase: Number((t.total * tipoCambio).toFixed(2)),
        }
      : {}),
    ...(op.descuentoGlobal
      ? { globalDiscount: op.descuentoGlobal, discount: Number((op.descuentoGlobal + descuentosDeItems).toFixed(2)) }
      : (descuentosDeItems ? { discount: Number(descuentosDeItems.toFixed(2)) } : {})),
    // Crédito sin método: el POS guarda 'Crédito' cuando no hay pago todavía.
    paymentMethod: metodoPagoDe(op),
    paymentType: op.formaPago, // 'contado' | 'credito'
    // paymentDueDate, NO dueDate: es el nombre que lee el generador del XML.
    // Una factura al credito SIN vencimiento sale con FormaPago=Credito y
    // ninguna cuota, y SUNAT la rechaza.
    ...(op.formaPago === 'credito' && op.fechaVencimiento
      ? { paymentDueDate: op.fechaVencimiento }
      : {}),
    // Cuotas. Sin ellas el XML arma una Cuota001 con el vencimiento; con
    // ellas manda esta lista (Cuota001, Cuota002...).
    paymentInstallments: op.formaPago === 'credito' ? (op.cuotas || []) : [],
    // Estado de cobro. Sin esto una venta al credito se cuenta como cobrada:
    // el cierre de caja solo excluye lo que tiene paymentStatus 'pending', y
    // las cuentas por cobrar de Clientes leen ese mismo campo.
    ...(op.formaPago === 'credito'
      ? {
          paymentStatus: 'pending',
          amountPaid: 0,
          balance: t.total,
          payments: [],
        }
      : {
          paymentStatus: 'completed',
          amountPaid: t.total,
          balance: 0,
          payments: [{ method: metodoPagoDe(op), amount: t.total }],
        }),
    ...(op.observaciones ? { notes: op.observaciones } : {}),
    // Vendedor: lo usan las comisiones y el filtro por vendedor de los reportes.
    ...(op.vendedor
      ? { sellerId: op.vendedor.id, sellerName: op.vendedor.name, sellerCode: op.vendedor.code || null }
      : {}),
    // Detracción (SPOT). El depósito se calcula SIEMPRE en soles y redondeado
    // a soles enteros, aunque el comprobante sea en dólares: es lo que exige
    // SUNAT y lo único que se puede depositar en el Banco de la Nación.
    ...(op.detraccion ? (() => {
      const d = calcularDetraccion(t.total, op.moneda === 'USD' ? (Number(tipoCambio) || 1) : 1, op.detraccion.rate)
      return {
        hasDetraction: true,
        detractionType: op.detraccion.code,
        detractionTypeName: op.detraccion.name,
        detractionRate: op.detraccion.rate,
        detractionAmountPEN: d.pen,
        detractionAmount: d.doc,
        detractionBankAccount: op.detraccion.bankAccount || null,
        netPayable: Number((t.total - d.doc).toFixed(2)),
      }
    })() : { hasDetraction: false }),
    ...(warehouseId ? { warehouseId } : {}),
    ...(branchId ? { branchId } : {}),
    // Estado SUNAT inicial. Sin este campo la Cloud Function rechaza el envío
    // con "INVALID_STATUS:undefined", que se muestra como "la factura ya fue
    // aceptada por SUNAT" — un mensaje que despista por completo.
    //
    // Va 'not_sent' cuando el negocio tiene apagado el envío automático, igual
    // que en el POS: así los crones de reintento no lo tocan. La lista de
    // estados que la función acepta para enviar incluye los dos, y el lote
    // envía explícitamente de todas formas.
    sunatStatus: autoEnvio ? 'pending' : 'not_sent',
    sunatResponse: null,
    sunatSentAt: null,
    // Marca del lote: es lo que hace idempotente el reintento.
    bulkKey,
    bulkLote: loteKey || null,
    bulkSource: 'excel',
  })
}

/**
 * Emite el lote de comprobantes, uno por uno.
 *
 * @param {string} businessId
 * @param {Array}  operaciones - SOLO las operaciones sin errores del parser
 * @param {object} opts
 * @param {string}   opts.loteKey     - huella del archivo, solo para trazabilidad
 * @param {number}   [opts.igvRate]   - tasa de IGV del negocio
 * @param {string}   [opts.warehouseId] - almacén del que sale el stock
 * @param {string}   [opts.branchId]  - sucursal activa (numeración por sede)
 * @param {boolean}  [opts.allowNegativeStock]
 * @param {boolean}  [opts.autoEnvio] - si el negocio tiene el envío automático a SUNAT activo
 * @param {string}   [opts.userId]
 * @param {Function} [opts.onProgress] - ({ indice, total, nOperacion, etapa, numero }) por paso
 * @param {Function} [opts.debeCancelar] - () => boolean; se consulta entre comprobantes
 * @returns {Promise<{resultados: Array, resumen: object}>}
 *
 * Cada resultado: { nOperacion, numero, estado, mensaje, stock }
 *   estado: 'aceptado' | 'rechazado' | 'creado' | 'error_envio' | 'error_creacion' | 'omitido' | 'cancelado'
 *
 * Un comprobante creado cuyo envío falla QUEDA CREADO con estado pendiente: se
 * reenvía desde Ventas, nunca se duplica desde acá. Y su stock YA se descontó,
 * porque la mercadería salió igual.
 */
/**
 * Tipo de cambio del dia de emision, memorizado por fecha dentro del lote.
 *
 * El Excel puede traer varias fechas, y cada comprobante en dolares tiene que
 * congelar el TC de SU dia — no el de hoy. Si la SBS no responde, se devuelve
 * null y el comprobante se emite sin TC antes que quedar con uno inventado.
 */
async function tipoCambioDe(fecha, memoria) {
  if (memoria.has(fecha)) return memoria.get(fecha)
  let tasa = null
  try {
    const r = await getRateForDate(new Date(`${fecha}T12:00:00`))
    if (r && Number.isFinite(Number(r.sell)) && Number(r.sell) > 0) {
      tasa = Number(Number(r.sell).toFixed(4))
    }
  } catch { /* sin TC: el comprobante sale igual */ }
  memoria.set(fecha, tasa)
  return tasa
}

export async function emitirLoteComprobantes(businessId, operaciones, {
  loteKey,
  igvRate = 18,
  warehouseId = '',
  branchId = null,
  allowNegativeStock = false,
  autoEnvio = false,
  userId = '',
  onProgress = null,
  debeCancelar = null,
} = {}) {
  const resultados = []
  const total = operaciones.length
  const ref = collection(db, 'businesses', businessId, 'invoices')
  const tcPorFecha = new Map()

  for (let i = 0; i < total; i++) {
    const op = operaciones[i]
    const avisar = (etapa, extra = {}) => {
      try { onProgress?.({ indice: i, total, nOperacion: op.nOperacion, etapa, ...extra }) } catch { /* la UI nunca frena el lote */ }
    }

    if (debeCancelar?.()) {
      resultados.push({ nOperacion: op.nOperacion, numero: null, estado: 'cancelado', mensaje: 'Cancelado por el usuario antes de emitir este comprobante.' })
      continue
    }

    const bulkKey = `inv_${huellaDeOperacion(op)}`

    try {
      // ── Idempotencia: ¿esta operación de este archivo ya se emitió? ──
      avisar('verificando')
      // Sin limit(1): una operación re-emitida tras un rechazo deja DOS
      // documentos con la misma clave, y hay que mirar todos para no quedarse
      // justo con el rechazado y re-emitir en bucle.
      const previa = await getDocs(query(ref, where('bulkKey', '==', bulkKey)))
      // Un comprobante RECHAZADO por SUNAT no existe para SUNAT: su número
      // quedó quemado y hay que emitir otro. Si solo hay rechazados, se emite
      // de nuevo; si no, se omite.
      const vivo = previa.docs.map((d) => d.data()).find((inv) => inv.sunatStatus !== 'rejected')
      if (vivo) {
        const numero = vivo.number || null
        const pendiente = vivo.sunatStatus === 'pending' || vivo.sunatStatus === 'not_sent'
        resultados.push({
          nOperacion: op.nOperacion,
          numero,
          estado: 'omitido',
          mensaje: pendiente
            ? `Ya se creó antes con estos mismos datos (${numero || 'sin número'}) y está pendiente de envío. No se duplica: mándalo desde Ventas.`
            : `Ya se emitió antes con estos mismos datos (${numero || 'sin número'}): mismo cliente, mismos ítems y mismos montos. No se duplica.`,
        })
        avisar('omitido', { numero })
        continue
      }

      // ── Crear el comprobante (numeración atómica por serie) ──
      avisar('creando')
      const tipoCambio = op.moneda === 'USD' ? await tipoCambioDe(op.fechaEmision, tcPorFecha) : 1
      const datos = comprobanteDesdeOperacion(op, { igvRate, bulkKey, loteKey, warehouseId, branchId, autoEnvio, tipoCambio })
      const creacion = await createInvoiceWithNumber(businessId, datos, op.tipo, warehouseId || null, branchId)
      if (!creacion.success) {
        resultados.push({ nOperacion: op.nOperacion, numero: null, estado: 'error_creacion', mensaje: creacion.error || 'No se pudo crear el comprobante.' })
        avisar('error', { mensaje: creacion.error })
        continue
      }

      // `number` YA viene completo ("B001-00000001"); `series` es solo el
      // prefijo. Concatenarlos daba "B001-B001-00000001".
      const numero = creacion.number || ''

      // ── Descontar stock, como una venta del POS ──
      // Va ANTES del envío a propósito: la mercadería salió, y si SUNAT
      // rechaza el documento el inventario sigue siendo el correcto. Nunca
      // lanza: el comprobante ya existe y no se puede deshacer.
      avisar('descontando', { numero })
      const stock = await descontarStockDeVentaGuardada({
        businessId,
        invoiceId: creacion.id,
        invoiceNumber: numero,
        documentType: op.tipo,
        invoiceData: datos,
        allowNegativeStock,
        userId,
      })

      // ── Enviar a SUNAT, SOLO si el negocio lo tiene activado ──
      // Con el envío automático apagado el negocio decidió revisar antes de
      // declarar; el lote no puede saltarse esa decisión por ser masivo. Los
      // comprobantes quedan creados y se envían desde Ventas cuando quieran.
      if (!autoEnvio) {
        resultados.push({
          nOperacion: op.nOperacion,
          numero,
          stock: stock?.ok !== false,
          estado: 'creado',
          mensaje: 'Creado sin enviar: tienes apagado el envío automático a SUNAT. Envíalo desde Ventas cuando quieras.',
        })
        avisar('creado', { numero })
        if (i < total - 1) await dormir(200)
        continue
      }

      avisar('enviando', { numero })
      const envio = await sendInvoiceToSunat(businessId, creacion.id)

      // sendInvoiceToSunat devuelve { success, status, message }. `success`
      // dice si el ENVÍO salió; `status` dice qué contestó SUNAT — un
      // comprobante puede enviarse bien y aun así ser rechazado.
      const base = { nOperacion: op.nOperacion, numero, stock: stock?.ok !== false }
      const estadoSunat = String(envio?.status || '').toLowerCase()
      if (envio?.success && estadoSunat !== 'rejected' && estadoSunat !== 'rechazado') {
        resultados.push({ ...base, estado: 'aceptado', mensaje: envio.message || 'Aceptado por SUNAT.' })
        avisar('aceptado', { numero })
      } else if (envio?.success) {
        resultados.push({ ...base, estado: 'rechazado', mensaje: envio.message || 'SUNAT rechazó el comprobante.' })
        avisar('rechazado', { numero })
      } else {
        resultados.push({
          ...base,
          estado: 'error_envio',
          mensaje: `${envio?.error || 'No se pudo enviar a SUNAT.'} El comprobante quedó creado; reenvíalo desde Ventas.`,
        })
        avisar('error_envio', { numero })
      }
    } catch (error) {
      console.error(`Error emitiendo la operación ${op.nOperacion}:`, error)
      resultados.push({ nOperacion: op.nOperacion, numero: null, estado: 'error_creacion', mensaje: error.message || 'Error inesperado.' })
      avisar('error', { mensaje: error.message })
    }

    // Ritmo: la pausa va entre envíos, no después del último.
    if (i < total - 1) await dormir(PAUSA_MS)
  }

  const cuenta = (estado) => resultados.filter((r) => r.estado === estado).length
  return {
    resultados,
    resumen: {
      total,
      aceptados: cuenta('aceptado'),
      rechazados: cuenta('rechazado'),
      erroresEnvio: cuenta('error_envio'),
      erroresCreacion: cuenta('error_creacion'),
      creados: cuenta('creado'),
      omitidos: cuenta('omitido'),
      cancelados: cuenta('cancelado'),
      sinStock: resultados.filter((r) => r.stock === false).length,
    },
  }
}
