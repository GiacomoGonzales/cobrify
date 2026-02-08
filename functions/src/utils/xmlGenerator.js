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
  // listID según catálogo 51 SUNAT:
  // - 0101: Venta interna
  // - 1001: Venta interna - Operación sujeta a detracción
  const operationTypeCode = (invoiceData.hasDetraction && invoiceData.detractionType && invoiceData.detractionAmount > 0)
    ? '1001'  // Operación sujeta a detracción
    : '0101'  // Venta interna normal

  root.ele('cbc:InvoiceTypeCode', {
    'listID': operationTypeCode,
    'listAgencyName': 'PE:SUNAT',
    'listName': 'Tipo de Documento',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01'
  }).txt(documentTypeCode)

  // Leyenda SPOT para operaciones con detracción (obligatoria según SUNAT)
  // NOTA: Según UBL 2.1, cbc:Note debe ir ANTES de DocumentCurrencyCode
  if (invoiceData.hasDetraction && invoiceData.detractionType && invoiceData.detractionAmount > 0) {
    root.ele('cbc:Note', {
      'languageLocaleID': '2006'
    }).txt('Operación sujeta al Sistema de Pago de Obligaciones Tributarias con el Gobierno Central')
  }

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

  // === DETRACCIÓN - PaymentMeans ===
  // IMPORTANTE: Según UBL 2.1, PaymentMeans DEBE ir ANTES de PaymentTerms
  // Solo se agrega si la factura tiene detracción habilitada
  if (invoiceData.hasDetraction && invoiceData.detractionType && invoiceData.detractionAmount > 0) {
    console.log(`📋 Agregando detracción al XML: tipo=${invoiceData.detractionType}, tasa=${invoiceData.detractionRate}%, monto=${invoiceData.detractionAmount}`)

    // Buscar cuenta de detracciones:
    // 1. Primero usar la cuenta de la factura (invoiceData.detractionBankAccount)
    // 2. Si no existe, buscar en bankAccountsList del negocio (tipo "detracciones")
    let detractionAccount = invoiceData.detractionBankAccount

    if (!detractionAccount && businessData.bankAccountsList && Array.isArray(businessData.bankAccountsList)) {
      const detractionBankAccount = businessData.bankAccountsList.find(
        acc => acc.accountType === 'detracciones'
      )
      if (detractionBankAccount) {
        detractionAccount = detractionBankAccount.accountNumber
        console.log(`📋 Usando cuenta de detracciones del negocio: ${detractionAccount}`)
      }
    }

    // PaymentMeans - Medio de pago (cuenta del Banco de la Nación)
    const paymentMeans = root.ele('cac:PaymentMeans')
    paymentMeans.ele('cbc:ID').txt('Detraccion')
    paymentMeans.ele('cbc:PaymentMeansCode', {
      'listAgencyName': 'PE:SUNAT',
      'listName': 'Medio de pago',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo59'
    }).txt('001') // 001 = Transferencia bancaria

    // La cuenta del Banco de la Nación es OBLIGATORIA para detracciones (error 3034)
    if (!detractionAccount) {
      throw new Error('DETRACCION_SIN_CUENTA: No se encontró cuenta de detracciones del Banco de la Nación. Configura tu cuenta BN en Ajustes > Cuentas bancarias (tipo "detracciones") antes de emitir con detracción.')
    }
    const payeeAccount = paymentMeans.ele('cac:PayeeFinancialAccount')
    payeeAccount.ele('cbc:ID').txt(detractionAccount)
  }

  // === FORMA DE PAGO / TIPO DE OPERACIÓN ===
  // IMPORTANTE: PaymentTerms DEBE ir DESPUÉS de PaymentMeans y ANTES de TaxTotal
  // Según ejemplos de Greenter y especificación SUNAT (Resolución Nº 000193-2020/SUNAT)
  // Vigente desde 01/04/2021

  const paymentType = invoiceData.paymentType || 'contado' // 'contado' o 'credito'
  console.log(`📋 Forma de pago en XML: paymentType=${paymentType}, invoiceData.paymentType=${invoiceData.paymentType}`)
  const paymentDueDate = invoiceData.paymentDueDate || null
  const paymentInstallments = invoiceData.paymentInstallments || []

  // Monto total para PaymentTerms
  const paymentTotalAmount = parseFloat(invoiceData.total) || 0

  // Calcular monto neto (descontando detracción) para crédito/cuotas
  const hasDetractionForPayment = invoiceData.hasDetraction && invoiceData.detractionType && invoiceData.detractionAmount > 0
  const detractionAmount = hasDetractionForPayment ? parseFloat(invoiceData.detractionAmount) : 0
  const netPayableAmount = paymentTotalAmount - detractionAmount

  // === DETRACCIÓN - PaymentTerms (DEBE ir ANTES de FormaPago según SUNAT) ===
  if (hasDetractionForPayment) {
    const detractionTerms = root.ele('cac:PaymentTerms')
    detractionTerms.ele('cbc:ID').txt('Detraccion')
    detractionTerms.ele('cbc:PaymentMeansID', {
      'schemeAgencyName': 'PE:SUNAT',
      'schemeName': 'Codigo de detraccion',
      'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo54'
    }).txt(invoiceData.detractionType)
    detractionTerms.ele('cbc:Note').txt(netPayableAmount.toFixed(2))
    detractionTerms.ele('cbc:PaymentPercent').txt(String(invoiceData.detractionRate || 0))
    detractionTerms.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(detractionAmount.toFixed(2))
  }

  if (paymentType === 'credito') {
    // Pago al Crédito - Monto pendiente descontando detracción
    const creditAmount = hasDetractionForPayment ? netPayableAmount : paymentTotalAmount

    const paymentTermsCredito = root.ele('cac:PaymentTerms')
    paymentTermsCredito.ele('cbc:ID').txt('FormaPago')
    paymentTermsCredito.ele('cbc:PaymentMeansID').txt('Credito')
    paymentTermsCredito.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(creditAmount.toFixed(2))

    // Si hay cuotas definidas, agregar cada una (ajustando montos si hay detracción)
    if (paymentInstallments.length > 0) {
      // Calcular factor de ajuste para distribuir la detracción proporcionalmente en las cuotas
      const adjustFactor = hasDetractionForPayment && paymentTotalAmount > 0
        ? netPayableAmount / paymentTotalAmount : 1

      paymentInstallments.forEach((cuota, index) => {
        const cuotaTerms = root.ele('cac:PaymentTerms')
        cuotaTerms.ele('cbc:ID').txt('FormaPago')
        cuotaTerms.ele('cbc:PaymentMeansID').txt(`Cuota${String(index + 1).padStart(3, '0')}`)
        const cuotaAmount = parseFloat(cuota.amount || 0) * adjustFactor
        cuotaTerms.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
          .txt(cuotaAmount.toFixed(2))
        if (cuota.dueDate) {
          cuotaTerms.ele('cbc:PaymentDueDate').txt(cuota.dueDate)
        }
      })
    } else if (paymentDueDate) {
      // Si no hay cuotas pero sí fecha de vencimiento, crear una sola cuota con el monto neto
      const cuotaTerms = root.ele('cac:PaymentTerms')
      cuotaTerms.ele('cbc:ID').txt('FormaPago')
      cuotaTerms.ele('cbc:PaymentMeansID').txt('Cuota001')
      cuotaTerms.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
        .txt(creditAmount.toFixed(2))
      cuotaTerms.ele('cbc:PaymentDueDate').txt(paymentDueDate)
    }
  } else {
    // Pago al Contado (por defecto)
    const paymentTerms = root.ele('cac:PaymentTerms')
    paymentTerms.ele('cbc:ID').txt('FormaPago')
    paymentTerms.ele('cbc:PaymentMeansID').txt('Contado')
  }

  // === DESCUENTO GLOBAL ===
  // IMPORTANTE: Usar solo globalDiscount (descuento global, sin incluir descuentos por ítem).
  // Los descuentos por ítem se manejan como AllowanceCharge en cada línea.
  // Si no existe globalDiscount (facturas antiguas), usar discount como fallback.
  // Pero si hay items con itemDiscount, restar esos del discount total para no contar doble.
  const itemDiscountsSum = (invoiceData.items || []).reduce((sum, item) => sum + (item.itemDiscount || item.descuento || 0), 0)
  const discountWithIGV = invoiceData.globalDiscount != null
    ? invoiceData.globalDiscount
    : Math.max(0, (invoiceData.discount || 0) - itemDiscountsSum)

  // Calcular la suma total CON IGV para obtener el factor de descuento
  // Usamos el total con IGV para que el factor funcione correctamente con tasas mixtas (18%/10%)
  let sumTotalWithIGV = 0
  invoiceData.items.forEach((item) => {
    sumTotalWithIGV += item.quantity * item.unitPrice
  })
  sumTotalWithIGV = Math.round(sumTotalWithIGV * 100) / 100

  // Factor de descuento (proporción del descuento sobre el total con IGV)
  const discountFactor = discountWithIGV > 0 && sumTotalWithIGV > 0
    ? discountWithIGV / sumTotalWithIGV
    : 0

  // Calcular LineExtensionAmount de cada item CON descuento proporcional aplicado
  // Esto evita los errores 4309/4310 porque:
  // - Suma de LineExtensionAmount de líneas = LineExtensionAmount global
  // - Suma de IGV de líneas = IGV global
  // También guardamos los precios ajustados para evitar errores 4287/4288
  const lineExtensions = []          // LineExtensionAmount por línea (base DESPUÉS de item discount)
  const lineIGVs = []                // IGV por línea (sobre el LineExtensionAmount)
  const lineIgvRates = []            // IGV rate used per line (for XML Percent)
  const lineTaxAffectations = []     // Tipo de afectación de cada línea
  const linePricesWithIGV = []       // AlternativeConditionPrice: precio unitario CON IGV DESPUÉS de item discount
  const lineItemDiscountBases = []   // Descuento por ítem SIN IGV (para AllowanceCharge)
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

    // IGV rate: SIEMPRE usar la tasa global del negocio para TODOS los items gravados
    // SUNAT regla 3462: "La tasa del IGV debe ser la misma en todas las líneas"
    // No se permite mezclar tasas (ej: 10% y 18%) en la misma factura/boleta
    const itemIgvRate = isGravado ? igvRate : 0
    const itemIgvMultiplier = itemIgvRate / 100

    // Descuento por ítem (viene CON IGV desde el POS)
    const itemDiscount = item.itemDiscount || item.descuento || 0

    // Total CON IGV: restar descuento por ítem ANTES de dividir por tasa
    // Esto es CRÍTICO: el itemDiscount está en el mismo espacio que unitPrice (con IGV)
    const lineTotalWithIGV = item.quantity * originalPriceWithIGV - itemDiscount

    // Si hay descuento GLOBAL, aplicarlo proporcionalmente
    const adjustedLineTotalWithIGV = lineTotalWithIGV * (1 - discountFactor)

    // Calcular subtotal sin IGV (base imponible) = LineExtensionAmount
    // Este valor ya tiene el item discount incorporado correctamente
    const lineTotal = isGravado
      ? Math.round((adjustedLineTotalWithIGV / (1 + itemIgvMultiplier)) * 100) / 100
      : Math.round(adjustedLineTotalWithIGV * 100) / 100

    // IGV = Total con IGV - Subtotal sin IGV (esto garantiza que cuadre)
    const lineIGV = isGravado
      ? Math.round((adjustedLineTotalWithIGV - lineTotal) * 100) / 100
      : 0

    // Descuento por ítem convertido a BASE (sin IGV) para AllowanceCharge en XML
    // SUNAT requiere AllowanceCharge.Amount en valor base (sin impuestos)
    let itemDiscountBase = 0
    if (itemDiscount > 0) {
      const itemDiscountAfterGlobal = itemDiscount * (1 - discountFactor)
      itemDiscountBase = isGravado
        ? Math.round(itemDiscountAfterGlobal / (1 + itemIgvMultiplier) * 100) / 100
        : Math.round(itemDiscountAfterGlobal * 100) / 100
    }

    // AlternativeConditionPrice: precio unitario CON IGV DESPUÉS del descuento por ítem
    // Según SUNAT: "incluye los tributos y la deducción de descuentos por item"
    // Fórmula 4287: AlternativeConditionPrice = (LineExtensionAmount + IGV) / Quantity
    const effectivePriceWithIGV = isGravado
      ? (lineTotal + lineIGV) / item.quantity
      : lineTotal / item.quantity

    lineExtensions.push(lineTotal)
    lineIgvRates.push(itemIgvRate)
    lineTaxAffectations.push(taxAffectation)
    linePricesWithIGV.push(Math.round(effectivePriceWithIGV * 1000000) / 1000000)
    lineItemDiscountBases.push(itemDiscountBase)
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
  console.log(`   sumTotalWithIGV (suma ANTES de descuento): ${sumTotalWithIGV}`)
  console.log(`   discountWithIGV (desde POS): ${discountWithIGV}`)
  console.log(`   discountFactor aplicado: ${(discountFactor * 100).toFixed(2)}%`)
  console.log(`   LineExtensions por item (YA con descuento): ${JSON.stringify(lineExtensions)}`)
  console.log(`   LineIGVs por item: ${JSON.stringify(lineIGVs)}`)
  console.log(`   sumLineExtension (taxableAmount): ${sumLineExtension}`)
  console.log(`   sumLineIGV (igvAmount): ${sumLineIGV}`)
  console.log(`   totalAmount: ${totalAmount}`)
  console.log(`   📊 Por tipo de afectación:`)
  console.log(`      Gravadas (10): ${sumGravadas} | IGV: ${sumIGVGravadas}`)
  console.log(`      Exoneradas (20): ${sumExoneradas}`)
  console.log(`      Inafectas (30): ${sumInafectas}`)

  // === RECARGO AL CONSUMO (Decreto Ley N° 25988) ===
  // El RC se declara como AllowanceCharge con ChargeIndicator=true (es un cargo, no un descuento)
  // Código SUNAT: 46 (Catálogo 53)
  // IMPORTANTE: El RC NO forma parte de la base imponible del IGV
  const recargoConsumo = invoiceData.recargoConsumo || 0
  const recargoConsumoRate = invoiceData.recargoConsumoRate || 0
  const currency = invoiceData.currency || 'PEN'

  if (recargoConsumo > 0) {
    // === RECARGO AL CONSUMO según especificación SUNAT UBL 2.1 ===
    // El AllowanceChargeReasonCode NO debe tener atributos según los ejemplos oficiales de SUNAT
    const allowanceChargeRC = root.ele('cac:AllowanceCharge')
    allowanceChargeRC.ele('cbc:ChargeIndicator').txt('true') // true = cargo (no descuento)
    allowanceChargeRC.ele('cbc:AllowanceChargeReasonCode').txt('46') // Código 46 = Recargo al Consumo (Catálogo 53)
    allowanceChargeRC.ele('cbc:MultiplierFactorNumeric').txt((recargoConsumoRate / 100).toFixed(5))
    allowanceChargeRC.ele('cbc:Amount', { 'currencyID': currency }).txt(recargoConsumo.toFixed(2))
    allowanceChargeRC.ele('cbc:BaseAmount', { 'currencyID': currency }).txt(sumLineExtension.toFixed(2))
    console.log(`✅ AllowanceCharge RC agregado: ${recargoConsumo.toFixed(2)} (${recargoConsumoRate}% de ${sumLineExtension.toFixed(2)})`)
  }

  // === IMPUESTOS (IGV) ===
  // IMPORTANTE: TaxTotal DEBE ir ANTES de LegalMonetaryTotal según UBL 2.1
  // SIEMPRE usar los valores calculados para que cuadren con las líneas
  // NUEVO: Generar múltiples TaxSubtotals según los tipos de afectación usados
  const finalIgv = igvAmount

  const taxTotal = root.ele('cac:TaxTotal')
  taxTotal.ele('cbc:TaxAmount', { 'currencyID': currency })
    .txt(finalIgv.toFixed(2))

  // Función helper para crear un TaxSubtotal
  const createTaxSubtotal = (taxableAmt, taxAmt, percent, categoryId, schemeId, schemeName, taxTypeCode) => {
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

    category.ele('cbc:Percent').txt(percent)

    const scheme = category.ele('cac:TaxScheme')
    scheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeAgencyID': '6'
    }).txt(schemeId)
    scheme.ele('cbc:Name').txt(schemeName)
    scheme.ele('cbc:TaxTypeCode').txt(taxTypeCode)
  }

  // Determinar tasa de gravado para Percent (usar la tasa de las líneas gravadas)
  const gravadoPercent = (() => {
    const gravadoRates = lineIgvRates.filter((r, i) => lineTaxAffectations[i] === '10')
    return gravadoRates.length > 0 ? gravadoRates[0].toFixed(2) : igvRate.toFixed(2)
  })()

  // Generar TaxSubtotal para operaciones GRAVADAS (si hay)
  if (sumGravadas > 0) {
    createTaxSubtotal(sumGravadas, sumIGVGravadas, gravadoPercent, 'S', '1000', 'IGV', 'VAT')
  }

  // Generar TaxSubtotal para operaciones EXONERADAS (si hay)
  if (sumExoneradas > 0) {
    createTaxSubtotal(sumExoneradas, 0, '0.00', 'E', '9997', 'EXO', 'VAT')
  }

  // Generar TaxSubtotal para operaciones INAFECTAS (si hay)
  if (sumInafectas > 0) {
    createTaxSubtotal(sumInafectas, 0, '0.00', 'O', '9998', 'INA', 'FRE')
  }

  // Si no hay ningún tipo (caso edge), generar al menos uno según igvExempt
  if (sumGravadas === 0 && sumExoneradas === 0 && sumInafectas === 0) {
    if (igvExempt) {
      createTaxSubtotal(0, 0, '0.00', 'E', '9997', 'EXO', 'VAT')
    } else {
      createTaxSubtotal(0, 0, igvRate.toFixed(2), 'S', '1000', 'IGV', 'VAT')
    }
  }

  // === TOTALES ===
  // IMPORTANTE: LegalMonetaryTotal DEBE ir DESPUÉS de TaxTotal y ANTES de InvoiceLine
  // El orden de los elementos es CRÍTICO según el esquema XSD UBL 2.1 de SUNAT:
  // LineExtensionAmount -> TaxExclusiveAmount -> TaxInclusiveAmount -> AllowanceTotalAmount -> ChargeTotalAmount -> PayableAmount

  // El total final incluye: subtotal + IGV + Recargo al Consumo (si aplica)
  const finalTotal = totalAmount + recargoConsumo

  const legalMonetaryTotal = root.ele('cac:LegalMonetaryTotal')

  // Con el nuevo enfoque (descuento distribuido en líneas):
  // - LineExtensionAmount = suma de LineExtensionAmount de cada línea (YA con descuento aplicado)
  // - TaxInclusiveAmount = LineExtensionAmount + IGV + ChargeTotalAmount
  // - ChargeTotalAmount = Recargo al Consumo (si aplica) - VA DESPUÉS de TaxInclusiveAmount según UBL 2.1
  // - PayableAmount = TaxInclusiveAmount

  // 1. LineExtensionAmount = suma de líneas (ya tienen el descuento proporcional aplicado)
  legalMonetaryTotal.ele('cbc:LineExtensionAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(sumLineExtension.toFixed(2))

  // 2. TaxInclusiveAmount - Total impuestos incluidos (incluye RC si aplica)
  legalMonetaryTotal.ele('cbc:TaxInclusiveAmount', { 'currencyID': invoiceData.currency || 'PEN' })
    .txt(finalTotal.toFixed(2))

  // 3. ChargeTotalAmount = Recargo al Consumo (solo si hay) - DEBE ir después de TaxInclusiveAmount
  if (recargoConsumo > 0) {
    legalMonetaryTotal.ele('cbc:ChargeTotalAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(recargoConsumo.toFixed(2))
  }

  // 4. PayableAmount - Total a pagar
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

    // Valores pre-calculados
    const lineTotal = lineExtensions[index]         // Base imponible DESPUÉS de item discount (= LineExtensionAmount)
    const priceWithIGV = linePricesWithIGV[index]   // Precio unitario CON IGV después de item discount
    const itemDiscountBase = lineItemDiscountBases[index] // Descuento por ítem SIN IGV

    // LineExtensionAmount = base imponible después de descuento por ítem
    invoiceLine.ele('cbc:LineExtensionAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(lineTotal.toFixed(2))

    // === PricingReference: AlternativeConditionPrice ===
    // Según SUNAT guía UBL 2.1: "incluye los tributos y la deducción de descuentos por item"
    // Fórmula validación 4287: AlternativeConditionPrice = (LineExtensionAmount + IGV) / Quantity
    const pricingReference = invoiceLine.ele('cac:PricingReference')
    const alternativeCondition = pricingReference.ele('cac:AlternativeConditionPrice')
    alternativeCondition.ele('cbc:PriceAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(priceWithIGV.toFixed(2))
    alternativeCondition.ele('cbc:PriceTypeCode', {
      'listName': 'Tipo de Precio',
      'listAgencyName': 'PE:SUNAT',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16'
    }).txt('01') // 01 = Precio unitario (incluye el IGV)

    // === DESCUENTO POR ÍTEM (AllowanceCharge) según especificación SUNAT UBL 2.1 ===
    // AllowanceCharge.Amount debe estar SIN IGV (valor base)
    // Fórmula validación 4288: LineExtensionAmount = (Qty × PriceAmount) - AllowanceCharge.Amount
    if (itemDiscountBase > 0) {
      const lineAllowanceCharge = invoiceLine.ele('cac:AllowanceCharge')
      lineAllowanceCharge.ele('cbc:ChargeIndicator').txt('false') // false = descuento
      lineAllowanceCharge.ele('cbc:AllowanceChargeReasonCode').txt('00') // Código 00 = Descuento que afecta la base imponible (Catálogo 53)
      lineAllowanceCharge.ele('cbc:Amount', { 'currencyID': invoiceData.currency || 'PEN' })
        .txt(itemDiscountBase.toFixed(2))
    }

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
      lineTaxCategory.ele('cbc:Percent').txt(lineIgvRates[index].toFixed(2))
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
    // Usar 'name' como nombre base, o 'description' si 'name' no existe (compatibilidad con datos antiguos)
    const itemName = item.name || item.description || 'Producto'
    // Concatenar observaciones adicionales si existen (IMEI, placa, serie, etc.)
    const itemDescription = item.observations
      ? `${itemName} - ${item.observations}`
      : itemName
    lineItem.ele('cbc:Description').txt(itemDescription)

    const sellersItemId = lineItem.ele('cac:SellersItemIdentification')
    // Usar código del producto, si no existe usar productId, si tampoco existe usar índice
    sellersItemId.ele('cbc:ID').txt(item.code || item.productId || String(index + 1))

    // cac:Price/PriceAmount = valor unitario SIN IGV, ANTES del descuento por ítem
    // Fórmula SUNAT 4288: LineExtensionAmount = (Qty × PriceAmount) - AllowanceCharge.Amount
    // Por lo tanto: PriceAmount = (LineExtensionAmount + AllowanceCharge.Amount) / Qty
    const exactUnitPrice = (lineTotal + itemDiscountBase) / item.quantity

    // SUNAT acepta hasta 10 decimales. Usar más decimales para cantidades grandes
    let unitPriceDecimals = exactUnitPrice < 0.1 ? 10 : (item.quantity > 100 ? 6 : 4)
    let unitPriceForXML = parseFloat(exactUnitPrice.toFixed(unitPriceDecimals))

    // Validar que el cálculo cuadra con la fórmula SUNAT (tolerancia de 0.01 para redondeo)
    const calculatedLineTotal = Math.round((item.quantity * unitPriceForXML - itemDiscountBase) * 100) / 100
    if (Math.abs(calculatedLineTotal - lineTotal) > 0.01) {
      unitPriceDecimals = 10
      unitPriceForXML = parseFloat(exactUnitPrice.toFixed(10))
      console.log(`⚠️ Item ${index + 1}: Precio ajustado a 10 decimales para cuadrar con SUNAT`)
      console.log(`   quantity=${item.quantity}, lineTotal=${lineTotal}, itemDiscountBase=${itemDiscountBase}, priceAmount=${unitPriceForXML}`)
    }

    const price = invoiceLine.ele('cac:Price')
    price.ele('cbc:PriceAmount', { 'currencyID': invoiceData.currency || 'PEN' })
      .txt(unitPriceForXML.toString())
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
  const cnLineIgvRates = []
  const cnLineTaxAffectations = []

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

    const itemIgvRate = isGravado ? igvRate : 0
    const itemIgvMultiplier = itemIgvRate / 100
    cnLineIgvRates.push(itemIgvRate)
    cnLineTaxAffectations.push(taxAffectation)

    const priceWithIGV = item.unitPrice
    const priceWithoutIGV = isGravado ? priceWithIGV / (1 + itemIgvMultiplier) : priceWithIGV
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
  const createTaxSubtotalCN = (taxableAmt, taxAmt, percent, categoryId, schemeId, schemeName, taxTypeCode) => {
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

    category.ele('cbc:Percent').txt(percent)

    const scheme = category.ele('cac:TaxScheme')
    scheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeAgencyID': '6'
    }).txt(schemeId)
    scheme.ele('cbc:Name').txt(schemeName)
    scheme.ele('cbc:TaxTypeCode').txt(taxTypeCode)
  }

  // Determinar tasa de gravado para Percent
  const cnGravadoPercent = (() => {
    const rates = cnLineIgvRates.filter((r, i) => cnLineTaxAffectations[i] === '10')
    return rates.length > 0 ? rates[0].toFixed(2) : igvRate.toFixed(2)
  })()

  // Generar TaxSubtotal para operaciones GRAVADAS (si hay)
  if (cnSumGravadas > 0) {
    createTaxSubtotalCN(cnSumGravadas, cnSumIGVGravadas, cnGravadoPercent, 'S', '1000', 'IGV', 'VAT')
  }

  // Generar TaxSubtotal para operaciones EXONERADAS (si hay)
  if (cnSumExoneradas > 0) {
    createTaxSubtotalCN(cnSumExoneradas, 0, '0.00', 'E', '9997', 'EXO', 'VAT')
  }

  // Generar TaxSubtotal para operaciones INAFECTAS (si hay)
  if (cnSumInafectas > 0) {
    createTaxSubtotalCN(cnSumInafectas, 0, '0.00', 'O', '9998', 'INA', 'FRE')
  }

  // Si no hay ningún tipo (caso edge), generar al menos uno según igvExempt
  if (cnSumGravadas === 0 && cnSumExoneradas === 0 && cnSumInafectas === 0) {
    if (igvExempt) {
      createTaxSubtotalCN(0, 0, '0.00', 'E', '9997', 'EXO', 'VAT')
    } else {
      createTaxSubtotalCN(0, 0, igvRate.toFixed(2), 'S', '1000', 'IGV', 'VAT')
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
    // Per-item IGV rate
    const itemIgvRate = isGravado ? igvRate : 0
    const itemIgvMultiplier = itemIgvRate / 100
    const priceWithoutIGV = isGravado ? priceWithIGV / (1 + itemIgvMultiplier) : priceWithIGV

    // === DESCUENTO POR ÍTEM - declarar antes porque afecta los cálculos ===
    const itemDiscount = item.itemDiscount || item.descuento || 0

    // Total línea SIN IGV (base imponible)
    const lineTotal = item.quantity * priceWithoutIGV
    creditNoteLine.ele('cbc:LineExtensionAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(lineTotal.toFixed(2))

    // Precio unitario CON IGV (PricingReference)
    // IMPORTANTE: Cuando hay descuento por ítem, el PricingReference debe ser el precio BASE (antes del descuento)
    // Fórmula SUNAT: LineExtensionAmount = (Cantidad × PriceAmount) - AllowanceCharge
    const basePriceWithoutIGV = itemDiscount > 0
      ? (lineTotal + itemDiscount) / item.quantity
      : priceWithoutIGV
    const basePriceWithIGV = isGravado
      ? basePriceWithoutIGV * (1 + itemIgvMultiplier)
      : basePriceWithoutIGV

    const pricingReference = creditNoteLine.ele('cac:PricingReference')
    const alternativeCondition = pricingReference.ele('cac:AlternativeConditionPrice')
    alternativeCondition.ele('cbc:PriceAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(basePriceWithIGV.toFixed(2))
    alternativeCondition.ele('cbc:PriceTypeCode', {
      'listName': 'Tipo de Precio',
      'listAgencyName': 'PE:SUNAT',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16'
    }).txt('01')

    // === DESCUENTO POR ÍTEM (AllowanceCharge) según especificación SUNAT UBL 2.1 ===
    if (itemDiscount > 0) {
      const lineAllowanceCharge = creditNoteLine.ele('cac:AllowanceCharge')
      lineAllowanceCharge.ele('cbc:ChargeIndicator').txt('false') // false = descuento
      lineAllowanceCharge.ele('cbc:AllowanceChargeReasonCode').txt('00') // Código 00 = Descuento que afecta la base imponible (Catálogo 53)
      lineAllowanceCharge.ele('cbc:Amount', { 'currencyID': creditNoteData.currency || 'PEN' })
        .txt(parseFloat(itemDiscount).toFixed(2))
    }

    // Impuesto de la línea
    const lineTaxTotal = creditNoteLine.ele('cac:TaxTotal')
    const lineIGV = isGravado ? lineTotal * itemIgvMultiplier : 0
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
      lineTaxCategory.ele('cbc:Percent').txt(itemIgvRate.toFixed(2))
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
    // Usar 'name' como nombre base, o 'description' si 'name' no existe (compatibilidad con datos antiguos)
    const itemName = item.name || item.description || 'Producto'
    // Concatenar observaciones adicionales si existen (IMEI, placa, serie, etc.)
    const itemDescription = item.observations
      ? `${itemName} - ${item.observations}`
      : itemName
    lineItem.ele('cbc:Description').txt(itemDescription)

    const sellersItemId = lineItem.ele('cac:SellersItemIdentification')
    // Usar código del producto, si no existe usar productId, si tampoco existe usar índice
    sellersItemId.ele('cbc:ID').txt(item.code || item.productId || String(index + 1))

    // Precio unitario SIN IGV (valor base para SUNAT)
    // IMPORTANTE: Cuando hay descuento por ítem (AllowanceCharge), la fórmula SUNAT es:
    //   LineExtensionAmount = (Cantidad × PriceAmount) - AllowanceCharge
    // Por lo tanto: PriceAmount = (LineExtensionAmount + AllowanceCharge) / Cantidad
    // SUNAT acepta hasta 10 decimales en el precio unitario
    const roundedLineTotal = parseFloat(lineTotal.toFixed(2))
    const exactUnitPrice = (roundedLineTotal + itemDiscount) / item.quantity

    let unitPriceDecimals = exactUnitPrice < 0.1 ? 10 : (item.quantity > 100 ? 6 : 4)
    let unitPriceForXML = parseFloat(exactUnitPrice.toFixed(unitPriceDecimals))

    // Validar que el cálculo cuadra con la fórmula SUNAT (tolerancia de 0.01 para redondeo)
    const calculatedLineTotal = Math.round((item.quantity * unitPriceForXML - itemDiscount) * 100) / 100
    if (Math.abs(calculatedLineTotal - roundedLineTotal) > 0.01) {
      unitPriceDecimals = 10
      unitPriceForXML = parseFloat(exactUnitPrice.toFixed(10))
    }

    const price = creditNoteLine.ele('cac:Price')
    price.ele('cbc:PriceAmount', { 'currencyID': creditNoteData.currency || 'PEN' })
      .txt(unitPriceForXML.toString())
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
  const dnLineIgvRates = []
  const dnLineTaxAffectations = []

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

    const itemIgvRate = isGravado ? igvRate : 0
    const itemIgvMultiplier = itemIgvRate / 100
    dnLineIgvRates.push(itemIgvRate)
    dnLineTaxAffectations.push(taxAffectation)

    const priceWithIGV = item.unitPrice
    const priceWithoutIGV = isGravado ? priceWithIGV / (1 + itemIgvMultiplier) : priceWithIGV
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
  const createTaxSubtotalDN = (taxableAmt, taxAmt, percent, categoryId, schemeId, schemeName, taxTypeCode) => {
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

    category.ele('cbc:Percent').txt(percent)

    const scheme = category.ele('cac:TaxScheme')
    scheme.ele('cbc:ID', {
      'schemeID': 'UN/ECE 5153',
      'schemeAgencyID': '6'
    }).txt(schemeId)
    scheme.ele('cbc:Name').txt(schemeName)
    scheme.ele('cbc:TaxTypeCode').txt(taxTypeCode)
  }

  // Determinar tasa de gravado para Percent
  const dnGravadoPercent = (() => {
    const rates = dnLineIgvRates.filter((r, i) => dnLineTaxAffectations[i] === '10')
    return rates.length > 0 ? rates[0].toFixed(2) : igvRate.toFixed(2)
  })()

  // Generar TaxSubtotal para operaciones GRAVADAS (si hay)
  if (dnSumGravadas > 0) {
    createTaxSubtotalDN(dnSumGravadas, dnSumIGVGravadas, dnGravadoPercent, 'S', '1000', 'IGV', 'VAT')
  }

  // Generar TaxSubtotal para operaciones EXONERADAS (si hay)
  if (dnSumExoneradas > 0) {
    createTaxSubtotalDN(dnSumExoneradas, 0, '0.00', 'E', '9997', 'EXO', 'VAT')
  }

  // Generar TaxSubtotal para operaciones INAFECTAS (si hay)
  if (dnSumInafectas > 0) {
    createTaxSubtotalDN(dnSumInafectas, 0, '0.00', 'O', '9998', 'INA', 'FRE')
  }

  // Si no hay ningún tipo (caso edge), generar al menos uno según igvExempt
  if (dnSumGravadas === 0 && dnSumExoneradas === 0 && dnSumInafectas === 0) {
    if (igvExempt) {
      createTaxSubtotalDN(0, 0, '0.00', 'E', '9997', 'EXO', 'VAT')
    } else {
      createTaxSubtotalDN(0, 0, igvRate.toFixed(2), 'S', '1000', 'IGV', 'VAT')
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
    // Per-item IGV rate
    const itemIgvRate = isGravado ? igvRate : 0
    const itemIgvMultiplier = itemIgvRate / 100
    const priceWithoutIGV = isGravado ? priceWithIGV / (1 + itemIgvMultiplier) : priceWithIGV

    // === DESCUENTO POR ÍTEM - declarar antes porque afecta los cálculos ===
    const itemDiscount = item.itemDiscount || item.descuento || 0

    // Total línea SIN IGV (base imponible)
    const lineTotal = item.quantity * priceWithoutIGV
    debitNoteLine.ele('cbc:LineExtensionAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(lineTotal.toFixed(2))

    // Precio unitario CON IGV (PricingReference)
    // IMPORTANTE: Cuando hay descuento por ítem, el PricingReference debe ser el precio BASE (antes del descuento)
    // Fórmula SUNAT: LineExtensionAmount = (Cantidad × PriceAmount) - AllowanceCharge
    const basePriceWithoutIGV = itemDiscount > 0
      ? (lineTotal + itemDiscount) / item.quantity
      : priceWithoutIGV
    const basePriceWithIGV = isGravado
      ? basePriceWithoutIGV * (1 + itemIgvMultiplier)
      : basePriceWithoutIGV

    const pricingReference = debitNoteLine.ele('cac:PricingReference')
    const alternativeCondition = pricingReference.ele('cac:AlternativeConditionPrice')
    alternativeCondition.ele('cbc:PriceAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(basePriceWithIGV.toFixed(2))
    alternativeCondition.ele('cbc:PriceTypeCode', {
      'listName': 'Tipo de Precio',
      'listAgencyName': 'PE:SUNAT',
      'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16'
    }).txt('01')

    // === DESCUENTO POR ÍTEM (AllowanceCharge) según especificación SUNAT UBL 2.1 ===
    if (itemDiscount > 0) {
      const lineAllowanceCharge = debitNoteLine.ele('cac:AllowanceCharge')
      lineAllowanceCharge.ele('cbc:ChargeIndicator').txt('false') // false = descuento
      lineAllowanceCharge.ele('cbc:AllowanceChargeReasonCode').txt('00') // Código 00 = Descuento que afecta la base imponible (Catálogo 53)
      lineAllowanceCharge.ele('cbc:Amount', { 'currencyID': debitNoteData.currency || 'PEN' })
        .txt(parseFloat(itemDiscount).toFixed(2))
    }

    // Impuesto de la línea
    const lineTaxTotal = debitNoteLine.ele('cac:TaxTotal')
    const lineIGV = isGravado ? lineTotal * itemIgvMultiplier : 0
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
      lineTaxCategory.ele('cbc:Percent').txt(itemIgvRate.toFixed(2))
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
    // Usar 'name' como nombre base, o 'description' si 'name' no existe (compatibilidad con datos antiguos)
    const itemName = item.name || item.description || 'Producto'
    // Concatenar observaciones adicionales si existen (IMEI, placa, serie, etc.)
    const itemDescription = item.observations
      ? `${itemName} - ${item.observations}`
      : itemName
    lineItem.ele('cbc:Description').txt(itemDescription)

    const sellersItemId = lineItem.ele('cac:SellersItemIdentification')
    // Usar código del producto, si no existe usar productId, si tampoco existe usar índice
    sellersItemId.ele('cbc:ID').txt(item.code || item.productId || String(index + 1))

    // Precio unitario SIN IGV (valor base para SUNAT)
    // IMPORTANTE: Cuando hay descuento por ítem (AllowanceCharge), la fórmula SUNAT es:
    //   LineExtensionAmount = (Cantidad × PriceAmount) - AllowanceCharge
    // Por lo tanto: PriceAmount = (LineExtensionAmount + AllowanceCharge) / Cantidad
    // SUNAT acepta hasta 10 decimales en el precio unitario
    const roundedLineTotal = parseFloat(lineTotal.toFixed(2))
    const exactUnitPrice = (roundedLineTotal + itemDiscount) / item.quantity

    let unitPriceDecimals = exactUnitPrice < 0.1 ? 10 : (item.quantity > 100 ? 6 : 4)
    let unitPriceForXML = parseFloat(exactUnitPrice.toFixed(unitPriceDecimals))

    // Validar que el cálculo cuadra con la fórmula SUNAT (tolerancia de 0.01 para redondeo)
    const calculatedLineTotal = Math.round((item.quantity * unitPriceForXML - itemDiscount) * 100) / 100
    if (Math.abs(calculatedLineTotal - roundedLineTotal) > 0.01) {
      unitPriceDecimals = 10
      unitPriceForXML = parseFloat(exactUnitPrice.toFixed(10))
    }

    const price = debitNoteLine.ele('cac:Price')
    price.ele('cbc:PriceAmount', { 'currencyID': debitNoteData.currency || 'PEN' })
      .txt(unitPriceForXML.toString())
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

  // IMPORTANTE: Si la fecha de traslado es anterior a la fecha de emisión,
  // usar la fecha de traslado como fecha de emisión para evitar error SUNAT 2329
  // "La fecha de emision se encuentra fuera del limite permitido"
  if (transferDate < issueDate) {
    console.log(`⚠️ [GRE-R] Fecha de traslado (${transferDate}) es anterior a fecha de emisión (${issueDate})`)
    console.log(`📅 [GRE-R] Ajustando fecha de emisión a: ${transferDate}`)
    issueDate = transferDate
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

    // RUC del emisor del documento relacionado (obligatorio según SUNAT - error 3380)
    const issuerParty = additionalDoc.ele('cac:IssuerParty')
    const issuerPartyId = issuerParty.ele('cac:PartyIdentification')
    issuerPartyId.ele('cbc:ID', {
      'schemeID': '6',
      'schemeName': 'Documento de Identidad',
      'schemeAgencyName': 'PE:SUNAT',
      'schemeURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06'
    }).txt(guideData.referencedInvoice.ruc || businessData.ruc)
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
  shipment.ele('cbc:ID').txt('SUNAT_Envio')

  // Motivo de traslado (Catálogo 20)
  shipment.ele('cbc:HandlingCode', {
    'listAgencyName': 'PE:SUNAT',
    'listName': 'Motivo de traslado',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20'
  }).txt(guideData.transferReason || '01')

  // Campo cbc:HandlingInstructions - Descripción del motivo de traslado
  // Obligatorio cuando el motivo es "13" (Otros), opcional para los demás
  // Error 3457: Si falta la descripción del motivo de traslado
  if (guideData.transferReason === '13') {
    // Para motivo "Otros", usar descripción personalizada o valor por defecto
    const otherReasonDescription = guideData.transferReasonDescription || 'OTROS MOTIVOS DE TRASLADO'
    shipment.ele('cbc:HandlingInstructions').txt(otherReasonDescription)
  }

  // Campo cbc:Information - Sustento de diferencia de peso bruto
  // SOLO para motivos 08 (Importación), 09 (Exportación), 19 (Traslado mercancía extranjera)
  // Error 3418: Si el motivo NO es 08, 09 o 19, NO debe consignar este campo
  if (['08', '09', '19'].includes(guideData.transferReason)) {
    const transferReasonNames = {
      '08': 'IMPORTACION',
      '09': 'EXPORTACION',
      '19': 'TRASLADO A ZONA PRIMARIA'
    }
    shipment.ele('cbc:Information').txt(transferReasonNames[guideData.transferReason])
  }

  // Peso bruto total
  shipment.ele('cbc:GrossWeightMeasure', {
    'unitCode': 'KGM'
  }).txt((guideData.totalWeight || 0).toFixed(2))

  // === INDICADOR DE VEHÍCULO M1/L ===
  // Si el traslado se realiza en vehículos de categoría M1 o L, agregar el indicador
  // Esto hace que la placa y datos del conductor sean OPCIONALES
  // Tag: /DespatchAdvice/cac:Shipment/cbc:SpecialInstructions
  // Valor: SUNAT_Envio_IndicadorTrasladoVehiculoM1L
  if (guideData.isM1LVehicle === true) {
    shipment.ele('cbc:SpecialInstructions').txt('SUNAT_Envio_IndicadorTrasladoVehiculoM1L')
    console.log(`🏍️ [GRE XML] Indicador M1/L agregado: vehículo categoría M1 o L`)
  }

  // === DATOS DE TRANSPORTE (ShipmentStage debe ir ANTES de Delivery según UBL 2.1) ===
  const shipmentStage = shipment.ele('cac:ShipmentStage')
  // Nota: No incluir cbc:ID en ShipmentStage según ejemplos EFACT

  // Modalidad de transporte (01=Público, 02=Privado)
  shipmentStage.ele('cbc:TransportModeCode', {
    'listName': 'Modalidad de traslado',
    'listAgencyName': 'PE:SUNAT',
    'listURI': 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18'
  }).txt(guideData.transportMode || '02')

  // === TRANSPORTE PRIVADO ===
  if (guideData.transportMode === '02') {
    const transitPeriod = shipmentStage.ele('cac:TransitPeriod')
    transitPeriod.ele('cbc:StartDate').txt(transferDate)

    // Verificar si es vehículo M1/L (moto, taxi, auto particular hasta 8 asientos)
    // Para vehículos M1/L, los datos de conductor y placa son OPCIONALES según SUNAT
    const isM1LVehicle = guideData.isM1LVehicle === true
    const hasVehiclePlate = guideData.transport?.vehicle?.plate?.trim()
    const hasDriverData = guideData.transport?.driver?.documentNumber?.trim()

    console.log(`🚗 [GRE XML] Transporte privado - M1/L: ${isM1LVehicle}, Placa: ${hasVehiclePlate || 'NO'}, Conductor: ${hasDriverData || 'NO'}`)

    // Datos del vehículo (TransportMeans debe ir ANTES de DriverPerson según UBL 2.1)
    // Solo incluir si hay placa O si NO es vehículo M1/L (obligatorio)
    if (hasVehiclePlate) {
      const transportMeans = shipmentStage.ele('cac:TransportMeans')
      const roadTransport = transportMeans.ele('cac:RoadTransport')
      // Normalizar placa: quitar guiones, espacios y convertir a mayúsculas (SUNAT no acepta guiones)
      const normalizedPlate = hasVehiclePlate.replace(/[-\s]/g, '').toUpperCase()
      roadTransport.ele('cbc:LicensePlateID').txt(normalizedPlate)
      console.log(`📋 [GRE XML] Placa incluida: ${normalizedPlate}`)
    } else if (!isM1LVehicle) {
      // Si NO es M1/L y NO hay placa, es un error - pero dejamos que SUNAT lo valide
      console.log(`⚠️ [GRE XML] ADVERTENCIA: Transporte privado sin placa y NO es vehículo M1/L`)
    }

    // Datos del conductor (DriverPerson debe ir DESPUÉS de TransportMeans)
    // Solo incluir si hay datos del conductor O si NO es vehículo M1/L (obligatorio)
    if (hasDriverData && guideData.transport?.driver) {
      const driverPerson = shipmentStage.ele('cac:DriverPerson')
      // Solo schemeID según ejemplos EFACT
      driverPerson.ele('cbc:ID', {
        'schemeID': guideData.transport.driver.documentType || '1'
      }).txt(guideData.transport.driver.documentNumber)

      driverPerson.ele('cbc:FirstName').txt(guideData.transport.driver.name || '')
      driverPerson.ele('cbc:FamilyName').txt(guideData.transport.driver.lastName || '')
      driverPerson.ele('cbc:JobTitle').txt('Principal')

      // Licencia de conducir
      if (guideData.transport.driver.license) {
        const driverLicense = driverPerson.ele('cac:IdentityDocumentReference')
        driverLicense.ele('cbc:ID').txt(guideData.transport.driver.license)
      }
      console.log(`👤 [GRE XML] Conductor incluido: ${guideData.transport.driver.name} ${guideData.transport.driver.lastName}`)
    } else if (!isM1LVehicle) {
      // Si NO es M1/L y NO hay conductor, es un error - pero dejamos que SUNAT lo valide
      console.log(`⚠️ [GRE XML] ADVERTENCIA: Transporte privado sin conductor y NO es vehículo M1/L`)
    }
  }

  // === TRANSPORTE PÚBLICO ===
  if (guideData.transportMode === '01' && guideData.transport?.carrier) {
    // Período de tránsito (también para transporte público)
    const transitPeriod = shipmentStage.ele('cac:TransitPeriod')
    transitPeriod.ele('cbc:StartDate').txt(transferDate)

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

  // === DELIVERY: Punto de llegada y punto de partida (después de ShipmentStage según UBL 2.1) ===
  const delivery = shipment.ele('cac:Delivery')

  // Punto de LLEGADA (destino) - DeliveryAddress
  const deliveryAddress = delivery.ele('cac:DeliveryAddress')
  deliveryAddress.ele('cbc:ID', {
    'schemeAgencyName': 'PE:INEI',
    'schemeName': 'Ubigeos'
  }).txt(guideData.destination?.ubigeo || '150101')
  // Usar AddressLine/Line en lugar de StreetName según ejemplos EFACT
  const deliveryAddressLine = deliveryAddress.ele('cac:AddressLine')
  deliveryAddressLine.ele('cbc:Line').txt(guideData.destination?.address || '')

  // Punto de PARTIDA (origen) - Despatch/DespatchAddress
  const despatch = delivery.ele('cac:Despatch')
  const despatchAddress = despatch.ele('cac:DespatchAddress')
  despatchAddress.ele('cbc:ID', {
    'schemeAgencyName': 'PE:INEI',
    'schemeName': 'Ubigeos'
  }).txt(guideData.origin?.ubigeo || '150101')
  // Usar AddressLine/Line en lugar de StreetName según ejemplos EFACT
  const despatchAddressLine = despatchAddress.ele('cac:AddressLine')
  despatchAddressLine.ele('cbc:Line').txt(guideData.origin?.address || '')

  // === VEHÍCULO PRINCIPAL - TransportHandlingUnit (OBLIGATORIO para transporte privado) ===
  // Según ejemplos EFACT, TransportHandlingUnit SIEMPRE debe existir para transporte privado
  // Estructura correcta:
  //   <cac:TransportHandlingUnit>
  //     <cac:TransportEquipment>
  //       <cbc:ID>PLACA</cbc:ID>
  //     </cac:TransportEquipment>
  //   </cac:TransportHandlingUnit>
  if (guideData.transportMode === '02' && guideData.transport?.vehicle?.plate) {
    const transportHandlingUnit = shipment.ele('cac:TransportHandlingUnit')
    // Vehículo principal dentro de TransportEquipment
    // Normalizar placa: quitar guiones, espacios y convertir a mayúsculas (SUNAT no acepta guiones)
    const normalizedMainPlate = (guideData.transport.vehicle.plate || '').replace(/[-\s]/g, '').toUpperCase()
    const transportEquipment = transportHandlingUnit.ele('cac:TransportEquipment')
    transportEquipment.ele('cbc:ID').txt(normalizedMainPlate)

    // Vehículos secundarios (si existen)
    if (guideData.transport.additionalVehicles?.length > 0) {
      guideData.transport.additionalVehicles.forEach(vehicle => {
        const normalizedAdditionalPlate = (vehicle.plate || '').replace(/[-\s]/g, '').toUpperCase()
        const additionalEquipment = transportHandlingUnit.ele('cac:TransportEquipment')
        additionalEquipment.ele('cbc:ID').txt(normalizedAdditionalPlate)
      })
    }
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

  // Customization ID
  root.ele('cbc:CustomizationID').txt('2.0')

  // ID de la guía (Serie-Correlativo)
  root.ele('cbc:ID').txt(guideData.number || `${guideData.series}-${String(guideData.correlative).padStart(8, '0')}`)

  // Fecha de emisión (ya calculada en hora de Perú)
  root.ele('cbc:IssueDate').txt(issueDate)

  // Hora de emisión (ya calculada en hora de Perú)
  root.ele('cbc:IssueTime').txt(issueTime)

  // Tipo de documento: 31 = Guía de Remisión TRANSPORTISTA
  root.ele('cbc:DespatchAdviceTypeCode').txt('31')

  // Cantidad de líneas
  const itemCount = (guideData.items && guideData.items.length > 0) ? guideData.items.length : 1
  root.ele('cbc:LineCountNumeric').txt(String(itemCount))

  // Referencia a GRE Remitente(s) relacionada(s)
  if (guideData.relatedGuides && guideData.relatedGuides.length > 0) {
    guideData.relatedGuides.forEach(related => {
      if (related.number) {
        const additionalDoc = root.ele('cac:AdditionalDocumentReference')
        additionalDoc.ele('cbc:ID').txt(related.number.trim())
        additionalDoc.ele('cbc:DocumentTypeCode').txt('09') // 09 = GRE Remitente
        additionalDoc.ele('cbc:DocumentType').txt('Guía de Remisión Remitente')

        // Datos del emisor de la GRE Remitente
        if (related.ruc) {
          const issuerParty = additionalDoc.ele('cac:IssuerParty')
          const issuerPartyId = issuerParty.ele('cac:PartyIdentification')
          issuerPartyId.ele('cbc:ID', {
            'schemeID': '6'
          }).txt(related.ruc.trim())
        }
      }
    })
  }

  // === FIRMA (Referencia) ===
  const signature = root.ele('cac:Signature')
  signature.ele('cbc:ID').txt('IDSignature')
  const signatoryParty = signature.ele('cac:SignatoryParty')
  const sigPartyId = signatoryParty.ele('cac:PartyIdentification')
  sigPartyId.ele('cbc:ID').txt(businessData.ruc)
  const sigPartyName = signatoryParty.ele('cac:PartyName')
  sigPartyName.ele('cbc:Name').txt(businessData.businessName)
  const digitalSigAttachment = signature.ele('cac:DigitalSignatureAttachment')
  const externalRef = digitalSigAttachment.ele('cac:ExternalReference')
  externalRef.ele('cbc:URI').txt('IDSignature')

  // === TRANSPORTISTA (Emisor de la guía - CarrierParty) ===
  // En GRE Transportista, el emisor es el transportista
  const despatchSupplierParty = root.ele('cac:DespatchSupplierParty')
  const supplierParty = despatchSupplierParty.ele('cac:Party')

  // Identificación del transportista (RUC)
  const supplierPartyId = supplierParty.ele('cac:PartyIdentification')
  supplierPartyId.ele('cbc:ID', {
    'schemeID': '6'
  }).txt(businessData.ruc)

  // Dirección fiscal del transportista
  const supplierPostalAddress = supplierParty.ele('cac:PostalAddress')
  supplierPostalAddress.ele('cbc:ID').txt(businessData.ubigeo || '150101')
  supplierPostalAddress.ele('cbc:StreetName').txt(businessData.address || '')
  supplierPostalAddress.ele('cbc:CityName').txt(businessData.province || businessData.city || 'LIMA')
  supplierPostalAddress.ele('cbc:CountrySubentity').txt(businessData.department || 'LIMA')
  supplierPostalAddress.ele('cbc:District').txt(businessData.district || '')
  const supplierCountry = supplierPostalAddress.ele('cac:Country')
  supplierCountry.ele('cbc:IdentificationCode').txt('PE')

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

  // Email del transportista
  if (businessData.email) {
    const supplierContact = supplierParty.ele('cac:Contact')
    supplierContact.ele('cbc:ElectronicMail').txt(businessData.email)
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
    'schemeID': recipientDocType
  }).txt(recipientData.documentNumber || '00000000')

  // Dirección del destinatario (si está disponible)
  if (recipientData.ubigeo || recipientData.address) {
    const customerPostalAddress = customerParty.ele('cac:PostalAddress')
    customerPostalAddress.ele('cbc:ID').txt(recipientData.ubigeo || '150101')
    customerPostalAddress.ele('cbc:StreetName').txt(recipientData.address || '')
    if (recipientData.city) customerPostalAddress.ele('cbc:CityName').txt(recipientData.city)
    if (recipientData.department) customerPostalAddress.ele('cbc:CountrySubentity').txt(recipientData.department)
    if (recipientData.district) customerPostalAddress.ele('cbc:District').txt(recipientData.district)
    const customerCountry = customerPostalAddress.ele('cac:Country')
    customerCountry.ele('cbc:IdentificationCode').txt('PE')
  }

  const customerLegalEntity = customerParty.ele('cac:PartyLegalEntity')
  customerLegalEntity.ele('cbc:RegistrationName').txt(recipientData.name || 'DESTINATARIO')

  // Email del destinatario
  if (recipientData.email) {
    const customerContact = customerParty.ele('cac:Contact')
    customerContact.ele('cbc:ElectronicMail').txt(recipientData.email)
  }

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
  shipment.ele('cbc:ID').txt('SUNAT_Envio')

  // Peso bruto total
  shipment.ele('cbc:GrossWeightMeasure', {
    'unitCode': 'KGM'
  }).txt((guideData.totalWeight || 0).toFixed(2))

  // === INDICADOR DE PAGADOR DE FLETE (DEBE ir antes de ShipmentStage según UBL 2.1) ===
  // Warning 4388: "Debe consignar el Indicador de pagador de flete"
  // Formato: SUNAT_Envio_IndicadorPagadorFlete_[Pagador]
  const freightPayerRaw = guideData.freightPayer || guideData.pagadorFlete || 'remitente'
  // Valores válidos según SUNAT/EFACT:
  // - _Remitente: el remitente paga el flete
  // - _Subcontratador: transporte subcontratado (requiere IndicadorTrasporteSubcontratado + LogisticsOperatorParty)
  // - _Tercero: un tercero paga (requiere datos del pagador)
  // "Destinatario" se mapea a "Remitente" para evitar observaciones 4401/4402/4370
  const freightPayerMap = {
    'remitente': 'SUNAT_Envio_IndicadorPagadorFlete_Remitente',
    '1': 'SUNAT_Envio_IndicadorPagadorFlete_Remitente',
    'destinatario': 'SUNAT_Envio_IndicadorPagadorFlete_Remitente',
    '2': 'SUNAT_Envio_IndicadorPagadorFlete_Remitente',
    'subcontratante': 'SUNAT_Envio_IndicadorPagadorFlete_Subcontratador',
    'subcontratador': 'SUNAT_Envio_IndicadorPagadorFlete_Subcontratador',
    'tercero': 'SUNAT_Envio_IndicadorPagadorFlete_Tercero',
    '3': 'SUNAT_Envio_IndicadorPagadorFlete_Tercero',
  }
  const freightPayerIndicator = freightPayerMap[freightPayerRaw] || 'SUNAT_Envio_IndicadorPagadorFlete_Remitente'
  const isSubcontracted = freightPayerIndicator === 'SUNAT_Envio_IndicadorPagadorFlete_Subcontratador'

  // Si es subcontratado, agregar IndicadorTrasporteSubcontratado ANTES del indicador de pagador (como EFACT)
  if (isSubcontracted) {
    shipment.ele('cbc:SpecialInstructions').txt('SUNAT_Envio_IndicadorTrasporteSubcontratado')
  }
  shipment.ele('cbc:SpecialInstructions').txt(freightPayerIndicator)

  // === CONSIGNMENT / OPERADOR LOGÍSTICO (solo para transporte subcontratado) ===
  // Según EFACT: cac:Consignment > cac:LogisticsOperatorParty con RUC y razón social del subcontratista
  if (isSubcontracted) {
    const logisticsOperator = guideData.logisticsOperator || guideData.subcontractor || {}
    if (logisticsOperator.ruc || logisticsOperator.documentNumber) {
      const consignment = shipment.ele('cac:Consignment')
      consignment.ele('cbc:ID').txt('SUNAT_Envio')
      const logisticsParty = consignment.ele('cac:LogisticsOperatorParty')
      const logisticsPartyId = logisticsParty.ele('cac:PartyIdentification')
      logisticsPartyId.ele('cbc:ID', {
        'schemeID': logisticsOperator.documentType || '6'
      }).txt(logisticsOperator.ruc || logisticsOperator.documentNumber)
      const logisticsLegalEntity = logisticsParty.ele('cac:PartyLegalEntity')
      logisticsLegalEntity.ele('cbc:RegistrationName').txt(logisticsOperator.businessName || logisticsOperator.name || '')
    }
  }

  // === DATOS DE TRANSPORTE (ShipmentStage) ===
  const shipmentStage = shipment.ele('cac:ShipmentStage')

  // Fecha de inicio del traslado
  const transitPeriod = shipmentStage.ele('cac:TransitPeriod')
  transitPeriod.ele('cbc:StartDate').txt(transferDate)

  // Número de Registro MTC del transportista (ROW 37-40, OBS 4391 si falta)
  // XPath: /DespatchAdvice/cac:Shipment/cac:ShipmentStage/cac:CarrierParty/cac:PartyLegalEntity/cbc:CompanyID
  const mtcRegistration = guideData.mtcRegistration || ''
  if (mtcRegistration) {
    const carrierParty = shipmentStage.ele('cac:CarrierParty')
    const carrierLegalEntity = carrierParty.ele('cac:PartyLegalEntity')
    carrierLegalEntity.ele('cbc:CompanyID').txt(mtcRegistration)
  }

  // === CONDUCTOR (obligatorio en GRE Transportista) ===
  const driverData = guideData.driver || guideData.transport?.driver || {}
  console.log('🚗 [GRE-T XML] Datos del conductor:', JSON.stringify(driverData))

  const driverPerson = shipmentStage.ele('cac:DriverPerson')
  driverPerson.ele('cbc:ID', {
    'schemeID': driverData.documentType || '1'
  }).txt(driverData.documentNumber || '00000000')

  driverPerson.ele('cbc:FirstName').txt(driverData.name || driverData.firstName || 'CONDUCTOR')
  driverPerson.ele('cbc:FamilyName').txt(driverData.lastName || driverData.familyName || 'NO ESPECIFICADO')
  driverPerson.ele('cbc:JobTitle').txt('Principal')

  // Licencia de conducir (obligatoria)
  const driverLicense = driverPerson.ele('cac:IdentityDocumentReference')
  driverLicense.ele('cbc:ID').txt(driverData.license || driverData.licenseNumber || 'Q00000000')

  // === CONDUCTOR SECUNDARIO (opcional) ===
  const secondaryDriver = guideData.secondaryDriver || guideData.driver2 || null
  if (secondaryDriver && secondaryDriver.documentNumber) {
    const driverPerson2 = shipmentStage.ele('cac:DriverPerson')
    driverPerson2.ele('cbc:ID', {
      'schemeID': secondaryDriver.documentType || '1'
    }).txt(secondaryDriver.documentNumber)
    driverPerson2.ele('cbc:FirstName').txt(secondaryDriver.name || secondaryDriver.firstName || '')
    driverPerson2.ele('cbc:FamilyName').txt(secondaryDriver.lastName || secondaryDriver.familyName || '')
    driverPerson2.ele('cbc:JobTitle').txt('Secundario')
    const driverLicense2 = driverPerson2.ele('cac:IdentityDocumentReference')
    driverLicense2.ele('cbc:ID').txt(secondaryDriver.license || secondaryDriver.licenseNumber || '')
  }

  // === PUNTO DE LLEGADA (Destino) ===
  const delivery = shipment.ele('cac:Delivery')
  const deliveryAddress = delivery.ele('cac:DeliveryAddress')
  deliveryAddress.ele('cbc:ID').txt(guideData.destination?.ubigeo || '150101')
  if (guideData.destination?.city) deliveryAddress.ele('cbc:CityName').txt(guideData.destination.city)
  if (guideData.destination?.department) deliveryAddress.ele('cbc:CountrySubentity').txt(guideData.destination.department)
  if (guideData.destination?.district) deliveryAddress.ele('cbc:District').txt(guideData.destination.district)
  const deliveryAddressLine = deliveryAddress.ele('cac:AddressLine')
  deliveryAddressLine.ele('cbc:Line').txt(guideData.destination?.address || '')

  // === PUNTO DE PARTIDA (dentro de cac:Delivery/cac:Despatch/cac:DespatchAddress) ===
  const despatch = delivery.ele('cac:Despatch')

  // Dirección de despacho (punto de partida/origen)
  const despatchAddress = despatch.ele('cac:DespatchAddress')
  despatchAddress.ele('cbc:ID').txt(guideData.origin?.ubigeo || '150101')
  if (guideData.origin?.city) despatchAddress.ele('cbc:CityName').txt(guideData.origin.city)
  if (guideData.origin?.department) despatchAddress.ele('cbc:CountrySubentity').txt(guideData.origin.department)
  if (guideData.origin?.district) despatchAddress.ele('cbc:District').txt(guideData.origin.district)
  const despatchAddressLine = despatchAddress.ele('cac:AddressLine')
  despatchAddressLine.ele('cbc:Line').txt(guideData.origin?.address || '')

  // === REMITENTE (dentro de cac:Delivery/cac:Despatch/cac:DespatchParty) ===
  // Según validaciones SUNAT: /DespatchAdvice/cac:Shipment/cac:Delivery/cac:Despatch/cac:DespatchParty
  // Error 3383: "Debe consignar el Numero de documento de identidad del Remitente"
  // Error 3387: "Debe consignar el Nombre o razon social del Remitente"
  const despatchParty = despatch.ele('cac:DespatchParty')

  const despatchPartyId = despatchParty.ele('cac:PartyIdentification')
  despatchPartyId.ele('cbc:ID', {
    'schemeID': shipperDocType
  }).txt(shipperRuc || '00000000000')

  // Dirección del remitente (si está disponible)
  if (shipperData.ubigeo || shipperData.address) {
    const shipperPostalAddress = despatchParty.ele('cac:PostalAddress')
    shipperPostalAddress.ele('cbc:ID').txt(shipperData.ubigeo || '150101')
    shipperPostalAddress.ele('cbc:StreetName').txt(shipperData.address || '')
    if (shipperData.city) shipperPostalAddress.ele('cbc:CityName').txt(shipperData.city)
    if (shipperData.department) shipperPostalAddress.ele('cbc:CountrySubentity').txt(shipperData.department)
    if (shipperData.district) shipperPostalAddress.ele('cbc:District').txt(shipperData.district)
    const shipperCountry = shipperPostalAddress.ele('cac:Country')
    shipperCountry.ele('cbc:IdentificationCode').txt('PE')
  }

  const despatchLegalEntity = despatchParty.ele('cac:PartyLegalEntity')
  despatchLegalEntity.ele('cbc:RegistrationName').txt(shipperBusinessName || 'REMITENTE NO ESPECIFICADO')

  // Email del remitente o del transportista como contacto
  const shipperEmail = shipperData.email || businessData.email || ''
  if (shipperEmail) {
    const shipperContact = despatchParty.ele('cac:Contact')
    shipperContact.ele('cbc:ElectronicMail').txt(shipperEmail)
  }

  // === VEHÍCULO - TransportHandlingUnit (DEBE ir DESPUÉS de Delivery según UBL 2.1) ===
  // XPath: /DespatchAdvice/cac:Shipment/cac:TransportHandlingUnit/cac:TransportEquipment/cbc:ID
  const vehicleData = guideData.vehicle || guideData.transport?.vehicle || {}
  const rawVehiclePlate = vehicleData.plate || vehicleData.licensePlate || ''
  // Normalizar placa: quitar guiones, espacios y convertir a mayúsculas (SUNAT no acepta guiones)
  const vehiclePlate = rawVehiclePlate.replace(/[-\s]/g, '').toUpperCase()
  console.log('🚛 [GRE-T XML] Datos del vehículo:', JSON.stringify(vehicleData))
  console.log('🚛 [GRE-T XML] Placa del vehículo (original):', rawVehiclePlate)
  console.log('🚛 [GRE-T XML] Placa del vehículo (normalizada):', vehiclePlate)

  const transportHandlingUnit = shipment.ele('cac:TransportHandlingUnit')
  const transportEquipment = transportHandlingUnit.ele('cac:TransportEquipment')
  transportEquipment.ele('cbc:ID').txt(vehiclePlate || 'AAA000')

  // TUCE del vehículo principal en ApplicableTransportMeans (ROW 185-187)
  // SUNAT busca el TUCE aquí (OBS 4399 si falta)
  const vehicleCertificate = vehicleData.certificate || vehicleData.tuce || vehicleData.tuc || vehicleData.habilitacionVehicular || ''
  if (vehicleCertificate) {
    const applicableTransportMeans = transportEquipment.ele('cac:ApplicableTransportMeans')
    applicableTransportMeans.ele('cbc:RegistrationNationalityID').txt(vehicleCertificate)
  }

  // === VEHÍCULOS SECUNDARIOS (AttachedTransportEquipment) - Hasta 2 según SUNAT ===
  // Según UBL 2.1, AttachedTransportEquipment es hijo de TransportEquipment
  // y DEBE ir ANTES de ShipmentDocumentReference en el orden del esquema XSD
  const secondaryVehicles = (guideData.vehicles || []).filter((v, idx) => idx > 0 && v.plate?.trim())
  secondaryVehicles.slice(0, 2).forEach(secVehicle => {
    const secPlate = (secVehicle.plate || '').replace(/[-\s]/g, '').toUpperCase()
    const attachedEquipment = transportEquipment.ele('cac:AttachedTransportEquipment')
    attachedEquipment.ele('cbc:ID').txt(secPlate)

    // TUCE del vehículo secundario (ROW 199-201: ApplicableTransportMeans/RegistrationNationalityID)
    const secCertificate = secVehicle.certificate || secVehicle.tuce || secVehicle.tuc || secVehicle.mtcAuthorization || ''
    if (secCertificate) {
      const secMeans = attachedEquipment.ele('cac:ApplicableTransportMeans')
      secMeans.ele('cbc:RegistrationNationalityID').txt(secCertificate)
    }
  })

  // Autorización del vehículo principal emitida por entidad (ROW 188-194)
  // ShipmentDocumentReference DEBE ir DESPUÉS de AttachedTransportEquipment en UBL 2.1
  // schemeID usa Catálogo D-37: "06" = MTC, "01" = SUCAMEC, etc. (OBS 4407 si valor incorrecto)
  if (vehicleCertificate) {
    const rawEntity = vehicleData.mtcEntity || vehicleData.codEmisor || 'MTC'
    // Mapear abreviatura a código del Catálogo D-37 si es necesario
    const entityCodeMap = {
      'SUCAMEC': '01', 'DIGEMID': '02', 'DIGESA': '03', 'SENASA': '04',
      'SERFOR': '05', 'MTC': '06', 'PRODUCE': '07', 'MIN. AMBIENTE': '08',
      'SANIPES': '09', 'MML': '10', 'MINSA': '11', 'GR': '12',
    }
    const vehicleEntity = entityCodeMap[rawEntity.toUpperCase()] || rawEntity
    const shipmentDocRef = transportEquipment.ele('cac:ShipmentDocumentReference')
    shipmentDocRef.ele('cbc:ID', {
      'schemeID': vehicleEntity
    }).txt(vehicleCertificate)
  }

  // === LÍNEAS DE DESPACHO (DespatchLine) ===
  // Para GRE Transportista (tipo 31), el transportista no detalla bienes individuales.
  // Se usa unitCode="ZZ" (unidad genérica) en vez de NIU/unidades específicas (OBS 4434).
  // SUNAT valida que DeliveredQuantity sea > 0 (ERROR 2780 si es 0).
  if (guideData.items && guideData.items.length > 0) {
    guideData.items.forEach((item, index) => {
      const despatchLine = root.ele('cac:DespatchLine')
      despatchLine.ele('cbc:ID').txt(String(index + 1))
      if (item.packageType || item.note) {
        despatchLine.ele('cbc:Note').txt(item.packageType || item.note || '')
      }
      despatchLine.ele('cbc:DeliveredQuantity', {
        'unitCode': 'ZZ'
      }).txt(String(item.quantity || 1))
      const orderLineRef = despatchLine.ele('cac:OrderLineReference')
      orderLineRef.ele('cbc:LineID').txt(String(index + 1))
      const itemEle = despatchLine.ele('cac:Item')
      itemEle.ele('cbc:Description').txt(item.description || 'CARGA')
      if (item.code) {
        const sellersItemId = itemEle.ele('cac:SellersItemIdentification')
        sellersItemId.ele('cbc:ID').txt(item.code)
      }
    })
  } else {
    // Fallback: DespatchLine mínimo cuando no hay items
    const despatchLine = root.ele('cac:DespatchLine')
    despatchLine.ele('cbc:ID').txt('1')
    despatchLine.ele('cbc:DeliveredQuantity', {
      'unitCode': 'ZZ'
    }).txt('1')
    const orderLineRef = despatchLine.ele('cac:OrderLineReference')
    orderLineRef.ele('cbc:LineID').txt('1')
    const itemEle = despatchLine.ele('cac:Item')
    itemEle.ele('cbc:Description').txt('CARGA')
  }

  // Retornar XML como string
  return root.end({ prettyPrint: true })
}
