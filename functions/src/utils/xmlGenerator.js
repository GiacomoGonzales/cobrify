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
  'PIEZA': 'C62',
  'PIEZAS': 'C62',
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
  'CAJA': 'BX',
  'CAJAS': 'BX',
  'PAQUETE': 'PK',
  'PAQUETES': 'PK',
  'JUEGO': 'SET',
  'JUEGOS': 'SET',
  'HORA': 'HUR',
  'HORAS': 'HUR',
  'DOCENA': 'DZN',
  'DOCENAS': 'DZN',
  'PAR': 'PR',
  'PARES': 'PR',
  'MILLAR': 'MIL',
  'MILLARES': 'MIL',
  'TONELADA': 'TNE',
  'TONELADAS': 'TNE',
  'BALDE': 'BJ',
  'BALDES': 'BJ',
  'BARRIL': 'BLL',
  'BARRILES': 'BLL',
  'BOLSA': 'BG',
  'BOLSAS': 'BG',
  'BOTELLA': 'BO',
  'BOTELLAS': 'BO',
  'CARTON': 'CT',
  'CARTONES': 'CT',
  'CENTIMETRO': 'CMT',
  'CENTIMETROS': 'CMT',
  'CM': 'CMT',
  'CENTIMETRO CUADRADO': 'CMK',
  'CENTIMETRO CUBICO': 'CMQ',
  'CIENTO': 'CEN',
  'CIENTO DE UNIDADES': 'CEN',
  'CILINDRO': 'CY',
  'CILINDROS': 'CY',
  'FARDO': 'BE',
  'FARDOS': 'BE',
  'GALON INGLES': 'GLI',
  'HOJA': 'LEF',
  'HOJAS': 'LEF',
  'KILOMETRO': 'KTM',
  'KILOMETROS': 'KTM',
  'KM': 'KTM',
  'KILOVATIO HORA': 'KWH',
  'KWH': 'KWH',
  'KIT': 'KT',
  'KITS': 'KT',
  'LATA': 'CA',
  'LATAS': 'CA',
  'LIBRA': 'LBR',
  'LIBRAS': 'LBR',
  'MEGAVATIO HORA': 'MWH',
  'MILIGRAMO': 'MGM',
  'MILIGRAMOS': 'MGM',
  'MG': 'MGM',
  'MILILITRO': 'MLT',
  'MILILITROS': 'MLT',
  'ML': 'MLT',
  'MILIMETRO': 'MMT',
  'MILIMETROS': 'MMT',
  'MM': 'MMT',
  'MILIMETRO CUADRADO': 'MMK',
  'MILIMETRO CUBICO': 'MMQ',
  'MILLON': 'UM',
  'MILLON DE UNIDADES': 'UM',
  'ONZA': 'ONZ',
  'ONZAS': 'ONZ',
  'PALETA': 'PF',
  'PALETAS': 'PF',
  'PIE': 'FOT',
  'PIES': 'FOT',
  'PIE CUADRADO': 'FTK',
  'PIES CUADRADOS': 'FTK',
  'PIE CUBICO': 'FTQ',
  'PIES CUBICOS': 'FTQ',
  'PLACA': 'PG',
  'PLACAS': 'PG',
  'PLIEGO': 'ST',
  'PLIEGOS': 'ST',
  'PULGADA': 'INH',
  'PULGADAS': 'INH',
  'TUBO': 'TU',
  'TUBOS': 'TU',
  'YARDA': 'YRD',
  'YARDAS': 'YRD',
  'CUARTO DE DOCENA': 'QD',
  'MEDIA DOCENA': 'HD',
  'JARRA': 'JG',
  'JARRAS': 'JG',
  'FRASCO': 'JR',
  'FRASCOS': 'JR',
  'ENVASE': 'CH',
  'ENVASES': 'CH',
  'CAPSULA': 'AV',
  'CAPSULAS': 'AV',
  'SACO': 'SA',
  'SACOS': 'SA',
  'TORNILLO': 'BT',
  'TORNILLOS': 'BT',
  'TABLETA': 'U2',
  'BLISTER': 'U2',
  'DOCENA DE PAQUETES': 'DZP',
  'MEDIA HORA': 'HT',
  'CARRETE': 'RL',
  'CARRETES': 'RL',
  'SEGUNDO': 'SEC',
  'SEGUNDOS': 'SEC',
  'VARILLA': 'RD',
  'VARILLAS': 'RD',
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
  'BX': 'BX',
  'PK': 'PK',
  'SET': 'SET',
  'HUR': 'HUR',
  'DZN': 'DZN',
  'PR': 'PR',
  'MIL': 'MIL',
  'TNE': 'TNE',
  'BJ': 'BJ',
  'BLL': 'BLL',
  'BG': 'BG',
  'BO': 'BO',
  'CT': 'CT',
  'CMK': 'CMK',
  'CMQ': 'CMQ',
  'CMT': 'CMT',
  'CEN': 'CEN',
  'CY': 'CY',
  'BE': 'BE',
  'GLI': 'GLI',
  'LEF': 'LEF',
  'KTM': 'KTM',
  'KWH': 'KWH',
  'KT': 'KT',
  'CA': 'CA',
  'LBR': 'LBR',
  'MWH': 'MWH',
  'MGM': 'MGM',
  'MLT': 'MLT',
  'MMT': 'MMT',
  'MMK': 'MMK',
  'MMQ': 'MMQ',
  'UM': 'UM',
  'ONZ': 'ONZ',
  'PF': 'PF',
  'FOT': 'FOT',
  'FTK': 'FTK',
  'FTQ': 'FTQ',
  'C62': 'C62',
  'PG': 'PG',
  'ST': 'ST',
  'INH': 'INH',
  'TU': 'TU',
  'YRD': 'YRD',
  'QD': 'QD',
  'HD': 'HD',
  'JG': 'JG',
  'JR': 'JR',
  'CH': 'CH',
  'AV': 'AV',
  'SA': 'SA',
  'BT': 'BT',
  'U2': 'U2',
  'DZP': 'DZP',
  'HT': 'HT',
  'RL': 'RL',
  'SEC': 'SEC',
  'RD': 'RD',
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

  // DEBUG: Mostrar qué taxConfig llega
  console.log(`🔍 DEBUG taxConfig:`)
  console.log(`   invoiceData.taxConfig: ${JSON.stringify(invoiceData.taxConfig)}`)
  console.log(`   businessData.emissionConfig?.taxConfig: ${JSON.stringify(businessData?.emissionConfig?.taxConfig)}`)

  // Configuración de impuestos (IGV) - soporta IGV 0% para empresas exoneradas
  // Buscar taxConfig en: 1) invoiceData.taxConfig, 2) businessData.emissionConfig.taxConfig, 3) default 18
  const igvRate = invoiceData.taxConfig?.igvRate ?? businessData?.emissionConfig?.taxConfig?.igvRate ?? 18
  const igvExempt = invoiceData.taxConfig?.igvExempt ?? businessData?.emissionConfig?.taxConfig?.igvExempt ?? false
  const exemptionReason = invoiceData.taxConfig?.exemptionReason ?? businessData?.emissionConfig?.taxConfig?.exemptionReason ?? ''
  const igvMultiplier = igvRate / 100

  console.log(`💰 Configuración IGV FINAL: rate=${igvRate}%, exempt=${igvExempt}, multiplier=${igvMultiplier}`)

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
  // Según ejemplos de Greenter y especificación SUNAT (Resolución Nº 000193-2020/SUNAT)
  // Vigente desde 01/04/2021

  const paymentType = invoiceData.paymentType || 'contado' // 'contado' o 'credito'
  console.log(`📋 Forma de pago en XML: paymentType=${paymentType}, invoiceData.paymentType=${invoiceData.paymentType}`)
  const paymentDueDate = invoiceData.paymentDueDate || null
  const paymentInstallments = invoiceData.paymentInstallments || []

  // Monto total para PaymentTerms (usar el total de la factura directamente)
  const paymentTotalAmount = parseFloat(invoiceData.total) || 0

  if (paymentType === 'credito') {
    // Pago al Crédito - Primer bloque indica el tipo y monto total pendiente
    const paymentTermsCredito = root.ele('cac:PaymentTerms')
    paymentTermsCredito.ele('cbc:ID').txt('FormaPago')
    paymentTermsCredito.ele('cbc:PaymentMeansID').txt('Credito')
    paymentTermsCredito.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(paymentTotalAmount.toFixed(2))

    // Si hay cuotas definidas, agregar cada una
    if (paymentInstallments.length > 0) {
      paymentInstallments.forEach((cuota, index) => {
        const cuotaTerms = root.ele('cac:PaymentTerms')
        cuotaTerms.ele('cbc:ID').txt('FormaPago')
        cuotaTerms.ele('cbc:PaymentMeansID').txt(`Cuota${String(index + 1).padStart(3, '0')}`)
        cuotaTerms.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
          .txt(parseFloat(cuota.amount || 0).toFixed(2))
        if (cuota.dueDate) {
          cuotaTerms.ele('cbc:PaymentDueDate').txt(cuota.dueDate)
        }
      })
    } else if (paymentDueDate) {
      // Si no hay cuotas pero sí fecha de vencimiento, crear una sola cuota con el total
      const cuotaTerms = root.ele('cac:PaymentTerms')
      cuotaTerms.ele('cbc:ID').txt('FormaPago')
      cuotaTerms.ele('cbc:PaymentMeansID').txt('Cuota001')
      cuotaTerms.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
        .txt(paymentTotalAmount.toFixed(2))
      cuotaTerms.ele('cbc:PaymentDueDate').txt(paymentDueDate)
    }
  } else {
    // Pago al Contado (por defecto)
    const paymentTerms = root.ele('cac:PaymentTerms')
    paymentTerms.ele('cbc:ID').txt('FormaPago')
    paymentTerms.ele('cbc:PaymentMeansID').txt('Contado')
  }

  // === DETRACCIÓN ===
  // Solo se agrega si la factura tiene detracción habilitada
  // Según UBL 2.1 SUNAT: PaymentMeans + PaymentTerms adicional
  if (invoiceData.hasDetraction && invoiceData.detractionType && invoiceData.detractionAmount > 0) {
    console.log(`📋 Agregando detracción al XML: tipo=${invoiceData.detractionType}, tasa=${invoiceData.detractionRate}%, monto=${invoiceData.detractionAmount}`)

    // PaymentMeans - Medio de pago (cuenta del Banco de la Nación)
    const paymentMeans = root.ele('cac:PaymentMeans')
    paymentMeans.ele('cbc:ID').txt('Detraccion')
    paymentMeans.ele('cbc:PaymentMeansCode').txt('001') // 001 = Transferencia bancaria
    if (invoiceData.detractionBankAccount) {
      const payeeAccount = paymentMeans.ele('cac:PayeeFinancialAccount')
      payeeAccount.ele('cbc:ID').txt(invoiceData.detractionBankAccount)
    }

    // PaymentTerms - Datos de la detracción (código, porcentaje, monto)
    const detractionTerms = root.ele('cac:PaymentTerms')
    detractionTerms.ele('cbc:ID').txt('Detraccion')
    detractionTerms.ele('cbc:PaymentMeansID').txt(invoiceData.detractionType) // Código catálogo 54
    detractionTerms.ele('cbc:PaymentPercent').txt(String(invoiceData.detractionRate || 0))
    detractionTerms.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(parseFloat(invoiceData.detractionAmount).toFixed(2))
  }

  // === DESCUENTO ===
  // IMPORTANTE: El descuento viene CON IGV desde el POS
  // En lugar de usar descuento global (que causa errores 4309/4310 en SUNAT),
  // distribuimos el descuento proporcionalmente a cada línea.
  const discountWithIGV = invoiceData.discount || 0
  const discountWithoutIGV = discountWithIGV > 0 ? Math.round((discountWithIGV / (1 + igvMultiplier)) * 100) / 100 : 0

  // Primero calcular la suma total SIN descuento para obtener el factor de descuento
  let sumBeforeDiscount = 0
  invoiceData.items.forEach((item) => {
    // REGLA: Si negocio tiene Ley de la Selva (igvExempt=true) → FORZAR exonerado
    const taxAffectation = igvExempt ? '20' : (item.taxAffectation || '10')
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
  const lineTaxAffectations = []     // Tipo de afectación de cada línea
  const linePricesWithIGV = []      // Precio unitario CON IGV (ajustado por descuento)
  const linePricesWithoutIGV = []   // Precio unitario SIN IGV (ajustado por descuento)
  let sumLineExtension = 0
  let sumLineIGV = 0

  // Totales por tipo de afectación (para múltiples TaxSubtotals)
  let sumGravadas = 0      // Operaciones gravadas (taxAffectation = '10')
  let sumExoneradas = 0    // Operaciones exoneradas (taxAffectation = '20')
  let sumInafectas = 0     // Operaciones inafectas (taxAffectation = '30')
  let sumIGVGravadas = 0   // IGV solo de operaciones gravadas

  invoiceData.items.forEach((item) => {
    // REGLA: Si negocio tiene Ley de la Selva (igvExempt=true) → FORZAR exonerado
    const taxAffectation = igvExempt ? '20' : (item.taxAffectation || '10')
    const isGravado = taxAffectation === '10'
    const isExonerado = taxAffectation === '20'
    const isInafecto = taxAffectation === '30'
    const originalPriceWithIGV = item.unitPrice

    // Para calcular correctamente, trabajamos desde el total con IGV
    // y calculamos el subtotal de forma que subtotal + IGV = total exacto
    const lineTotalWithIGV = item.quantity * originalPriceWithIGV

    // Si hay descuento, aplicarlo al total con IGV
    const adjustedLineTotalWithIGV = lineTotalWithIGV * (1 - discountFactor)

    // Calcular subtotal sin IGV (base imponible) con 10 decimales de precisión
    // y luego redondear a 2 decimales
    const lineTotal = isGravado
      ? Math.round((adjustedLineTotalWithIGV / (1 + igvMultiplier)) * 100) / 100
      : Math.round(adjustedLineTotalWithIGV * 100) / 100

    // IGV = Total con IGV - Subtotal sin IGV (esto garantiza que cuadre)
    const lineIGV = isGravado
      ? Math.round((adjustedLineTotalWithIGV - lineTotal) * 100) / 100
      : 0

    // Precio unitario ajustado (para el XML)
    const adjustedPriceWithoutIGV = lineTotal / item.quantity
    const adjustedPriceWithIGV = isGravado
      ? (lineTotal + lineIGV) / item.quantity
      : adjustedPriceWithoutIGV

    lineExtensions.push(lineTotal)
    lineTaxAffectations.push(taxAffectation)
    linePricesWithIGV.push(Math.round(adjustedPriceWithIGV * 1000000) / 1000000) // 6 decimales para precio
    linePricesWithoutIGV.push(Math.round(adjustedPriceWithoutIGV * 1000000) / 1000000) // 6 decimales para precio
    sumLineExtension += lineTotal

    lineIGVs.push(lineIGV)
    sumLineIGV += lineIGV

    // Acumular por tipo de afectación
    if (isGravado) {
      sumGravadas += lineTotal
      sumIGVGravadas += lineIGV
    } else if (isExonerado) {
      sumExoneradas += lineTotal
    } else if (isInafecto) {
      sumInafectas += lineTotal
    }
  })

  // Redondear sumas finales
  sumLineExtension = Math.round(sumLineExtension * 100) / 100
  sumLineIGV = Math.round(sumLineIGV * 100) / 100
  sumGravadas = Math.round(sumGravadas * 100) / 100
  sumExoneradas = Math.round(sumExoneradas * 100) / 100
  sumInafectas = Math.round(sumInafectas * 100) / 100
  sumIGVGravadas = Math.round(sumIGVGravadas * 100) / 100

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
  console.log(`   📊 Por tipo de afectación:`)
  console.log(`      Gravadas (10): ${sumGravadas} | IGV: ${sumIGVGravadas}`)
  console.log(`      Exoneradas (20): ${sumExoneradas}`)
  console.log(`      Inafectas (30): ${sumInafectas}`)

  // === IMPUESTOS (IGV) ===
  // IMPORTANTE: TaxTotal DEBE ir ANTES de LegalMonetaryTotal según UBL 2.1
  // SIEMPRE usar los valores calculados para que cuadren con las líneas
  // NUEVO: Generar múltiples TaxSubtotals según los tipos de afectación usados
  const finalIgv = igvAmount
  const currency = invoiceData.currency || 'PEN'

  const taxTotal = root.ele('cac:TaxTotal')
  taxTotal.ele('cbc:TaxAmount', { 'currencyID': currency })
    .txt(finalIgv.toFixed(2))

  // Función helper para crear un TaxSubtotal
  const createTaxSubtotal = (taxableAmt, taxAmt, categoryId, schemeId, schemeName, taxTypeCode) => {
    const subtotal = taxTotal.ele('cac:TaxSubtotal')
    subtotal.ele('cbc:TaxableAmount', { 'currencyID': currency })
      .txt(taxableAmt.toFixed(2))
    subtotal.ele('cbc:TaxAmount', { 'currencyID': currency })
      .txt(taxAmt.toFixed(2))

    const category = subtotal.ele('cac:TaxCategory')
    category.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5305',
      'schemeName': 'Tax Category Identifier',
      'schemeAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(categoryId)

    const scheme = category.ele('cac:TaxScheme')
    scheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeAgencyID': '6'
    }).txt(schemeId)
    scheme.ele('cbc:Name').txt(schemeName)
    scheme.ele('cbc:TaxTypeCode').txt(taxTypeCode)
  }

  // Generar TaxSubtotal para operaciones GRAVADAS (si hay)
  if (sumGravadas > 0) {
    createTaxSubtotal(sumGravadas, sumIGVGravadas, 'S', '1000', 'IGV', 'VAT')
  }

  // Generar TaxSubtotal para operaciones EXONERADAS (si hay)
  if (sumExoneradas > 0) {
    createTaxSubtotal(sumExoneradas, 0, 'E', '9997', 'EXO', 'VAT')
  }

  // Generar TaxSubtotal para operaciones INAFECTAS (si hay)
  if (sumInafectas > 0) {
    createTaxSubtotal(sumInafectas, 0, 'O', '9998', 'INA', 'FRE')
  }

  // Si no hay ningún tipo (caso edge), generar al menos uno según igvExempt
  if (sumGravadas === 0 && sumExoneradas === 0 && sumInafectas === 0) {
    if (igvExempt) {
      createTaxSubtotal(0, 0, 'E', '9997', 'EXO', 'VAT')
    } else {
      createTaxSubtotal(0, 0, 'S', '1000', 'IGV', 'VAT')
    }
  }

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
    // REGLA: Si negocio tiene Ley de la Selva (igvExempt=true) → FORZAR exonerado para TODOS
    //        Si negocio normal → respetar config del producto, si no tiene = gravado
    let taxAffectation
    if (igvExempt) {
      // Ley de la Selva u otra exoneración → TODOS los productos son exonerados
      taxAffectation = '20'
    } else {
      // Negocio normal → respetar configuración del producto, default gravado
      taxAffectation = item.taxAffectation || '10'
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
    // Código de tributo según tipo de afectación:
    // - 1000 (IGV) para gravados
    // - 9997 (EXO) para exonerados
    // - 9998 (INA) para inafectos
    let lineItemTaxSchemeCode = '1000'
    let lineItemTaxSchemeName = 'IGV'
    let lineItemTaxTypeCode = 'VAT' // VAT para gravados y exonerados, FRE para inafectos
    if (isExonerado) {
      lineItemTaxSchemeCode = '9997'
      lineItemTaxSchemeName = 'EXO'
      lineItemTaxTypeCode = 'VAT'
    } else if (isInafecto) {
      lineItemTaxSchemeCode = '9998'
      lineItemTaxSchemeName = 'INA'
      lineItemTaxTypeCode = 'FRE' // Inafectos usan FRE según catálogo 05 SUNAT
    }
    lineItemTaxScheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeName': 'Codigo de tributos',
      'schemeAgencyName': 'PE:SUNAT'
    }).txt(lineItemTaxSchemeCode)
    lineItemTaxScheme.ele('cbc:Name').txt(lineItemTaxSchemeName)
    lineItemTaxScheme.ele('cbc:TaxTypeCode').txt(lineItemTaxTypeCode)

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
  // Buscar taxConfig en: 1) creditNoteData.taxConfig, 2) businessData.emissionConfig.taxConfig, 3) default 18
  const igvRate = creditNoteData.taxConfig?.igvRate ?? businessData?.emissionConfig?.taxConfig?.igvRate ?? 18
  const igvExempt = creditNoteData.taxConfig?.igvExempt ?? businessData?.emissionConfig?.taxConfig?.igvExempt ?? false
  const exemptionReason = creditNoteData.taxConfig?.exemptionReason ?? businessData?.emissionConfig?.taxConfig?.exemptionReason ?? ''
  const igvMultiplier = igvRate / 100

  console.log(`💰 NC - Configuración IGV: rate=${igvRate}%, exempt=${igvExempt}`)

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

  // === CALCULAR TOTALES POR TIPO DE AFECTACIÓN ===
  // Necesario para generar múltiples TaxSubtotals
  let cnSumGravadas = 0
  let cnSumExoneradas = 0
  let cnSumInafectas = 0
  let cnSumIGVGravadas = 0

  creditNoteData.items.forEach((item) => {
    let taxAffectation
    if (igvExempt) {
      taxAffectation = '20'
    } else {
      taxAffectation = item.taxAffectation || '10'
    }
    const isGravado = taxAffectation === '10'
    const isExonerado = taxAffectation === '20'
    const isInafecto = taxAffectation === '30'

    const priceWithIGV = item.unitPrice
    const priceWithoutIGV = isGravado ? priceWithIGV / (1 + igvMultiplier) : priceWithIGV
    const lineTotal = Math.round(item.quantity * priceWithoutIGV * 100) / 100
    const lineIGV = isGravado ? Math.round((item.quantity * priceWithIGV - lineTotal) * 100) / 100 : 0

    if (isGravado) {
      cnSumGravadas += lineTotal
      cnSumIGVGravadas += lineIGV
    } else if (isExonerado) {
      cnSumExoneradas += lineTotal
    } else if (isInafecto) {
      cnSumInafectas += lineTotal
    }
  })

  // Redondear
  cnSumGravadas = Math.round(cnSumGravadas * 100) / 100
  cnSumExoneradas = Math.round(cnSumExoneradas * 100) / 100
  cnSumInafectas = Math.round(cnSumInafectas * 100) / 100
  cnSumIGVGravadas = Math.round(cnSumIGVGravadas * 100) / 100

  // === IMPUESTOS (IGV) ===
  // NUEVO: Generar múltiples TaxSubtotals según los tipos de afectación usados
  const currencyCN = creditNoteData.currency || 'PEN'
  const taxTotal = root.ele('cac:TaxTotal')
  taxTotal.ele('cbc:TaxAmount', { 'currencyID': currencyCN })
    .txt(creditNoteData.igv.toFixed(2))

  // Función helper para crear un TaxSubtotal
  const createTaxSubtotalCN = (taxableAmt, taxAmt, categoryId, schemeId, schemeName, taxTypeCode) => {
    const subtotal = taxTotal.ele('cac:TaxSubtotal')
    subtotal.ele('cbc:TaxableAmount', { 'currencyID': currencyCN })
      .txt(taxableAmt.toFixed(2))
    subtotal.ele('cbc:TaxAmount', { 'currencyID': currencyCN })
      .txt(taxAmt.toFixed(2))

    const category = subtotal.ele('cac:TaxCategory')
    category.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5305',
      'schemeName': 'Tax Category Identifier',
      'schemeAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(categoryId)

    const scheme = category.ele('cac:TaxScheme')
    scheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeAgencyID': '6'
    }).txt(schemeId)
    scheme.ele('cbc:Name').txt(schemeName)
    scheme.ele('cbc:TaxTypeCode').txt(taxTypeCode)
  }

  // Generar TaxSubtotal para operaciones GRAVADAS (si hay)
  if (cnSumGravadas > 0) {
    createTaxSubtotalCN(cnSumGravadas, cnSumIGVGravadas, 'S', '1000', 'IGV', 'VAT')
  }

  // Generar TaxSubtotal para operaciones EXONERADAS (si hay)
  if (cnSumExoneradas > 0) {
    createTaxSubtotalCN(cnSumExoneradas, 0, 'E', '9997', 'EXO', 'VAT')
  }

  // Generar TaxSubtotal para operaciones INAFECTAS (si hay)
  if (cnSumInafectas > 0) {
    createTaxSubtotalCN(cnSumInafectas, 0, 'O', '9998', 'INA', 'FRE')
  }

  // Si no hay ningún tipo (caso edge), generar al menos uno según igvExempt
  if (cnSumGravadas === 0 && cnSumExoneradas === 0 && cnSumInafectas === 0) {
    if (igvExempt) {
      createTaxSubtotalCN(0, 0, 'E', '9997', 'EXO', 'VAT')
    } else {
      createTaxSubtotalCN(0, 0, 'S', '1000', 'IGV', 'VAT')
    }
  }

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

    // Código de afectación al IGV (10=Gravado, 20=Exonerado, 30=Inafecto)
    // REGLA: Si negocio tiene Ley de la Selva (igvExempt=true) → FORZAR exonerado para TODOS
    //        Si negocio normal → respetar config del producto, si no tiene = gravado
    let taxAffectation
    if (igvExempt) {
      taxAffectation = '20'
    } else {
      taxAffectation = item.taxAffectation || '10'
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
    // Código de tributo según tipo de afectación:
    // - 1000 (IGV) para gravados
    // - 9997 (EXO) para exonerados
    // - 9998 (INA) para inafectos
    let lineItemTaxSchemeCode = '1000'
    let lineItemTaxSchemeName = 'IGV'
    let lineItemTaxTypeCode = 'VAT' // VAT para gravados y exonerados, FRE para inafectos
    if (isExonerado) {
      lineItemTaxSchemeCode = '9997'
      lineItemTaxSchemeName = 'EXO'
      lineItemTaxTypeCode = 'VAT'
    } else if (isInafecto) {
      lineItemTaxSchemeCode = '9998'
      lineItemTaxSchemeName = 'INA'
      lineItemTaxTypeCode = 'FRE' // Inafectos usan FRE según catálogo 05 SUNAT
    }
    lineItemTaxScheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeName': 'Codigo de tributos',
      'schemeAgencyName': 'PE:SUNAT'
    }).txt(lineItemTaxSchemeCode)
    lineItemTaxScheme.ele('cbc:Name').txt(lineItemTaxSchemeName)
    lineItemTaxScheme.ele('cbc:TaxTypeCode').txt(lineItemTaxTypeCode)

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
  // Configuración de impuestos (IGV) - soporta IGV 0% para empresas exoneradas
  // Buscar taxConfig en: 1) debitNoteData.taxConfig, 2) businessData.emissionConfig.taxConfig, 3) default 18
  const igvRate = debitNoteData.taxConfig?.igvRate ?? businessData?.emissionConfig?.taxConfig?.igvRate ?? 18
  const igvExempt = debitNoteData.taxConfig?.igvExempt ?? businessData?.emissionConfig?.taxConfig?.igvExempt ?? false
  const exemptionReason = debitNoteData.taxConfig?.exemptionReason ?? businessData?.emissionConfig?.taxConfig?.exemptionReason ?? ''
  const igvMultiplier = igvRate / 100

  console.log(`💰 ND - Configuración IGV: rate=${igvRate}%, exempt=${igvExempt}`)

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

  // === CALCULAR TOTALES POR TIPO DE AFECTACIÓN ===
  // Necesario para generar múltiples TaxSubtotals
  let dnSumGravadas = 0
  let dnSumExoneradas = 0
  let dnSumInafectas = 0
  let dnSumIGVGravadas = 0

  debitNoteData.items.forEach((item) => {
    let taxAffectation
    if (igvExempt) {
      taxAffectation = '20'
    } else {
      taxAffectation = item.taxAffectation || '10'
    }
    const isGravado = taxAffectation === '10'
    const isExonerado = taxAffectation === '20'
    const isInafecto = taxAffectation === '30'

    const priceWithIGV = item.unitPrice
    const priceWithoutIGV = isGravado ? priceWithIGV / (1 + igvMultiplier) : priceWithIGV
    const lineTotal = Math.round(item.quantity * priceWithoutIGV * 100) / 100
    const lineIGV = isGravado ? Math.round((item.quantity * priceWithIGV - lineTotal) * 100) / 100 : 0

    if (isGravado) {
      dnSumGravadas += lineTotal
      dnSumIGVGravadas += lineIGV
    } else if (isExonerado) {
      dnSumExoneradas += lineTotal
    } else if (isInafecto) {
      dnSumInafectas += lineTotal
    }
  })

  // Redondear
  dnSumGravadas = Math.round(dnSumGravadas * 100) / 100
  dnSumExoneradas = Math.round(dnSumExoneradas * 100) / 100
  dnSumInafectas = Math.round(dnSumInafectas * 100) / 100
  dnSumIGVGravadas = Math.round(dnSumIGVGravadas * 100) / 100

  // === IMPUESTOS (IGV) ===
  // NUEVO: Generar múltiples TaxSubtotals según los tipos de afectación usados
  const currencyDN = debitNoteData.currency || 'PEN'
  const taxTotal = root.ele('cac:TaxTotal')
  taxTotal.ele('cbc:TaxAmount', { 'currencyID': currencyDN })
    .txt(debitNoteData.igv.toFixed(2))

  // Función helper para crear un TaxSubtotal
  const createTaxSubtotalDN = (taxableAmt, taxAmt, categoryId, schemeId, schemeName, taxTypeCode) => {
    const subtotal = taxTotal.ele('cac:TaxSubtotal')
    subtotal.ele('cbc:TaxableAmount', { 'currencyID': currencyDN })
      .txt(taxableAmt.toFixed(2))
    subtotal.ele('cbc:TaxAmount', { 'currencyID': currencyDN })
      .txt(taxAmt.toFixed(2))

    const category = subtotal.ele('cac:TaxCategory')
    category.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5305',
      'schemeName': 'Tax Category Identifier',
      'schemeAgencyName': 'United Nations Economic Commission for Europe'
    }).txt(categoryId)

    const scheme = category.ele('cac:TaxScheme')
    scheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeAgencyID': '6'
    }).txt(schemeId)
    scheme.ele('cbc:Name').txt(schemeName)
    scheme.ele('cbc:TaxTypeCode').txt(taxTypeCode)
  }

  // Generar TaxSubtotal para operaciones GRAVADAS (si hay)
  if (dnSumGravadas > 0) {
    createTaxSubtotalDN(dnSumGravadas, dnSumIGVGravadas, 'S', '1000', 'IGV', 'VAT')
  }

  // Generar TaxSubtotal para operaciones EXONERADAS (si hay)
  if (dnSumExoneradas > 0) {
    createTaxSubtotalDN(dnSumExoneradas, 0, 'E', '9997', 'EXO', 'VAT')
  }

  // Generar TaxSubtotal para operaciones INAFECTAS (si hay)
  if (dnSumInafectas > 0) {
    createTaxSubtotalDN(dnSumInafectas, 0, 'O', '9998', 'INA', 'FRE')
  }

  // Si no hay ningún tipo (caso edge), generar al menos uno según igvExempt
  if (dnSumGravadas === 0 && dnSumExoneradas === 0 && dnSumInafectas === 0) {
    if (igvExempt) {
      createTaxSubtotalDN(0, 0, 'E', '9997', 'EXO', 'VAT')
    } else {
      createTaxSubtotalDN(0, 0, 'S', '1000', 'IGV', 'VAT')
    }
  }

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

    // Código de afectación al IGV (10=Gravado, 20=Exonerado, 30=Inafecto)
    // REGLA: Si negocio tiene Ley de la Selva (igvExempt=true) → FORZAR exonerado para TODOS
    //        Si negocio normal → respetar config del producto, si no tiene = gravado
    let taxAffectation
    if (igvExempt) {
      taxAffectation = '20'
    } else {
      taxAffectation = item.taxAffectation || '10'
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
    const lineIGV = isGravado ? lineTotal * igvMultiplier : 0
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
    // Código de tributo según tipo de afectación:
    // - 1000 (IGV) para gravados
    // - 9997 (EXO) para exonerados
    // - 9998 (INA) para inafectos
    let lineItemTaxSchemeCode = '1000'
    let lineItemTaxSchemeName = 'IGV'
    let lineItemTaxTypeCode = 'VAT' // VAT para gravados y exonerados, FRE para inafectos
    if (isExonerado) {
      lineItemTaxSchemeCode = '9997'
      lineItemTaxSchemeName = 'EXO'
      lineItemTaxTypeCode = 'VAT'
    } else if (isInafecto) {
      lineItemTaxSchemeCode = '9998'
      lineItemTaxSchemeName = 'INA'
      lineItemTaxTypeCode = 'FRE' // Inafectos usan FRE según catálogo 05 SUNAT
    }
    lineItemTaxScheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeName': 'Codigo de tributos',
      'schemeAgencyName': 'PE:SUNAT'
    }).txt(lineItemTaxSchemeCode)
    lineItemTaxScheme.ele('cbc:Name').txt(lineItemTaxSchemeName)
    lineItemTaxScheme.ele('cbc:TaxTypeCode').txt(lineItemTaxTypeCode)

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
  // Helper para obtener fecha/hora en zona horaria de Perú (UTC-5)
  const getPeruDateTime = () => {
    const now = new Date()
    // Perú está en UTC-5 (sin horario de verano)
    const peruOffset = -5 * 60 // -5 horas en minutos
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000)
    const peruTime = new Date(utcTime + (peruOffset * 60000))
    return peruTime
  }

  // Helper para formatear fecha YYYY-MM-DD
  const formatDatePeru = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Helper para formatear hora HH:MM:SS
  const formatTimePeru = (date) => {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  // Obtener fecha y hora en zona horaria de Perú
  const peruNow = getPeruDateTime()

  // Si se proporciona una fecha de emisión específica, usarla; sino, usar la fecha actual de Perú
  let issueDate
  if (guideData.issueDate && typeof guideData.issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(guideData.issueDate)) {
    issueDate = guideData.issueDate
    console.log(`📅 [GRE-R] Usando fecha de emisión proporcionada: ${issueDate}`)
  } else {
    issueDate = formatDatePeru(peruNow)
    console.log(`📅 [GRE-R] Usando fecha de emisión actual (Perú): ${issueDate}`)
  }

  const issueTime = formatTimePeru(peruNow)
  console.log(`🕐 [GRE-R] Hora de emisión (Perú): ${issueTime}`)

  // Formatear fecha de inicio del traslado
  let transferDate
  if (guideData.transferDate) {
    // Si transferDate ya viene en formato YYYY-MM-DD, usarlo directamente
    if (typeof guideData.transferDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(guideData.transferDate)) {
      transferDate = guideData.transferDate
    } else {
      // Si es otro formato, parsearlo respetando la zona horaria local
      const date = new Date(guideData.transferDate)
      transferDate = formatDatePeru(date)
    }
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

  // Fecha de emisión (ya calculada en hora de Perú)
  root.ele('cbc:IssueDate').txt(issueDate)

  // Hora de emisión (ya calculada en hora de Perú)
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
  // Prioridad: recipient > customer (para compatibilidad)
  const recipientData = guideData.recipient || guideData.customer || {}

  // Determinar tipo de documento del destinatario
  let recipientDocType = recipientData.documentType || '1'
  // Convertir si viene como texto
  if (recipientDocType === 'RUC') recipientDocType = '6'
  else if (recipientDocType === 'DNI') recipientDocType = '1'

  const deliveryCustomerParty = root.ele('cac:DeliveryCustomerParty')
  const customerParty = deliveryCustomerParty.ele('cac:Party')

  // Identificación del destinatario
  const customerPartyId = customerParty.ele('cac:PartyIdentification')
  customerPartyId.ele('cbc:ID', {
    'schemeID': recipientDocType,
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(recipientData.documentNumber || '00000000')

  // Nombre del destinatario
  const customerLegalEntity = customerParty.ele('cac:PartyLegalEntity')
  customerLegalEntity.ele('cbc:RegistrationName').txt(recipientData.name || 'CLIENTE GENERAL')

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

/**
 * Genera el XML de una Guía de Remisión Electrónica TRANSPORTISTA (GRE-T)
 * según especificaciones UBL 2.1 y SUNAT
 *
 * DIFERENCIAS CON GRE REMITENTE:
 * - Código de documento: 31 (en lugar de 09)
 * - Serie: V001 (en lugar de T001)
 * - El emisor es el TRANSPORTISTA (no el remitente)
 * - Incluye datos del remitente como parte separada
 * - Vehículo y conductor son obligatorios
 * - Puede referenciar GRE Remitente(s)
 *
 * @param {Object} guideData - Datos de la guía transportista
 * @param {Object} businessData - Datos del negocio (transportista/emisor)
 * @returns {string} XML en formato string
 */
export function generateCarrierDispatchGuideXML(guideData, businessData) {
  // Helper para obtener fecha/hora en zona horaria de Perú (UTC-5)
  const getPeruDateTime = () => {
    const now = new Date()
    // Perú está en UTC-5 (sin horario de verano)
    const peruOffset = -5 * 60 // -5 horas en minutos
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000)
    const peruTime = new Date(utcTime + (peruOffset * 60000))
    return peruTime
  }

  // Helper para formatear fecha YYYY-MM-DD
  const formatDatePeru = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Helper para formatear hora HH:MM:SS
  const formatTimePeru = (date) => {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  // Obtener fecha y hora en zona horaria de Perú
  const peruNow = getPeruDateTime()

  // Si se proporciona una fecha de emisión específica, usarla; sino, usar la fecha actual de Perú
  let issueDate
  if (guideData.issueDate && typeof guideData.issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(guideData.issueDate)) {
    issueDate = guideData.issueDate
    console.log(`📅 [GRE-T] Usando fecha de emisión proporcionada: ${issueDate}`)
  } else {
    issueDate = formatDatePeru(peruNow)
    console.log(`📅 [GRE-T] Usando fecha de emisión actual (Perú): ${issueDate}`)
  }

  const issueTime = formatTimePeru(peruNow)
  console.log(`🕐 [GRE-T] Hora de emisión (Perú): ${issueTime}`)

  // Formatear fecha de inicio del traslado
  let transferDate
  if (guideData.transferDate) {
    if (typeof guideData.transferDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(guideData.transferDate)) {
      transferDate = guideData.transferDate
    } else {
      const date = new Date(guideData.transferDate)
      transferDate = formatDatePeru(date)
    }
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

  // Fecha de emisión (ya calculada en hora de Perú)
  root.ele('cbc:IssueDate').txt(issueDate)

  // Hora de emisión (ya calculada en hora de Perú)
  root.ele('cbc:IssueTime').txt(issueTime)

  // Tipo de documento: 31 = Guía de Remisión TRANSPORTISTA
  root.ele('cbc:DespatchAdviceTypeCode', {
    'listAgencyName': 'PE:SUNAT',
    'listName': 'Tipo de Documento',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
  }).txt('31')

  // Referencia a GRE Remitente(s) relacionada(s)
  if (guideData.relatedGuides && guideData.relatedGuides.length > 0) {
    guideData.relatedGuides.forEach(related => {
      if (related.number) {
        const additionalDoc = root.ele('cac:AdditionalDocumentReference')
        additionalDoc.ele('cbc:ID').txt(related.number)
        additionalDoc.ele('cbc:DocumentTypeCode', {
          'listAgencyName': 'PE:SUNAT',
          'listName': 'Tipo de Documento',
          'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
        }).txt('09') // 09 = GRE Remitente

        // Datos del emisor de la GRE Remitente
        if (related.ruc) {
          const issuerParty = additionalDoc.ele('cac:IssuerParty')
          const issuerPartyId = issuerParty.ele('cac:PartyIdentification')
          issuerPartyId.ele('cbc:ID', {
            'schemeID': '6',
            'schemeName': 'Documento de Identidad',
            'schemeAgencyName': 'PE:SUNAT',
            'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
          }).txt(related.ruc)
        }
      }
    })
  }

  // === TRANSPORTISTA (Emisor de la guía - CarrierParty) ===
  // En GRE Transportista, el emisor es el transportista
  const despatchSupplierParty = root.ele('cac:DespatchSupplierParty')
  const supplierParty = despatchSupplierParty.ele('cac:Party')

  // Identificación del transportista (RUC)
  const supplierPartyId = supplierParty.ele('cac:PartyIdentification')
  supplierPartyId.ele('cbc:ID', {
    'schemeID': '6',
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(businessData.ruc)

  // Nombre o razón social del transportista
  const supplierLegalEntity = supplierParty.ele('cac:PartyLegalEntity')
  supplierLegalEntity.ele('cbc:RegistrationName').txt(businessData.businessName)

  // Número de autorización MTC (si aplica)
  if (businessData.mtcRegistration) {
    supplierLegalEntity.ele('cbc:CompanyID', {
      'schemeAgencyName': 'PE:MTC',
      'schemeName': 'Registro MTC'
    }).txt(businessData.mtcRegistration)
  }

  // === DESTINATARIO ===
  const recipientData = guideData.recipient || {}
  let recipientDocType = recipientData.documentType || '1'
  if (recipientDocType === 'RUC') recipientDocType = '6'
  else if (recipientDocType === 'DNI') recipientDocType = '1'

  const deliveryCustomerParty = root.ele('cac:DeliveryCustomerParty')
  const customerParty = deliveryCustomerParty.ele('cac:Party')

  const customerPartyId = customerParty.ele('cac:PartyIdentification')
  customerPartyId.ele('cbc:ID', {
    'schemeID': recipientDocType,
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(recipientData.documentNumber || '00000000')

  const customerLegalEntity = customerParty.ele('cac:PartyLegalEntity')
  customerLegalEntity.ele('cbc:RegistrationName').txt(recipientData.name || 'DESTINATARIO')

  // === REMITENTE ===
  // En GRE Transportista, el remitente va dentro de cac:Shipment/cac:Delivery/cac:Despatch/cac:DespatchParty
  // Según validaciones SUNAT (error 3383): /DespatchAdvice/cac:Shipment/cac:Delivery/cac:Despatch/cac:DespatchParty/cac:PartyIdentification/cbc:ID
  const shipperData = guideData.shipper || guideData.sender || guideData.remitente || {}
  const shipperRuc = shipperData.ruc || shipperData.documentNumber || guideData.shipperRuc || ''
  const shipperBusinessName = shipperData.businessName || shipperData.name || shipperData.razonSocial || guideData.shipperName || ''
  const shipperDocType = shipperData.documentType || '6' // Por defecto RUC

  console.log('📦 [GRE-T XML] Datos del remitente (shipper):', JSON.stringify(shipperData))
  console.log('📦 [GRE-T XML] RUC del remitente:', shipperRuc)
  console.log('📦 [GRE-T XML] Razón social del remitente:', shipperBusinessName)

  // === ENVÍO (Shipment) ===
  const shipment = root.ele('cac:Shipment')
  shipment.ele('cbc:ID').txt('1')

  // Motivo de traslado (Catálogo 20)
  shipment.ele('cbc:HandlingCode', {
    'listAgencyName': 'PE:SUNAT',
    'listName': 'Motivo de traslado',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20'
  }).txt(guideData.transferReason || '01')

  // Descripción del motivo
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

  // === DATOS DE TRANSPORTE (ShipmentStage DEBE ir ANTES de TransportHandlingUnit según UBL 2.1) ===
  const shipmentStage = shipment.ele('cac:ShipmentStage')
  shipmentStage.ele('cbc:ID').txt('1')

  // Modalidad de transporte: siempre 01 (Público) para GRE Transportista
  shipmentStage.ele('cbc:TransportModeCode', {
    'listName': 'Modalidad de traslado',
    'listAgencyName': 'PE:SUNAT',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18'
  }).txt('01')

  // Fecha de inicio del traslado
  const transitPeriod = shipmentStage.ele('cac:TransitPeriod')
  transitPeriod.ele('cbc:StartDate').txt(transferDate)

  // === CONDUCTOR (obligatorio en GRE Transportista) ===
  const driverData = guideData.driver || guideData.transport?.driver || {}
  console.log('🚗 [GRE-T XML] Datos del conductor:', JSON.stringify(driverData))

  const driverPerson = shipmentStage.ele('cac:DriverPerson')
  driverPerson.ele('cbc:ID', {
    'schemeID': driverData.documentType || '1',
    'schemeName': 'Documento de Identidad',
    'schemeAgencyName': 'PE:SUNAT',
    'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
  }).txt(driverData.documentNumber || '00000000')

  driverPerson.ele('cbc:FirstName').txt(driverData.name || driverData.firstName || 'CONDUCTOR')
  driverPerson.ele('cbc:FamilyName').txt(driverData.lastName || driverData.familyName || 'NO ESPECIFICADO')
  driverPerson.ele('cbc:JobTitle').txt('Principal')

  // Licencia de conducir (obligatoria)
  const driverLicense = driverPerson.ele('cac:IdentityDocumentReference')
  driverLicense.ele('cbc:ID').txt(driverData.license || driverData.licenseNumber || 'Q00000000')

  // === PUNTO DE LLEGADA (Destino) - cac:Delivery DEBE ir ANTES de TransportHandlingUnit según UBL 2.1 ===
  // Orden en cac:Shipment según UBL 2.1: ShipmentStage (24) -> Delivery (25) -> TransportHandlingUnit (26)
  const delivery = shipment.ele('cac:Delivery')
  const deliveryAddress = delivery.ele('cac:DeliveryAddress')
  deliveryAddress.ele('cbc:ID', {
    'schemeAgencyName': 'PE:INEI',
    'schemeName': 'Ubigeos'
  }).txt(guideData.destination?.ubigeo || '150101')
  deliveryAddress.ele('cbc:StreetName').txt(guideData.destination?.address || '')

  // === PUNTO DE PARTIDA (dentro de cac:Delivery/cac:Despatch/cac:DespatchAddress) ===
  // Según validaciones SUNAT (error 2775): /DespatchAdvice/cac:Shipment/cac:Delivery/cac:Despatch/cac:DespatchAddress/cbc:ID
  const despatch = delivery.ele('cac:Despatch')

  // Dirección de despacho (punto de partida/origen)
  const despatchAddress = despatch.ele('cac:DespatchAddress')
  despatchAddress.ele('cbc:ID', {
    'schemeAgencyName': 'PE:INEI',
    'schemeName': 'Ubigeos'
  }).txt(guideData.origin?.ubigeo || '150101')
  despatchAddress.ele('cbc:StreetName').txt(guideData.origin?.address || '')

  // === REMITENTE (dentro de cac:Delivery/cac:Despatch/cac:DespatchParty) ===
  // Según validaciones SUNAT: /DespatchAdvice/cac:Shipment/cac:Delivery/cac:Despatch/cac:DespatchParty
  // Error 3383: "Debe consignar el Numero de documento de identidad del Remitente"
  // Error 3387: "Debe consignar el Nombre o razon social del Remitente"
  const despatchParty = despatch.ele('cac:DespatchParty')

  const despatchPartyId = despatchParty.ele('cac:PartyIdentification')
  despatchPartyId.ele('cbc:ID', {
    'schemeID': shipperDocType
  }).txt(shipperRuc || '00000000000')

  const despatchLegalEntity = despatchParty.ele('cac:PartyLegalEntity')
  despatchLegalEntity.ele('cbc:RegistrationName').txt(shipperBusinessName || 'REMITENTE NO ESPECIFICADO')

  // === VEHÍCULO - TransportHandlingUnit (DEBE ir DESPUÉS de Delivery según UBL 2.1) ===
  // XPath: /DespatchAdvice/cac:Shipment/cac:TransportHandlingUnit/cac:TransportEquipment/cbc:ID
  const vehicleData = guideData.vehicle || guideData.transport?.vehicle || {}
  const vehiclePlate = vehicleData.plate || vehicleData.licensePlate || ''
  console.log('🚛 [GRE-T XML] Datos del vehículo:', JSON.stringify(vehicleData))
  console.log('🚛 [GRE-T XML] Placa del vehículo:', vehiclePlate)

  const transportHandlingUnit = shipment.ele('cac:TransportHandlingUnit')
  const transportEquipment = transportHandlingUnit.ele('cac:TransportEquipment')
  transportEquipment.ele('cbc:ID').txt(vehiclePlate || 'AAA-000')

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
