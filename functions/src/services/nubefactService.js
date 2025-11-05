import axios from 'axios'

/**
 * Servicio para interactuar con la API JSON de NubeFact
 *
 * NubeFact actúa como OSE (Operador de Servicios Electrónicos):
 * - Recibe datos estructurados en JSON
 * - Genera el XML UBL 2.1
 * - Firma el XML con su certificado digital
 * - Envía a SUNAT
 * - Retorna el CDR (Constancia de Recepción)
 *
 * Documentación: Ver "NUBEFACT DOC API JSON V1.pdf"
 */

/**
 * Envía una factura/boleta a NubeFact para que la procese y envíe a SUNAT
 *
 * @param {Object} invoiceJSON - Datos de la factura en formato JSON de NubeFact
 * @param {Object} nubefactConfig - Configuración de NubeFact del usuario
 * @returns {Promise<Object>} Respuesta de NubeFact
 */
export async function sendToNubefact(invoiceJSON, nubefactConfig) {
  try {
    console.log('📤 Enviando comprobante a NubeFact...')

    // Validar configuración
    if (!nubefactConfig.ruta || !nubefactConfig.token) {
      throw new Error('Configuración de NubeFact incompleta: ruta y token son requeridos')
    }

    // Preparar headers
    const headers = {
      'Authorization': nubefactConfig.token,
      'Content-Type': 'application/json'
    }

    // Enviar solicitud a NubeFact
    const response = await axios.post(
      nubefactConfig.ruta,
      invoiceJSON,
      {
        headers,
        timeout: 60000 // 60 segundos de timeout
      }
    )

    console.log('✅ Respuesta de NubeFact recibida:', response.data)

    // Validar respuesta
    if (!response.data) {
      throw new Error('NubeFact no retornó datos')
    }

    return {
      success: true,
      nubefactResponse: response.data
    }

  } catch (error) {
    console.error('❌ Error al comunicarse con NubeFact:', error.message)

    // Parsear errores de NubeFact
    if (error.response) {
      // Error con respuesta del servidor
      const errorData = error.response.data

      return {
        success: false,
        error: errorData.errors || 'Error en NubeFact',
        errorCode: errorData.codigo || error.response.status,
        errorDetails: errorData
      }
    } else if (error.request) {
      // Error de red - no hubo respuesta
      return {
        success: false,
        error: 'No se pudo conectar con NubeFact. Verifique su conexión a internet.',
        errorCode: 'NETWORK_ERROR'
      }
    } else {
      // Error en la configuración de la solicitud
      return {
        success: false,
        error: error.message || 'Error desconocido al enviar a NubeFact',
        errorCode: 'UNKNOWN_ERROR'
      }
    }
  }
}

/**
 * Consulta el estado de un comprobante en NubeFact
 *
 * @param {Object} params - Parámetros de consulta
 * @param {number} params.tipo_de_comprobante - 1=Factura, 2=Boleta, 3=NC, 4=ND
 * @param {string} params.serie - Serie del comprobante
 * @param {number} params.numero - Número del comprobante
 * @param {Object} nubefactConfig - Configuración de NubeFact
 * @returns {Promise<Object>} Estado del comprobante
 */
export async function consultarComprobante(params, nubefactConfig) {
  try {
    console.log('🔍 Consultando comprobante en NubeFact...', params)

    const consultaJSON = {
      operacion: 'consultar_comprobante',
      tipo_de_comprobante: params.tipo_de_comprobante,
      serie: params.serie,
      numero: params.numero
    }

    const headers = {
      'Authorization': nubefactConfig.token,
      'Content-Type': 'application/json'
    }

    const response = await axios.post(
      nubefactConfig.ruta,
      consultaJSON,
      {
        headers,
        timeout: 30000
      }
    )

    return {
      success: true,
      data: response.data
    }

  } catch (error) {
    console.error('❌ Error al consultar comprobante:', error.message)

    return {
      success: false,
      error: error.response?.data?.errors || error.message
    }
  }
}

/**
 * Anula un comprobante en NubeFact (genera comunicación de baja)
 *
 * @param {Object} params - Parámetros de anulación
 * @param {number} params.tipo_de_comprobante - 1=Factura, 2=Boleta
 * @param {string} params.serie - Serie del comprobante
 * @param {number} params.numero - Número del comprobante
 * @param {string} params.motivo - Motivo de la anulación
 * @param {Object} nubefactConfig - Configuración de NubeFact
 * @returns {Promise<Object>} Resultado de la anulación
 */
export async function anularComprobante(params, nubefactConfig) {
  try {
    console.log('🗑️ Anulando comprobante en NubeFact...', params)

    const anulacionJSON = {
      operacion: 'generar_anulacion',
      tipo_de_comprobante: params.tipo_de_comprobante,
      serie: params.serie,
      numero: params.numero,
      motivo: params.motivo || 'ANULACIÓN SOLICITADA POR EL USUARIO',
      codigo_unico: params.codigo_unico || ''
    }

    const headers = {
      'Authorization': nubefactConfig.token,
      'Content-Type': 'application/json'
    }

    const response = await axios.post(
      nubefactConfig.ruta,
      anulacionJSON,
      {
        headers,
        timeout: 60000
      }
    )

    return {
      success: true,
      data: response.data
    }

  } catch (error) {
    console.error('❌ Error al anular comprobante:', error.message)

    return {
      success: false,
      error: error.response?.data?.errors || error.message
    }
  }
}

/**
 * Parsea la respuesta de NubeFact a un formato estandarizado
 *
 * @param {Object} nubefactResponse - Respuesta de NubeFact
 * @returns {Object} Respuesta parseada
 */
export function parseNubefactResponse(nubefactResponse) {
  return {
    accepted: nubefactResponse.aceptada_por_sunat === true,
    responseCode: nubefactResponse.sunat_responsecode || '',
    description: nubefactResponse.sunat_description || '',
    notes: nubefactResponse.sunat_note || null,
    pdfUrl: nubefactResponse.enlace_del_pdf || nubefactResponse.enlace + '.pdf',
    xmlUrl: nubefactResponse.enlace_del_xml || nubefactResponse.enlace + '.xml',
    cdrUrl: nubefactResponse.enlace_del_cdr || nubefactResponse.enlace + '.cdr',
    qrCode: nubefactResponse.cadena_para_codigo_qr || '',
    hash: nubefactResponse.codigo_hash || '',
    enlace: nubefactResponse.enlace || '',
    soapError: nubefactResponse.sunat_soap_error || '',
    // Incluir respuesta completa para debugging
    rawResponse: nubefactResponse
  }
}
