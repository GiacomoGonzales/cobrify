/**
 * Servicio para generar XML en formato UBL 2.1 según estándar de SUNAT
 *
 * Especificaciones:
 * - UBL Version 2.1
 * - CustomizationID: 2.0 (Factura/Boleta)
 * - Firma Digital XMLDSig
 */

import dayjs from 'dayjs'

/**
 * Códigos de tipo de documento según SUNAT
 */
export const DOCUMENT_TYPE_CODES = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
}

/**
 * Códigos de tipo de documento de identidad según SUNAT
 */
export const ID_TYPE_CODES = {
  DNI: '1',
  RUC: '6',
  CARNET_EXTRANJERIA: '4',
  PASAPORTE: '7',
  CEDULA_DIPLOMATICA: 'A',
}

/**
 * Códigos de moneda según ISO 4217
 */
export const CURRENCY_CODES = {
  PEN: 'PEN', // Soles
  USD: 'USD', // Dólares
}

/**
 * Códigos de unidad de medida según SUNAT
 */
export const UNIT_CODES = {
  UNIDAD: 'NIU', // Unidad
  KILOGRAMO: 'KGM',
  METRO: 'MTR',
  LITRO: 'LTR',
  SERVICIO: 'ZZ',
}

/**
 * Genera el XML UBL 2.1 para una factura o boleta
 *
 * @param {Object} invoiceData - Datos de la factura/boleta
 * @param {Object} companySettings - Configuración de la empresa
 * @param {Object} taxConfig - Configuración de impuestos (opcional)
 * @returns {string} XML en formato UBL 2.1
 */
export const generateInvoiceXML = (invoiceData, companySettings, taxConfig = null) => {
  const {
    documentType,
    series: seriesField,
    number,
    correlativeNumber,
    customer,
    items,
    subtotal,
    igv,
    total,
    createdAt,
    emissionDate,
  } = invoiceData

  const {
    ruc,
    businessName,
    address,
    department,
    province,
    district,
    urbanization,
    ubigeo
  } = companySettings

  // Configuración de impuestos (IGV)
  // Si no se proporciona taxConfig, usar valores por defecto (IGV 18%)
  const igvRate = taxConfig?.igvRate ?? 18
  const igvExempt = taxConfig?.igvExempt ?? false
  const exemptionReason = taxConfig?.exemptionReason ?? ''
  const exemptionCode = taxConfig?.exemptionCode ?? '10' // 10=Gravado, 20=Exonerado
  const igvMultiplier = igvRate / 100

  // Extraer series del número formateado si no existe el campo series
  // Ejemplo: "F001-00000001" -> series = "F001"
  let series = seriesField
  if (!series && number && number.includes('-')) {
    series = number.split('-')[0]
  }

  // Determinar el tipo de documento UBL
  const documentTypeCode = documentType === 'factura'
    ? DOCUMENT_TYPE_CODES.FACTURA
    : DOCUMENT_TYPE_CODES.BOLETA

  // Fecha de emisión en formato YYYY-MM-DD
  // Priorizar emissionDate si existe (fecha seleccionada por usuario), sino usar createdAt
  let issueDate, issueTime
  if (emissionDate) {
    // Si existe emissionDate (formato 'YYYY-MM-DD'), usarlo directamente
    issueDate = emissionDate
    issueTime = '12:00:00' // Hora fija para fechas personalizadas
  } else {
    // Usar createdAt (Timestamp de Firestore)
    issueDate = dayjs(createdAt.toDate()).format('YYYY-MM-DD')
    issueTime = dayjs(createdAt.toDate()).format('HH:mm:ss')
  }

  // Documento completo (serie-número)
  // Si tenemos correlativeNumber, usarlo; si no, usar el number formateado que ya viene
  const documentNumber = correlativeNumber
    ? `${series}-${String(correlativeNumber).padStart(8, '0')}`
    : number

  // Tipo de documento del cliente (mapeo completo según Catálogo 06 SUNAT)
  const docTypeMap = { 'DNI': '1', 'RUC': '6', 'CE': '4', 'PASSPORT': '7', 'CEDULA_DIPLOMATICA': 'A' }
  const customerDocType = docTypeMap[customer.documentType] || (customer.documentType === 'ruc' ? '6' : '1')

  // Moneda
  const currency = invoiceData.currency || 'PEN'

  // Detracción
  const hasDetraction = invoiceData.hasDetraction && invoiceData.detractionType && invoiceData.detractionAmount > 0

  // Cuenta de detracciones
  let detractionAccount = invoiceData.detractionBankAccount || ''
  if (!detractionAccount && companySettings.bankAccountsList && Array.isArray(companySettings.bankAccountsList)) {
    const detrBankAccount = companySettings.bankAccountsList.find(acc => acc.accountType === 'detracciones')
    if (detrBankAccount) detractionAccount = detrBankAccount.accountNumber
  }

  // Acumuladores por tasa/tipo para TaxTotal del documento
  const taxByRate = {}  // { rate: { taxable, tax } } para gravados
  let docTotalExonerado = 0
  let docTotalInafecto = 0

  // Generar líneas de items
  // IMPORTANTE: Los precios del POS ya incluyen IGV (para productos gravados)
  const invoiceLines = items.map((item, index) => {
    // Soportar tanto 'price' como 'unitPrice' para compatibilidad
    const unitPriceWithIgv = item.unitPrice || item.price || 0

    // Per-item tax affectation and IGV rate
    const itemTaxAffectation = igvExempt ? '20' : (item.taxAffectation || exemptionCode || '10')
    const isGravado = itemTaxAffectation === '10'
    const isExonerado = itemTaxAffectation === '20'
    const isInafecto = itemTaxAffectation === '30'

    // Per-item IGV rate: usar item.igvRate si existe, sino el igvRate global
    const itemIgvRate = isGravado ? (item.igvRate ?? igvRate) : 0
    const itemIgvMultiplier = itemIgvRate / 100

    // Los precios del POS ya incluyen IGV para gravados
    // Para exonerados/inafectos el precio es directamente el valor de venta
    const lineTotal = Number((item.quantity * unitPriceWithIgv).toFixed(2))
    let lineExtensionAmount, lineIgv, basePricePerUnit

    if (isGravado) {
      // Extraer base imponible (sin IGV) del precio con IGV
      lineExtensionAmount = Number((lineTotal / (1 + itemIgvMultiplier)).toFixed(2))
      lineIgv = Number((lineTotal - lineExtensionAmount).toFixed(2))
      basePricePerUnit = Number((lineExtensionAmount / item.quantity).toFixed(2))

      // Acumular por tasa para TaxSubtotals del documento
      if (!taxByRate[itemIgvRate]) taxByRate[itemIgvRate] = { taxable: 0, tax: 0 }
      taxByRate[itemIgvRate].taxable += lineExtensionAmount
      taxByRate[itemIgvRate].tax += lineIgv
    } else {
      // Exonerado/Inafecto: no hay IGV, precio = valor de venta
      lineExtensionAmount = lineTotal
      lineIgv = 0
      basePricePerUnit = unitPriceWithIgv

      if (isExonerado) docTotalExonerado += lineExtensionAmount
      if (isInafecto) docTotalInafecto += lineExtensionAmount
    }

    // Unidad de medida del item (usar la del item si existe, sino NIU por defecto)
    const unitCode = item.unit || item.unitCode || UNIT_CODES.UNIDAD

    // Si está exonerado y hay motivo, incluirlo en el XML
    const exemptionReasonTag = igvExempt && exemptionReason
      ? `<cbc:TaxExemptionReason><![CDATA[${exemptionReason}]]></cbc:TaxExemptionReason>`
      : ''

    // Tax category and scheme based on affectation type
    let taxCategoryId = 'S', taxSchemeId = '1000', taxSchemeName = 'IGV', taxTypeCode = 'VAT'
    if (isExonerado) {
      taxCategoryId = 'E'; taxSchemeId = '9997'; taxSchemeName = 'EXO'
    } else if (isInafecto) {
      taxCategoryId = 'O'; taxSchemeId = '9998'; taxSchemeName = 'INA'; taxTypeCode = 'FRE'
    }

    return `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${unitCode}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="${currency}">${unitPriceWithIgv.toFixed(2)}</cbc:PriceAmount>
          <cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode>
        </cac:AlternativeConditionPrice>
      </cac:PricingReference>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${currency}">${lineIgv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${currency}">${lineExtensionAmount.toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${currency}">${lineIgv.toFixed(2)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">${taxCategoryId}</cbc:ID>
            <cbc:Percent>${itemIgvRate.toFixed(2)}</cbc:Percent>
            <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${itemTaxAffectation}</cbc:TaxExemptionReasonCode>
            ${exemptionReasonTag}
            <cac:TaxScheme>
              <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">${taxSchemeId}</cbc:ID>
              <cbc:Name>${taxSchemeName}</cbc:Name>
              <cbc:TaxTypeCode>${taxTypeCode}</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Description><![CDATA[${item.name}]]></cbc:Description>
        <cac:SellersItemIdentification>
          <cbc:ID>${item.code || `ITEM${index + 1}`}</cbc:ID>
        </cac:SellersItemIdentification>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${currency}">${basePricePerUnit.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`
  }).join('\n')

  // Generar TaxSubtotals del documento (uno por cada tasa de IGV + exonerado/inafecto)
  let taxSubtotalsXml = ''

  // TaxSubtotals de gravados (uno por cada tasa: 18%, 10.5%, etc.)
  const rateKeys = Object.keys(taxByRate).sort((a, b) => Number(b) - Number(a))
  for (const rate of rateKeys) {
    const data = taxByRate[rate]
    taxSubtotalsXml += `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${data.taxable.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${data.tax.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>${Number(rate).toFixed(2)}</cbc:Percent>
        <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">10</cbc:TaxExemptionReasonCode>
        <cac:TaxScheme>
          <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
  }

  // Fallback: si no hay gravados y no es exempt, usar valores del documento
  if (rateKeys.length === 0 && !igvExempt) {
    taxSubtotalsXml = `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${subtotal.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>${igvRate.toFixed(2)}</cbc:Percent>
        <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${exemptionCode}</cbc:TaxExemptionReasonCode>
        <cac:TaxScheme>
          <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
  }

  // TaxSubtotal de exonerados
  if (docTotalExonerado > 0 || igvExempt) {
    const exoAmount = igvExempt ? subtotal : docTotalExonerado
    taxSubtotalsXml += `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${exoAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>0.00</cbc:Percent>
        <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">20</cbc:TaxExemptionReasonCode>${igvExempt && exemptionReason ? `
        <cbc:TaxExemptionReason><![CDATA[${exemptionReason}]]></cbc:TaxExemptionReason>` : ''}
        <cac:TaxScheme>
          <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">9997</cbc:ID>
          <cbc:Name>EXO</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
  }

  // TaxSubtotal de inafectos
  if (docTotalInafecto > 0) {
    taxSubtotalsXml += `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${docTotalInafecto.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>0.00</cbc:Percent>
        <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">30</cbc:TaxExemptionReasonCode>
        <cac:TaxScheme>
          <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">9998</cbc:ID>
          <cbc:Name>INA</cbc:Name>
          <cbc:TaxTypeCode>FRE</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
  }

  // === Leyenda SPOT (detracción) ===
  const spotLegend = hasDetraction
    ? `\n  <cbc:Note languageLocaleID="2006">Operación sujeta al Sistema de Pago de Obligaciones Tributarias con el Gobierno Central</cbc:Note>`
    : ''

  // === PaymentMeans (detracción - cuenta Banco de la Nación) ===
  let paymentMeansXml = ''
  if (hasDetraction && detractionAccount) {
    paymentMeansXml = `
  <cac:PaymentMeans>
    <cbc:ID>Detraccion</cbc:ID>
    <cbc:PaymentMeansCode listAgencyName="PE:SUNAT" listName="Medio de pago" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo59">001</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${detractionAccount}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>`
  }

  // === PaymentTerms (forma de pago) ===
  const paymentType = invoiceData.paymentType || 'contado'
  const paymentDueDate = invoiceData.paymentDueDate || null
  const paymentInstallments = invoiceData.paymentInstallments || []
  const paymentTotalAmount = parseFloat(total) || 0

  // Calcular monto neto (descontando detracción) para crédito/cuotas
  const detractionAmt = hasDetraction ? parseFloat(invoiceData.detractionAmount) : 0
  const netPayableAmount = paymentTotalAmount - detractionAmt

  let paymentTermsXml = ''

  // === PaymentTerms de detracción (DEBE ir ANTES de FormaPago según SUNAT) ===
  if (hasDetraction) {
    paymentTermsXml += `
  <cac:PaymentTerms>
    <cbc:ID>Detraccion</cbc:ID>
    <cbc:PaymentMeansID schemeAgencyName="PE:SUNAT" schemeName="Codigo de detraccion" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo54">${invoiceData.detractionType}</cbc:PaymentMeansID>
    <cbc:Note>${netPayableAmount.toFixed(2)}</cbc:Note>
    <cbc:PaymentPercent>${invoiceData.detractionRate || 0}</cbc:PaymentPercent>
    <cbc:Amount currencyID="${currency}">${detractionAmt.toFixed(2)}</cbc:Amount>
  </cac:PaymentTerms>`
  }

  if (paymentType === 'credito') {
    const creditAmount = hasDetraction ? netPayableAmount : paymentTotalAmount

    paymentTermsXml += `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>
    <cbc:Amount currencyID="${currency}">${creditAmount.toFixed(2)}</cbc:Amount>
  </cac:PaymentTerms>`

    if (paymentInstallments.length > 0) {
      const adjustFactor = hasDetraction && paymentTotalAmount > 0
        ? netPayableAmount / paymentTotalAmount : 1

      paymentInstallments.forEach((cuota, index) => {
        const cuotaAmount = parseFloat(cuota.amount || 0) * adjustFactor
        paymentTermsXml += `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Cuota${String(index + 1).padStart(3, '0')}</cbc:PaymentMeansID>
    <cbc:Amount currencyID="${currency}">${cuotaAmount.toFixed(2)}</cbc:Amount>${cuota.dueDate ? `
    <cbc:PaymentDueDate>${cuota.dueDate}</cbc:PaymentDueDate>` : ''}
  </cac:PaymentTerms>`
      })
    } else if (paymentDueDate) {
      paymentTermsXml += `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>
    <cbc:Amount currencyID="${currency}">${creditAmount.toFixed(2)}</cbc:Amount>
    <cbc:PaymentDueDate>${paymentDueDate}</cbc:PaymentDueDate>
  </cac:PaymentTerms>`
    }
  } else {
    paymentTermsXml += `
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
  </cac:PaymentTerms>`
  }

  // Generar el XML completo
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <!-- Firma digital se insertará aquí -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${documentNumber}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="${hasDetraction ? '1001' : '0101'}" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${documentTypeCode}</cbc:InvoiceTypeCode>${spotLegend}
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha">${currency}</cbc:DocumentCurrencyCode>
  <cac:Signature>
    <cbc:ID>SignatureSP</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${businessName}]]></cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${ID_TYPE_CODES.RUC}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${businessName}]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${businessName}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID schemeName="Ubigeos" schemeAgencyName="PE:INEI">${ubigeo || '150101'}</cbc:ID>
          <cbc:AddressTypeCode listAgencyName="PE:SUNAT" listName="Establecimientos anexos">0000</cbc:AddressTypeCode>${urbanization ? `\n          <cbc:CitySubdivisionName>${urbanization}</cbc:CitySubdivisionName>` : ''}
          <cbc:CityName>${province || 'Lima'}</cbc:CityName>
          <cbc:CountrySubentity>${department || 'Lima'}</cbc:CountrySubentity>
          <cbc:District>${district || 'Lima'}</cbc:District>
          <cac:AddressLine>
            <cbc:Line><![CDATA[${address}]]></cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode listID="ISO 3166-1" listAgencyName="United Nations Economic Commission for Europe" listName="Country">PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${customerDocType}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${customer.documentNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${customer.businessName || customer.name}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>${paymentMeansXml}${paymentTermsXml}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${igv.toFixed(2)}</cbc:TaxAmount>${taxSubtotalsXml}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${invoiceLines}
</Invoice>`

  return xml
}

/**
 * Genera el nombre del archivo XML según el estándar de SUNAT
 * Formato: RUC-TIPO-SERIE-NUMERO.xml
 *
 * @param {string} ruc - RUC del emisor
 * @param {string} documentType - Tipo de documento (factura/boleta)
 * @param {string} series - Serie del documento
 * @param {number} number - Número correlativo
 * @returns {string} Nombre del archivo
 */
export const generateXMLFileName = (ruc, documentType, series, number) => {
  const typeCode = documentType === 'factura'
    ? DOCUMENT_TYPE_CODES.FACTURA
    : DOCUMENT_TYPE_CODES.BOLETA

  const paddedNumber = String(number).padStart(8, '0')

  return `${ruc}-${typeCode}-${series}-${paddedNumber}.xml`
}

/**
 * Valida que los datos de la factura sean correctos antes de generar el XML
 *
 * @param {Object} invoiceData - Datos de la factura
 * @param {Object} companySettings - Configuración de la empresa
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validateInvoiceData = (invoiceData, companySettings) => {
  const errors = []

  // Validar datos de empresa
  if (!companySettings.ruc || companySettings.ruc.length !== 11) {
    errors.push('RUC de la empresa inválido (debe tener 11 dígitos)')
  }

  if (!companySettings.businessName) {
    errors.push('Razón social de la empresa es requerida')
  }

  if (!companySettings.address) {
    errors.push('Dirección de la empresa es requerida')
  }

  if (!companySettings.department) {
    errors.push('Departamento de la empresa es requerido')
  }

  if (!companySettings.province) {
    errors.push('Provincia de la empresa es requerida')
  }

  if (!companySettings.district) {
    errors.push('Distrito de la empresa es requerido')
  }

  // Validar datos de factura
  // Verificar que tenga series o que se pueda extraer del número
  const hasSeries = invoiceData.series || (invoiceData.number && invoiceData.number.includes('-'))
  if (!hasSeries) {
    errors.push('Serie del documento es requerida (no se pudo determinar de los datos)')
  }

  // Validar que tenga número formateado o correlativo
  if (!invoiceData.number && (!invoiceData.correlativeNumber || invoiceData.correlativeNumber < 1)) {
    errors.push('Número del documento inválido')
  }

  // Validar cliente
  if (!invoiceData.customer || !invoiceData.customer.documentNumber) {
    errors.push('Datos del cliente incompletos')
  }

  // Validar items
  if (!invoiceData.items || invoiceData.items.length === 0) {
    errors.push('Debe haber al menos un producto/servicio')
  }

  // Validar totales
  if (invoiceData.total <= 0) {
    errors.push('El total debe ser mayor a 0')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
