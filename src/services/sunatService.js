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
 * @returns {Promise<Object>} { success: boolean, xml?: string, fileName?: string, error?: string }
 */
export const prepareInvoiceXML = async (invoiceData, companySettings) => {
  try {
    // Validar datos antes de generar XML
    const validation = validateInvoiceData(invoiceData, companySettings)

    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      }
    }

    // Generar el XML UBL 2.1
    const xml = generateInvoiceXML(invoiceData, companySettings)

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
 * @returns {Promise<Object>} { success: boolean, cdr?: Object, error?: string }
 */
export const sendInvoiceToSunat = async (invoiceData, companySettings) => {
  try {
    // Verificar configuración
    if (!isSunatConfigured()) {
      return {
        success: false,
        error: 'Configuración de SUNAT incompleta. Verifica las variables de entorno.',
      }
    }

    // Preparar el XML
    const prepareResult = await prepareInvoiceXML(invoiceData, companySettings)

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

export default {
  isSunatConfigured,
  prepareInvoiceXML,
  sendInvoiceToSunat,
  downloadXML,
  downloadCompressedXML,
  getInvoiceStatus,
  getSunatErrorMessage,
}
