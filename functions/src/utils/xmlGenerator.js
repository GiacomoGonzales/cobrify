import { create } from 'xmlbuilder2'

/**
 * Mapeo de unidades de medida internas a códigos SUNAT (Catálogo N° 03 - UN/ECE Rec 20)
 * Las unidades guardadas en la app pueden ser texto legible, pero SUNAT requiere códigos específicos
 */
const UNIT_CODE_MAP = {
  // Mapeos de texto a código SUNAT
  'SERVICIO': 'ZZ',
  'UNIDAD': 'NIU',
  'UNIDADES': 'NIU',
  'UND': 'NIU',
  'PIEZA': 'NIU',
  'PIEZAS': 'NIU',
  'KILOGRAMO': 'KGM',
  'KILOGRAMOS': 'KGM',
  'KG': 'KGM',
  'GRAMO': 'GRM',
  'GRAMOS': 'GRM',
  'GR': 'GRM',
  'LITRO': 'LTR',
  'LITROS': 'LTR',
  'LT': 'LTR',
  'METRO': 'MTR',
  'METROS': 'MTR',
  'M': 'MTR',
  'METRO CUADRADO': 'MTK',
  'METROS CUADRADOS': 'MTK',
  'M2': 'MTK',
  'METRO CUBICO': 'MTQ',
  'METROS CUBICOS': 'MTQ',
  'M3': 'MTQ',
  'GALON': 'GLL',
  'GALONES': 'GLL',
  'CAJA': 'BOX',
  'CAJAS': 'BOX',
  'PAQUETE': 'PK',
  'PAQUETES': 'PK',
  'JUEGO': 'SET',
  'JUEGOS': 'SET',
  'HORA': 'HUR',
  'HORAS': 'HUR',
  'DIA': 'DAY',
  'DIAS': 'DAY',
  'MES': 'MON',
  'MESES': 'MON',
  'DOCENA': 'DZN',
  'DOCENAS': 'DZN',
  'PAR': 'PR',
  'PARES': 'PR',
  'MILLAR': 'MIL',
  'MILLARES': 'MIL',
  // Códigos que ya son válidos (pass-through)
  'NIU': 'NIU',
  'ZZ': 'ZZ',
  'KGM': 'KGM',
  'GRM': 'GRM',
  'LTR': 'LTR',
  'MTR': 'MTR',
  'MTK': 'MTK',
  'MTQ': 'MTQ',
  'GLL': 'GLL',
  'BOX': 'BOX',
  'PK': 'PK',
  'SET': 'SET',
  'HUR': 'HUR',
  'DAY': 'DAY',
  'MON': 'MON',
  'DZN': 'DZN',
  'PR': 'PR',
  'MIL': 'MIL',
}

/**
 * Convierte una unidad de medida al código SUNAT correspondiente
 * @param {string} unit - Unidad de medida (puede ser texto o código)
 * @returns {string} - Código SUNAT válido (default: NIU)
 */
function mapUnitToSunatCode(unit) {
  if (!unit) return 'NIU'
  const normalized = unit.toString().toUpperCase().trim()
  return UNIT_CODE_MAP[normalized] || 'NIU'
}

/**
 * Genera XML UBL 2.1 para factura o boleta electrónica según especificaciones SUNAT
 *
 * Referencias:
 * - UBL 2.1: http://docs.oasis-open.org/ubl/UBL-2.1.html
 * - Especificaciones SUNAT: https://cpe.sunat.gob.pe/node/88
 */
export function generateInvoiceXML(invoiceData, businessData) {
  // Mapeo de tipos de documento según catálogo 01 de SUNAT
  const documentTypeMap = {
    'factura': '01',
    'boleta': '03',
    'nota_credito': '07',
    'nota_debito': '08'
  }

  const documentTypeCode = documentTypeMap[invoiceData.documentType] || '03'
  const isFactura = invoiceData.documentType === 'factura'
  const isCreditNote = invoiceData.documentType === 'nota_credito'
  const isDebitNote = invoiceData.documentType === 'nota_debito'
  const isNote = isCreditNote || isDebitNote

  console.log(`📄 Generando XML para: ${invoiceData.documentType} (código ${documentTypeCode})`)

  // Configuración de impuestos (IGV) - soporta IGV 0% para empresas exoneradas
  const igvRate = invoiceData.taxConfig?.igvRate ?? 18
  const igvExempt = invoiceData.taxConfig?.igvExempt ?? false
  const exemptionReason = invoiceData.taxConfig?.exemptionReason ?? ''
  const igvMultiplier = igvRate / 100

  // Formatear fecha para SUNAT (YYYY-MM-DD)
  // Usar emissionDate primero (fecha seleccionada por el usuario), luego issueDate, luego fecha actual
  let issueDate
  const dateSource = invoiceData.emissionDate || invoiceData.issueDate

  if (typeof dateSource === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateSource)) {
    // Si es un string en formato YYYY-MM-DD, usarlo directamente
    issueDate = dateSource
  } else if (dateSource?.toDate) {
    // Si es un Firestore Timestamp
    const date = dateSource.toDate()
    // Usar getFullYear, getMonth, getDate para respetar zona horaria local
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    issueDate = `${year}-${month}-${day}`
  } else if (dateSource) {
    // Si es un string o Date válido
    const date = new Date(dateSource)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      issueDate = `${year}-${month}-${day}`
    } else {
      // Fecha inválida, usar fecha actual
      console.warn('⚠️ Fecha de emisión inválida, usando fecha actual')
      const now = new Date()
      issueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    }
  } else {
    // No hay fecha, usar fecha actual
    console.warn('⚠️ No hay fecha de emisión, usando fecha actual')
    const now = new Date()
    issueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  // Determinar el elemento raíz según tipo de documento
  const rootElementName = isCreditNote ? 'CreditNote' : isDebitNote ? 'DebitNote' : 'Invoice'
  const rootNamespace = isCreditNote ?
    'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2' :
    isDebitNote ?
    'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2' :
    'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'

  // Construir XML según especificación UBL 2.1
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele(rootElementName, {
      'xmlns': rootNamespace,
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

  // === ELEMENTOS ESPECÍFICOS PARA NOTAS DE CRÉDITO/DÉBITO ===
  if (isNote) {
    // 1. Referencia al documento modificado (BillingReference)
    if (invoiceData.referencedDocumentId && invoiceData.referencedDocumentType) {
      const billingReference = root.ele('cac:BillingReference')
      const invoiceDocRef = billingReference.ele('cac:InvoiceDocumentReference')
      invoiceDocRef.ele('cbc:ID').txt(invoiceData.referencedDocumentId)
      invoiceDocRef.ele('cbc:DocumentTypeCode', {
        'listAgencyName': 'PE:SUNAT',
        'listName': 'Tipo de Documento',
        'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
      }).txt(invoiceData.referencedDocumentType) // 01=Factura, 03=Boleta
    }

    // 2. Motivo de la nota (DiscrepancyResponse)
    if (invoiceData.discrepancyCode) {
      const discrepancyResponse = root.ele('cac:DiscrepancyResponse')
      discrepancyResponse.ele('cbc:ReferenceID').txt(invoiceData.referencedDocumentId || '')
      discrepancyResponse.ele('cbc:ResponseCode', {
        'listAgencyName': 'PE:SUNAT',
        'listName': isCreditNote ? 'Tipo de nota de credito' : 'Tipo de nota de debito',
        'listURI': isCreditNote ?
          'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo09' :  // Catálogo 09 - Notas de Crédito
          'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo10'    // Catálogo 10 - Notas de Débito
      }).txt(invoiceData.discrepancyCode)
      discrepancyResponse.ele('cbc:Description').txt(invoiceData.discrepancyReason || invoiceData.notes || '')
    }
  }

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

  // === FORMA DE PAGO / TIPO DE OPERACIÓN ===
  // IMPORTANTE: PaymentTerms DEBE ir DESPUÉS de AccountingCustomerParty y ANTES de AllowanceCharge
  // Según ejemplos de Greenter y especificación SUNAT
  const paymentTerms = root.ele('cac:PaymentTerms')
  paymentTerms.ele('cbc:ID').txt('FormaPago')
  paymentTerms.ele('cbc:PaymentMeansID').txt('Contado')

  // === DESCUENTO ===
  // IMPORTANTE: El descuento viene CON IGV desde el POS
  // En lugar de usar descuento global (que causa errores 4309/4310 en SUNAT),
  // distribuimos el descuento proporcionalmente a cada línea.
  const discountWithIGV = invoiceData.discount || 0
  const discountWithoutIGV = discountWithIGV > 0 ? Math.round((discountWithIGV / (1 + igvMultiplier)) * 100) / 100 : 0

  // Primero calcular la suma total SIN descuento para obtener el factor de descuento
  let sumBeforeDiscount = 0
  invoiceData.items.forEach((item) => {
    const taxAffectation = item.taxAffectation || (igvExempt ? '20' : '10')
    const isGravado = taxAffectation === '10'
    const priceWithIGV = item.unitPrice
    const priceWithoutIGV = isGravado ? priceWithIGV / (1 + igvMultiplier) : priceWithIGV
    sumBeforeDiscount += item.quantity * priceWithoutIGV
  })
  sumBeforeDiscount = Math.round(sumBeforeDiscount * 100) / 100

  // Factor de descuento (qué porcentaje del total representa el descuento)
  const discountFactor = discountWithoutIGV > 0 && sumBeforeDiscount > 0
    ? discountWithoutIGV / sumBeforeDiscount
    : 0

  // Calcular LineExtensionAmount de cada item CON descuento proporcional aplicado
  // Esto evita los errores 4309/4310 porque:
  // - Suma de LineExtensionAmount de líneas = LineExtensionAmount global
  // - Suma de IGV de líneas = IGV global
  // También guardamos los precios ajustados para evitar errores 4287/4288
  const lineExtensions = []
  const lineIGVs = []
  const linePricesWithIGV = []      // Precio unitario CON IGV (ajustado por descuento)
  const linePricesWithoutIGV = []   // Precio unitario SIN IGV (ajustado por descuento)
  let sumLineExtension = 0
  let sumLineIGV = 0

  invoiceData.items.forEach((item) => {
    const taxAffectation = item.taxAffectation || (igvExempt ? '20' : '10')
    const isGravado = taxAffectation === '10'
    const originalPriceWithIGV = item.unitPrice
    const originalPriceWithoutIGV = isGravado ? originalPriceWithIGV / (1 + igvMultiplier) : originalPriceWithIGV

    // Aplicar descuento proporcional al precio unitario
    // Esto asegura que: LineExtensionAmount = cantidad × precio sin IGV (ajustado)
    const adjustedPriceWithoutIGV = originalPriceWithoutIGV * (1 - discountFactor)
    const adjustedPriceWithIGV = isGravado
      ? adjustedPriceWithoutIGV * (1 + igvMultiplier)
      : adjustedPriceWithoutIGV

    // Calcular LineExtensionAmount usando el precio ajustado
    const lineTotal = Math.round(item.quantity * adjustedPriceWithoutIGV * 100) / 100

    lineExtensions.push(lineTotal)
    linePricesWithIGV.push(Math.round(adjustedPriceWithIGV * 100) / 100)
    linePricesWithoutIGV.push(Math.round(adjustedPriceWithoutIGV * 100) / 100)
    sumLineExtension += lineTotal

    // IGV de la línea (calculado sobre el valor YA descontado)
    const lineIGV = isGravado ? Math.round(lineTotal * igvMultiplier * 100) / 100 : 0
    lineIGVs.push(lineIGV)
    sumLineIGV += lineIGV
  })

  // Redondear sumas finales
  sumLineExtension = Math.round(sumLineExtension * 100) / 100
  sumLineIGV = Math.round(sumLineIGV * 100) / 100

  // Los valores globales ahora coinciden exactamente con la suma de líneas
  const taxableAmount = sumLineExtension
  const igvAmount = sumLineIGV
  const totalAmount = Math.round((taxableAmount + igvAmount) * 100) / 100

  // DEBUG: Log de valores calculados
  console.log('🧮 XML Generator - Cálculos SUNAT (descuento distribuido en líneas):')
  console.log(`   Items count: ${invoiceData.items.length}`)
  console.log(`   sumBeforeDiscount (suma ANTES de descuento): ${sumBeforeDiscount}`)
  console.log(`   discountWithIGV (desde POS): ${discountWithIGV}`)
  console.log(`   discountWithoutIGV: ${discountWithoutIGV}`)
  console.log(`   discountFactor: ${(discountFactor * 100).toFixed(2)}%`)
  console.log(`   LineExtensions por item (YA con descuento): ${JSON.stringify(lineExtensions)}`)
  console.log(`   LineIGVs por item: ${JSON.stringify(lineIGVs)}`)
  console.log(`   sumLineExtension (taxableAmount): ${sumLineExtension}`)
  console.log(`   sumLineIGV (igvAmount): ${sumLineIGV}`)
  console.log(`   totalAmount: ${totalAmount}`)

  // === IMPUESTOS (IGV) ===
  // IMPORTANTE: TaxTotal DEBE ir ANTES de LegalMonetaryTotal según UBL 2.1
  // SIEMPRE usar los valores calculados para que cuadren con las líneas
  const finalIgv = igvAmount
  const finalTaxable = taxableAmount

  const taxTotal = root.ele('cac:TaxTotal')
  taxTotal.ele('cbc:TaxAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(finalIgv.toFixed(2))

  const taxSubtotal = taxTotal.ele('cac:TaxSubtotal')
  taxSubtotal.ele('cbc:TaxableAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(finalTaxable.toFixed(2))
  taxSubtotal.ele('cbc:TaxAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(finalIgv.toFixed(2))

  const taxCategory = taxSubtotal.ele('cac:TaxCategory')
  // Tax Category ID según si es exonerado o no:
  // S = Standard rate (Gravado con IGV)
  // E = Exempt from tax (Exonerado de IGV)
  const taxCategoryIdGlobal = igvExempt ? 'E' : 'S'
  taxCategory.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5305',
    'schemeName': 'Tax Category Identifier',
    'schemeAgencyName': 'United Nations Economic Commission for Europe'
  }).txt(taxCategoryIdGlobal)

  const taxScheme = taxCategory.ele('cac:TaxScheme')
  // Para operaciones exoneradas usar código 9997 (EXO), para gravadas usar 1000 (IGV)
  const taxSchemeCode = igvExempt ? '9997' : '1000'
  const taxSchemeName = igvExempt ? 'EXO' : 'IGV'
  taxScheme.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5153',
    'schemeAgencyID': '6'
  }).txt(taxSchemeCode)
  taxScheme.ele('cbc:Name').txt(taxSchemeName)
  taxScheme.ele('cbc:TaxTypeCode').txt('VAT')

  // === TOTALES ===
  // IMPORTANTE: LegalMonetaryTotal DEBE ir DESPUÉS de TaxTotal y ANTES de InvoiceLine
  // El orden de los elementos es CRÍTICO según el esquema XSD UBL 2.1 de SUNAT:
  // LineExtensionAmount -> TaxInclusiveAmount -> AllowanceTotalAmount -> PayableAmount

  // SIEMPRE usar los valores calculados para que cuadren con las líneas
  const finalTotal = totalAmount

  const legalMonetaryTotal = root.ele('cac:LegalMonetaryTotal')

  // Con el nuevo enfoque (descuento distribuido en líneas):
  // - LineExtensionAmount = suma de LineExtensionAmount de cada línea (YA con descuento aplicado)
  // - TaxInclusiveAmount = LineExtensionAmount + IGV
  // - No hay AllowanceCharge global ni AllowanceTotalAmount

  // 1. LineExtensionAmount = suma de líneas (ya tienen el descuento proporcional aplicado)
  legalMonetaryTotal.ele('cbc:LineExtensionAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(sumLineExtension.toFixed(2))

  // 2. Total impuestos incluidos
  legalMonetaryTotal.ele('cbc:TaxInclusiveAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(finalTotal.toFixed(2))

  // 3. Total a pagar
  legalMonetaryTotal.ele('cbc:PayableAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(finalTotal.toFixed(2))

  // === ITEMS ===
  invoiceData.items.forEach((item, index) => {
    const invoiceLine = root.ele('cac:InvoiceLine')

    // Código de afectación al IGV (10=Gravado, 20=Exonerado, 30=Inafecto)
    // Si el negocio está exonerado de IGV, todos los items deben ser exonerados (20)
    let taxAffectation = item.taxAffectation
    if (!taxAffectation) {
      taxAffectation = igvExempt ? '20' : '10'  // 20=Exonerado si empresa exonerada, 10=Gravado si no
    }
    const isGravado = taxAffectation === '10'
    const isExonerado = taxAffectation === '20'
    const isInafecto = taxAffectation === '30'

    // ID de línea
    invoiceLine.ele('cbc:ID').txt(String(index + 1))

    // Cantidad - usar mapeo de unidades para códigos SUNAT válidos
    invoiceLine.ele('cbc:InvoicedQuantity', {
      'unitCode': mapUnitToSunatCode(item.unit),
      'unitCodeListID': 'UN/ECE rec 20',
      'unitCodeListAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(item.quantity.toFixed(2))

    // USAR los precios pre-calculados (ya ajustados por descuento proporcional)
    // Esto asegura que: LineExtensionAmount = cantidad × priceWithoutIGV
    const priceWithIGV = linePricesWithIGV[index]
    const priceWithoutIGV = linePricesWithoutIGV[index]

    // Total de la línea SIN IGV (base imponible) - pre-calculado
    const lineTotal = lineExtensions[index]
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
    // USAR el IGV pre-calculado en lineIGVs para garantizar que la suma cuadre
    const lineIGV = lineIGVs[index]
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

    // Incluir porcentaje: tasa de IGV para gravados, 0 para exonerados/inafectos
    if (isGravado) {
      lineTaxCategory.ele('cbc:Percent').txt(igvRate.toFixed(2))
    } else {
      // Para exonerados e inafectos, SUNAT requiere explícitamente Percent = 0
      lineTaxCategory.ele('cbc:Percent').txt('0')
    }

    lineTaxCategory.ele('cbc:TaxExemptionReasonCode', {
      'listAgencyName': 'PE:SUNAT',
      'listName': 'Afectacion del IGV',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07'
    }).txt(taxAffectation) // 10=Gravado, 20=Exonerado, 30=Inafecto

    const lineItemTaxScheme = lineTaxCategory.ele('cac:TaxScheme')
    // Para items exonerados usar código 9997 (EXO), para gravados usar 1000 (IGV)
    const lineItemTaxSchemeCode = isExonerado ? '9997' : '1000'
    const lineItemTaxSchemeName = isExonerado ? 'EXO' : 'IGV'
    lineItemTaxScheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeName': 'Codigo de tributos',
      'schemeAgencyName': 'PE:SUNAT'
    }).txt(lineItemTaxSchemeCode)
    lineItemTaxScheme.ele('cbc:Name').txt(lineItemTaxSchemeName)
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

  // NOTA: Las notas de crédito NO llevan PaymentTerms según UBL 2.1
  // El nodo PaymentTerms es solo para facturas/boletas, no para documentos de ajuste

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
  // Tax Category ID según si es exonerado o no:
  // S = Standard rate (Gravado con IGV)
  // E = Exempt from tax (Exonerado de IGV)
  const taxCategoryIdGlobalCN = igvExempt ? 'E' : 'S'
  taxCategory.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5305',
    'schemeName': 'Tax Category Identifier',
    'schemeAgencyName': 'United Nations Economic Commission for Europe'
  }).txt(taxCategoryIdGlobalCN)

  const taxScheme = taxCategory.ele('cac:TaxScheme')
  // Para operaciones exoneradas usar código 9997 (EXO), para gravadas usar 1000 (IGV)
  const taxSchemeCodeCN = igvExempt ? '9997' : '1000'
  const taxSchemeNameCN = igvExempt ? 'EXO' : 'IGV'
  taxScheme.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5153',
    'schemeAgencyID': '6'
  }).txt(taxSchemeCodeCN)
  taxScheme.ele('cbc:Name').txt(taxSchemeNameCN)
  taxScheme.ele('cbc:TaxTypeCode').txt('VAT')

  // === TOTALES ===
  const legalMonetaryTotal = root.ele('cac:LegalMonetaryTotal')

  // Orden correcto según XSD UBL 2.1
  legalMonetaryTotal.ele('cbc:LineExtensionAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
    .txt(creditNoteData.subtotal.toFixed(2))

  legalMonetaryTotal.ele('cbc:TaxInclusiveAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
    .txt(creditNoteData.total.toFixed(2))

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
    let taxAffectation = item.taxAffectation
    if (!taxAffectation) {
      taxAffectation = igvExempt ? '20' : '10'  // 20=Exonerado si empresa exonerada, 10=Gravado si no
    }
    const isGravado = taxAffectation === '10'
    const isExonerado = taxAffectation === '20'
    const isInafecto = taxAffectation === '30'

    // ID de línea
    creditNoteLine.ele('cbc:ID').txt(String(index + 1))

    // Cantidad (CreditedQuantity en lugar de InvoicedQuantity)
    creditNoteLine.ele('cbc:CreditedQuantity', {
      'unitCode': mapUnitToSunatCode(item.unit),
      'unitCodeListID': 'UN/ECE rec 20',
      'unitCodeListAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(item.quantity.toFixed(2))

    // IMPORTANTE: item.unitPrice YA INCLUYE IGV (viene del POS/frontend con IGV incluido)
    const priceWithIGV = item.unitPrice
    // Usar la tasa IGV del taxConfig (no hardcodear 1.18)
    const priceWithoutIGV = isGravado ? priceWithIGV / (1 + igvMultiplier) : priceWithIGV

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

    // Incluir porcentaje: tasa de IGV para gravados, 0 para exonerados/inafectos
    if (isGravado) {
      lineTaxCategory.ele('cbc:Percent').txt(igvRate.toFixed(2))
    } else {
      // Para exonerados e inafectos, SUNAT requiere explícitamente Percent = 0
      lineTaxCategory.ele('cbc:Percent').txt('0')
    }

    lineTaxCategory.ele('cbc:TaxExemptionReasonCode', {
      'listAgencyName': 'PE:SUNAT',
      'listName': 'Afectacion del IGV',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07'
    }).txt(taxAffectation)

    const lineItemTaxScheme = lineTaxCategory.ele('cac:TaxScheme')
    // Para items exonerados usar código 9997 (EXO), para gravados usar 1000 (IGV)
    const lineItemTaxSchemeCode = isExonerado ? '9997' : '1000'
    const lineItemTaxSchemeName = isExonerado ? 'EXO' : 'IGV'
    lineItemTaxScheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeName': 'Codigo de tributos',
      'schemeAgencyName': 'PE:SUNAT'
    }).txt(lineItemTaxSchemeCode)
    lineItemTaxScheme.ele('cbc:Name').txt(lineItemTaxSchemeName)
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
  // Configuración de impuestos (IGV)
  const igvExempt = debitNoteData.taxConfig?.igvExempt ?? false

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

  // NOTA: Las notas de débito NO llevan PaymentTerms según UBL 2.1
  // El nodo PaymentTerms es solo para facturas/boletas, no para documentos de ajuste

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
  // Tax Category ID según si es exonerado o no:
  // S = Standard rate (Gravado con IGV)
  // E = Exempt from tax (Exonerado de IGV)
  const taxCategoryIdGlobalDN = igvExempt ? 'E' : 'S'
  taxCategory.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5305',
    'schemeName': 'Tax Category Identifier',
    'schemeAgencyName': 'United Nations Economic Commission for Europe'
  }).txt(taxCategoryIdGlobalDN)

  const taxScheme = taxCategory.ele('cac:TaxScheme')
  // Para operaciones exoneradas usar código 9997 (EXO), para gravadas usar 1000 (IGV)
  const taxSchemeCodeDN = igvExempt ? '9997' : '1000'
  const taxSchemeNameDN = igvExempt ? 'EXO' : 'IGV'
  taxScheme.ele('cbc:ID', {
    'schemeID': 'UN/ECE 5153',
    'schemeAgencyID': '6'
  }).txt(taxSchemeCodeDN)
  taxScheme.ele('cbc:Name').txt(taxSchemeNameDN)
  taxScheme.ele('cbc:TaxTypeCode').txt('VAT')

  // === TOTALES ===
  const legalMonetaryTotal = root.ele('cac:RequestedMonetaryTotal')

  // Orden correcto según XSD UBL 2.1
  legalMonetaryTotal.ele('cbc:LineExtensionAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
    .txt(debitNoteData.subtotal.toFixed(2))

  legalMonetaryTotal.ele('cbc:TaxInclusiveAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
    .txt(debitNoteData.total.toFixed(2))

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
    let taxAffectation = item.taxAffectation
    if (!taxAffectation) {
      taxAffectation = igvExempt ? '20' : '10'  // 20=Exonerado si empresa exonerada, 10=Gravado si no
    }
    const isGravado = taxAffectation === '10'
    const isExonerado = taxAffectation === '20'
    const isInafecto = taxAffectation === '30'

    // ID de línea
    debitNoteLine.ele('cbc:ID').txt(String(index + 1))

    // Cantidad (DebitedQuantity en lugar de InvoicedQuantity)
    debitNoteLine.ele('cbc:DebitedQuantity', {
      'unitCode': mapUnitToSunatCode(item.unit),
      'unitCodeListID': 'UN/ECE rec 20',
      'unitCodeListAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(item.quantity.toFixed(2))

    // IMPORTANTE: item.unitPrice YA INCLUYE IGV (viene del POS/frontend con IGV incluido)
    const priceWithIGV = item.unitPrice
    // Usar la tasa IGV del taxConfig (no hardcodear 1.18)
    const priceWithoutIGV = isGravado ? priceWithIGV / (1 + igvMultiplier) : priceWithIGV

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

    // Incluir porcentaje: tasa de IGV para gravados, 0 para exonerados/inafectos
    if (isGravado) {
      lineTaxCategory.ele('cbc:Percent').txt(igvRate.toFixed(2))
    } else {
      // Para exonerados e inafectos, SUNAT requiere explícitamente Percent = 0
      lineTaxCategory.ele('cbc:Percent').txt('0')
    }

    lineTaxCategory.ele('cbc:TaxExemptionReasonCode', {
      'listAgencyName': 'PE:SUNAT',
      'listName': 'Afectacion del IGV',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07'
    }).txt(taxAffectation)

    const lineItemTaxScheme = lineTaxCategory.ele('cac:TaxScheme')
    // Para items exonerados usar código 9997 (EXO), para gravados usar 1000 (IGV)
    const lineItemTaxSchemeCode = isExonerado ? '9997' : '1000'
    const lineItemTaxSchemeName = isExonerado ? 'EXO' : 'IGV'
    lineItemTaxScheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeName': 'Codigo de tributos',
      'schemeAgencyName': 'PE:SUNAT'
    }).txt(lineItemTaxSchemeCode)
    lineItemTaxScheme.ele('cbc:Name').txt(lineItemTaxSchemeName)
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
        'unitCode': mapUnitToSunatCode(item.unit)
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
