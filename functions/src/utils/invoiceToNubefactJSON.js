/**
 * Convierte datos de factura de Firestore al formato JSON esperado por NubeFact
 *
 * Referencia: "NUBEFACT DOC API JSON V1.pdf"
 * Estructura completa en páginas 8-16 del manual
 */

/**
 * Convierte una invoice de Firestore a JSON de NubeFact
 *
 * @param {Object} invoiceData - Datos de la factura desde Firestore
 * @param {Object} businessData - Datos del negocio desde Firestore
 * @returns {Object} JSON en formato NubeFact
 */
export function convertInvoiceToNubefactJSON(invoiceData, businessData) {
  // Determinar tipo de comprobante
  const tipo_de_comprobante = getTipoComprobante(invoiceData.documentType)

  // Determinar serie según tipo de documento
  const serie = invoiceData.series || getDefaultSerie(invoiceData.documentType)

  // Formatear fecha (DD-MM-YYYY)
  const fecha_emision = formatDateForNubefact(invoiceData.issueDate)

  // Cliente
  const cliente = getClienteData(invoiceData.customer)

  // Calcular totales
  const totales = calculateTotals(invoiceData.items, invoiceData.igvRate || 18)

  // Construir JSON según especificación de NubeFact
  const nubefactJSON = {
    // Operación: siempre "generar_comprobante"
    operacion: 'generar_comprobante',

    // Tipo de comprobante
    tipo_de_comprobante: tipo_de_comprobante,
    serie: serie,
    numero: invoiceData.correlativeNumber,

    // Tipo de transacción SUNAT
    sunat_transaction: 1, // 1 = Venta interna (default)

    // Datos del cliente
    cliente_tipo_de_documento: cliente.tipo_documento,
    cliente_numero_de_documento: cliente.numero_documento,
    cliente_denominacion: cliente.denominacion,
    cliente_direccion: cliente.direccion,
    cliente_email: invoiceData.customer?.email || '',
    cliente_email_1: '',
    cliente_email_2: '',

    // Fechas
    fecha_de_emision: fecha_emision,
    fecha_de_vencimiento: '',

    // Moneda
    moneda: invoiceData.currency === 'USD' ? 2 : 1, // 1=Soles, 2=Dólares
    tipo_de_cambio: invoiceData.exchangeRate || '',

    // IGV
    porcentaje_de_igv: invoiceData.igvRate || 18.00,

    // Descuentos y anticipos
    descuento_global: '',
    total_descuento: '',
    total_anticipo: '',

    // Totales
    total_gravada: totales.gravada,
    total_inafecta: totales.inafecta,
    total_exonerada: totales.exonerada,
    total_igv: totales.igv,
    total_gratuita: totales.gratuita,
    total_otros_cargos: '',
    total: totales.total,

    // Percepción y retención
    percepcion_tipo: '',
    percepcion_base_imponible: '',
    total_percepcion: '',
    total_incluido_percepcion: '',
    retencion_tipo: '',
    retencion_base_imponible: '',
    total_retencion: '',
    total_impuestos_bolsas: '',

    // Detracción
    detraccion: false,

    // Observaciones
    observaciones: invoiceData.notes || '',

    // Documento que se modifica (para notas de crédito/débito)
    documento_que_se_modifica_tipo: '',
    documento_que_se_modifica_serie: '',
    documento_que_se_modifica_numero: '',
    tipo_de_nota_de_credito: '',
    tipo_de_nota_de_debito: '',

    // Configuración de envío
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: false,

    // Otros campos opcionales
    condiciones_de_pago: '',
    medio_de_pago: invoiceData.paymentMethod || '',
    placa_vehiculo: '',
    orden_compra_servicio: '',
    formato_de_pdf: '', // A4, A5 o TICKET (vacío = default)
    generado_por_contingencia: '',
    bienes_region_selva: '',
    servicios_region_selva: '',

    // Items (productos/servicios)
    items: convertItems(invoiceData.items, invoiceData.igvRate || 18),

    // Guías relacionadas
    guias: [],

    // Venta al crédito (cuotas)
    venta_al_credito: []
  }

  return nubefactJSON
}

/**
 * Determina el código de tipo de comprobante para NubeFact
 */
function getTipoComprobante(documentType) {
  const mapping = {
    'factura': 1,
    'boleta': 2,
    'nota_credito': 3,
    'nota_debito': 4
  }
  return mapping[documentType] || 1
}

/**
 * Obtiene la serie por defecto según tipo de documento
 */
function getDefaultSerie(documentType) {
  const mapping = {
    'factura': 'F001',
    'boleta': 'B001',
    'nota_credito': 'FC01',
    'nota_debito': 'FD01'
  }
  return mapping[documentType] || 'F001'
}

/**
 * Formatea fecha al formato DD-MM-YYYY requerido por NubeFact
 */
function formatDateForNubefact(date) {
  let dateObj

  if (date?.toDate) {
    // Firestore Timestamp
    dateObj = date.toDate()
  } else if (date instanceof Date) {
    dateObj = date
  } else if (typeof date === 'string') {
    dateObj = new Date(date)
  } else {
    // Sin fecha válida, usar hoy
    dateObj = new Date()
  }

  const day = String(dateObj.getDate()).padStart(2, '0')
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const year = dateObj.getFullYear()

  return `${day}-${month}-${year}`
}

/**
 * Extrae y formatea datos del cliente
 */
function getClienteData(customer) {
  if (!customer) {
    return {
      tipo_documento: '-',
      numero_documento: '00000000',
      denominacion: 'CLIENTE VARIOS',
      direccion: '-'
    }
  }

  // Mapear tipo de documento
  const tipoDocMapping = {
    'DNI': '1',
    'RUC': '6',
    'CARNET_EXTRANJERIA': '4',
    'PASAPORTE': '7'
  }

  return {
    tipo_documento: tipoDocMapping[customer.documentType] || '1',
    numero_documento: customer.documentNumber || '00000000',
    denominacion: customer.businessName || customer.name || 'CLIENTE',
    direccion: customer.address || '-'
  }
}

/**
 * Calcula totales de la factura
 */
function calculateTotals(items, igvRate) {
  if (!items || items.length === 0) {
    return {
      gravada: 0,
      inafecta: 0,
      exonerada: 0,
      gratuita: 0,
      igv: 0,
      total: 0
    }
  }

  let totalGravada = 0
  let totalInafecta = 0
  let totalExonerada = 0
  let totalGratuita = 0
  let totalIgv = 0

  items.forEach(item => {
    const subtotal = item.quantity * item.unitPrice

    // Por ahora asumimos que todo es gravado (afecto a IGV)
    // En una implementación completa, cada item debería tener su tipo de IGV
    totalGravada += subtotal
    totalIgv += subtotal * (igvRate / 100)
  })

  const total = totalGravada + totalInafecta + totalExonerada + totalIgv

  return {
    gravada: parseFloat(totalGravada.toFixed(2)),
    inafecta: parseFloat(totalInafecta.toFixed(2)),
    exonerada: parseFloat(totalExonerada.toFixed(2)),
    gratuita: parseFloat(totalGratuita.toFixed(2)),
    igv: parseFloat(totalIgv.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  }
}

/**
 * Convierte items de Firestore a formato NubeFact
 */
function convertItems(items, igvRate) {
  if (!items || items.length === 0) {
    return []
  }

  return items.map(item => {
    const quantity = item.quantity || 1
    const unitPrice = item.unitPrice || 0

    // Calcular valor unitario (sin IGV)
    const valorUnitario = unitPrice / (1 + igvRate / 100)

    // Subtotal sin IGV
    const subtotal = valorUnitario * quantity

    // IGV del item
    const igv = subtotal * (igvRate / 100)

    // Total del item (con IGV)
    const total = subtotal + igv

    return {
      unidad_de_medida: item.unit || 'NIU', // NIU = Unidad, ZZ = Servicio
      codigo: item.code || item.productId || '',
      codigo_producto_sunat: '', // Código de catálogo SUNAT (opcional)
      descripcion: item.name || item.description || 'PRODUCTO/SERVICIO',
      cantidad: quantity,
      valor_unitario: parseFloat(valorUnitario.toFixed(10)),
      precio_unitario: parseFloat(unitPrice.toFixed(10)),
      descuento: 0,
      subtotal: parseFloat(subtotal.toFixed(2)),
      tipo_de_igv: 1, // 1 = Gravado - Operación Onerosa
      igv: parseFloat(igv.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      anticipo_regularizacion: false,
      anticipo_documento_serie: '',
      anticipo_documento_numero: ''
    }
  })
}

/**
 * Convierte una nota de crédito a formato NubeFact
 */
export function convertCreditNoteToNubefactJSON(creditNoteData, businessData, originalInvoice) {
  // Usa la función principal y agrega campos específicos de NC
  const baseJSON = convertInvoiceToNubefactJSON(creditNoteData, businessData)

  // Agregar campos específicos de nota de crédito
  baseJSON.documento_que_se_modifica_tipo = getTipoComprobante(originalInvoice.documentType)
  baseJSON.documento_que_se_modifica_serie = originalInvoice.series
  baseJSON.documento_que_se_modifica_numero = originalInvoice.correlativeNumber
  baseJSON.tipo_de_nota_de_credito = creditNoteData.creditNoteType || 1 // 1 = Anulación de operación

  return baseJSON
}

/**
 * Convierte una nota de débito a formato NubeFact
 */
export function convertDebitNoteToNubefactJSON(debitNoteData, businessData, originalInvoice) {
  const baseJSON = convertInvoiceToNubefactJSON(debitNoteData, businessData)

  baseJSON.documento_que_se_modifica_tipo = getTipoComprobante(originalInvoice.documentType)
  baseJSON.documento_que_se_modifica_serie = originalInvoice.series
  baseJSON.documento_que_se_modifica_numero = originalInvoice.correlativeNumber
  baseJSON.tipo_de_nota_de_debito = debitNoteData.debitNoteType || 1 // 1 = Intereses por mora

  return baseJSON
}
