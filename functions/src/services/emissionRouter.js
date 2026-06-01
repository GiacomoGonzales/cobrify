import { generateInvoiceXML, generateCreditNoteXML, generateDebitNoteXML, generateDispatchGuideXML, generateCarrierDispatchGuideXML } from '../utils/xmlGenerator.js'
import { signXML } from '../utils/xmlSigner.js'
import { sendToSunat } from '../utils/sunatClient.js'
import { sendDispatchGuideToSunat } from '../utils/sunatClientGRE.js'
import { sendDispatchGuideToSunatREST, hasAPICredentials } from '../utils/sunatClientGRE_REST.js'
import { sendToQPse } from './qpseService.js'

/**
 * Router de Emisión de Comprobantes Electrónicos
 *
 * Decide si enviar el comprobante vía:
 * - SUNAT DIRECTO (con certificado propio)
 * - QPSE (Proveedor de Servicios de Firma)
 *
 * Según la configuración del usuario
 */

/**
 * Mapea el tipo de documento interno a código SUNAT (Catálogo 01)
 *
 * @param {string} documentType - Tipo de documento interno (factura, boleta, nota_credito, nota_debito)
 * @returns {string} Código SUNAT (01, 03, 07, 08)
 *
 * Catálogo 01 - Tipos de Documentos:
 * - 01: Factura
 * - 03: Boleta de Venta
 * - 07: Nota de Crédito
 * - 08: Nota de Débito
 */
function getDocumentTypeCode(documentType) {
  const typeMap = {
    'factura': '01',
    'boleta': '03',
    'nota_credito': '07',
    'nota_debito': '08'
  }

  const code = typeMap[documentType]

  if (!code) {
    console.warn(`⚠️ Tipo de documento desconocido: ${documentType}, usando 03 (boleta) por defecto`)
    return '03'
  }

  return code
}

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

    if (emissionMethod === 'qpse') {
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
 * 3. Si sunat.enabled = true, usar SUNAT directo
 * 4. Default: SUNAT directo
 */
function determineEmissionMethod(businessData) {
  console.log('🔍 Determinando método de emisión...')
  console.log('   - emissionMethod:', businessData.emissionMethod)
  console.log('   - qpse:', JSON.stringify(businessData.qpse))
  console.log('   - sunat:', JSON.stringify(businessData.sunat))

  // Opción 1: Método explícito configurado (puede estar en emissionMethod o emissionConfig.method)
  const explicitMethod = businessData.emissionMethod || businessData.emissionConfig?.method
  if (explicitMethod) {
    console.log(`   ✓ Usando método explícito: ${explicitMethod}`)
    return explicitMethod
  }

  // Opción 2: QPse habilitado (aceptar true, "true", 1, "1", o si tiene credenciales configuradas)
  const qpseEnabled = businessData.qpse?.enabled
  const hasQpseCredentials = businessData.qpse?.usuario && businessData.qpse?.password
  if (qpseEnabled === true || qpseEnabled === 'true' || qpseEnabled === 1 || qpseEnabled === '1' || hasQpseCredentials) {
    console.log('   ✓ QPse está habilitado (enabled:', qpseEnabled, ', hasCredentials:', hasQpseCredentials, ')')
    return 'qpse'
  }

  // Opción 3: SUNAT directo habilitado
  const sunatEnabled = businessData.sunat?.enabled
  if (sunatEnabled === true || sunatEnabled === 'true' || sunatEnabled === 1 || sunatEnabled === '1') {
    console.log('   ✓ SUNAT directo está habilitado')
    return 'sunat_direct'
  }

  // Default: SUNAT directo
  console.log('   ⚠ Ningún método habilitado, usando sunat_direct por defecto')
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
    const signedXML = await signXML(xml, {
      certificate: businessData.sunat.certificateData,
      certificatePassword: businessData.sunat.certificatePassword
    })

    // 3. Enviar a SUNAT
    console.log('📡 Enviando a SUNAT...')
    const sunatResponse = await sendToSunat(signedXML, {
      ruc: businessData.ruc,
      documentType: invoiceData.documentType,
      series: invoiceData.series,
      number: invoiceData.correlativeNumber,
      solUser: businessData.sunat.solUser,
      solPassword: businessData.sunat.solPassword,
      environment: businessData.sunat.environment || 'production'
    })

    return {
      success: sunatResponse.accepted,
      method: 'sunat_direct',
      accepted: sunatResponse.accepted,
      responseCode: sunatResponse.code || sunatResponse.responseCode, // sunatClient retorna 'code'
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

    // 2. Determinar tipo de documento para QPse usando el helper
    const tipoDocumento = getDocumentTypeCode(invoiceData.documentType)
    console.log(`📄 Tipo de documento: ${invoiceData.documentType} → Código SUNAT: ${tipoDocumento}`)

    // 3. Enviar a QPse (firma y envía automáticamente)
    console.log('📡 Enviando a QPse...')
    const qpseResponse = await sendToQPse(
      xml,
      businessData.ruc,
      tipoDocumento,
      invoiceData.series,
      invoiceData.correlativeNumber,
      businessData.qpse,
      businessData
    )

    // Si el código es PENDING_MANUAL, el documento está firmado pero necesita envío manual
    const isPendingManual = qpseResponse.responseCode === 'PENDING_MANUAL'

    // success = true si el documento fue procesado exitosamente (independientemente de si SUNAT lo aceptó o rechazó)
    // success = false solo si hubo un error técnico que impidió procesar el documento
    const success = true // QPse siempre devuelve una respuesta, incluso si SUNAT rechaza

    return {
      success: success,
      method: 'qpse',
      accepted: qpseResponse.accepted,
      responseCode: qpseResponse.responseCode,
      description: qpseResponse.description,
      notes: qpseResponse.notes,
      cdrUrl: qpseResponse.cdrUrl,
      cdrData: qpseResponse.cdrData, // CDR como contenido directo (base64 decodificado)
      xmlUrl: qpseResponse.xmlUrl,
      pdfUrl: qpseResponse.pdfUrl,
      ticket: qpseResponse.ticket,
      hash: qpseResponse.hash,
      nombreArchivo: qpseResponse.nombreArchivo,
      xmlFirmado: qpseResponse.xmlFirmado,
      pendingManual: isPendingManual,
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

/**
 * Emite una Nota de Crédito electrónica usando el método configurado
 *
 * Esta función es independiente de emitirComprobante para no afectar
 * el flujo existente de facturas y boletas.
 *
 * @param {Object} creditNoteData - Datos de la nota de crédito
 * @param {Object} businessData - Datos del negocio
 * @returns {Promise<Object>} Resultado del envío
 */
export async function emitirNotaCredito(creditNoteData, businessData) {
  try {
    console.log('🚀 Iniciando emisión de NOTA DE CRÉDITO...')
    console.log(`📋 Documento: ${creditNoteData.documentType} ${creditNoteData.series}-${creditNoteData.correlativeNumber}`)
    console.log(`📄 Documento referenciado: ${creditNoteData.referencedDocumentId} (tipo: ${creditNoteData.referencedDocumentType})`)
    console.log(`📝 Motivo: ${creditNoteData.discrepancyCode} - ${creditNoteData.discrepancyReason}`)

    // Determinar qué método usar
    const emissionMethod = determineEmissionMethod(businessData)
    console.log(`📡 Método de emisión seleccionado: ${emissionMethod}`)

    // Ejecutar el método correspondiente
    let result

    if (emissionMethod === 'qpse') {
      result = await emitCreditNoteViaQPse(creditNoteData, businessData)
    } else if (emissionMethod === 'sunat_direct') {
      result = await emitCreditNoteViaSunatDirect(creditNoteData, businessData)
    } else {
      throw new Error('Método de emisión no soportado para notas de crédito. Use QPse o SUNAT directo.')
    }

    return result

  } catch (error) {
    console.error('❌ Error en emisión de nota de crédito:', error)

    return {
      success: false,
      method: 'error',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite Nota de Crédito vía SUNAT DIRECTO
 */
async function emitCreditNoteViaSunatDirect(creditNoteData, businessData) {
  console.log('📤 Emitiendo Nota de Crédito vía SUNAT DIRECTO...')

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

    // 1. Generar XML usando generateCreditNoteXML (específico para NC)
    console.log('🔨 Generando XML UBL 2.1 para Nota de Crédito...')
    const xml = generateCreditNoteXML(creditNoteData, businessData)

    // 2. Firmar XML
    console.log('🔏 Firmando XML con certificado digital...')
    const signedXML = await signXML(xml, {
      certificate: businessData.sunat.certificateData,
      certificatePassword: businessData.sunat.certificatePassword
    })

    // 3. Enviar a SUNAT (tipo documento 07 = Nota de Crédito)
    console.log('📡 Enviando Nota de Crédito a SUNAT...')
    const sunatResponse = await sendToSunat(signedXML, {
      ruc: businessData.ruc,
      documentType: 'nota_credito', // Se mapea a '07' en sunatClient
      series: creditNoteData.series,
      number: creditNoteData.correlativeNumber,
      solUser: businessData.sunat.solUser,
      solPassword: businessData.sunat.solPassword,
      environment: businessData.sunat.environment || 'production'
    })

    return {
      success: sunatResponse.accepted,
      method: 'sunat_direct',
      accepted: sunatResponse.accepted,
      responseCode: sunatResponse.code || sunatResponse.responseCode, // sunatClient retorna 'code'
      description: sunatResponse.description,
      notes: sunatResponse.notes,
      cdrData: sunatResponse.cdrData,
      xml: signedXML,
      sunatResponse: sunatResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión NC vía SUNAT directo:', error)

    return {
      success: false,
      method: 'sunat_direct',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite Nota de Crédito vía QPse
 */
async function emitCreditNoteViaQPse(creditNoteData, businessData) {
  console.log('📤 Emitiendo Nota de Crédito vía QPSE...')

  try {
    // Validar configuración QPse
    if (!businessData.qpse || !businessData.qpse.enabled) {
      throw new Error('QPse no está habilitado para este negocio')
    }

    if (!businessData.qpse.usuario || !businessData.qpse.password) {
      throw new Error('Credenciales de QPse no configuradas')
    }

    // 1. Generar XML usando generateCreditNoteXML (específico para NC)
    console.log('🔨 Generando XML UBL 2.1 para Nota de Crédito...')
    const xml = generateCreditNoteXML(creditNoteData, businessData)

    // 2. Tipo de documento: 07 = Nota de Crédito
    const tipoDocumento = '07'
    console.log(`📄 Tipo de documento: nota_credito → Código SUNAT: ${tipoDocumento}`)

    // 3. Enviar a QPse (firma y envía automáticamente)
    console.log('📡 Enviando Nota de Crédito a QPse...')
    const qpseResponse = await sendToQPse(
      xml,
      businessData.ruc,
      tipoDocumento,
      creditNoteData.series,
      creditNoteData.correlativeNumber,
      businessData.qpse,
      businessData
    )

    // Si el código es PENDING_MANUAL, el documento está firmado pero necesita envío manual
    const isPendingManual = qpseResponse.responseCode === 'PENDING_MANUAL'

    return {
      success: true,
      method: 'qpse',
      accepted: qpseResponse.accepted,
      responseCode: qpseResponse.responseCode,
      description: qpseResponse.description,
      notes: qpseResponse.notes,
      cdrUrl: qpseResponse.cdrUrl,
      cdrData: qpseResponse.cdrData, // CDR como contenido directo (base64 decodificado)
      xmlUrl: qpseResponse.xmlUrl,
      pdfUrl: qpseResponse.pdfUrl,
      ticket: qpseResponse.ticket,
      hash: qpseResponse.hash,
      nombreArchivo: qpseResponse.nombreArchivo,
      xmlFirmado: qpseResponse.xmlFirmado,
      pendingManual: isPendingManual,
      qpseResponse: qpseResponse.rawResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión NC vía QPse:', error)

    return {
      success: false,
      method: 'qpse',
      error: error.message,
      errorDetails: error
    }
  }
}

// ==================== NOTAS DE DÉBITO ====================

/**
 * Emite una Nota de Débito Electrónica a SUNAT
 *
 * Tipo de documento: 08 (Nota de Débito)
 *
 * Catálogo 10 - Motivos de Nota de Débito:
 * - '01': Intereses por mora
 * - '02': Aumento en el valor
 * - '03': Penalidades / otros conceptos
 *
 * @param {Object} debitNoteData - Datos de la nota de débito
 * @param {Object} businessData - Datos del negocio
 * @returns {Promise<Object>} Resultado del envío
 */
export async function emitirNotaDebito(debitNoteData, businessData) {
  try {
    console.log('🚀 Iniciando emisión de NOTA DE DÉBITO...')
    console.log(`📋 Documento: ${debitNoteData.documentType} ${debitNoteData.series}-${debitNoteData.correlativeNumber}`)
    console.log(`📄 Documento referenciado: ${debitNoteData.referencedDocumentId} (tipo: ${debitNoteData.referencedDocumentType})`)
    console.log(`📝 Motivo: ${debitNoteData.discrepancyCode} - ${debitNoteData.discrepancyReason}`)

    // Determinar qué método usar
    const emissionMethod = determineEmissionMethod(businessData)
    console.log(`📡 Método de emisión seleccionado: ${emissionMethod}`)

    // Ejecutar el método correspondiente
    let result

    if (emissionMethod === 'qpse') {
      result = await emitDebitNoteViaQPse(debitNoteData, businessData)
    } else if (emissionMethod === 'sunat_direct') {
      result = await emitDebitNoteViaSunatDirect(debitNoteData, businessData)
    } else {
      throw new Error('Método de emisión no soportado para notas de débito. Use QPse o SUNAT directo.')
    }

    return result

  } catch (error) {
    console.error('❌ Error en emisión de nota de débito:', error)

    return {
      success: false,
      method: 'error',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite Nota de Débito vía SUNAT DIRECTO
 */
async function emitDebitNoteViaSunatDirect(debitNoteData, businessData) {
  console.log('📤 Emitiendo Nota de Débito vía SUNAT DIRECTO...')

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

    // 1. Generar XML usando generateDebitNoteXML (específico para ND)
    console.log('🔨 Generando XML UBL 2.1 para Nota de Débito...')
    const xml = generateDebitNoteXML(debitNoteData, businessData)

    // 2. Firmar XML
    console.log('🔏 Firmando XML con certificado digital...')
    const signedXML = await signXML(xml, {
      certificate: businessData.sunat.certificateData,
      certificatePassword: businessData.sunat.certificatePassword
    })

    // 3. Enviar a SUNAT (tipo documento 08 = Nota de Débito)
    console.log('📡 Enviando Nota de Débito a SUNAT...')
    const sunatResponse = await sendToSunat(signedXML, {
      ruc: businessData.ruc,
      documentType: 'nota_debito', // Se mapea a '08' en sunatClient
      series: debitNoteData.series,
      number: debitNoteData.correlativeNumber,
      solUser: businessData.sunat.solUser,
      solPassword: businessData.sunat.solPassword,
      environment: businessData.sunat.environment || 'production'
    })

    return {
      success: sunatResponse.accepted,
      method: 'sunat_direct',
      accepted: sunatResponse.accepted,
      responseCode: sunatResponse.code || sunatResponse.responseCode,
      description: sunatResponse.description,
      notes: sunatResponse.notes,
      cdrData: sunatResponse.cdrData,
      xml: signedXML,
      sunatResponse: sunatResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión ND vía SUNAT directo:', error)

    return {
      success: false,
      method: 'sunat_direct',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite Nota de Débito vía QPse
 */
async function emitDebitNoteViaQPse(debitNoteData, businessData) {
  console.log('📤 Emitiendo Nota de Débito vía QPSE...')

  try {
    // Validar configuración QPse
    if (!businessData.qpse || !businessData.qpse.enabled) {
      throw new Error('QPse no está habilitado para este negocio')
    }

    if (!businessData.qpse.usuario || !businessData.qpse.password) {
      throw new Error('Credenciales de QPse no configuradas')
    }

    // 1. Generar XML usando generateDebitNoteXML (específico para ND)
    console.log('🔨 Generando XML UBL 2.1 para Nota de Débito...')
    const xml = generateDebitNoteXML(debitNoteData, businessData)

    // 2. Tipo de documento: 08 = Nota de Débito
    const tipoDocumento = '08'
    console.log(`📄 Tipo de documento: nota_debito → Código SUNAT: ${tipoDocumento}`)

    // 3. Enviar a QPse (firma y envía automáticamente)
    console.log('📡 Enviando Nota de Débito a QPse...')
    const qpseResponse = await sendToQPse(
      xml,
      businessData.ruc,
      tipoDocumento,
      debitNoteData.series,
      debitNoteData.correlativeNumber,
      businessData.qpse,
      businessData
    )

    // Si el código es PENDING_MANUAL, el documento está firmado pero necesita envío manual
    const isPendingManual = qpseResponse.responseCode === 'PENDING_MANUAL'

    return {
      success: true,
      method: 'qpse',
      accepted: qpseResponse.accepted,
      responseCode: qpseResponse.responseCode,
      description: qpseResponse.description,
      notes: qpseResponse.notes,
      cdrUrl: qpseResponse.cdrUrl,
      cdrData: qpseResponse.cdrData, // CDR como contenido directo (base64 decodificado)
      xmlUrl: qpseResponse.xmlUrl,
      pdfUrl: qpseResponse.pdfUrl,
      ticket: qpseResponse.ticket,
      hash: qpseResponse.hash,
      nombreArchivo: qpseResponse.nombreArchivo,
      xmlFirmado: qpseResponse.xmlFirmado,
      pendingManual: isPendingManual,
      qpseResponse: qpseResponse.rawResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión ND vía QPse:', error)

    return {
      success: false,
      method: 'qpse',
      error: error.message,
      errorDetails: error
    }
  }
}

// ==================== GUÍAS DE REMISIÓN ====================

/**
 * Emite una Guía de Remisión Electrónica (GRE) a SUNAT
 *
 * Esta función es INDEPENDIENTE de emitirComprobante para no afectar
 * el flujo existente de facturas y boletas.
 *
 * IMPORTANTE: Las GRE usan endpoints DIFERENTES a las facturas/boletas
 *
 * @param {Object} guideData - Datos de la guía de remisión
 * @param {Object} businessData - Datos del negocio
 * @returns {Promise<Object>} Resultado del envío
 */
export async function emitirGuiaRemision(guideData, businessData) {
  try {
    console.log('🚛 Iniciando emisión de GUÍA DE REMISIÓN...')
    console.log(`📋 Documento: GRE ${guideData.series}-${guideData.correlative}`)
    console.log(`📍 Origen: ${guideData.origin?.address}`)
    console.log(`📍 Destino: ${guideData.destination?.address}`)

    // Determinar qué método usar
    const emissionMethod = determineEmissionMethod(businessData)
    console.log(`📡 Método de emisión seleccionado: ${emissionMethod}`)

    // Por ahora solo soportamos SUNAT directo para GRE
    // QPse puede agregarse después
    let result

    if (emissionMethod === 'qpse') {
      result = await emitDispatchGuideViaQPse(guideData, businessData)
    } else {
      // Default: SUNAT directo
      result = await emitDispatchGuideViaSunatDirect(guideData, businessData)
    }

    return result

  } catch (error) {
    console.error('❌ Error en emisión de guía de remisión:', error)

    return {
      success: false,
      method: 'error',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite Guía de Remisión vía SUNAT DIRECTO
 *
 * IMPORTANTE: Desde 2024, SUNAT cambió el método de envío de GRE de SOAP a REST API
 * Ahora se requieren credenciales API adicionales (clientId, clientSecret)
 * generadas en el portal SOL de SUNAT.
 *
 * Pasos:
 * 1. Generar XML UBL 2.1 DespatchAdvice
 * 2. Firmar con certificado digital
 * 3. Enviar a SUNAT vía REST API (nuevo método)
 * 4. Procesar respuesta asíncrona
 */
async function emitDispatchGuideViaSunatDirect(guideData, businessData) {
  console.log('📤 Emitiendo Guía de Remisión vía SUNAT DIRECTO (REST API)...')

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

    // Validar credenciales API REST (requeridas para GRE desde 2024)
    if (!hasAPICredentials(businessData.sunat)) {
      throw new Error(
        'Credenciales API no configuradas. Para enviar Guías de Remisión directamente a SUNAT, ' +
        'debe generar las credenciales API (Client ID y Client Secret) en el portal SOL de SUNAT: ' +
        'Menú SOL > Empresa > Credenciales API. Alternativamente, puede usar el método QPse.'
      )
    }

    // 1. Generar XML usando generateDispatchGuideXML
    console.log('🔨 Generando XML UBL 2.1 DespatchAdvice...')
    const xml = generateDispatchGuideXML(guideData, businessData)

    console.log('📄 XML generado (primeros 500 chars):', xml.substring(0, 500))

    // 2. Firmar XML
    console.log('🔏 Firmando XML con certificado digital...')
    const signedXML = await signXML(xml, {
      certificate: businessData.sunat.certificateData,
      certificatePassword: businessData.sunat.certificatePassword
    })

    // 3. Enviar a SUNAT vía REST API (nuevo método desde 2024)
    console.log('📡 Enviando Guía de Remisión a SUNAT vía REST API...')
    const sunatResponse = await sendDispatchGuideToSunatREST(signedXML, {
      ruc: businessData.ruc,
      series: guideData.series,
      number: guideData.correlative,
      solUser: businessData.sunat.solUser,
      solPassword: businessData.sunat.solPassword,
      clientId: businessData.sunat.clientId,
      clientSecret: businessData.sunat.clientSecret,
      environment: businessData.sunat.environment || 'production'
    })

    return {
      success: sunatResponse.accepted,
      method: 'sunat_direct',
      accepted: sunatResponse.accepted,
      responseCode: sunatResponse.code,
      description: sunatResponse.description,
      notes: sunatResponse.notes,
      cdrData: sunatResponse.cdrData,
      xml: signedXML,
      ticket: sunatResponse.ticket,
      sunatResponse: sunatResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión GRE vía SUNAT directo:', error)

    return {
      success: false,
      method: 'sunat_direct',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite Guía de Remisión vía QPse
 *
 * Pasos:
 * 1. Generar XML UBL 2.1 DespatchAdvice
 * 2. Enviar a QPse para firma y envío
 * 3. Procesar respuesta
 */
async function emitDispatchGuideViaQPse(guideData, businessData) {
  console.log('📤 Emitiendo Guía de Remisión vía QPSE...')

  try {
    // Validar configuración QPse (aceptar enabled true, "true", o si tiene credenciales)
    const qpseEnabled = businessData.qpse?.enabled
    const hasCredentials = businessData.qpse?.usuario && businessData.qpse?.password
    const isEnabled = qpseEnabled === true || qpseEnabled === 'true' || hasCredentials

    if (!businessData.qpse || !isEnabled) {
      throw new Error('QPse no está habilitado para este negocio')
    }

    if (!hasCredentials) {
      throw new Error('Credenciales de QPse no configuradas')
    }

    console.log('✅ QPse configurado correctamente:', {
      usuario: businessData.qpse.usuario,
      environment: businessData.qpse.environment || 'production'
    })

    // 1. Generar XML
    console.log('🔨 Generando XML UBL 2.1 DespatchAdvice...')
    const xml = generateDispatchGuideXML(guideData, businessData)

    // 2. Tipo de documento: 09 = Guía de Remisión Remitente
    const tipoDocumento = '09'
    console.log(`📄 Tipo de documento: GRE → Código SUNAT: ${tipoDocumento}`)

    // 3. Enviar a QPse (firma y envía automáticamente)
    console.log('📡 Enviando Guía de Remisión a QPse...')
    const qpseResponse = await sendToQPse(
      xml,
      businessData.ruc,
      tipoDocumento,
      guideData.series,
      guideData.correlative,
      businessData.qpse,
      businessData
    )

    const isPendingManual = qpseResponse.responseCode === 'PENDING_MANUAL'

    return {
      success: true,
      method: 'qpse',
      accepted: qpseResponse.accepted,
      responseCode: qpseResponse.responseCode,
      description: qpseResponse.description,
      notes: qpseResponse.notes,
      cdrUrl: qpseResponse.cdrUrl,
      cdrData: qpseResponse.cdrData, // CDR como contenido directo (base64 decodificado)
      xmlUrl: qpseResponse.xmlUrl,
      pdfUrl: qpseResponse.pdfUrl,
      ticket: qpseResponse.ticket,
      hash: qpseResponse.hash,
      nombreArchivo: qpseResponse.nombreArchivo,
      xmlFirmado: qpseResponse.xmlFirmado,
      pendingManual: isPendingManual,
      qpseResponse: qpseResponse.rawResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión GRE vía QPse:', error)

    return {
      success: false,
      method: 'qpse',
      error: error.message,
      errorDetails: error
    }
  }
}

// ==================== GUÍAS DE REMISIÓN TRANSPORTISTA ====================

/**
 * Emite una Guía de Remisión Electrónica - Transportista (GRE-T) a SUNAT
 *
 * Tipo de documento: 31 (Guía de Remisión Transportista)
 * Serie: V001-Vxxx
 *
 * IMPORTANTE: Las GRE Transportista son emitidas por empresas de transporte
 * que prestan servicio de transporte de carga.
 *
 * @param {Object} guideData - Datos de la guía de remisión transportista
 * @param {Object} businessData - Datos del negocio (transportista)
 * @returns {Promise<Object>} Resultado del envío
 */
export async function emitirGuiaRemisionTransportista(guideData, businessData) {
  try {
    console.log('🚛 Iniciando emisión de GUÍA DE REMISIÓN TRANSPORTISTA...')
    console.log(`📋 Documento: GRE-T ${guideData.series}-${guideData.correlative}`)
    console.log(`📍 Origen: ${guideData.origin?.address}`)
    console.log(`📍 Destino: ${guideData.destination?.address}`)
    console.log(`🚚 Vehículo: ${guideData.vehicle?.plate}`)

    // Determinar qué método usar
    const emissionMethod = determineEmissionMethod(businessData)
    console.log(`📡 Método de emisión seleccionado: ${emissionMethod}`)

    let result

    if (emissionMethod === 'qpse') {
      result = await emitCarrierDispatchGuideViaQPse(guideData, businessData)
    } else {
      // Default: SUNAT directo
      result = await emitCarrierDispatchGuideViaSunatDirect(guideData, businessData)
    }

    return result

  } catch (error) {
    console.error('❌ Error en emisión de guía de remisión transportista:', error)

    return {
      success: false,
      method: 'error',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite Guía de Remisión Transportista vía SUNAT DIRECTO (REST API)
 */
async function emitCarrierDispatchGuideViaSunatDirect(guideData, businessData) {
  console.log('📤 Emitiendo Guía de Remisión Transportista vía SUNAT DIRECTO (REST API)...')

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

    // Validar credenciales API REST (requeridas para GRE desde 2024)
    if (!hasAPICredentials(businessData.sunat)) {
      throw new Error(
        'Credenciales API no configuradas. Para enviar Guías de Remisión directamente a SUNAT, ' +
        'debe generar las credenciales API (Client ID y Client Secret) en el portal SOL de SUNAT: ' +
        'Menú SOL > Empresa > Credenciales API. Alternativamente, puede usar el método QPse.'
      )
    }

    // 1. Generar XML usando generateCarrierDispatchGuideXML
    console.log('🔨 Generando XML UBL 2.1 DespatchAdvice (Transportista)...')
    const xml = generateCarrierDispatchGuideXML(guideData, businessData)

    console.log('📄 XML generado (primeros 500 chars):', xml.substring(0, 500))

    // 2. Firmar XML
    console.log('🔏 Firmando XML con certificado digital...')
    const signedXML = await signXML(xml, {
      certificate: businessData.sunat.certificateData,
      certificatePassword: businessData.sunat.certificatePassword
    })

    // 3. Enviar a SUNAT vía REST API
    console.log('📡 Enviando Guía de Remisión Transportista a SUNAT vía REST API...')
    const sunatResponse = await sendDispatchGuideToSunatREST(signedXML, {
      ruc: businessData.ruc,
      series: guideData.series,
      number: guideData.correlative,
      solUser: businessData.sunat.solUser,
      solPassword: businessData.sunat.solPassword,
      clientId: businessData.sunat.clientId,
      clientSecret: businessData.sunat.clientSecret,
      environment: businessData.sunat.environment || 'production'
    })

    return {
      success: sunatResponse.accepted,
      method: 'sunat_direct',
      accepted: sunatResponse.accepted,
      responseCode: sunatResponse.code,
      description: sunatResponse.description,
      notes: sunatResponse.notes,
      cdrData: sunatResponse.cdrData,
      xml: signedXML,
      ticket: sunatResponse.ticket,
      sunatResponse: sunatResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión GRE-T vía SUNAT directo:', error)

    return {
      success: false,
      method: 'sunat_direct',
      error: error.message,
      errorDetails: error
    }
  }
}

/**
 * Emite Guía de Remisión Transportista vía QPse
 */
async function emitCarrierDispatchGuideViaQPse(guideData, businessData) {
  console.log('📤 Emitiendo Guía de Remisión Transportista vía QPSE...')

  try {
    // Validar configuración QPse
    const qpseEnabled = businessData.qpse?.enabled
    const hasCredentials = businessData.qpse?.usuario && businessData.qpse?.password
    const isEnabled = qpseEnabled === true || qpseEnabled === 'true' || hasCredentials

    if (!businessData.qpse || !isEnabled) {
      throw new Error('QPse no está habilitado para este negocio')
    }

    if (!hasCredentials) {
      throw new Error('Credenciales de QPse no configuradas')
    }

    console.log('✅ QPse configurado correctamente:', {
      usuario: businessData.qpse.usuario,
      environment: businessData.qpse.environment || 'production'
    })

    // 1. Generar XML
    console.log('🔨 Generando XML UBL 2.1 DespatchAdvice (Transportista)...')
    const xml = generateCarrierDispatchGuideXML(guideData, businessData)

    // 2. Tipo de documento: 31 = Guía de Remisión Transportista
    const tipoDocumento = '31'
    console.log(`📄 Tipo de documento: GRE-T → Código SUNAT: ${tipoDocumento}`)

    // 3. Enviar a QPse (firma y envía automáticamente)
    console.log('📡 Enviando Guía de Remisión Transportista a QPse...')
    const qpseResponse = await sendToQPse(
      xml,
      businessData.ruc,
      tipoDocumento,
      guideData.series,
      guideData.correlative,
      businessData.qpse,
      businessData
    )

    const isPendingManual = qpseResponse.responseCode === 'PENDING_MANUAL'

    return {
      success: true,
      method: 'qpse',
      accepted: qpseResponse.accepted,
      responseCode: qpseResponse.responseCode,
      description: qpseResponse.description,
      notes: qpseResponse.notes,
      cdrUrl: qpseResponse.cdrUrl,
      cdrData: qpseResponse.cdrData,
      xmlUrl: qpseResponse.xmlUrl,
      pdfUrl: qpseResponse.pdfUrl,
      ticket: qpseResponse.ticket,
      hash: qpseResponse.hash,
      nombreArchivo: qpseResponse.nombreArchivo,
      xmlFirmado: qpseResponse.xmlFirmado,
      pendingManual: isPendingManual,
      qpseResponse: qpseResponse.rawResponse
    }

  } catch (error) {
    console.error('❌ Error en emisión GRE-T vía QPse:', error)

    return {
      success: false,
      method: 'qpse',
      error: error.message,
      errorDetails: error
    }
  }
}
