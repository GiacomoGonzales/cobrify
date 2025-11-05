import { generateInvoiceXML } from '../utils/xmlGenerator.js'
import { signXML } from '../utils/xmlSigner.js'
import { sendToSunat } from '../utils/sunatClient.js'
import { sendToNubefact, parseNubefactResponse } from './nubefactService.js'
import { convertInvoiceToNubefactJSON } from '../utils/invoiceToNubefactJSON.js'
import { sendToQPse } from './qpseService.js'

/**
 * Router de Emisión de Comprobantes Electrónicos
 *
 * Decide si enviar el comprobante vía:
 * - SUNAT DIRECTO (con certificado propio)
 * - NUBEFACT OSE (usando su API JSON)
 * - QPSE (Proveedor de Servicios de Firma)
 *
 * Según la configuración del usuario
 */

/**
 * Envía un comprobante electrónico usando el método configurado
 *
 * @param {Object} invoiceData - Datos de la factura
 * @param {Object} businessData - Datos del negocio
 * @returns {Promise<Object>} Resultado del envío
 */
export async function emitirComprobante(invoiceData, businessData) {
  try {
    console.log('🚀 Iniciando emisión de comprobante...')
    console.log(`📋 Documento: ${invoiceData.documentType} ${invoiceData.series}-${invoiceData.correlativeNumber}`)

    // Determinar qué método usar
    const emissionMethod = determineEmissionMethod(businessData)

    console.log(`📡 Método de emisión seleccionado: ${emissionMethod}`)

    // Ejecutar el método correspondiente
    let result

    if (emissionMethod === 'nubefact') {
      result = await emitViaNubefact(invoiceData, businessData)
    } else if (emissionMethod === 'qpse') {
      result = await emitViaQPse(invoiceData, businessData)
    } else {
      result = await emitViaSunatDirect(invoiceData, businessData)
    }

    return result

  } catch (error) {
    console.error('❌ Error en emisión de comprobante:', error)

    return {
      success: false,
      method: 'error',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Determina qué método de emisión usar según la configuración
 *
 * Orden de prioridad:
 * 1. Si emissionMethod está definido, usar ese
 * 2. Si qpse.enabled = true, usar QPse
 * 3. Si nubefact.enabled = true, usar NubeFact
 * 4. Si sunat.enabled = true, usar SUNAT directo
 * 5. Default: SUNAT directo
 */
function determineEmissionMethod(businessData) {
  // Opción 1: Método explícito configurado
  if (businessData.emissionMethod) {
    return businessData.emissionMethod
  }

  // Opción 2: QPse habilitado
  if (businessData.qpse?.enabled === true) {
    return 'qpse'
  }

  // Opción 3: NubeFact habilitado
  if (businessData.nubefact?.enabled === true) {
    return 'nubefact'
  }

  // Opción 4: SUNAT directo habilitado (o default)
  if (businessData.sunat?.enabled !== false) {
    return 'sunat_direct'
  }

  // Default: SUNAT directo
  return 'sunat_direct'
}

/**
 * Emite comprobante vía SUNAT DIRECTO (flujo existente)
 *
 * Pasos:
 * 1. Generar XML UBL 2.1
 * 2. Firmar con certificado digital
 * 3. Enviar a SUNAT vía SOAP
 * 4. Procesar CDR
 */
async function emitViaSunatDirect(invoiceData, businessData) {
  console.log('📤 Emitiendo vía SUNAT DIRECTO...')

  try {
    // Validar configuración SUNAT
    if (!businessData.sunat || !businessData.sunat.enabled) {
      throw new Error('SUNAT no está habilitado para este negocio')
    }

    if (!businessData.sunat.solUser || !businessData.sunat.solPassword) {
      throw new Error('Credenciales SOL no configuradas')
    }

    if (!businessData.sunat.certificateData || !businessData.sunat.certificatePassword) {
      throw new Error('Certificado digital no configurado')
    }

    // 1. Generar XML
    console.log('🔨 Generando XML UBL 2.1...')
    const xml = generateInvoiceXML(invoiceData, businessData)

    // 2. Firmar XML
    console.log('🔏 Firmando XML con certificado digital...')
    const signedXML = await signXML(
      xml,
      businessData.sunat.certificateData,
      businessData.sunat.certificatePassword
    )

    // 3. Enviar a SUNAT
    console.log('📡 Enviando a SUNAT...')
    const sunatResponse = await sendToSunat(
      signedXML,
      businessData.ruc,
      invoiceData.documentType,
      invoiceData.series,
      invoiceData.correlativeNumber,
      {
        solUser: businessData.sunat.solUser,
        solPassword: businessData.sunat.solPassword,
        environment: businessData.sunat.environment || 'production'
      }
    )

    return {
      success: sunatResponse.accepted,
      method: 'sunat_direct',
      accepted: sunatResponse.accepted,
      responseCode: sunatResponse.responseCode,
      description: sunatResponse.description,
      notes: sunatResponse.notes,
      cdrData: sunatResponse.cdrData,
      xml: signedXML,
      sunatResponse: sunatResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión vía SUNAT directo:', error)

    return {
      success: false,
      method: 'sunat_direct',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite comprobante vía NUBEFACT (API JSON)
 *
 * Pasos:
 * 1. Convertir datos a JSON NubeFact
 * 2. Enviar a NubeFact API
 * 3. Procesar respuesta
 */
async function emitViaNubefact(invoiceData, businessData) {
  console.log('📤 Emitiendo vía NUBEFACT API JSON...')

  try {
    // Validar configuración NubeFact
    if (!businessData.nubefact || !businessData.nubefact.enabled) {
      throw new Error('NubeFact no está habilitado para este negocio')
    }

    if (!businessData.nubefact.ruta || !businessData.nubefact.token) {
      throw new Error('Configuración de NubeFact incompleta (ruta y token requeridos)')
    }

    // 1. Convertir a JSON NubeFact
    console.log('🔄 Convirtiendo datos a formato JSON NubeFact...')
    const nubefactJSON = convertInvoiceToNubefactJSON(invoiceData, businessData)

    console.log('📦 JSON generado:', JSON.stringify(nubefactJSON, null, 2))

    // 2. Enviar a NubeFact
    console.log('📡 Enviando a NubeFact API...')
    const nubefactResult = await sendToNubefact(nubefactJSON, businessData.nubefact)

    if (!nubefactResult.success) {
      throw new Error(nubefactResult.error || 'Error al enviar a NubeFact')
    }

    // 3. Parsear respuesta
    const parsedResponse = parseNubefactResponse(nubefactResult.nubefactResponse)

    return {
      success: parsedResponse.accepted,
      method: 'nubefact',
      accepted: parsedResponse.accepted,
      responseCode: parsedResponse.responseCode,
      description: parsedResponse.description,
      notes: parsedResponse.notes,
      pdfUrl: parsedResponse.pdfUrl,
      xmlUrl: parsedResponse.xmlUrl,
      cdrUrl: parsedResponse.cdrUrl,
      qrCode: parsedResponse.qrCode,
      hash: parsedResponse.hash,
      enlace: parsedResponse.enlace,
      soapError: parsedResponse.soapError,
      nubefactResponse: parsedResponse.rawResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión vía NubeFact:', error)

    return {
      success: false,
      method: 'nubefact',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite comprobante vía QPSE (Proveedor de Servicios de Firma)
 *
 * Pasos:
 * 1. Generar XML UBL 2.1
 * 2. Enviar a QPse para firma y envío a SUNAT
 * 3. Procesar respuesta
 */
async function emitViaQPse(invoiceData, businessData) {
  console.log('📤 Emitiendo vía QPSE...')

  try {
    // Validar configuración QPse
    if (!businessData.qpse || !businessData.qpse.enabled) {
      throw new Error('QPse no está habilitado para este negocio')
    }

    if (!businessData.qpse.usuario || !businessData.qpse.password) {
      throw new Error('Credenciales de QPse no configuradas')
    }

    // 1. Generar XML
    console.log('🔨 Generando XML UBL 2.1...')
    const xml = generateInvoiceXML(invoiceData, businessData)

    // 2. Determinar tipo de documento para QPse
    const tipoDocumento = invoiceData.documentType === 'factura' ? '01' : '03'

    // 3. Enviar a QPse (firma y envía automáticamente)
    console.log('📡 Enviando a QPse...')
    const qpseResponse = await sendToQPse(
      xml,
      businessData.ruc,
      tipoDocumento,
      invoiceData.series,
      invoiceData.correlativeNumber,
      businessData.qpse
    )

    return {
      success: qpseResponse.accepted,
      method: 'qpse',
      accepted: qpseResponse.accepted,
      responseCode: qpseResponse.responseCode,
      description: qpseResponse.description,
      notes: qpseResponse.notes,
      cdrUrl: qpseResponse.cdrUrl,
      xmlUrl: qpseResponse.xmlUrl,
      pdfUrl: qpseResponse.pdfUrl,
      ticket: qpseResponse.ticket,
      qpseResponse: qpseResponse.rawResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión vía QPse:', error)

    return {
      success: false,
      method: 'qpse',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Consulta el estado de un comprobante según el método usado
 */
export async function consultarEstadoComprobante(invoiceData, businessData) {
  const emissionMethod = determineEmissionMethod(businessData)

  // TODO: Implementar consulta para ambos métodos
  console.log(`🔍 Consultando estado vía ${emissionMethod}...`)

  return {
    success: false,
    error: 'Funcionalidad de consulta pendiente de implementación'
  }
}

/**
 * Anula un comprobante según el método usado
 */
export async function anularComprobante(invoiceData, businessData, motivo) {
  const emissionMethod = determineEmissionMethod(businessData)

  // TODO: Implementar anulación para ambos métodos
  console.log(`🗑️ Anulando comprobante vía ${emissionMethod}...`)

  return {
    success: false,
    error: 'Funcionalidad de anulación pendiente de implementación'
  }
}
