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
 * @returns {string} XML en formato UBL 2.1
 */
export const generateInvoiceXML = (invoiceData, companySettings) => {
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
  const issueDate = dayjs(createdAt.toDate()).format('YYYY-MM-DD')
  const issueTime = dayjs(createdAt.toDate()).format('HH:mm:ss')

  // Documento completo (serie-número)
  // Si tenemos correlativeNumber, usarlo; si no, usar el number formateado que ya viene
  const documentNumber = correlativeNumber
    ? `${series}-${String(correlativeNumber).padStart(8, '0')}`
    : number

  // Tipo de documento del cliente
  const customerDocType = customer.documentType === 'ruc'
    ? ID_TYPE_CODES.RUC
    : ID_TYPE_CODES.DNI

  // Generar líneas de items
  const invoiceLines = items.map((item, index) => {
    // Soportar tanto 'price' como 'unitPrice' para compatibilidad
    const unitPrice = item.unitPrice || item.price || 0
    const lineExtensionAmount = item.quantity * unitPrice
    const priceWithTax = unitPrice * 1.18
    const lineIgv = lineExtensionAmount * 0.18

    return `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${UNIT_CODES.UNIDAD}">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${CURRENCY_CODES.PEN}">${lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="${CURRENCY_CODES.PEN}">${priceWithTax.toFixed(2)}</cbc:PriceAmount>
          <cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode>
        </cac:AlternativeConditionPrice>
      </cac:PricingReference>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${CURRENCY_CODES.PEN}">${lineIgv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${CURRENCY_CODES.PEN}">${lineExtensionAmount.toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${CURRENCY_CODES.PEN}">${lineIgv.toFixed(2)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:Percent>18.00</cbc:Percent>
            <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">10</cbc:TaxExemptionReasonCode>
            <cac:TaxScheme>
              <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
              <cbc:Name>IGV</cbc:Name>
              <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
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
        <cbc:PriceAmount currencyID="${CURRENCY_CODES.PEN}">${unitPrice.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`
  }).join('\n')

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
  <cbc:InvoiceTypeCode listID="0101">${documentTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha">${CURRENCY_CODES.PEN}</cbc:DocumentCurrencyCode>
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
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${CURRENCY_CODES.PEN}">${igv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${CURRENCY_CODES.PEN}">${subtotal.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${CURRENCY_CODES.PEN}">${igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${CURRENCY_CODES.PEN}">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${CURRENCY_CODES.PEN}">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${CURRENCY_CODES.PEN}">${total.toFixed(2)}</cbc:PayableAmount>
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
