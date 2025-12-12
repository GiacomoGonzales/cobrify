/**
 * Servicio para comunicación con SUNAT
 * Maneja el envío de comprobantes electrónicos y consulta de estado
 */

import axios from 'axios'
import JSZip from 'jszip'
import { generateInvoiceXML, generateXMLFileName, validateInvoiceData } from './sunatXMLService'

/**
 * URLs de los servicios de SUNAT según ambiente
 */
const SUNAT_ENDPOINTS = {
  beta: {
    sendBill: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
    getStatus: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billConsultService',
  },
  produccion: {
    sendBill: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
    getStatus: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billConsultService',
  },
}

/**
 * Obtiene la configuración de SUNAT desde las variables de entorno
 */
const getSunatConfig = () => {
  return {
    ruc: import.meta.env.VITE_SUNAT_RUC,
    solUser: import.meta.env.VITE_SUNAT_SOL_USER,
    solPassword: import.meta.env.VITE_SUNAT_SOL_PASSWORD,
    environment: import.meta.env.VITE_SUNAT_ENVIRONMENT || 'beta',
    certificatePath: import.meta.env.VITE_SUNAT_CERTIFICATE_PATH,
    certificatePassword: import.meta.env.VITE_SUNAT_CERTIFICATE_PASSWORD,
  }
}

/**
 * Verifica si las credenciales de SUNAT están configuradas
 */
export const isSunatConfigured = () => {
  const config = getSunatConfig()

  return !!(
    config.ruc &&
    config.solUser &&
    config.solPassword &&
    config.certificatePath &&
    config.certificatePassword
  )
}

/**
 * Prepara el XML del comprobante para envío a SUNAT
 *
 * @param {Object} invoiceData - Datos de la factura/boleta
 * @param {Object} companySettings - Configuración de la empresa
 * @param {Object} taxConfig - Configuración de impuestos (opcional)
 * @returns {Promise<Object>} { success: boolean, xml?: string, fileName?: string, error?: string }
 */
export const prepareInvoiceXML = async (invoiceData, companySettings, taxConfig = null) => {
  try {
    // Validar datos antes de generar XML
    const validation = validateInvoiceData(invoiceData, companySettings)

    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      }
    }

    // Generar el XML UBL 2.1 con configuración de impuestos
    const xml = generateInvoiceXML(invoiceData, companySettings, taxConfig)

    // Generar nombre del archivo
    // Extraer series y número correlativo
    let series = invoiceData.series
    let numberToUse = invoiceData.correlativeNumber

    // Si no tiene series o correlativeNumber, extraer del número formateado
    if (!series && invoiceData.number && invoiceData.number.includes('-')) {
      const parts = invoiceData.number.split('-')
      series = parts[0]
      numberToUse = parseInt(parts[1])
    }

    // Si aún no tenemos correlativeNumber, intentar extraerlo del número
    if (!numberToUse && invoiceData.number) {
      numberToUse = parseInt(invoiceData.number.split('-').pop()) || 0
    }

    const fileName = generateXMLFileName(
      companySettings.ruc,
      invoiceData.documentType,
      series,
      numberToUse
    )

    return {
      success: true,
      xml,
      fileName,
    }
  } catch (error) {
    console.error('Error al preparar XML:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Envía el comprobante electrónico a SUNAT
 * NOTA: Esta función requiere un backend (Firebase Functions) para manejar
 * la firma digital y el envío SOAP
 *
 * @param {Object} invoiceData - Datos de la factura/boleta
 * @param {Object} companySettings - Configuración de la empresa
 * @param {Object} taxConfig - Configuración de impuestos (opcional)
 * @returns {Promise<Object>} { success: boolean, cdr?: Object, error?: string }
 */
export const sendInvoiceToSunat = async (invoiceData, companySettings, taxConfig = null) => {
  try {
    // Verificar configuración
    if (!isSunatConfigured()) {
      return {
        success: false,
        error: 'Configuración de SUNAT incompleta. Verifica las variables de entorno.',
      }
    }

    // Preparar el XML con configuración de impuestos
    const prepareResult = await prepareInvoiceXML(invoiceData, companySettings, taxConfig)

    if (!prepareResult.success) {
      return prepareResult
    }

    const { xml, fileName } = prepareResult

    // Aquí debería ir la llamada al backend (Firebase Functions)
    // Por ahora, retornamos el XML generado para descarga manual
    console.log('XML generado:', fileName)
    console.log(xml)

    // TODO: Implementar llamada a Firebase Function
    // const response = await axios.post('/api/sunat/sendInvoice', {
    //   xml,
    //   fileName,
    //   ruc: companySettings.ruc,
    // })

    return {
      success: true,
      message: 'XML generado correctamente. Integración con SUNAT en desarrollo.',
      xml,
      fileName,
      // cdr: response.data.cdr // CDR (Constancia de Recepción) de SUNAT
    }
  } catch (error) {
    console.error('Error al enviar a SUNAT:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Descarga el XML generado (útil para pruebas)
 *
 * @param {string} xml - Contenido del XML
 * @param {string} fileName - Nombre del archivo
 */
export const downloadXML = (xml, fileName) => {
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Comprime el XML en formato ZIP (requerido por SUNAT)
 *
 * @param {string} xml - Contenido del XML
 * @param {string} fileName - Nombre del archivo XML
 * @returns {Promise<Blob>} ZIP comprimido
 */
export const compressXML = async (xml, fileName) => {
  const zip = new JSZip()
  zip.file(fileName, xml)

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  return zipBlob
}

/**
 * Descarga el XML comprimido en ZIP
 *
 * @param {string} xml - Contenido del XML
 * @param {string} fileName - Nombre del archivo XML
 */
export const downloadCompressedXML = async (xml, fileName) => {
  const zipBlob = await compressXML(xml, fileName)
  const zipFileName = fileName.replace('.xml', '.zip')

  const url = URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = zipFileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Valida el estado de un comprobante en SUNAT
 *
 * @param {string} ruc - RUC del emisor
 * @param {string} documentType - Tipo de documento
 * @param {string} series - Serie
 * @param {number} number - Número
 * @returns {Promise<Object>} Estado del comprobante
 */
export const getInvoiceStatus = async (ruc, documentType, series, number) => {
  try {
    const config = getSunatConfig()
    const endpoint = SUNAT_ENDPOINTS[config.environment].getStatus

    // TODO: Implementar consulta a SUNAT
    // Requiere autenticación con usuario SOL

    return {
      success: true,
      status: 'PENDIENTE',
      message: 'Consulta de estado en desarrollo',
    }
  } catch (error) {
    console.error('Error al consultar estado:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Obtiene el mensaje de error de SUNAT según el código
 *
 * @param {string} code - Código de error de SUNAT
 * @returns {string} Descripción del error
 */
export const getSunatErrorMessage = code => {
  const errors = {
    '0100': 'El sistema no puede responder su solicitud',
    '0101': 'El encabezado de seguridad es incorrecto',
    '0102': 'Usuario no autorizado',
    '0103': 'La firma digital es inválida',
    '0104': 'El certificado con el que firmó es inválido',
    '0105': 'El certificado no corresponde al emisor',
    '0110': 'El archivo ZIP no contiene el archivo XML',
    '0111': 'El nombre del archivo XML es incorrecto',
    '0112': 'El formato del archivo XML es incorrecto',
    '0113': 'El archivo XML ya fue presentado anteriormente',
    '0130': 'Error en el schema del XML',
    '0131': 'Precio/Valor Unitario es menor o igual a cero',
    '0132': 'Total Descuentos es mayor a Suma de Items',
    '0200': 'No se puede leer el archivo ZIP',
    '0201': 'El RUC del nombre del archivo no corresponde al RUC del emisor',
    '0202': 'El tipo de documento del nombre del archivo no corresponde',
    '0203': 'La serie del nombre del archivo no corresponde',
    '0204': 'El número del documento no corresponde',
    '1033': 'El certificado no está vigente o está revocado',
    '2000': 'RUC del emisor no existe',
    '2001': 'RUC del emisor no está activo',
    '2002': 'RUC del emisor no está habilitado para emitir comprobantes',
    '2003': 'El contribuyente no está autorizado como emisor electrónico',
  }

  return errors[code] || `Error desconocido (código: ${code})`
}

/**
 * Anula una factura mediante Comunicación de Baja a SUNAT
 *
 * @param {string} userId - ID del usuario/negocio
 * @param {string} invoiceId - ID de la factura a anular
 * @param {string} reason - Motivo de la anulación
 * @param {string} idToken - Token de autenticación
 * @returns {Promise<Object>} { success: boolean, status?: string, message?: string, error?: string }
 */
export const voidInvoice = async (userId, invoiceId, reason, idToken) => {
  try {
    // URL de Cloud Functions (funciona con autenticación Firebase)
    const voidInvoiceUrl = import.meta.env.VITE_VOID_INVOICE_URL || 'https://us-central1-cobrify-395fe.cloudfunctions.net/voidInvoice'

    const response = await axios.post(
      voidInvoiceUrl,
      {
        userId,
        invoiceId,
        reason: reason || 'ANULACION DE OPERACION'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        timeout: 120000 // 2 minutos
      }
    )

    return response.data
  } catch (error) {
    console.error('Error al anular factura:', error)

    if (error.response?.data) {
      return {
        success: false,
        error: error.response.data.error || 'Error al anular la factura'
      }
    }

    return {
      success: false,
      error: error.message || 'Error de conexión'
    }
  }
}

/**
 * Consulta el estado de una comunicación de baja pendiente
 *
 * @param {string} userId - ID del usuario/negocio
 * @param {string} voidedDocumentId - ID del documento de baja
 * @param {string} idToken - Token de autenticación
 * @returns {Promise<Object>} { status: string, message?: string, error?: string }
 */
export const checkVoidStatus = async (userId, voidedDocumentId, idToken) => {
  try {
    // URL de Cloud Functions (funciona con autenticación Firebase)
    const checkVoidStatusUrl = import.meta.env.VITE_CHECK_VOID_STATUS_URL || 'https://us-central1-cobrify-395fe.cloudfunctions.net/checkVoidStatus'

    const response = await axios.post(
      checkVoidStatusUrl,
      {
        userId,
        voidedDocumentId
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        timeout: 60000
      }
    )

    return response.data
  } catch (error) {
    console.error('Error al consultar estado de baja:', error)

    return {
      status: 'error',
      error: error.response?.data?.error || error.message || 'Error de conexión'
    }
  }
}

/**
 * Valida si una factura puede ser anulada
 *
 * @param {Object} invoice - Datos de la factura
 * @returns {Object} { canVoid: boolean, reason: string }
 */
export const canVoidInvoice = (invoice) => {
  // Debe ser factura o nota (no boleta)
  if (invoice.documentType === 'boleta') {
    return {
      canVoid: false,
      reason: 'Las boletas no pueden anularse con comunicación de baja. Debe usar resumen diario.'
    }
  }

  // Debe tener estado aceptado o en proceso de anulación (para reintentos)
  const validStatuses = ['ACEPTADO', 'accepted', 'voiding']
  if (!validStatuses.includes(invoice.sunatStatus)) {
    return {
      canVoid: false,
      reason: 'Solo se pueden anular facturas aceptadas por SUNAT'
    }
  }

  // No debe haber sido entregada
  if (invoice.delivered === true) {
    return {
      canVoid: false,
      reason: 'La factura ya fue entregada al cliente. Debe emitir una Nota de Crédito.'
    }
  }

  // Debe estar dentro del plazo de 7 días
  const issueDate = invoice.issueDate?.toDate ? invoice.issueDate.toDate() : new Date(invoice.issueDate)
  const today = new Date()
  const diffTime = Math.abs(today - issueDate)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays > 7) {
    return {
      canVoid: false,
      reason: `Han pasado ${diffDays} días desde la emisión. El plazo máximo es 7 días. Debe emitir una Nota de Crédito.`
    }
  }

  // Si está en proceso de anulación, permitir reintentar
  if (invoice.sunatStatus === 'voiding') {
    return {
      canVoid: true,
      reason: 'La factura está en proceso de anulación. Puede reintentar.',
      isRetry: true,
      daysRemaining: 7 - diffDays
    }
  }

  // Ya está anulada
  if (invoice.sunatStatus === 'voided') {
    return {
      canVoid: false,
      reason: 'La factura ya fue anulada'
    }
  }

  return {
    canVoid: true,
    reason: 'La factura puede ser anulada',
    daysRemaining: 7 - diffDays
  }
}

/**
 * Anula una boleta mediante Resumen Diario a SUNAT
 *
 * @param {string} userId - ID del usuario/negocio
 * @param {string} invoiceId - ID de la boleta a anular
 * @param {string} reason - Motivo de la anulación
 * @param {string} idToken - Token de autenticación
 * @returns {Promise<Object>} { success: boolean, status?: string, message?: string, error?: string }
 */
export const voidBoleta = async (userId, invoiceId, reason, idToken) => {
  try {
    // URL de Cloud Functions
    const voidBoletaUrl = import.meta.env.VITE_VOID_BOLETA_URL || 'https://us-central1-cobrify-395fe.cloudfunctions.net/voidBoleta'

    const response = await axios.post(
      voidBoletaUrl,
      {
        userId,
        invoiceId,
        reason: reason || 'ANULACION DE OPERACION'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        timeout: 120000 // 2 minutos
      }
    )

    return response.data
  } catch (error) {
    console.error('Error al anular boleta:', error)

    if (error.response?.data) {
      return {
        success: false,
        error: error.response.data.error || 'Error al anular la boleta'
      }
    }

    return {
      success: false,
      error: error.message || 'Error de conexión'
    }
  }
}

/**
 * Valida si una boleta puede ser anulada
 *
 * @param {Object} boleta - Datos de la boleta
 * @returns {Object} { canVoid: boolean, reason: string }
 */
export const canVoidBoleta = (boleta) => {
  // Verificar que sea una boleta (serie empieza con B)
  const series = boleta.series || boleta.number?.split('-')[0] || ''
  if (!series.toUpperCase().startsWith('B')) {
    return {
      canVoid: false,
      reason: 'Este documento no es una boleta. Use la función de anulación de facturas.'
    }
  }

  // Debe tener estado aceptado o en proceso de anulación (para reintentos)
  const validStatuses = ['ACEPTADO', 'accepted', 'voiding']
  if (!validStatuses.includes(boleta.sunatStatus)) {
    return {
      canVoid: false,
      reason: 'Solo se pueden anular boletas aceptadas por SUNAT'
    }
  }

  // No debe haber sido entregada
  if (boleta.delivered === true) {
    return {
      canVoid: false,
      reason: 'La boleta ya fue entregada al cliente. Debe emitir una Nota de Crédito.'
    }
  }

  // Debe estar dentro del plazo de 7 días
  const issueDate = boleta.issueDate?.toDate ? boleta.issueDate.toDate() : new Date(boleta.issueDate)
  const today = new Date()
  const diffTime = Math.abs(today - issueDate)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays > 7) {
    return {
      canVoid: false,
      reason: `Han pasado ${diffDays} días desde la emisión. El plazo máximo es 7 días. Debe emitir una Nota de Crédito.`
    }
  }

  // Si está en proceso de anulación, permitir reintentar
  if (boleta.sunatStatus === 'voiding') {
    return {
      canVoid: true,
      reason: 'La boleta está en proceso de anulación. Puede reintentar.',
      isRetry: true,
      daysRemaining: 7 - diffDays
    }
  }

  // Ya está anulada
  if (boleta.sunatStatus === 'voided') {
    return {
      canVoid: false,
      reason: 'La boleta ya fue anulada'
    }
  }

  return {
    canVoid: true,
    reason: 'La boleta puede ser anulada',
    daysRemaining: 7 - diffDays
  }
}

/**
 * Anula una boleta en SUNAT usando QPSe como proveedor de firma
 *
 * @param {string} userId - ID del usuario/negocio
 * @param {string} invoiceId - ID de la boleta
 * @param {string} reason - Motivo de la anulación
 * @param {string} idToken - Token de autenticación
 * @returns {Promise<Object>} { success: boolean, status?: string, message?: string, error?: string }
 */
export const voidBoletaQPse = async (userId, invoiceId, reason, idToken) => {
  try {
    // URL de Cloud Functions para QPSe
    const voidBoletaQPseUrl = import.meta.env.VITE_VOID_BOLETA_QPSE_URL || 'https://us-central1-cobrify-395fe.cloudfunctions.net/voidBoletaQPse'

    const response = await axios.post(
      voidBoletaQPseUrl,
      {
        userId,
        invoiceId,
        reason: reason || 'ANULACION DE OPERACION'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        timeout: 120000 // 2 minutos
      }
    )

    return response.data
  } catch (error) {
    console.error('Error al anular boleta vía QPse:', error)

    if (error.response?.data) {
      return {
        success: false,
        error: error.response.data.error || 'Error al anular la boleta vía QPse'
      }
    }

    return {
      success: false,
      error: error.message || 'Error de conexión'
    }
  }
}

/**
 * Función unificada para anular documentos (detecta automáticamente si es factura o boleta)
 *
 * @param {Object} invoice - Datos del documento
 * @param {string} userId - ID del usuario/negocio
 * @param {string} reason - Motivo de la anulación
 * @param {string} idToken - Token de autenticación
 * @param {string} emissionMethod - Método de emisión ('qpse', 'sunat_direct', etc.) - opcional
 * @returns {Promise<Object>} { success: boolean, status?: string, message?: string, error?: string }
 */
export const voidDocument = async (invoice, userId, reason, idToken, emissionMethod = null) => {
  const series = invoice.series || invoice.number?.split('-')[0] || ''

  // Si es boleta (serie empieza con B)
  if (series.toUpperCase().startsWith('B')) {
    // Si el método de emisión es QPSe, usar la función específica
    if (emissionMethod === 'qpse') {
      return await voidBoletaQPse(userId, invoice.id, reason, idToken)
    }
    // Default: usar SUNAT directo
    return await voidBoleta(userId, invoice.id, reason, idToken)
  }

  // Si es factura, usar voidInvoice (solo SUNAT directo soportado por ahora)
  // Nota: QPSe no tiene endpoint para Comunicación de Baja de facturas
  return await voidInvoice(userId, invoice.id, reason, idToken)
}

/**
 * Función unificada para validar si un documento puede ser anulado
 *
 * @param {Object} document - Datos del documento
 * @returns {Object} { canVoid: boolean, reason: string }
 */
export const canVoidDocument = (document) => {
  const series = document.series || document.number?.split('-')[0] || ''

  // Si es boleta, usar validación de boletas
  if (series.toUpperCase().startsWith('B')) {
    return canVoidBoleta(document)
  }

  // Si es factura, usar validación de facturas
  return canVoidInvoice(document)
}

export default {
  isSunatConfigured,
  prepareInvoiceXML,
  sendInvoiceToSunat,
  downloadXML,
  downloadCompressedXML,
  getInvoiceStatus,
  getSunatErrorMessage,
  voidInvoice,
  voidBoleta,
  voidBoletaQPse,
  voidDocument,
  checkVoidStatus,
  canVoidInvoice,
  canVoidBoleta,
  canVoidDocument,
}
