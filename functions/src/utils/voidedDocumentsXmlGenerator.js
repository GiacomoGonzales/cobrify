/**
 * Generador de XML para Comunicación de Baja (VoidedDocuments)
 *
 * Este documento se usa para dar de baja facturas, notas de crédito y débito
 * que no han sido entregadas al cliente, dentro de los 7 días de emisión.
 *
 * Referencia: https://fe-primer.greenter.dev/docs/baja/
 */

/**
 * Genera el XML de Comunicación de Baja
 * @param {Object} data - Datos de la comunicación de baja
 * @param {string} data.id - Identificador RA-YYYYMMDD-correlativo
 * @param {string} data.referenceDate - Fecha del documento a anular (YYYY-MM-DD)
 * @param {string} data.issueDate - Fecha de la comunicación (YYYY-MM-DD)
 * @param {Object} data.supplier - Datos del emisor
 * @param {string} data.supplier.ruc - RUC del emisor
 * @param {string} data.supplier.name - Razón social del emisor
 * @param {Array} data.documents - Lista de documentos a dar de baja
 * @param {number} data.documents[].lineId - Número de línea (1, 2, 3...)
 * @param {string} data.documents[].documentType - Código tipo doc (01=Factura, 07=NC, 08=ND)
 * @param {string} data.documents[].series - Serie del documento (F001, FC01, etc.)
 * @param {number} data.documents[].number - Número correlativo
 * @param {string} data.documents[].reason - Motivo de la baja
 * @returns {string} XML generado
 */
export function generateVoidedDocumentsXML(data) {
  const { id, referenceDate, issueDate, supplier, documents } = data

  // Validaciones básicas
  if (!id || !referenceDate || !issueDate || !supplier || !documents?.length) {
    throw new Error('Faltan datos requeridos para generar XML de baja')
  }

  // Generar líneas de documentos a dar de baja (sin espacios adicionales)
  const documentLines = documents.map(doc =>
    `<sac:VoidedDocumentsLine>` +
    `<cbc:LineID>${doc.lineId}</cbc:LineID>` +
    `<cbc:DocumentTypeCode>${doc.documentType}</cbc:DocumentTypeCode>` +
    `<sac:DocumentSerialID>${doc.series}</sac:DocumentSerialID>` +
    `<sac:DocumentNumberID>${doc.number}</sac:DocumentNumberID>` +
    `<sac:VoidReasonDescription><![CDATA[${doc.reason || 'ANULACION DE OPERACION'}]]></sac:VoidReasonDescription>` +
    `</sac:VoidedDocumentsLine>`
  ).join('')

  // Generar XML sin espacios innecesarios (como lo hace Greenter con spaceless)
  // El ID de la firma debe ser SIGN + RUC según el template de Greenter
  const xml = `<?xml version="1.0" encoding="utf-8"?>` +
    `<VoidedDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1" ` +
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
    `<cbc:CustomizationID>1.0</cbc:CustomizationID>` +
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
    `</VoidedDocuments>`

  return xml
}

/**
 * Genera el ID para una comunicación de baja
 * Formato: RA-YYYYMMDD-correlativo
 * @param {Date} date - Fecha de la comunicación
 * @param {number} correlativo - Número correlativo del día
 * @returns {string} ID generado
 */
export function generateVoidedDocumentId(date, correlativo) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `RA-${year}${month}${day}-${correlativo}`
}

/**
 * Obtiene el código de tipo de documento para SUNAT
 * @param {string} documentType - Tipo de documento interno
 * @returns {string} Código SUNAT
 */
export function getDocumentTypeCode(documentType) {
  const codes = {
    'factura': '01',
    'invoice': '01',
    'nota_credito': '07',
    'credit_note': '07',
    'nota_debito': '08',
    'debit_note': '08',
    'guia_remision': '09',
    'dispatch_guide': '09'
  }

  return codes[documentType?.toLowerCase()] || '01'
}

/**
 * Valida si un documento puede ser dado de baja
 * @param {Object} document - Documento a validar
 * @param {Date} document.issueDate - Fecha de emisión
 * @param {string} document.sunatStatus - Estado en SUNAT
 * @param {boolean} document.delivered - Si fue entregado al cliente
 * @returns {Object} { canVoid: boolean, reason: string }
 */
export function canVoidDocument(document) {
  // Debe tener CDR aceptado o estar en proceso de anulación (para reintentos)
  const validStatuses = ['ACEPTADO', 'accepted', 'voiding']
  if (!validStatuses.includes(document.sunatStatus)) {
    return {
      canVoid: false,
      reason: 'El documento debe estar aceptado por SUNAT para poder anularlo'
    }
  }

  // No debe haber sido entregado al cliente
  if (document.delivered === true) {
    return {
      canVoid: false,
      reason: 'El documento ya fue entregado al cliente. Debe emitir una Nota de Crédito.'
    }
  }

  // Debe estar dentro del plazo de 7 días
  const issueDate = document.issueDate?.toDate ? document.issueDate.toDate() : new Date(document.issueDate)
  const today = new Date()
  const diffTime = Math.abs(today - issueDate)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays > 7) {
    return {
      canVoid: false,
      reason: `Han pasado ${diffDays} días desde la emisión. El plazo máximo es 7 días. Debe emitir una Nota de Crédito.`
    }
  }

  // Solo facturas y notas pueden anularse con comunicación de baja
  const validTypes = ['factura', 'invoice', 'nota_credito', 'credit_note', 'nota_debito', 'debit_note']
  if (!validTypes.includes(document.documentType?.toLowerCase())) {
    return {
      canVoid: false,
      reason: 'Solo facturas y notas de crédito/débito pueden anularse. Las boletas requieren resumen diario.'
    }
  }

  return {
    canVoid: true,
    reason: 'El documento puede ser anulado'
  }
}
