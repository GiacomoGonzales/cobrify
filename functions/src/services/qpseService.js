/**
 * Servicio de integración con QPse API
 *
 * QPse es un PSE (Proveedor de Servicios de Firma Digital) que:
 * - Firma XMLs con su propio certificado (no requiere certificado del cliente)
 * - Envía comprobantes a SUNAT
 * - Modelo económico: ~S/7-12 por RUC/mes con firmas ilimitadas
 *
 * Flujo:
 * 1. Generar XML UBL 2.1 (con xmlGenerator.js)
 * 2. Obtener token de autenticación
 * 3. POST /api/cpe/generar - QPse firma el XML
 * 4. POST /api/cpe/enviar - QPse envía a SUNAT
 * 5. GET /api/cpe/consultar - Consultar respuesta de SUNAT
 */

import axios from 'axios'

const QPSE_BASE_URL = {
  demo: 'https://demo-cpe.qpse.pe',
  production: 'https://cpe.qpse.pe'
}

/**
 * Obtiene token de autenticación de QPse
 *
 * @param {Object} config - Configuración de QPse
 * @returns {Promise<string>} Token de acceso
 */
async function obtenerToken(config) {
  try {
    const baseUrl = QPSE_BASE_URL[config.environment || 'demo']

    console.log('📡 Obteniendo token de QPse...')
    console.log(`Ambiente: ${config.environment || 'demo'}`)

    const response = await axios.post(
      `${baseUrl}/api/auth/cpe/token`,
      {
        username: config.usuario,
        password: config.password
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.data || !response.data.token_acceso) {
      throw new Error('QPse no devolvió token de acceso')
    }

    console.log('✅ Token obtenido exitosamente')
    console.log(`⏱️ Token expira en: ${response.data.expira_en} segundos`)
    return response.data.token_acceso

  } catch (error) {
    console.error('❌ Error al obtener token de QPse:', error.response?.data || error.message)
    throw new Error(`Error al autenticar con QPse: ${error.response?.data?.message || error.message}`)
  }
}

/**
 * Firma un XML usando el servicio de QPse
 *
 * @param {string} nombreArchivo - Nombre del archivo (sin extensión)
 * @param {string} xmlContent - Contenido XML sin firmar
 * @param {string} token - Token de autenticación
 * @param {string} environment - Ambiente (demo/production)
 * @returns {Promise<Object>} Respuesta con XML firmado
 */
async function firmarXML(nombreArchivo, xmlContent, token, environment = 'demo') {
  try {
    const baseUrl = QPSE_BASE_URL[environment]

    // Convertir XML a Base64
    const xmlBase64 = Buffer.from(xmlContent, 'utf-8').toString('base64')

    console.log('🔏 Firmando XML con QPse...')
    console.log(`Nombre archivo: ${nombreArchivo}`)
    console.log(`Tamaño XML: ${xmlContent.length} caracteres`)

    const response = await axios.post(
      `${baseUrl}/api/cpe/generar`,
      {
        tipo_integracion: 0,
        nombre_archivo: nombreArchivo,
        contenido_archivo: xmlBase64
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (!response.data) {
      throw new Error('QPse no devolvió respuesta al firmar XML')
    }

    console.log('✅ XML firmado exitosamente')
    return response.data

  } catch (error) {
    console.error('❌ Error al firmar XML con QPse:', error.response?.data || error.message)
    throw new Error(`Error al firmar con QPse: ${error.response?.data?.message || error.message}`)
  }
}

/**
 * Envía un XML firmado a SUNAT a través de QPse
 *
 * @param {string} nombreArchivo - Nombre del archivo XML firmado
 * @param {string} xmlFirmadoBase64 - XML firmado en Base64
 * @param {string} token - Token de autenticación
 * @param {string} environment - Ambiente (demo/production)
 * @returns {Promise<Object>} Respuesta de SUNAT
 */
async function enviarASunat(nombreArchivo, xmlFirmadoBase64, token, environment = 'demo') {
  try {
    const baseUrl = QPSE_BASE_URL[environment]

    console.log('📤 Enviando XML a SUNAT vía QPse...')
    console.log(`Nombre archivo: ${nombreArchivo}`)

    const response = await axios.post(
      `${baseUrl}/api/cpe/enviar`,
      {
        nombre_xml_firmado: nombreArchivo,
        contenido_xml_firmado: xmlFirmadoBase64
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (!response.data) {
      throw new Error('QPse no devolvió respuesta al enviar a SUNAT')
    }

    console.log('✅ Enviado a SUNAT exitosamente')
    console.log('🔍 Respuesta de enviar a SUNAT:', JSON.stringify(response.data, null, 2))
    return response.data

  } catch (error) {
    console.error('❌ Error al enviar a SUNAT vía QPse:')
    console.error('Status:', error.response?.status)
    console.error('Data:', JSON.stringify(error.response?.data, null, 2))
    console.error('Message:', error.message)

    // Analizar el error y dar un mensaje más específico
    const errorData = error.response?.data
    let errorMessage = error.message

    if (errorData) {
      // Intentar obtener el mensaje más específico
      if (errorData.errors && Array.isArray(errorData.errors)) {
        errorMessage = errorData.errors.join(', ')
      } else if (errorData.mensaje) {
        errorMessage = errorData.mensaje
      } else if (errorData.message) {
        errorMessage = errorData.message
      }

      // Si es un error de conexión con SUNAT, agregar contexto más detallado
      if (errorData.connection === false || errorData.errors?.includes('No se recibió respuesta SOAP')) {
        const sunatErrors = []

        // Agregar información específica del error
        if (errorData.errores && Array.isArray(errorData.errores)) {
          sunatErrors.push(...errorData.errores)
        }

        sunatErrors.push('Posibles causas:')
        sunatErrors.push('1. Credenciales SOL incorrectas en QPse')
        sunatErrors.push('2. RUC no dado de alta en SUNAT (espera 24-48 horas)')
        sunatErrors.push('3. Necesitas homologar en ambiente BETA antes de producción')
        sunatErrors.push('4. SUNAT puede estar en mantenimiento')

        errorMessage = sunatErrors.join(' | ')
      }
    }

    throw new Error(`Error al enviar a SUNAT: ${errorMessage}`)
  }
}

/**
 * Consulta el estado de un comprobante en QPse
 *
 * @param {string} nombreArchivo - Nombre del archivo
 * @param {string} token - Token de autenticación
 * @param {string} environment - Ambiente (demo/production)
 * @returns {Promise<Object>} Estado del comprobante
 */
async function consultarEstado(nombreArchivo, token, environment = 'demo') {
  try {
    const baseUrl = QPSE_BASE_URL[environment]

    console.log('🔍 Consultando estado en QPse...')

    const response = await axios.get(
      `${baseUrl}/api/cpe/consultar/${nombreArchivo}`,
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    )

    return response.data

  } catch (error) {
    console.error('❌ Error al consultar estado en QPse:', error.response?.data || error.message)
    throw new Error(`Error al consultar estado: ${error.response?.data?.message || error.message}`)
  }
}

/**
 * Flujo completo de emisión de comprobante vía QPse
 *
 * @param {string} xml - XML sin firmar
 * @param {string} ruc - RUC del emisor
 * @param {string} tipoDocumento - Tipo de documento (01=Factura, 03=Boleta)
 * @param {string} serie - Serie del documento
 * @param {number} correlativo - Número correlativo
 * @param {Object} config - Configuración de QPse
 * @returns {Promise<Object>} Resultado del envío
 */
export async function sendToQPse(xml, ruc, tipoDocumento, serie, correlativo, config, businessData) {
  try {
    console.log('🚀 Iniciando emisión vía QPse...')
    console.log(`RUC: ${ruc}`)
    console.log(`Documento: ${tipoDocumento}-${serie}-${correlativo}`)

    // 1. Obtener token
    const token = await obtenerToken(config)

    // 2. Intentar registrar la empresa (si no está registrada, la registra automáticamente)
    try {
      console.log('📝 Verificando registro de empresa en QPse...')
      await registrarEmpresa(ruc, businessData?.businessName || businessData?.name || 'Empresa', token, config.environment || 'demo')
    } catch (registroError) {
      // Si falla el registro pero no es porque ya existe, loguearlo pero continuar
      console.warn('⚠️ No se pudo verificar/registrar empresa:', registroError.message)
    }

    // 2. Construir nombre de archivo
    // Formato: RUC-TipoDoc-Serie-Correlativo (con 8 dígitos)
    // Ejemplo: 10469712228-03-B001-00000008
    const correlativoFormateado = String(correlativo).padStart(8, '0')
    const nombreArchivo = `${ruc}-${tipoDocumento}-${serie}-${correlativoFormateado}`

    // 3. Firmar XML
    const resultadoFirma = await firmarXML(
      nombreArchivo,
      xml,
      token,
      config.environment || 'demo'
    )

    console.log('🔍 Respuesta de firmar XML:', JSON.stringify(resultadoFirma, null, 2))

    // Validar que la firma fue exitosa
    if (!resultadoFirma.xml && !resultadoFirma.xml_firmado && !resultadoFirma.contenido_xml_firmado) {
      console.error('❌ Campos en respuesta:', Object.keys(resultadoFirma))
      throw new Error('QPse no devolvió XML firmado')
    }

    // El campo puede venir como xml, xml_firmado o contenido_xml_firmado
    const xmlFirmado = resultadoFirma.xml || resultadoFirma.xml_firmado || resultadoFirma.contenido_xml_firmado

    // 4. Intentar enviar a SUNAT
    let resultadoEnvio
    let envioFallido = false
    let errorEnvio = null

    try {
      resultadoEnvio = await enviarASunat(
        nombreArchivo,
        xmlFirmado,
        token,
        config.environment || 'demo'
      )
    } catch (errorEnvioSunat) {
      // Si falla el envío automático, guardamos el error pero continuamos
      // para poder devolver el XML firmado
      envioFallido = true
      errorEnvio = errorEnvioSunat
      console.warn('⚠️ El envío automático a SUNAT falló, pero el XML está firmado y disponible en QPse')
      console.warn('Error:', errorEnvio.message)
    }

    // 5. Si el envío automático falló, devolver información del XML firmado
    if (envioFallido) {
      return {
        accepted: false,
        responseCode: 'PENDING_MANUAL',
        description: 'El documento fue firmado correctamente pero el envío automático a SUNAT falló. Puedes descargarlo desde tu panel de QPse y enviarlo manualmente.',
        notes: errorEnvio?.message || 'Error al conectar con SUNAT',

        // Información del documento firmado
        xmlFirmado: xmlFirmado,
        nombreArchivo: nombreArchivo,
        ticket: resultadoFirma.external_id || '',
        hash: resultadoFirma.hash || resultadoFirma.codigo_hash || '',

        // URLs de QPse (si están disponibles)
        xmlUrl: `https://${config.environment === 'production' ? 'cpe' : 'demo-cpe'}.qpse.pe/consultar/${nombreArchivo}`,

        rawResponse: {
          firma: resultadoFirma,
          envioError: errorEnvio?.message
        }
      }
    }

    // 6. Si el envío fue exitoso, parsear respuesta
    console.log('🔍 Respuesta completa de SUNAT vía QPse:', JSON.stringify(resultadoEnvio, null, 2))

    const resultado = parseQPseResponse(resultadoEnvio)

    console.log(`✅ Emisión completada - Estado: ${resultado.accepted ? 'ACEPTADO' : 'RECHAZADO'}`)
    if (!resultado.accepted) {
      console.log(`❌ Código de error: ${resultado.responseCode}`)
      console.log(`❌ Descripción: ${resultado.description}`)
      console.log(`❌ Notas: ${resultado.notes}`)
    }

    return resultado

  } catch (error) {
    console.error('❌ Error en emisión vía QPse:', error)
    throw error
  }
}

/**
 * Parsea la respuesta de QPse a un formato estándar
 *
 * @param {Object} qpseResponse - Respuesta de QPse
 * @returns {Object} Respuesta parseada
 */
function parseQPseResponse(qpseResponse) {
  console.log('🔍 Parseando respuesta de QPse:', JSON.stringify(qpseResponse, null, 2))

  // Verificar si la respuesta está vacía o es inválida
  if (!qpseResponse || Object.keys(qpseResponse).length === 0) {
    console.error('❌ Respuesta de QPse está vacía o inválida')
    return {
      accepted: false,
      responseCode: 'ERROR',
      description: 'No se recibió respuesta válida de SUNAT',
      notes: '',
      ticket: '',
      cdrUrl: '',
      xmlUrl: '',
      pdfUrl: '',
      rawResponse: qpseResponse
    }
  }

  // Estructura esperada de respuesta de QPse (ajustar según documentación real)
  const responseCode = qpseResponse.codigo || qpseResponse.code || qpseResponse.responseCode || qpseResponse.codigo_sunat || ''
  const description = qpseResponse.descripcion || qpseResponse.description || qpseResponse.mensaje || qpseResponse.mensaje_sunat || ''
  const accepted = qpseResponse.aceptado || qpseResponse.accepted || qpseResponse.success || responseCode === '0' || responseCode === '0000'

  return {
    accepted: accepted,
    responseCode: responseCode,
    description: description,
    notes: qpseResponse.observaciones || qpseResponse.notes || qpseResponse.nota || '',

    // Datos adicionales de QPse
    ticket: qpseResponse.ticket || '',
    cdrUrl: qpseResponse.url_cdr || qpseResponse.cdrUrl || '',
    xmlUrl: qpseResponse.url_xml || qpseResponse.xmlUrl || '',
    pdfUrl: qpseResponse.url_pdf || qpseResponse.pdfUrl || '',

    // Respuesta completa para debugging
    rawResponse: qpseResponse
  }
}

/**
 * Registra una nueva empresa en QPse
 *
 * @param {string} ruc - RUC de la empresa
 * @param {string} razonSocial - Razón social de la empresa
 * @param {string} token - Token de autenticación
 * @param {string} environment - Ambiente (demo/production)
 * @returns {Promise<Object>} Resultado del registro
 */
export async function registrarEmpresa(ruc, razonSocial, token, environment = 'demo') {
  try {
    const baseUrl = QPSE_BASE_URL[environment]

    console.log(`📝 Registrando empresa en QPse: ${ruc} - ${razonSocial}`)

    const response = await axios.post(
      `${baseUrl}/api/empresa/crear`,
      {
        ruc: ruc,
        razon_social: razonSocial
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    )

    console.log('✅ Empresa registrada en QPse')
    return response.data

  } catch (error) {
    // Si la empresa ya existe, no es un error crítico
    if (error.response?.status === 409 || error.response?.data?.message?.includes('ya existe')) {
      console.log('ℹ️ Empresa ya registrada en QPse')
      return { success: true, message: 'Empresa ya registrada' }
    }

    console.error('❌ Error al registrar empresa en QPse:', error.response?.data || error.message)
    throw new Error(`Error al registrar empresa: ${error.response?.data?.message || error.message}`)
  }
}

export { obtenerToken, consultarEstado }
