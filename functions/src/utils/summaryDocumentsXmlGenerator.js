/**
 * Generador de XML para Resumen Diario (SummaryDocuments)
 *
 * Este documento se usa para:
 * - Informar boletas de venta emitidas
 * - Anular boletas de venta (con ConditionCode 3)
 * - Informar notas de crédito/débito relacionadas a boletas
 *
 * Referencia: https://fe-primer.greenter.dev/docs/resumen_diario/
 */

/**
 * Códigos de condición para el estado del documento
 */
export const CONDITION_CODES = {
  ADD: '1',      // Adicionar (primera comunicación)
  MODIFY: '2',   // Modificar valores previos
  VOID: '3'      // Anular el comprobante
}

/**
 * Códigos de tipo de documento
 */
export const DOCUMENT_TYPE_CODES = {
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08'
}

/**
 * Códigos de tipo de identificación del cliente
 */
export const IDENTITY_TYPE_CODES = {
  DNI: '1',
  RUC: '6',
  OTROS: '-'
}

/**
 * Genera el XML de Resumen Diario (SummaryDocuments)
 * @param {Object} data - Datos del resumen diario
 * @param {string} data.id - Identificador RC-YYYYMMDD-correlativo
 * @param {string} data.referenceDate - Fecha de los documentos (YYYY-MM-DD)
 * @param {string} data.issueDate - Fecha del resumen (YYYY-MM-DD)
 * @param {Object} data.supplier - Datos del emisor
 * @param {string} data.supplier.ruc - RUC del emisor
 * @param {string} data.supplier.name - Razón social del emisor
 * @param {Array} data.documents - Lista de documentos a incluir
 * @param {number} data.documents[].lineId - Número de línea (1, 2, 3...)
 * @param {string} data.documents[].documentType - Código tipo doc (03=Boleta, 07=NC, 08=ND)
 * @param {string} data.documents[].documentId - Serie-Correlativo (B001-123)
 * @param {string} data.documents[].conditionCode - Código de condición (1=Adicionar, 3=Anular)
 * @param {Object} data.documents[].customer - Datos del cliente
 * @param {string} data.documents[].customer.identityType - Tipo de documento (1=DNI, 6=RUC)
 * @param {string} data.documents[].customer.identityNumber - Número de documento
 * @param {string} data.documents[].currency - Moneda (PEN, USD)
 * @param {number} data.documents[].total - Total del documento
 * @param {number} data.documents[].taxableAmount - Monto gravado (base imponible)
 * @param {number} data.documents[].exemptAmount - Monto exonerado (opcional)
 * @param {number} data.documents[].freeAmount - Monto gratuito (opcional)
 * @param {number} data.documents[].igv - Monto del IGV
 * @returns {string} XML generado
 */
export function generateSummaryDocumentsXML(data) {
  const { id, referenceDate, issueDate, supplier, documents } = data

  // Validaciones básicas
  if (!id || !referenceDate || !issueDate || !supplier || !documents?.length) {
    throw new Error('Faltan datos requeridos para generar XML de resumen diario')
  }

  // Generar líneas de documentos
  const documentLines = documents.map(doc => generateDocumentLine(doc)).join('')

  // Generar XML sin espacios innecesarios (como lo hace Greenter con spaceless)
  const xml = `<?xml version="1.0" encoding="utf-8"?>` +
    `<SummaryDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1" ` +
    `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
    `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" ` +
    `xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" ` +
    `xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1" ` +
    `xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<ext:UBLExtensions>` +
    `<ext:UBLExtension>` +
    `<ext:ExtensionContent/>` +
    `</ext:UBLExtension>` +
    `</ext:UBLExtensions>` +
    `<cbc:UBLVersionID>2.0</cbc:UBLVersionID>` +
    `<cbc:CustomizationID>1.1</cbc:CustomizationID>` +
    `<cbc:ID>${id}</cbc:ID>` +
    `<cbc:ReferenceDate>${referenceDate}</cbc:ReferenceDate>` +
    `<cbc:IssueDate>${issueDate}</cbc:IssueDate>` +
    `<cac:Signature>` +
    `<cbc:ID>SIGN${supplier.ruc}</cbc:ID>` +
    `<cac:SignatoryParty>` +
    `<cac:PartyIdentification>` +
    `<cbc:ID>${supplier.ruc}</cbc:ID>` +
    `</cac:PartyIdentification>` +
    `<cac:PartyName>` +
    `<cbc:Name><![CDATA[${supplier.name}]]></cbc:Name>` +
    `</cac:PartyName>` +
    `</cac:SignatoryParty>` +
    `<cac:DigitalSignatureAttachment>` +
    `<cac:ExternalReference>` +
    `<cbc:URI>#FACTUYA-SIGN</cbc:URI>` +
    `</cac:ExternalReference>` +
    `</cac:DigitalSignatureAttachment>` +
    `</cac:Signature>` +
    `<cac:AccountingSupplierParty>` +
    `<cbc:CustomerAssignedAccountID>${supplier.ruc}</cbc:CustomerAssignedAccountID>` +
    `<cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>` +
    `<cac:Party>` +
    `<cac:PartyLegalEntity>` +
    `<cbc:RegistrationName><![CDATA[${supplier.name}]]></cbc:RegistrationName>` +
    `</cac:PartyLegalEntity>` +
    `</cac:Party>` +
    `</cac:AccountingSupplierParty>` +
    documentLines +
    `</SummaryDocuments>`

  return xml
}

/**
 * Genera una línea de documento para el resumen
 * @param {Object} doc - Datos del documento
 * @returns {string} XML de la línea
 */
function generateDocumentLine(doc) {
  const {
    lineId,
    documentType,
    documentId,
    conditionCode,
    customer,
    currency = 'PEN',
    total = 0,
    taxableAmount = 0,
    exemptAmount = 0,
    freeAmount = 0,
    igv = 0
  } = doc

  // Formatear montos a 2 decimales
  const formatAmount = (amount) => (amount || 0).toFixed(2)

  // Si no hay ningún monto desglosado, calcular desde el total
  let effectiveTaxableAmount = taxableAmount
  let effectiveExemptAmount = exemptAmount
  let effectiveFreeAmount = freeAmount

  if (effectiveTaxableAmount === 0 && effectiveExemptAmount === 0 && effectiveFreeAmount === 0 && total > 0) {
    // Legacy: calcular desde total
    if (igv > 0) {
      effectiveTaxableAmount = total / 1.18
    } else {
      effectiveExemptAmount = total
    }
  }

  // Generar BillingPayments SOLO para montos > 0
  let billingPayments = ''

  // Monto gravado (operación gravada) - InstructionID 01
  if (effectiveTaxableAmount > 0) {
    billingPayments += `<sac:BillingPayment>` +
      `<cbc:PaidAmount currencyID="${currency}">${formatAmount(effectiveTaxableAmount)}</cbc:PaidAmount>` +
      `<cbc:InstructionID>01</cbc:InstructionID>` +
      `</sac:BillingPayment>`
  }

  // Monto exonerado - InstructionID 02
  if (effectiveExemptAmount > 0) {
    billingPayments += `<sac:BillingPayment>` +
      `<cbc:PaidAmount currencyID="${currency}">${formatAmount(effectiveExemptAmount)}</cbc:PaidAmount>` +
      `<cbc:InstructionID>02</cbc:InstructionID>` +
      `</sac:BillingPayment>`
  }

  // Monto inafecto - InstructionID 03
  if (effectiveFreeAmount > 0) {
    billingPayments += `<sac:BillingPayment>` +
      `<cbc:PaidAmount currencyID="${currency}">${formatAmount(effectiveFreeAmount)}</cbc:PaidAmount>` +
      `<cbc:InstructionID>03</cbc:InstructionID>` +
      `</sac:BillingPayment>`
  }

  // Fallback: si no hay ningún BillingPayment, usar total como gravado
  if (!billingPayments && total > 0) {
    const baseAmount = total / 1.18
    billingPayments = `<sac:BillingPayment>` +
      `<cbc:PaidAmount currencyID="${currency}">${formatAmount(baseAmount)}</cbc:PaidAmount>` +
      `<cbc:InstructionID>01</cbc:InstructionID>` +
      `</sac:BillingPayment>`
  }

  // Tipo de documento del cliente (1=DNI, 6=RUC, -=Otros)
  const customerIdType = customer?.identityType || '1'
  const customerIdNumber = customer?.identityNumber || '00000000'

  // Generar TaxSubtotals según tipos de operación
  let taxSubtotals = ''

  // TaxSubtotal para operaciones gravadas (IGV) - incluir si hay gravado o IGV
  if (effectiveTaxableAmount > 0 || igv > 0) {
    taxSubtotals += `<cac:TaxSubtotal>` +
      `<cbc:TaxAmount currencyID="${currency}">${formatAmount(igv)}</cbc:TaxAmount>` +
      `<cac:TaxCategory>` +
      `<cac:TaxScheme>` +
      `<cbc:ID>1000</cbc:ID>` +
      `<cbc:Name>IGV</cbc:Name>` +
      `<cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>` +
      `</cac:TaxScheme>` +
      `</cac:TaxCategory>` +
      `</cac:TaxSubtotal>`
  }

  // TaxSubtotal para operaciones exoneradas - solo si hay monto
  if (effectiveExemptAmount > 0) {
    taxSubtotals += `<cac:TaxSubtotal>` +
      `<cbc:TaxAmount currencyID="${currency}">0.00</cbc:TaxAmount>` +
      `<cac:TaxCategory>` +
      `<cac:TaxScheme>` +
      `<cbc:ID>9997</cbc:ID>` +
      `<cbc:Name>EXO</cbc:Name>` +
      `<cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>` +
      `</cac:TaxScheme>` +
      `</cac:TaxCategory>` +
      `</cac:TaxSubtotal>`
  }

  // TaxSubtotal para operaciones inafectas - solo si hay monto
  if (effectiveFreeAmount > 0) {
    taxSubtotals += `<cac:TaxSubtotal>` +
      `<cbc:TaxAmount currencyID="${currency}">0.00</cbc:TaxAmount>` +
      `<cac:TaxCategory>` +
      `<cac:TaxScheme>` +
      `<cbc:ID>9998</cbc:ID>` +
      `<cbc:Name>INA</cbc:Name>` +
      `<cbc:TaxTypeCode>FRE</cbc:TaxTypeCode>` +
      `</cac:TaxScheme>` +
      `</cac:TaxCategory>` +
      `</cac:TaxSubtotal>`
  }

  // Fallback: si no hay ningún TaxSubtotal, agregar uno de IGV con 0
  if (!taxSubtotals) {
    taxSubtotals = `<cac:TaxSubtotal>` +
      `<cbc:TaxAmount currencyID="${currency}">0.00</cbc:TaxAmount>` +
      `<cac:TaxCategory>` +
      `<cac:TaxScheme>` +
      `<cbc:ID>1000</cbc:ID>` +
      `<cbc:Name>IGV</cbc:Name>` +
      `<cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>` +
      `</cac:TaxScheme>` +
      `</cac:TaxCategory>` +
      `</cac:TaxSubtotal>`
  }

  return `<sac:SummaryDocumentsLine>` +
    `<cbc:LineID>${lineId}</cbc:LineID>` +
    `<cbc:DocumentTypeCode>${documentType}</cbc:DocumentTypeCode>` +
    `<cbc:ID>${documentId}</cbc:ID>` +
    `<cac:AccountingCustomerParty>` +
    `<cbc:CustomerAssignedAccountID>${customerIdNumber}</cbc:CustomerAssignedAccountID>` +
    `<cbc:AdditionalAccountID>${customerIdType}</cbc:AdditionalAccountID>` +
    `</cac:AccountingCustomerParty>` +
    `<cac:Status>` +
    `<cbc:ConditionCode>${conditionCode}</cbc:ConditionCode>` +
    `</cac:Status>` +
    `<sac:TotalAmount currencyID="${currency}">${formatAmount(total)}</sac:TotalAmount>` +
    billingPayments +
    `<cac:TaxTotal>` +
    `<cbc:TaxAmount currencyID="${currency}">${formatAmount(igv)}</cbc:TaxAmount>` +
    taxSubtotals +
    `</cac:TaxTotal>` +
    `</sac:SummaryDocumentsLine>`
}

/**
 * Genera el ID para un resumen diario
 * Formato: RC-YYYYMMDD-correlativo
 * @param {Date} date - Fecha del resumen
 * @param {number} correlativo - Número correlativo del día
 * @returns {string} ID generado
 */
export function generateSummaryDocumentId(date, correlativo) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `RC-${year}${month}${day}-${correlativo}`
}

/**
 * Formatea una fecha a YYYY-MM-DD
 * @param {Date} date - Fecha a formatear
 * @returns {string} Fecha formateada
 */
export function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Valida si una boleta puede ser anulada
 * @param {Object} boleta - Datos de la boleta
 * @param {Date|Object} boleta.issueDate - Fecha de emisión
 * @param {string} boleta.sunatStatus - Estado en SUNAT
 * @param {boolean} boleta.delivered - Si fue entregada al cliente
 * @param {string} boleta.documentType - Tipo de documento
 * @returns {Object} { canVoid: boolean, reason: string }
 */
export function canVoidBoleta(boleta) {
  // Verificar que sea una boleta
  const boletaTypes = ['boleta', 'receipt', '03']
  const docType = boleta.documentType?.toLowerCase() || ''

  if (!boletaTypes.includes(docType) && docType !== '03') {
    // Verificar por serie que empiece con B
    const series = boleta.series || boleta.number?.split('-')[0] || ''
    if (!series.toUpperCase().startsWith('B')) {
      return {
        canVoid: false,
        reason: 'Este documento no es una boleta. Use Comunicación de Baja para facturas.'
      }
    }
  }

  // Debe tener CDR aceptado o estar en proceso de anulación (para reintentos)
  const validStatuses = ['ACEPTADO', 'accepted', 'voiding']
  if (!validStatuses.includes(boleta.sunatStatus)) {
    return {
      canVoid: false,
      reason: 'La boleta debe estar aceptada por SUNAT para poder anularla'
    }
  }

  // No debe haber sido entregada al cliente
  if (boleta.delivered === true) {
    return {
      canVoid: false,
      reason: 'La boleta ya fue entregada al cliente. Debe emitir una Nota de Crédito.'
    }
  }

  // Debe estar dentro del plazo de 7 días
  const issueDate = boleta.issueDate?.toDate
    ? boleta.issueDate.toDate()
    : (boleta.issueDate instanceof Date ? boleta.issueDate : new Date(boleta.issueDate))

  const today = new Date()
  const diffTime = Math.abs(today - issueDate)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays > 7) {
    return {
      canVoid: false,
      reason: `Han pasado ${diffDays} días desde la emisión. El plazo máximo es 7 días. Debe emitir una Nota de Crédito.`
    }
  }

  return {
    canVoid: true,
    reason: 'La boleta puede ser anulada',
    daysRemaining: 7 - diffDays
  }
}

/**
 * Obtiene el código de tipo de identidad del cliente
 * @param {string} identityType - Tipo de identidad interno
 * @returns {string} Código SUNAT (1=DNI, 6=RUC, -=Otros)
 */
export function getIdentityTypeCode(identityType) {
  const codes = {
    'dni': '1',
    '1': '1',
    'ruc': '6',
    '6': '6',
    'carnet_extranjeria': '4',
    '4': '4',
    'pasaporte': '7',
    '7': '7',
    'otros': '-',
    '-': '-'
  }

  return codes[identityType?.toLowerCase()] || '1'
}
