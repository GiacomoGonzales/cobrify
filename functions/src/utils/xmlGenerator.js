import { create } from 'xmlbuilder2'

/**
 * Genera XML UBL 2.1 para factura o boleta electrónica según especificaciones SUNAT
 *
 * Referencias:
 * - UBL 2.1: http://docs.oasis-open.org/ubl/UBL-2.1.html
 * - Especificaciones SUNAT: https://cpe.sunat.gob.pe/node/88
 */
export function generateInvoiceXML(invoiceData, businessData) {
  const isFactura = invoiceData.documentType === 'factura'
  const documentTypeCode = isFactura ? '01' : '03' // 01=Factura, 03=Boleta

  // Configuración de impuestos (IGV) - soporta IGV 0% para empresas exoneradas
  const igvRate = invoiceData.taxConfig?.igvRate ?? 18
  const igvExempt = invoiceData.taxConfig?.igvExempt ?? false
  const exemptionReason = invoiceData.taxConfig?.exemptionReason ?? ''
  const igvMultiplier = igvRate / 100

  // Formatear fecha para SUNAT (YYYY-MM-DD)
  let issueDate
  if (invoiceData.issueDate?.toDate) {
    // Si es un Firestore Timestamp
    issueDate = invoiceData.issueDate.toDate().toISOString().split('T')[0]
  } else if (invoiceData.issueDate) {
    // Si es un string o Date válido
    const date = new Date(invoiceData.issueDate)
    if (!isNaN(date.getTime())) {
      issueDate = date.toISOString().split('T')[0]
    } else {
      // Fecha inválida, usar fecha actual
      console.warn('⚠️ Fecha de emisión inválida, usando fecha actual')
      issueDate = new Date().toISOString().split('T')[0]
    }
  } else {
    // No hay fecha, usar fecha actual
    console.warn('⚠️ No hay fecha de emisión, usando fecha actual')
    issueDate = new Date().toISOString().split('T')[0]
  }

  // Construir XML según especificación UBL 2.1
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Invoice', {
      'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ccts': 'urn:un:unece:uncefact:documentation:2',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'xmlns:qdt': 'urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2',
      'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
      'xmlns:udt': 'urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    })

  // UBL Extensions (para firma digital)
  const extensions = root.ele('ext:UBLExtensions')
  const extension = extensions.ele('ext:UBLExtension')
  extension.ele('ext:ExtensionContent').txt('')

  // UBL Version
  root.ele('cbc:UBLVersionID').txt('2.1')

  // Customization ID (versión de SUNAT)
  root.ele('cbc:CustomizationID').txt('2.0')

  // ID del comprobante (Serie-Correlativo)
  root.ele('cbc:ID').txt(`${invoiceData.series}-${String(invoiceData.correlativeNumber).padStart(8, '0')}`)

  // Fecha de emisión
  root.ele('cbc:IssueDate').txt(issueDate)

  // Tipo de documento
  root.ele('cbc:InvoiceTypeCode', {
    'listID': '0101',
    'listAgencyName': 'PE:SUNAT',
    'listName': 'Tipo de Documento',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
  }).txt(documentTypeCode)

  // Moneda
  root.ele('cbc:DocumentCurrencyCode', {
    'listID': 'ISO 4217 Alpha',
    'listName': 'Currency',
    'listAgencyName': 'United Nations Economic Commission for Europe'
  }).txt(invoiceData.currency || 'PEN')

  // === FIRMA DIGITAL ===
  // La firma XMLDSig se insertará en ext:UBLExtensions por xmlSigner.js
  // No se requiere el elemento cac:Signature para SUNAT

  // === PROVEEDOR (Emisor) ===
  const accountingSupplierParty = root.ele('cac:AccountingSupplierParty')
  const supplierParty = accountingSupplierParty.ele('cac:Party')

  // Identificación del proveedor
  const supplierPartyId = supplierParty.ele('cac:PartyIdentification')
  supplierPartyId.ele('cbc:ID', {
    'schemeID': '6',
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(businessData.ruc)

  // Nombre comercial
  if (businessData.tradeName) {
    supplierParty.ele('cac:PartyName').ele('cbc:Name').txt(businessData.tradeName)
  }

  // PartyLegalEntity (debe contener tanto RegistrationName como RegistrationAddress)
  const supplierLegalEntity = supplierParty.ele('cac:PartyLegalEntity')

  // Razón social
  supplierLegalEntity.ele('cbc:RegistrationName').txt(businessData.businessName)

  // Dirección del proveedor
  const supplierAddress = supplierLegalEntity.ele('cac:RegistrationAddress')

  if (businessData.address) {
    // Orden según UBL 2.1 AddressType schema
    supplierAddress.ele('cbc:AddressTypeCode').txt('0000')

    // Departamento (ej: Lima, Arequipa)
    if (businessData.department) {
      supplierAddress.ele('cbc:Department').txt(businessData.department)
    }

    // Urbanización
    if (businessData.urbanization) {
      supplierAddress.ele('cbc:CitySubdivisionName').txt(businessData.urbanization)
    }

    // Provincia (ej: Lima, Callao) - usar CountrySubentity
    if (businessData.province) {
      supplierAddress.ele('cbc:CountrySubentity').txt(businessData.province)
    }

    // Distrito (ej: Miraflores, San Isidro)
    if (businessData.district) {
      supplierAddress.ele('cbc:District').txt(businessData.district)
    }

    const country = supplierAddress.ele('cac:Country')
    country.ele('cbc:IdentificationCode').txt('PE')
  }

  // === CLIENTE (Adquiriente) ===
  const accountingCustomerParty = root.ele('cac:AccountingCustomerParty')
  const customerParty = accountingCustomerParty.ele('cac:Party')

  // Identificación del cliente
  const customerPartyId = customerParty.ele('cac:PartyIdentification')
  const customerDocType = getCustomerDocTypeCode(invoiceData.customer.documentType)

  customerPartyId.ele('cbc:ID', {
    'schemeID': customerDocType,
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(invoiceData.customer.documentNumber)

  // Nombre o Razón Social del cliente
  const customerLegalEntity = customerParty.ele('cac:PartyLegalEntity')
  customerLegalEntity.ele('cbc:RegistrationName').txt(
    invoiceData.customer.businessName || invoiceData.customer.name
  )

  // === DESCUENTO GLOBAL ===
  // Si hay descuento aplicado, agregarlo como AllowanceCharge
  const discount = invoiceData.discount || 0
  if (discount > 0) {
    // subtotalBeforeDiscount: subtotal ANTES del descuento (suma de items)
    // discount: monto del descuento
    // subtotal: subtotal DESPUÉS del descuento (base imponible para IGV)
    const subtotalBeforeDiscount = invoiceData.subtotalBeforeDiscount || (invoiceData.subtotal + discount)

    const allowanceCharge = root.ele('cac:AllowanceCharge')
    allowanceCharge.ele('cbc:ChargeIndicator').txt('false') // false = descuento, true = cargo
    allowanceCharge.ele('cbc:AllowanceChargeReasonCode').txt('00') // 00 = Descuento global
    allowanceCharge.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(discount.toFixed(2))
    allowanceCharge.ele('cbc:BaseAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(subtotalBeforeDiscount.toFixed(2))
  }

  // === IMPUESTOS (IGV) ===
  // IMPORTANTE: TaxTotal DEBE ir ANTES de LegalMonetaryTotal según UBL 2.1
  const taxTotal = root.ele('cac:TaxTotal')
  taxTotal.ele('cbc:TaxAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(invoiceData.igv.toFixed(2))

  const taxSubtotal = taxTotal.ele('cac:TaxSubtotal')
  taxSubtotal.ele('cbc:TaxableAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(invoiceData.subtotal.toFixed(2))
  taxSubtotal.ele('cbc:TaxAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(invoiceData.igv.toFixed(2))

  const taxCategory = taxSubtotal.ele('cac:TaxCategory')
  taxCategory.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5305',
    'schemeName': 'Tax Category Identifier',
    'schemeAgencyName': 'United Nations Economic Commission for Europe'
  }).txt('S') // S = Standard rate

  const taxScheme = taxCategory.ele('cac:TaxScheme')
  taxScheme.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5153',
    'schemeAgencyID': '6'
  }).txt('1000') // 1000 = IGV
  taxScheme.ele('cbc:Name').txt('IGV')
  taxScheme.ele('cbc:TaxTypeCode').txt('VAT')

  // === TOTALES ===
  // IMPORTANTE: LegalMonetaryTotal DEBE ir DESPUÉS de TaxTotal y ANTES de InvoiceLine

  const legalMonetaryTotal = root.ele('cac:LegalMonetaryTotal')

  // Si hay descuento, incluir el monto total de descuentos
  if (discount > 0) {
    legalMonetaryTotal.ele('cbc:AllowanceTotalAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(discount.toFixed(2))
  }

  // Total valor de venta (sin IGV) - este es el subtotal DESPUÉS del descuento
  legalMonetaryTotal.ele('cbc:LineExtensionAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(invoiceData.subtotal.toFixed(2))

  // Total impuestos
  legalMonetaryTotal.ele('cbc:TaxInclusiveAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(invoiceData.total.toFixed(2))

  // Total a pagar
  legalMonetaryTotal.ele('cbc:PayableAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(invoiceData.total.toFixed(2))

  // === ITEMS ===
  invoiceData.items.forEach((item, index) => {
    const invoiceLine = root.ele('cac:InvoiceLine')

    // Código de afectación al IGV (10=Gravado, 20=Exonerado, 30=Inafecto)
    const taxAffectation = item.taxAffectation || '10'
    const isGravado = taxAffectation === '10'
    const isExonerado = taxAffectation === '20'
    const isInafecto = taxAffectation === '30'

    // ID de línea
    invoiceLine.ele('cbc:ID').txt(String(index + 1))

    // Cantidad
    invoiceLine.ele('cbc:InvoicedQuantity', {
      'unitCode': item.unit || 'NIU',
      'unitCodeListID': 'UN/ECE rec 20',
      'unitCodeListAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(item.quantity.toFixed(2))

    // IMPORTANTE: item.unitPrice YA INCLUYE IGV (viene del POS/frontend con IGV incluido)
    // Necesitamos calcular el precio sin IGV para el XML UBL 2.1

    // Precio unitario CON IGV (el que viene de la base de datos)
    const priceWithIGV = item.unitPrice

    // Precio unitario SIN IGV (valor base para SUNAT)
    // Para items gravados, dividimos entre 1.18 para obtener el valor sin IGV
    // Para items exonerados/inafectos, el precio ya está sin IGV
    const priceWithoutIGV = isGravado ? priceWithIGV / 1.18 : priceWithIGV

    // Total de la línea SIN IGV (base imponible)
    const lineTotal = item.quantity * priceWithoutIGV
    invoiceLine.ele('cbc:LineExtensionAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(lineTotal.toFixed(2))

    // Precio unitario (tipo 01 = precio unitario incluye IGV según catálogo 16)
    const pricingReference = invoiceLine.ele('cac:PricingReference')
    const alternativeCondition = pricingReference.ele('cac:AlternativeConditionPrice')
    alternativeCondition.ele('cbc:PriceAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(priceWithIGV.toFixed(2))
    alternativeCondition.ele('cbc:PriceTypeCode', {
      'listName': 'Tipo de Precio',
      'listAgencyName': 'PE:SUNAT',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16'
    }).txt('01') // 01 = Precio unitario (incluye el IGV)

    // Impuesto de la línea
    const lineTaxTotal = invoiceLine.ele('cac:TaxTotal')
    // Calcular IGV según la tasa configurada (puede ser 0% para exonerados)
    const lineIGV = isGravado ? lineTotal * igvMultiplier : 0
    lineTaxTotal.ele('cbc:TaxAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(lineIGV.toFixed(2))

    const lineTaxSubtotal = lineTaxTotal.ele('cac:TaxSubtotal')
    lineTaxSubtotal.ele('cbc:TaxableAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(lineTotal.toFixed(2))
    lineTaxSubtotal.ele('cbc:TaxAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(lineIGV.toFixed(2))

    const lineTaxCategory = lineTaxSubtotal.ele('cac:TaxCategory')

    // Tax Category ID según afectación:
    // S = Standard rate (Gravado)
    // E = Exempt from tax (Exonerado)
    // O = Not subject to tax (Inafecto)
    let taxCategoryId = 'S'
    if (isExonerado) taxCategoryId = 'E'
    if (isInafecto) taxCategoryId = 'O'

    lineTaxCategory.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5305',
      'schemeName': 'Tax Category Identifier',
      'schemeAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(taxCategoryId)

    // Solo incluir porcentaje para items gravados
    if (isGravado) {
      lineTaxCategory.ele('cbc:Percent').txt(igvRate.toFixed(2))
    }

    lineTaxCategory.ele('cbc:TaxExemptionReasonCode', {
      'listAgencyName': 'PE:SUNAT',
      'listName': 'Afectacion del IGV',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07'
    }).txt(taxAffectation) // 10=Gravado, 20=Exonerado, 30=Inafecto

    const lineItemTaxScheme = lineTaxCategory.ele('cac:TaxScheme')
    lineItemTaxScheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeName': 'Codigo de tributos',
      'schemeAgencyName': 'PE:SUNAT'
    }).txt('1000')
    lineItemTaxScheme.ele('cbc:Name').txt('IGV')
    lineItemTaxScheme.ele('cbc:TaxTypeCode').txt('VAT')

    // Descripción del item
    const lineItem = invoiceLine.ele('cac:Item')
    // Usar 'description' si existe, sino 'name' (por compatibilidad con POS)
    const itemDescription = item.description || item.name || 'Producto'
    lineItem.ele('cbc:Description').txt(itemDescription)

    const sellersItemId = lineItem.ele('cac:SellersItemIdentification')
    // Usar código del producto, si no existe usar productId, si tampoco existe usar índice
    sellersItemId.ele('cbc:ID').txt(item.code || item.productId || String(index + 1))

    // Precio unitario SIN IGV (valor base para SUNAT)
    const price = invoiceLine.ele('cac:Price')
    price.ele('cbc:PriceAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(priceWithoutIGV.toFixed(2))
  })

  return root.end({ prettyPrint: true })
}

/**
 * Genera XML UBL 2.1 para Nota de Crédito según especificaciones SUNAT
 *
 * @param {Object} creditNoteData - Datos de la nota de crédito
 * @param {Object} businessData - Datos del emisor
 * @returns {string} XML formateado
 *
 * Catálogo 09 - Tipos de nota de crédito:
 * - '01' = Anulación de la operación
 * - '02' = Anulación por error en el RUC
 * - '03' = Corrección por error en la descripción
 * - '06' = Devolución total
 * - '07' = Devolución por ítem
 * - '13' = Otros conceptos
 */
export function generateCreditNoteXML(creditNoteData, businessData) {
  // Configuración de impuestos (IGV) - soporta IGV 0% para empresas exoneradas
  const igvRate = creditNoteData.taxConfig?.igvRate ?? 18
  const igvExempt = creditNoteData.taxConfig?.igvExempt ?? false
  const exemptionReason = creditNoteData.taxConfig?.exemptionReason ?? ''
  const igvMultiplier = igvRate / 100

  // Formatear fecha para SUNAT (YYYY-MM-DD)
  let issueDate
  if (creditNoteData.issueDate?.toDate) {
    issueDate = creditNoteData.issueDate.toDate().toISOString().split('T')[0]
  } else if (creditNoteData.issueDate) {
    const date = new Date(creditNoteData.issueDate)
    if (!isNaN(date.getTime())) {
      issueDate = date.toISOString().split('T')[0]
    } else {
      console.warn('⚠️ Fecha de emisión inválida, usando fecha actual')
      issueDate = new Date().toISOString().split('T')[0]
    }
  } else {
    issueDate = new Date().toISOString().split('T')[0]
  }

  // Construir XML según especificación UBL 2.1 CreditNote
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('CreditNote', {
      'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ccts': 'urn:un:unece:uncefact:documentation:2',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'xmlns:qdt': 'urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2',
      'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
      'xmlns:udt': 'urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    })

  // UBL Extensions (para firma digital)
  const extensions = root.ele('ext:UBLExtensions')
  const extension = extensions.ele('ext:UBLExtension')
  extension.ele('ext:ExtensionContent').txt('')

  // UBL Version
  root.ele('cbc:UBLVersionID').txt('2.1')

  // Customization ID (versión de SUNAT)
  root.ele('cbc:CustomizationID').txt('2.0')

  // ID de la nota de crédito (Serie-Correlativo)
  root.ele('cbc:ID').txt(`${creditNoteData.series}-${String(creditNoteData.correlativeNumber).padStart(8, '0')}`)

  // Fecha de emisión
  root.ele('cbc:IssueDate').txt(issueDate)

  // Moneda
  root.ele('cbc:DocumentCurrencyCode', {
    'listID': 'ISO 4217 Alpha',
    'listName': 'Currency',
    'listAgencyName': 'United Nations Economic Commission for Europe'
  }).txt(creditNoteData.currency || 'PEN')

  // === DOCUMENTO REFERENCIADO (Factura/Boleta original) ===
  // Información de discrepancia (motivo de la nota de crédito)
  const discrepancyResponse = root.ele('cac:DiscrepancyResponse')
  discrepancyResponse.ele('cbc:ReferenceID').txt(creditNoteData.referencedDocumentId) // Serie-Correlativo del doc original
  discrepancyResponse.ele('cbc:ResponseCode').txt(creditNoteData.discrepancyCode || '01') // Catálogo 09
  discrepancyResponse.ele('cbc:Description').txt(creditNoteData.discrepancyReason || 'Anulación de la operación')

  // Referencia de facturación (documento que se modifica)
  const billingReference = root.ele('cac:BillingReference')
  const invoiceDocumentReference = billingReference.ele('cac:InvoiceDocumentReference')
  invoiceDocumentReference.ele('cbc:ID').txt(creditNoteData.referencedDocumentId)
  invoiceDocumentReference.ele('cbc:DocumentTypeCode', {
    'listAgencyName': 'PE:SUNAT',
    'listName': 'Tipo de Documento',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
  }).txt(creditNoteData.referencedDocumentType || '01') // 01=Factura, 03=Boleta

  // === PROVEEDOR (Emisor) ===
  const accountingSupplierParty = root.ele('cac:AccountingSupplierParty')
  const supplierParty = accountingSupplierParty.ele('cac:Party')

  // Identificación del proveedor
  const supplierPartyId = supplierParty.ele('cac:PartyIdentification')
  supplierPartyId.ele('cbc:ID', {
    'schemeID': '6',
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(businessData.ruc)

  // Nombre comercial
  if (businessData.tradeName) {
    supplierParty.ele('cac:PartyName').ele('cbc:Name').txt(businessData.tradeName)
  }

  // PartyLegalEntity
  const supplierLegalEntity = supplierParty.ele('cac:PartyLegalEntity')
  supplierLegalEntity.ele('cbc:RegistrationName').txt(businessData.businessName)

  // Dirección del proveedor
  const supplierAddress = supplierLegalEntity.ele('cac:RegistrationAddress')
  if (businessData.address) {
    supplierAddress.ele('cbc:AddressTypeCode').txt('0000')
    if (businessData.department) supplierAddress.ele('cbc:Department').txt(businessData.department)
    if (businessData.urbanization) supplierAddress.ele('cbc:CitySubdivisionName').txt(businessData.urbanization)
    if (businessData.province) supplierAddress.ele('cbc:CountrySubentity').txt(businessData.province)
    if (businessData.district) supplierAddress.ele('cbc:District').txt(businessData.district)
    const country = supplierAddress.ele('cac:Country')
    country.ele('cbc:IdentificationCode').txt('PE')
  }

  // === CLIENTE (Adquiriente) ===
  const accountingCustomerParty = root.ele('cac:AccountingCustomerParty')
  const customerParty = accountingCustomerParty.ele('cac:Party')

  // Identificación del cliente
  const customerPartyId = customerParty.ele('cac:PartyIdentification')
  const customerDocType = getCustomerDocTypeCode(creditNoteData.customer.documentType)

  customerPartyId.ele('cbc:ID', {
    'schemeID': customerDocType,
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(creditNoteData.customer.documentNumber)

  // Nombre o Razón Social del cliente
  const customerLegalEntity = customerParty.ele('cac:PartyLegalEntity')
  customerLegalEntity.ele('cbc:RegistrationName').txt(
    creditNoteData.customer.businessName || creditNoteData.customer.name
  )

  // === DESCUENTO GLOBAL ===
  const creditDiscount = creditNoteData.discount || 0
  if (creditDiscount > 0) {
    const subtotalBeforeDiscount = creditNoteData.subtotalBeforeDiscount || (creditNoteData.subtotal + creditDiscount)

    const allowanceCharge = root.ele('cac:AllowanceCharge')
    allowanceCharge.ele('cbc:ChargeIndicator').txt('false')
    allowanceCharge.ele('cbc:AllowanceChargeReasonCode').txt('00')
    allowanceCharge.ele('cbc:Amount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(creditDiscount.toFixed(2))
    allowanceCharge.ele('cbc:BaseAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(subtotalBeforeDiscount.toFixed(2))
  }

  // === IMPUESTOS (IGV) ===
  const taxTotal = root.ele('cac:TaxTotal')
  taxTotal.ele('cbc:TaxAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
    .txt(creditNoteData.igv.toFixed(2))

  const taxSubtotal = taxTotal.ele('cac:TaxSubtotal')
  taxSubtotal.ele('cbc:TaxableAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
    .txt(creditNoteData.subtotal.toFixed(2))
  taxSubtotal.ele('cbc:TaxAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
    .txt(creditNoteData.igv.toFixed(2))

  const taxCategory = taxSubtotal.ele('cac:TaxCategory')
  taxCategory.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5305',
    'schemeName': 'Tax Category Identifier',
    'schemeAgencyName': 'United Nations Economic Commission for Europe'
  }).txt('S')

  const taxScheme = taxCategory.ele('cac:TaxScheme')
  taxScheme.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5153',
    'schemeAgencyID': '6'
  }).txt('1000')
  taxScheme.ele('cbc:Name').txt('IGV')
  taxScheme.ele('cbc:TaxTypeCode').txt('VAT')

  // === TOTALES ===
  const legalMonetaryTotal = root.ele('cac:LegalMonetaryTotal')

  if (creditDiscount > 0) {
    legalMonetaryTotal.ele('cbc:AllowanceTotalAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(creditDiscount.toFixed(2))
  }

  legalMonetaryTotal.ele('cbc:PayableAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
    .txt(creditNoteData.total.toFixed(2))

  // === ITEMS (CreditNoteLine en lugar de InvoiceLine) ===
  creditNoteData.items.forEach((item, index) => {
    const creditNoteLine = root.ele('cac:CreditNoteLine')

    // Código de afectación al IGV
    const taxAffectation = item.taxAffectation || '10'
    const isGravado = taxAffectation === '10'
    const isExonerado = taxAffectation === '20'
    const isInafecto = taxAffectation === '30'

    // ID de línea
    creditNoteLine.ele('cbc:ID').txt(String(index + 1))

    // Cantidad (CreditedQuantity en lugar de InvoicedQuantity)
    creditNoteLine.ele('cbc:CreditedQuantity', {
      'unitCode': item.unit || 'NIU',
      'unitCodeListID': 'UN/ECE rec 20',
      'unitCodeListAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(item.quantity.toFixed(2))

    // IMPORTANTE: item.unitPrice YA INCLUYE IGV (viene del POS/frontend con IGV incluido)
    const priceWithIGV = item.unitPrice
    const priceWithoutIGV = isGravado ? priceWithIGV / 1.18 : priceWithIGV

    // Total línea SIN IGV (base imponible)
    const lineTotal = item.quantity * priceWithoutIGV
    creditNoteLine.ele('cbc:LineExtensionAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(lineTotal.toFixed(2))

    // Precio unitario CON IGV
    const pricingReference = creditNoteLine.ele('cac:PricingReference')
    const alternativeCondition = pricingReference.ele('cac:AlternativeConditionPrice')
    alternativeCondition.ele('cbc:PriceAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(priceWithIGV.toFixed(2))
    alternativeCondition.ele('cbc:PriceTypeCode', {
      'listName': 'Tipo de Precio',
      'listAgencyName': 'PE:SUNAT',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16'
    }).txt('01')

    // Impuesto de la línea
    const lineTaxTotal = creditNoteLine.ele('cac:TaxTotal')
    const lineIGV = isGravado ? lineTotal * igvMultiplier : 0
    lineTaxTotal.ele('cbc:TaxAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(lineIGV.toFixed(2))

    const lineTaxSubtotal = lineTaxTotal.ele('cac:TaxSubtotal')
    lineTaxSubtotal.ele('cbc:TaxableAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(lineTotal.toFixed(2))
    lineTaxSubtotal.ele('cbc:TaxAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(lineIGV.toFixed(2))

    const lineTaxCategory = lineTaxSubtotal.ele('cac:TaxCategory')

    // Tax Category ID
    let taxCategoryId = 'S'
    if (isExonerado) taxCategoryId = 'E'
    if (isInafecto) taxCategoryId = 'O'

    lineTaxCategory.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5305',
      'schemeName': 'Tax Category Identifier',
      'schemeAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(taxCategoryId)

    if (isGravado) {
      lineTaxCategory.ele('cbc:Percent').txt(igvRate.toFixed(2))
    }

    lineTaxCategory.ele('cbc:TaxExemptionReasonCode', {
      'listAgencyName': 'PE:SUNAT',
      'listName': 'Afectacion del IGV',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07'
    }).txt(taxAffectation)

    const lineItemTaxScheme = lineTaxCategory.ele('cac:TaxScheme')
    lineItemTaxScheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeName': 'Codigo de tributos',
      'schemeAgencyName': 'PE:SUNAT'
    }).txt('1000')
    lineItemTaxScheme.ele('cbc:Name').txt('IGV')
    lineItemTaxScheme.ele('cbc:TaxTypeCode').txt('VAT')

    // Descripción del item
    const lineItem = creditNoteLine.ele('cac:Item')
    const itemDescription = item.description || item.name || 'Producto'
    lineItem.ele('cbc:Description').txt(itemDescription)

    const sellersItemId = lineItem.ele('cac:SellersItemIdentification')
    // Usar código del producto, si no existe usar productId, si tampoco existe usar índice
    sellersItemId.ele('cbc:ID').txt(item.code || item.productId || String(index + 1))

    // Precio unitario SIN IGV (valor base para SUNAT)
    const price = creditNoteLine.ele('cac:Price')
    price.ele('cbc:PriceAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(priceWithoutIGV.toFixed(2))
  })

  return root.end({ prettyPrint: true })
}

/**
 * Genera XML UBL 2.1 para Nota de Débito según especificaciones SUNAT
 *
 * @param {Object} debitNoteData - Datos de la nota de débito
 * @param {Object} businessData - Datos del emisor
 * @returns {string} XML formateado
 *
 * Catálogo 10 - Tipos de nota de débito:
 * - '01' = Intereses por mora
 * - '02' = Aumento en el valor
 * - '03' = Penalidades/ otros conceptos
 * - '10' = Ajuste de operaciones de exportación
 * - '11' = Ajuste afectos al IVAP
 */
export function generateDebitNoteXML(debitNoteData, businessData) {
  // Formatear fecha para SUNAT (YYYY-MM-DD)
  let issueDate
  if (debitNoteData.issueDate?.toDate) {
    issueDate = debitNoteData.issueDate.toDate().toISOString().split('T')[0]
  } else if (debitNoteData.issueDate) {
    const date = new Date(debitNoteData.issueDate)
    if (!isNaN(date.getTime())) {
      issueDate = date.toISOString().split('T')[0]
    } else {
      console.warn('⚠️ Fecha de emisión inválida, usando fecha actual')
      issueDate = new Date().toISOString().split('T')[0]
    }
  } else {
    issueDate = new Date().toISOString().split('T')[0]
  }

  // Construir XML según especificación UBL 2.1 DebitNote
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('DebitNote', {
      'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ccts': 'urn:un:unece:uncefact:documentation:2',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'xmlns:qdt': 'urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2',
      'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
      'xmlns:udt': 'urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    })

  // UBL Extensions (para firma digital)
  const extensions = root.ele('ext:UBLExtensions')
  const extension = extensions.ele('ext:UBLExtension')
  extension.ele('ext:ExtensionContent').txt('')

  // UBL Version
  root.ele('cbc:UBLVersionID').txt('2.1')

  // Customization ID (versión de SUNAT)
  root.ele('cbc:CustomizationID').txt('2.0')

  // ID de la nota de débito (Serie-Correlativo)
  root.ele('cbc:ID').txt(`${debitNoteData.series}-${String(debitNoteData.correlativeNumber).padStart(8, '0')}`)

  // Fecha de emisión
  root.ele('cbc:IssueDate').txt(issueDate)

  // Moneda
  root.ele('cbc:DocumentCurrencyCode', {
    'listID': 'ISO 4217 Alpha',
    'listName': 'Currency',
    'listAgencyName': 'United Nations Economic Commission for Europe'
  }).txt(debitNoteData.currency || 'PEN')

  // === DOCUMENTO REFERENCIADO (Factura/Boleta original) ===
  // Información de discrepancia (motivo de la nota de débito)
  const discrepancyResponse = root.ele('cac:DiscrepancyResponse')
  discrepancyResponse.ele('cbc:ReferenceID').txt(debitNoteData.referencedDocumentId)
  discrepancyResponse.ele('cbc:ResponseCode').txt(debitNoteData.discrepancyCode || '01') // Catálogo 10
  discrepancyResponse.ele('cbc:Description').txt(debitNoteData.discrepancyReason || 'Intereses por mora')

  // Referencia de facturación (documento que se modifica)
  const billingReference = root.ele('cac:BillingReference')
  const invoiceDocumentReference = billingReference.ele('cac:InvoiceDocumentReference')
  invoiceDocumentReference.ele('cbc:ID').txt(debitNoteData.referencedDocumentId)
  invoiceDocumentReference.ele('cbc:DocumentTypeCode', {
    'listAgencyName': 'PE:SUNAT',
    'listName': 'Tipo de Documento',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
  }).txt(debitNoteData.referencedDocumentType || '01') // 01=Factura, 03=Boleta

  // === PROVEEDOR (Emisor) ===
  const accountingSupplierParty = root.ele('cac:AccountingSupplierParty')
  const supplierParty = accountingSupplierParty.ele('cac:Party')

  // Identificación del proveedor
  const supplierPartyId = supplierParty.ele('cac:PartyIdentification')
  supplierPartyId.ele('cbc:ID', {
    'schemeID': '6',
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(businessData.ruc)

  // Nombre comercial
  if (businessData.tradeName) {
    supplierParty.ele('cac:PartyName').ele('cbc:Name').txt(businessData.tradeName)
  }

  // PartyLegalEntity
  const supplierLegalEntity = supplierParty.ele('cac:PartyLegalEntity')
  supplierLegalEntity.ele('cbc:RegistrationName').txt(businessData.businessName)

  // Dirección del proveedor
  const supplierAddress = supplierLegalEntity.ele('cac:RegistrationAddress')
  if (businessData.address) {
    supplierAddress.ele('cbc:AddressTypeCode').txt('0000')
    if (businessData.department) supplierAddress.ele('cbc:Department').txt(businessData.department)
    if (businessData.urbanization) supplierAddress.ele('cbc:CitySubdivisionName').txt(businessData.urbanization)
    if (businessData.province) supplierAddress.ele('cbc:CountrySubentity').txt(businessData.province)
    if (businessData.district) supplierAddress.ele('cbc:District').txt(businessData.district)
    const country = supplierAddress.ele('cac:Country')
    country.ele('cbc:IdentificationCode').txt('PE')
  }

  // === CLIENTE (Adquiriente) ===
  const accountingCustomerParty = root.ele('cac:AccountingCustomerParty')
  const customerParty = accountingCustomerParty.ele('cac:Party')

  // Identificación del cliente
  const customerPartyId = customerParty.ele('cac:PartyIdentification')
  const customerDocType = getCustomerDocTypeCode(debitNoteData.customer.documentType)

  customerPartyId.ele('cbc:ID', {
    'schemeID': customerDocType,
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(debitNoteData.customer.documentNumber)

  // Nombre o Razón Social del cliente
  const customerLegalEntity = customerParty.ele('cac:PartyLegalEntity')
  customerLegalEntity.ele('cbc:RegistrationName').txt(
    debitNoteData.customer.businessName || debitNoteData.customer.name
  )

  // === DESCUENTO GLOBAL ===
  const debitDiscount = debitNoteData.discount || 0
  if (debitDiscount > 0) {
    const subtotalBeforeDiscount = debitNoteData.subtotalBeforeDiscount || (debitNoteData.subtotal + debitDiscount)

    const allowanceCharge = root.ele('cac:AllowanceCharge')
    allowanceCharge.ele('cbc:ChargeIndicator').txt('false')
    allowanceCharge.ele('cbc:AllowanceChargeReasonCode').txt('00')
    allowanceCharge.ele('cbc:Amount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(debitDiscount.toFixed(2))
    allowanceCharge.ele('cbc:BaseAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(subtotalBeforeDiscount.toFixed(2))
  }

  // === IMPUESTOS (IGV) ===
  const taxTotal = root.ele('cac:TaxTotal')
  taxTotal.ele('cbc:TaxAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
    .txt(debitNoteData.igv.toFixed(2))

  const taxSubtotal = taxTotal.ele('cac:TaxSubtotal')
  taxSubtotal.ele('cbc:TaxableAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
    .txt(debitNoteData.subtotal.toFixed(2))
  taxSubtotal.ele('cbc:TaxAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
    .txt(debitNoteData.igv.toFixed(2))

  const taxCategory = taxSubtotal.ele('cac:TaxCategory')
  taxCategory.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5305',
    'schemeName': 'Tax Category Identifier',
    'schemeAgencyName': 'United Nations Economic Commission for Europe'
  }).txt('S')

  const taxScheme = taxCategory.ele('cac:TaxScheme')
  taxScheme.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5153',
    'schemeAgencyID': '6'
  }).txt('1000')
  taxScheme.ele('cbc:Name').txt('IGV')
  taxScheme.ele('cbc:TaxTypeCode').txt('VAT')

  // === TOTALES ===
  const legalMonetaryTotal = root.ele('cac:RequestedMonetaryTotal')

  if (debitDiscount > 0) {
    legalMonetaryTotal.ele('cbc:AllowanceTotalAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(debitDiscount.toFixed(2))
  }

  legalMonetaryTotal.ele('cbc:PayableAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
    .txt(debitNoteData.total.toFixed(2))

  // === ITEMS (DebitNoteLine en lugar de InvoiceLine) ===
  debitNoteData.items.forEach((item, index) => {
    const debitNoteLine = root.ele('cac:DebitNoteLine')

    // Código de afectación al IGV
    const taxAffectation = item.taxAffectation || '10'
    const isGravado = taxAffectation === '10'
    const isExonerado = taxAffectation === '20'
    const isInafecto = taxAffectation === '30'

    // ID de línea
    debitNoteLine.ele('cbc:ID').txt(String(index + 1))

    // Cantidad (DebitedQuantity en lugar de InvoicedQuantity)
    debitNoteLine.ele('cbc:DebitedQuantity', {
      'unitCode': item.unit || 'NIU',
      'unitCodeListID': 'UN/ECE rec 20',
      'unitCodeListAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(item.quantity.toFixed(2))

    // IMPORTANTE: item.unitPrice YA INCLUYE IGV (viene del POS/frontend con IGV incluido)
    const priceWithIGV = item.unitPrice
    const priceWithoutIGV = isGravado ? priceWithIGV / 1.18 : priceWithIGV

    // Total línea SIN IGV (base imponible)
    const lineTotal = item.quantity * priceWithoutIGV
    debitNoteLine.ele('cbc:LineExtensionAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(lineTotal.toFixed(2))

    // Precio unitario CON IGV
    const pricingReference = debitNoteLine.ele('cac:PricingReference')
    const alternativeCondition = pricingReference.ele('cac:AlternativeConditionPrice')
    alternativeCondition.ele('cbc:PriceAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(priceWithIGV.toFixed(2))
    alternativeCondition.ele('cbc:PriceTypeCode', {
      'listName': 'Tipo de Precio',
      'listAgencyName': 'PE:SUNAT',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16'
    }).txt('01')

    // Impuesto de la línea
    const lineTaxTotal = debitNoteLine.ele('cac:TaxTotal')
    const lineIGV = isGravado ? lineTotal * 0.18 : 0
    lineTaxTotal.ele('cbc:TaxAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(lineIGV.toFixed(2))

    const lineTaxSubtotal = lineTaxTotal.ele('cac:TaxSubtotal')
    lineTaxSubtotal.ele('cbc:TaxableAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(lineTotal.toFixed(2))
    lineTaxSubtotal.ele('cbc:TaxAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(lineIGV.toFixed(2))

    const lineTaxCategory = lineTaxSubtotal.ele('cac:TaxCategory')

    // Tax Category ID
    let taxCategoryId = 'S'
    if (isExonerado) taxCategoryId = 'E'
    if (isInafecto) taxCategoryId = 'O'

    lineTaxCategory.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5305',
      'schemeName': 'Tax Category Identifier',
      'schemeAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(taxCategoryId)

    if (isGravado) {
      lineTaxCategory.ele('cbc:Percent').txt(igvRate.toFixed(2))
    }

    lineTaxCategory.ele('cbc:TaxExemptionReasonCode', {
      'listAgencyName': 'PE:SUNAT',
      'listName': 'Afectacion del IGV',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07'
    }).txt(taxAffectation)

    const lineItemTaxScheme = lineTaxCategory.ele('cac:TaxScheme')
    lineItemTaxScheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeName': 'Codigo de tributos',
      'schemeAgencyName': 'PE:SUNAT'
    }).txt('1000')
    lineItemTaxScheme.ele('cbc:Name').txt('IGV')
    lineItemTaxScheme.ele('cbc:TaxTypeCode').txt('VAT')

    // Descripción del item
    const lineItem = debitNoteLine.ele('cac:Item')
    const itemDescription = item.description || item.name || 'Producto'
    lineItem.ele('cbc:Description').txt(itemDescription)

    const sellersItemId = lineItem.ele('cac:SellersItemIdentification')
    // Usar código del producto, si no existe usar productId, si tampoco existe usar índice
    sellersItemId.ele('cbc:ID').txt(item.code || item.productId || String(index + 1))

    // Precio unitario SIN IGV (valor base para SUNAT)
    const price = debitNoteLine.ele('cac:Price')
    price.ele('cbc:PriceAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(priceWithoutIGV.toFixed(2))
  })

  return root.end({ prettyPrint: true })
}

/**
 * Convierte tipo de documento del cliente al código SUNAT
 */
function getCustomerDocTypeCode(documentType) {
  const docTypeMap = {
    'DNI': '1',
    'RUC': '6',
    'CE': '4',
    'PASSPORT': '7'
  }
  return docTypeMap[documentType] || '1'
}

/**
 * Genera XML UBL 2.1 para Guía de Remisión Electrónica según especificaciones SUNAT
 *
 * @param {Object} guideData - Datos de la guía de remisión
 * @param {Object} businessData - Datos del negocio emisor
 * @returns {string} XML en formato string
 *
 * Referencias:
 * - UBL 2.1 DespatchAdvice: http://docs.oasis-open.org/ubl/UBL-2.1.html
 * - Especificaciones SUNAT GRE: https://cpe.sunat.gob.pe/
 */
export function generateDispatchGuideXML(guideData, businessData) {
  // Formatear fecha de emisión (hoy)
  const issueDate = new Date().toISOString().split('T')[0]

  // Formatear fecha de inicio del traslado
  let transferDate
  if (guideData.transferDate) {
    transferDate = new Date(guideData.transferDate).toISOString().split('T')[0]
  } else {
    transferDate = issueDate
  }

  // Construir XML según especificación UBL 2.1 - DespatchAdvice
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('DespatchAdvice', {
      'xmlns': 'urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ccts': 'urn:un:unece:uncefact:documentation:2',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'xmlns:qdt': 'urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2',
      'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
      'xmlns:udt': 'urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    })

  // UBL Extensions (para firma digital)
  const extensions = root.ele('ext:UBLExtensions')
  const extension = extensions.ele('ext:UBLExtension')
  extension.ele('ext:ExtensionContent').txt('')

  // UBL Version
  root.ele('cbc:UBLVersionID').txt('2.1')

  // Customization ID (versión de SUNAT para GRE)
  root.ele('cbc:CustomizationID', {
    'schemeAgencyName': 'PE:SUNAT'
  }).txt('2.0')

  // ID de la guía (Serie-Correlativo)
  root.ele('cbc:ID').txt(guideData.number || `${guideData.series}-${String(guideData.correlative).padStart(8, '0')}`)

  // Fecha de emisión
  root.ele('cbc:IssueDate').txt(issueDate)

  // Hora de emisión (opcional pero recomendado)
  const issueTime = new Date().toTimeString().split(' ')[0] // HH:MM:SS
  root.ele('cbc:IssueTime').txt(issueTime)

  // Tipo de documento: 09 = Guía de Remisión Remitente
  root.ele('cbc:DespatchAdviceTypeCode', {
    'listAgencyName': 'PE:SUNAT',
    'listName': 'Tipo de Documento',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
  }).txt('09')

  // Referencia a documento relacionado (factura/boleta origen)
  if (guideData.referencedInvoice) {
    const additionalDoc = root.ele('cac:AdditionalDocumentReference')
    additionalDoc.ele('cbc:ID').txt(
      `${guideData.referencedInvoice.series}-${guideData.referencedInvoice.number}`
    )
    additionalDoc.ele('cbc:DocumentTypeCode', {
      'listAgencyName': 'PE:SUNAT',
      'listName': 'Tipo de Documento',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
    }).txt(guideData.referencedInvoice.documentType || '01')
  }

  // === REMITENTE (Emisor de la guía) ===
  const despatchSupplierParty = root.ele('cac:DespatchSupplierParty')
  const supplierParty = despatchSupplierParty.ele('cac:Party')

  // Identificación del remitente (RUC)
  const supplierPartyId = supplierParty.ele('cac:PartyIdentification')
  supplierPartyId.ele('cbc:ID', {
    'schemeID': '6',
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(businessData.ruc)

  // Nombre o razón social del remitente
  const supplierLegalEntity = supplierParty.ele('cac:PartyLegalEntity')
  supplierLegalEntity.ele('cbc:RegistrationName').txt(businessData.businessName)

  // === DESTINATARIO ===
  const deliveryCustomerParty = root.ele('cac:DeliveryCustomerParty')
  const customerParty = deliveryCustomerParty.ele('cac:Party')

  // Identificación del destinatario
  const customerPartyId = customerParty.ele('cac:PartyIdentification')
  customerPartyId.ele('cbc:ID', {
    'schemeID': guideData.customer?.documentType === 'RUC' ? '6' : '1',
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(guideData.customer?.documentNumber || '-')

  // Nombre del destinatario
  const customerLegalEntity = customerParty.ele('cac:PartyLegalEntity')
  customerLegalEntity.ele('cbc:RegistrationName').txt(guideData.customer?.name || 'VARIOS')

  // === ENVÍO (Shipment) ===
  const shipment = root.ele('cac:Shipment')
  shipment.ele('cbc:ID').txt('1')

  // Motivo de traslado (Catálogo 20)
  shipment.ele('cbc:HandlingCode', {
    'listAgencyName': 'PE:SUNAT',
    'listName': 'Motivo de traslado',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20'
  }).txt(guideData.transferReason || '01')

  // Descripción del motivo (opcional)
  const transferReasonNames = {
    '01': 'VENTA',
    '02': 'COMPRA',
    '04': 'TRASLADO ENTRE ESTABLECIMIENTOS DE LA MISMA EMPRESA',
    '08': 'IMPORTACION',
    '09': 'EXPORTACION',
    '13': 'OTROS'
  }
  if (transferReasonNames[guideData.transferReason]) {
    shipment.ele('cbc:Information').txt(transferReasonNames[guideData.transferReason])
  }

  // Peso bruto total
  shipment.ele('cbc:GrossWeightMeasure', {
    'unitCode': 'KGM'
  }).txt((guideData.totalWeight || 0).toFixed(2))

  // === PUNTO DE PARTIDA (Origen) ===
  const deliveryAddress = shipment.ele('cac:Delivery').ele('cac:DeliveryAddress')
  deliveryAddress.ele('cbc:ID', {
    'schemeAgencyName': 'PE:INEI',
    'schemeName': 'Ubigeos'
  }).txt(guideData.origin?.ubigeo || '150101')
  deliveryAddress.ele('cbc:StreetName').txt(guideData.origin?.address || '')

  // === PUNTO DE LLEGADA (Destino) ===
  const originAddress = shipment.ele('cac:OriginAddress')
  originAddress.ele('cbc:ID', {
    'schemeAgencyName': 'PE:INEI',
    'schemeName': 'Ubigeos'
  }).txt(guideData.destination?.ubigeo || '150101')
  originAddress.ele('cbc:StreetName').txt(guideData.destination?.address || '')

  // === FECHA DE INICIO DEL TRASLADO ===
  const transportHandlingUnit = shipment.ele('cac:TransportHandlingUnit')
  transportHandlingUnit.ele('cac:ActualPackage').ele('cbc:ID').txt(transferDate)

  // === DATOS DE TRANSPORTE ===
  const shipmentStage = shipment.ele('cac:ShipmentStage')
  shipmentStage.ele('cbc:ID').txt('1')

  // Modalidad de transporte (01=Público, 02=Privado)
  shipmentStage.ele('cbc:TransportModeCode', {
    'listName': 'Modalidad de traslado',
    'listAgencyName': 'PE:SUNAT',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18'
  }).txt(guideData.transportMode || '02')

  // === TRANSPORTE PRIVADO ===
  if (guideData.transportMode === '02' && guideData.transport?.driver) {
    const transitPeriod = shipmentStage.ele('cac:TransitPeriod')
    transitPeriod.ele('cbc:StartDate').txt(transferDate)

    // Datos del conductor
    const driverPerson = shipmentStage.ele('cac:DriverPerson')
    driverPerson.ele('cbc:ID', {
      'schemeID': guideData.transport.driver.documentType || '1',
      'schemeName': 'Documento de Identidad',
      'schemeAgencyName': 'PE:SUNAT',
      'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
    }).txt(guideData.transport.driver.documentNumber)

    driverPerson.ele('cbc:FirstName').txt(guideData.transport.driver.name)
    driverPerson.ele('cbc:FamilyName').txt(guideData.transport.driver.lastName)
    driverPerson.ele('cbc:JobTitle').txt('Principal')

    // Licencia de conducir
    const driverLicense = driverPerson.ele('cac:IdentityDocumentReference')
    driverLicense.ele('cbc:ID').txt(guideData.transport.driver.license)

    // Datos del vehículo
    if (guideData.transport.vehicle) {
      const transportMeans = shipmentStage.ele('cac:TransportMeans')
      const roadTransport = transportMeans.ele('cac:RoadTransport')
      roadTransport.ele('cbc:LicensePlateID').txt(guideData.transport.vehicle.plate)
    }
  }

  // === TRANSPORTE PÚBLICO ===
  if (guideData.transportMode === '01' && guideData.transport?.carrier) {
    const carrierParty = shipmentStage.ele('cac:CarrierParty')

    // RUC del transportista
    const carrierPartyId = carrierParty.ele('cac:PartyIdentification')
    carrierPartyId.ele('cbc:ID', {
      'schemeID': '6',
      'schemeName': 'Documento de Identidad',
      'schemeAgencyName': 'PE:SUNAT',
      'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
    }).txt(guideData.transport.carrier.ruc)

    // Razón social del transportista
    const carrierLegalEntity = carrierParty.ele('cac:PartyLegalEntity')
    carrierLegalEntity.ele('cbc:RegistrationName').txt(guideData.transport.carrier.businessName)
  }

  // === LÍNEAS DE LA GUÍA (Items a transportar) ===
  if (guideData.items && guideData.items.length > 0) {
    guideData.items.forEach((item, index) => {
      const despatchLine = root.ele('cac:DespatchLine')
      despatchLine.ele('cbc:ID').txt(String(index + 1))

      // Cantidad despachada
      despatchLine.ele('cbc:DeliveredQuantity', {
        'unitCode': item.unit || 'NIU'
      }).txt(String(item.quantity || 0))

      // Información del item
      const orderLineRef = despatchLine.ele('cac:OrderLineReference')
      orderLineRef.ele('cbc:LineID').txt(String(index + 1))

      // Descripción del producto
      const itemEle = despatchLine.ele('cac:Item')
      itemEle.ele('cbc:Description').txt(item.description || '')

      // Código del producto (si existe)
      if (item.code) {
        const sellersItemId = itemEle.ele('cac:SellersItemIdentification')
        sellersItemId.ele('cbc:ID').txt(item.code)
      }
    })
  }

  // Retornar XML como string
  return root.end({ prettyPrint: true })
}
