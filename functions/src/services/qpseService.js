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

    console.log('🔏 [FIRMAR] Firmando XML con QPse...')
    console.log(`[FIRMAR] URL: ${baseUrl}/api/cpe/generar`)
    console.log(`[FIRMAR] Nombre archivo: ${nombreArchivo}`)
    console.log(`[FIRMAR] Tamaño XML: ${xmlContent.length} caracteres`)
    console.log(`[FIRMAR] Tamaño Base64: ${xmlBase64.length} caracteres`)
    console.log(`[FIRMAR] Token (primeros 20): ${token?.substring(0, 20)}...`)

    const requestBody = {
      tipo_integracion: 0,
      xml_filename: nombreArchivo,
      xml_content_base64: xmlBase64
    }
    console.log('[FIRMAR] Request body keys:', Object.keys(requestBody))

    const response = await axios.post(
      `${baseUrl}/api/cpe/generar`,
      requestBody,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    )

    console.log('[FIRMAR] Response status:', response.status)
    console.log('[FIRMAR] Response data:', JSON.stringify(response.data, null, 2))

    if (!response.data) {
      throw new Error('QPse no devolvió respuesta al firmar XML')
    }

    console.log('✅ [FIRMAR] XML firmado exitosamente')
    console.log('[FIRMAR] Campos en respuesta:', Object.keys(response.data))
    return response.data

  } catch (error) {
    console.error('❌ Error al firmar XML con QPse:')
    console.error('Status:', error.response?.status)
    console.error('Data completa:', JSON.stringify(error.response?.data, null, 2))
    console.error('Headers:', JSON.stringify(error.response?.headers, null, 2))
    console.error('Message:', error.message)

    // Extraer mensaje de error más específico
    const errorData = error.response?.data
    let errorMessage = error.message

    if (errorData) {
      if (errorData.errors && Array.isArray(errorData.errors)) {
        errorMessage = `QPse errors: ${errorData.errors.join(', ')}`
      } else if (errorData.errores && Array.isArray(errorData.errores)) {
        errorMessage = `QPse errores: ${errorData.errores.join(', ')}`
      } else if (errorData.mensaje) {
        errorMessage = errorData.mensaje
      } else if (errorData.message) {
        errorMessage = errorData.message
      } else if (typeof errorData === 'string') {
        errorMessage = errorData
      }
    }

    throw new Error(`Error al firmar con QPse: ${errorMessage}`)
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

    console.log('📤 [ENVIAR] Enviando XML a SUNAT vía QPse...')
    console.log(`[ENVIAR] URL: ${baseUrl}/api/cpe/enviar`)
    console.log(`[ENVIAR] Nombre archivo: ${nombreArchivo}`)
    console.log(`[ENVIAR] Tamaño XML firmado Base64: ${xmlFirmadoBase64?.length} caracteres`)
    console.log(`[ENVIAR] Token (primeros 20): ${token?.substring(0, 20)}...`)

    const requestBody = {
      xml_filename: nombreArchivo,
      xml_signed_base64: xmlFirmadoBase64
    }
    console.log('[ENVIAR] Request body keys:', Object.keys(requestBody))

    const response = await axios.post(
      `${baseUrl}/api/cpe/enviar`,
      requestBody,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    )

    console.log('[ENVIAR] Response status:', response.status)
    console.log('[ENVIAR] Response data:', JSON.stringify(response.data, null, 2))

    if (!response.data) {
      throw new Error('QPse no devolvió respuesta al enviar a SUNAT')
    }

    console.log('✅ [ENVIAR] Enviado a SUNAT exitosamente')
    console.log('[ENVIAR] Campos en respuesta:', Object.keys(response.data))
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

    // 6. Si el envío fue exitoso, parsear respuesta inicial
    console.log('🔍 Respuesta completa de SUNAT vía QPse:', JSON.stringify(resultadoEnvio, null, 2))

    let resultado = parseQPseResponse(resultadoEnvio)

    console.log(`📝 Estado inicial tras envío: ${resultado.accepted ? 'ACEPTADO' : 'RECHAZADO'}`)

    // 7. IMPORTANTE: Para documentos con ticket (GRE, Comunicación de Baja, etc.)
    // SIEMPRE debemos consultar getStatus para obtener la respuesta real de SUNAT
    // El código 0 del envío solo significa "ticket obtenido", no "aceptado por SUNAT"
    const tieneTicket = resultado.ticket || resultadoEnvio.ticket || resultadoEnvio.numero_ticket
    const necesitaConsultarEstado = tieneTicket || resultado.accepted || (!resultado.cdrUrl && !resultado.cdrData)

    if (necesitaConsultarEstado) {
      console.log('📄 Consultando estado final en SUNAT (getStatus)...')

      // Reintentar hasta 5 veces con espera incremental para dar tiempo a SUNAT
      for (let intento = 1; intento <= 5; intento++) {
        try {
          // Esperar antes de consultar (2s, 3s, 4s, 5s, 6s)
          const tiempoEspera = 1000 + (intento * 1000)
          console.log(`⏳ Intento ${intento}/5 - Esperando ${tiempoEspera}ms...`)
          await new Promise(resolve => setTimeout(resolve, tiempoEspera))

          const estadoConsulta = await consultarEstado(nombreArchivo, token, config.environment || 'demo')
          console.log(`📋 Estado consultado (intento ${intento}):`, JSON.stringify(estadoConsulta, null, 2))

          // CRÍTICO: Verificar si SUNAT rechazó el documento en getStatus
          const codigoEstado = estadoConsulta.codigo || estadoConsulta.code || estadoConsulta.estado || ''
          const mensajeEstado = estadoConsulta.mensaje || estadoConsulta.descripcion || estadoConsulta.message || ''

          // Si el código NO es 0, SUNAT rechazó el documento
          if (codigoEstado && codigoEstado !== '0' && codigoEstado !== '0000' && codigoEstado !== 0) {
            console.log(`❌ SUNAT rechazó el documento en getStatus`)
            console.log(`❌ Código: ${codigoEstado}`)
            console.log(`❌ Mensaje: ${mensajeEstado}`)

            // Actualizar resultado como RECHAZADO
            resultado.accepted = false
            resultado.responseCode = codigoEstado
            resultado.description = mensajeEstado
            resultado.notes = estadoConsulta.observaciones || estadoConsulta.errores?.join(' | ') || ''
            break
          }

          // Si SUNAT aceptó (código 0), actualizar URLs
          // IMPORTANTE: Solo marcar como aceptado si el código es 0, o si no hay código pero sunat_success es true
          const esCodigoAceptado = codigoEstado === '0' || codigoEstado === '0000' || codigoEstado === 0
          const sinCodigoPeroExitoso = !codigoEstado && estadoConsulta.sunat_success === true
          if (esCodigoAceptado || sinCodigoPeroExitoso) {
            resultado.accepted = true
            console.log(`✅ SUNAT aceptó el documento`)
          }

          // Actualizar URLs si están disponibles en la consulta
          if (estadoConsulta.url_cdr && !resultado.cdrUrl) {
            resultado.cdrUrl = estadoConsulta.url_cdr
            console.log(`✅ CDR URL obtenida: ${resultado.cdrUrl}`)
          }
          if (estadoConsulta.url_xml && !resultado.xmlUrl) {
            resultado.xmlUrl = estadoConsulta.url_xml
            console.log(`✅ XML URL obtenida: ${resultado.xmlUrl}`)
          }
          if (estadoConsulta.url_pdf && !resultado.pdfUrl) {
            resultado.pdfUrl = estadoConsulta.url_pdf
            console.log(`✅ PDF URL obtenida: ${resultado.pdfUrl}`)
          }

          // NUEVO: También buscar CDR como contenido directo en consultarEstado.
          // QPse a veces devuelve el CDR base64 en estadoConsulta.cdr (no solo url_cdr).
          // Crítico para GRE: el enviarASunat inicial NO trae cdr para guías (devuelve
          // solo ticket), por lo que sin este check el CDR nunca queda guardado.
          if (!resultado.cdrData) {
            const cdrFromQuery = estadoConsulta.cdr || estadoConsulta.cdr_base64 ||
              estadoConsulta.cdr_content || estadoConsulta.contenido_cdr ||
              estadoConsulta.cdr_xml || ''
            if (cdrFromQuery) {
              let cdrText = cdrFromQuery
              // Decodificar base64 si empieza con PD94 (= <?xml en base64)
              if (typeof cdrText === 'string' && cdrText.startsWith('PD94')) {
                try {
                  cdrText = Buffer.from(cdrText, 'base64').toString('utf-8')
                  console.log('✅ CDR (contenido directo) decodificado de base64 durante polling')
                } catch (e) {
                  console.warn('⚠️ Error decodificando CDR base64 del polling:', e.message)
                }
              }
              resultado.cdrData = cdrText
              console.log(`✅ CDR contenido directo obtenido durante polling (${cdrText.length} chars)`)
            }
          }

          // También actualizar hash si no lo teníamos
          if ((estadoConsulta.hash || estadoConsulta.codigo_hash) && !resultado.hash) {
            resultado.hash = estadoConsulta.hash || estadoConsulta.codigo_hash
          }

          // Si ya tenemos respuesta definitiva (aceptado con CDR — URL o data — o rechazado), salir
          if ((resultado.accepted && (resultado.cdrUrl || resultado.cdrData)) || !resultado.accepted) {
            break
          }
        } catch (consultaError) {
          console.warn(`⚠️ Error en consulta (intento ${intento}):`, consultaError.message)
        }
      }

      if (resultado.accepted && !resultado.cdrUrl && !resultado.cdrData) {
        console.warn('⚠️ Documento aceptado pero CDR aún no disponible en QPse después de 5 intentos. Puede consultarse luego.')
      }
    }

    // Log estado final
    console.log(`✅ Emisión completada - Estado FINAL: ${resultado.accepted ? 'ACEPTADO' : 'RECHAZADO'}`)
    if (!resultado.accepted) {
      console.log(`❌ Código de error: ${resultado.responseCode}`)
      console.log(`❌ Descripción: ${resultado.description}`)
      console.log(`❌ Notas: ${resultado.notes}`)
    }

    // 8. Log si no tenemos URLs de CDR/XML/PDF
    if (resultado.accepted) {
      if (!resultado.cdrUrl) {
        console.warn('⚠️ QPse no devolvió URL de CDR')
      }
      if (!resultado.xmlUrl) {
        console.warn('⚠️ QPse no devolvió URL de XML')
      }
      if (!resultado.pdfUrl) {
        console.warn('⚠️ QPse no devolvió URL de PDF')
      }
    }

    // 9. IMPORTANTE: Incluir el XML firmado para guardarlo en Storage
    // Esto permite tener el XML original firmado siempre disponible
    resultado.xmlFirmado = xmlFirmado
    resultado.nombreArchivo = nombreArchivo

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
  const responseCode = qpseResponse.codigo || qpseResponse.code || qpseResponse.responseCode || qpseResponse.codigo_sunat || qpseResponse.estado || ''
  const description = qpseResponse.descripcion || qpseResponse.description || qpseResponse.mensaje || qpseResponse.message || qpseResponse.mensaje_sunat || ''

  // IMPORTANTE: QPse devuelve:
  // - success: true/false = si la petición HTTP fue exitosa
  // - sunat_success: true/false = si SUNAT aceptó el comprobante
  // Debemos verificar sunat_success, NO success
  // CRÍTICO: Si hay un responseCode específico (diferente de 0), ese tiene prioridad sobre sunat_success
  const esCodigoAceptado = responseCode === '0' || responseCode === '0000' || String(responseCode).startsWith('4')
  const esCodigoRechazado = responseCode && !esCodigoAceptado && responseCode !== ''
  const sinCodigoPeroExitoso = !responseCode && qpseResponse.sunat_success === true
  const accepted = esCodigoAceptado || (!esCodigoRechazado && sinCodigoPeroExitoso)

  // Extraer notas/observaciones de los errores de SUNAT
  let notes = qpseResponse.observaciones || qpseResponse.notes || qpseResponse.nota || ''
  if (!notes && qpseResponse.errores && Array.isArray(qpseResponse.errores)) {
    notes = qpseResponse.errores.join(' | ')
  }

  // Buscar CDR en múltiples campos posibles (URL o contenido base64)
  const cdrUrl = qpseResponse.url_cdr || qpseResponse.cdrUrl || qpseResponse.cdr_url ||
                 qpseResponse.enlace_cdr || qpseResponse.link_cdr || ''

  // QPse devuelve el CDR directamente en el campo "cdr" como base64
  let cdrData = qpseResponse.cdr || qpseResponse.cdr_base64 || qpseResponse.cdr_content ||
                qpseResponse.contenido_cdr || qpseResponse.cdr_xml || ''

  // Log para debugging
  if (accepted) {
    console.log('🔍 Campos disponibles en respuesta QPse:', Object.keys(qpseResponse))
    if (cdrUrl) console.log('✅ CDR URL encontrada:', cdrUrl)
    if (cdrData) {
      console.log('✅ CDR encontrado como contenido directo (longitud):', cdrData.length)
      // Decodificar base64 si es necesario (QPse lo envía en base64)
      if (cdrData.startsWith('PD94')) {
        // Es base64 (PD94 = <?xml en base64)
        try {
          cdrData = Buffer.from(cdrData, 'base64').toString('utf-8')
          console.log('✅ CDR decodificado de base64 exitosamente')
        } catch (e) {
          console.warn('⚠️ Error decodificando CDR base64:', e.message)
        }
      }
    }
    if (!cdrUrl && !cdrData) {
      console.warn('⚠️ No se encontró CDR en la respuesta')
    }
  }

  return {
    accepted: accepted,
    responseCode: responseCode,
    description: description,
    notes: notes,

    // Datos adicionales de QPse
    ticket: qpseResponse.ticket || '',
    cdrUrl: cdrUrl,
    cdrData: cdrData, // CDR como contenido base64/XML
    xmlUrl: qpseResponse.url_xml || qpseResponse.xmlUrl || qpseResponse.xml_url || '',
    pdfUrl: qpseResponse.url_pdf || qpseResponse.pdfUrl || qpseResponse.pdf_url || '',
    hash: qpseResponse.hash || qpseResponse.codigo_hash || qpseResponse.digest_value || '',

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

/**
 * Anula una factura vía QPse usando Comunicación de Baja (VoidedDocuments)
 *
 * Las facturas usan Comunicación de Baja (RA-) a diferencia de las boletas
 * que usan Resumen Diario (RC-).
 *
 * @param {string} voidedXml - XML de Comunicación de Baja sin firmar
 * @param {string} ruc - RUC del emisor
 * @param {string} voidedId - ID de la comunicación (RA-YYYYMMDD-correlativo)
 * @param {Object} config - Configuración de QPse
 * @returns {Promise<Object>} Resultado de la anulación
 */
export async function voidInvoiceViaQPse(voidedXml, ruc, voidedId, config) {
  try {
    console.log('==========================================')
    console.log('🗑️ [QPSE VOID] INICIANDO ANULACIÓN DE FACTURA')
    console.log('==========================================')
    console.log(`RUC: ${ruc}`)
    console.log(`Comunicación de Baja ID: ${voidedId}`)
    console.log(`Ambiente: ${config.environment || 'demo'}`)
    console.log(`Usuario QPse: ${config.usuario}`)
    console.log('XML a firmar (primeros 500 chars):', voidedXml?.substring(0, 500))

    // 1. Obtener token
    console.log('📡 [PASO 1] Obteniendo token de QPse...')
    const token = await obtenerToken(config)
    console.log('✅ [PASO 1] Token obtenido:', token ? `${token.substring(0, 20)}...` : 'NULL')

    // 2. Construir nombre de archivo para la Comunicación de Baja
    // Formato: RUC-RA-YYYYMMDD-correlativo
    // Ejemplo: 10417844398-RA-20241211-1
    const nombreArchivo = `${ruc}-${voidedId}`
    console.log(`📄 Nombre archivo: ${nombreArchivo}`)

    // 3. Firmar XML de Comunicación de Baja
    console.log('🔏 [PASO 2] Firmando XML con QPse...')
    const resultadoFirma = await firmarXML(
      nombreArchivo,
      voidedXml,
      token,
      config.environment || 'demo'
    )

    console.log('✅ [PASO 2] Respuesta de firmar XML:', JSON.stringify(resultadoFirma, null, 2))
    console.log('📋 [PASO 2] Campos disponibles:', Object.keys(resultadoFirma))

    // Validar que la firma fue exitosa
    if (!resultadoFirma.xml && !resultadoFirma.xml_firmado && !resultadoFirma.contenido_xml_firmado) {
      console.error('❌ [PASO 2] QPse NO devolvió XML firmado!')
      console.error('❌ [PASO 2] Campos en respuesta:', Object.keys(resultadoFirma))
      throw new Error('QPse no devolvió XML firmado')
    }

    const xmlFirmado = resultadoFirma.xml || resultadoFirma.xml_firmado || resultadoFirma.contenido_xml_firmado
    console.log('✅ [PASO 2] XML firmado obtenido, longitud:', xmlFirmado?.length)

    // 4. Enviar a SUNAT (devuelve ticket porque es asíncrono)
    console.log('📤 [PASO 3] Enviando Comunicación de Baja a SUNAT vía QPse...')
    let resultadoEnvio
    try {
      resultadoEnvio = await enviarASunat(
        nombreArchivo,
        xmlFirmado,
        token,
        config.environment || 'demo'
      )
    } catch (errorEnvio) {
      console.error('❌ [PASO 3] Error al enviar Comunicación de Baja a SUNAT:', errorEnvio.message)
      return {
        accepted: false,
        responseCode: 'ERROR_ENVIO',
        description: 'Error al enviar la Comunicación de Baja a SUNAT',
        notes: errorEnvio.message,
        nombreArchivo: nombreArchivo,
        xmlFirmado: xmlFirmado
      }
    }

    console.log('✅ [PASO 3] Respuesta de enviar a SUNAT:', JSON.stringify(resultadoEnvio, null, 2))
    console.log('📋 [PASO 3] Campos en respuesta:', Object.keys(resultadoEnvio || {}))

    // 5. Obtener el ticket para consulta posterior
    const ticket = resultadoEnvio.ticket || resultadoEnvio.numero_ticket || resultadoEnvio.nroTicket || ''
    console.log(`🎫 [PASO 3] Ticket extraído: "${ticket}"`)

    if (!ticket) {
      console.warn('⚠️ [PASO 3] NO se recibió ticket de SUNAT - Campos disponibles:', Object.keys(resultadoEnvio || {}))
    }

    // 6. Esperar y consultar estado (la Comunicación de Baja es asíncrona)
    let estadoFinal = null
    if (ticket) {
      console.log(`🎫 [PASO 4] Ticket recibido: ${ticket}`)
      console.log('⏳ Esperando respuesta de SUNAT...')

      // Esperar un poco antes de consultar (SUNAT necesita tiempo para procesar)
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Intentar consultar el estado hasta 3 veces (reducido para respuesta más rápida)
      for (let intento = 1; intento <= 3; intento++) {
        try {
          console.log(`🔍 Intento ${intento}/3 - Consultando estado del ticket...`)
          estadoFinal = await consultarEstado(nombreArchivo, token, config.environment || 'demo')
          console.log(`📋 Estado recibido:`, JSON.stringify(estadoFinal, null, 2))

          // Si ya tenemos respuesta definitiva, salir del bucle
          const codigo = estadoFinal.codigo || estadoFinal.code || estadoFinal.estado || ''
          if (codigo === '0' || codigo === '0000' || estadoFinal.sunat_success === true) {
            console.log('✅ SUNAT aceptó la anulación')
            break
          } else if (codigo && codigo !== '98' && codigo !== '99' && codigo !== 'PROCESANDO') {
            // Si hay un código de error diferente a "procesando/pendiente", salir
            console.log(`❌ SUNAT rechazó con código: ${codigo}`)
            break
          }

          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (errorConsulta) {
          console.warn(`⚠️ Error en consulta (intento ${intento}):`, errorConsulta.message)
          if (intento < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
      }
    }

    // 7. Parsear respuesta final
    console.log('📊 [PASO 5] Parseando respuesta final...')
    console.log('📊 estadoFinal:', JSON.stringify(estadoFinal, null, 2))
    console.log('📊 resultadoEnvio.codigo:', resultadoEnvio?.codigo)

    // Determinar el código de respuesta real
    let responseCode = estadoFinal?.codigo || estadoFinal?.code || resultadoEnvio?.codigo

    // Si no hay código pero hay ticket, es que está pendiente (98)
    // Si no hay código NI ticket, es un error
    if (!responseCode) {
      if (ticket) {
        responseCode = '98' // Pendiente con ticket válido
        console.log('📊 Usando código 98 porque hay ticket pero no hay código de respuesta')
      } else {
        responseCode = 'NO_RESPONSE'
        console.log('📊 Usando código NO_RESPONSE porque no hay ticket ni código')
      }
    }

    const accepted = responseCode === '0' || responseCode === '0000' || estadoFinal?.sunat_success === true
    const description = estadoFinal?.descripcion || estadoFinal?.description || resultadoEnvio?.descripcion ||
      (accepted ? 'Factura anulada correctamente' : (responseCode === '98' ? 'Pendiente de confirmación de SUNAT' : 'Sin respuesta de SUNAT'))

    console.log('==========================================')
    console.log('📊 [RESULTADO FINAL]')
    console.log('==========================================')
    console.log(`Accepted: ${accepted}`)
    console.log(`ResponseCode: ${responseCode}`)
    console.log(`Ticket: ${ticket}`)
    console.log(`Description: ${description}`)

    return {
      accepted: accepted,
      responseCode: responseCode,
      description: description,
      notes: estadoFinal?.observaciones || estadoFinal?.errores?.join(' | ') || '',
      ticket: ticket,
      nombreArchivo: nombreArchivo,
      xmlFirmado: xmlFirmado,
      cdrUrl: estadoFinal?.url_cdr || '',
      rawResponse: {
        firma: resultadoFirma,
        envio: resultadoEnvio,
        estado: estadoFinal
      }
    }

  } catch (error) {
    console.error('==========================================')
    console.error('❌ [QPSE VOID] ERROR EN ANULACIÓN DE FACTURA')
    console.error('==========================================')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    throw error
  }
}

/**
 * Anula una boleta vía QPse usando Resumen Diario (SummaryDocuments)
 *
 * Las boletas no pueden usar Comunicación de Baja como las facturas.
 * Se debe enviar un Resumen Diario con ConditionCode 3 (Anular).
 *
 * @param {string} summaryXml - XML del Resumen Diario sin firmar
 * @param {string} ruc - RUC del emisor
 * @param {string} summaryId - ID del resumen (RC-YYYYMMDD-correlativo)
 * @param {Object} config - Configuración de QPse
 * @returns {Promise<Object>} Resultado de la anulación
 */
export async function voidBoletaViaQPse(summaryXml, ruc, summaryId, config) {
  try {
    console.log('🗑️ Iniciando anulación de boleta vía QPse...')
    console.log(`RUC: ${ruc}`)
    console.log(`Resumen ID: ${summaryId}`)

    // 1. Obtener token
    const token = await obtenerToken(config)

    // 2. Construir nombre de archivo para el Resumen Diario
    // Formato: RUC-RC-YYYYMMDD-correlativo
    // Ejemplo: 10417844398-RC-20241211-1
    const nombreArchivo = `${ruc}-${summaryId}`
    console.log(`📄 Nombre archivo: ${nombreArchivo}`)

    // 3. Firmar XML del Resumen Diario
    const resultadoFirma = await firmarXML(
      nombreArchivo,
      summaryXml,
      token,
      config.environment || 'demo'
    )

    console.log('🔍 Respuesta de firmar XML:', JSON.stringify(resultadoFirma, null, 2))

    // Validar que la firma fue exitosa
    if (!resultadoFirma.xml && !resultadoFirma.xml_firmado && !resultadoFirma.contenido_xml_firmado) {
      console.error('❌ Campos en respuesta:', Object.keys(resultadoFirma))
      throw new Error('QPse no devolvió XML firmado')
    }

    const xmlFirmado = resultadoFirma.xml || resultadoFirma.xml_firmado || resultadoFirma.contenido_xml_firmado

    // 4. Enviar a SUNAT (devuelve ticket porque es asíncrono)
    let resultadoEnvio
    try {
      resultadoEnvio = await enviarASunat(
        nombreArchivo,
        xmlFirmado,
        token,
        config.environment || 'demo'
      )
    } catch (errorEnvio) {
      console.error('❌ Error al enviar Resumen Diario a SUNAT:', errorEnvio.message)
      return {
        accepted: false,
        responseCode: 'ERROR_ENVIO',
        description: 'Error al enviar el Resumen Diario a SUNAT',
        notes: errorEnvio.message,
        nombreArchivo: nombreArchivo,
        xmlFirmado: xmlFirmado
      }
    }

    console.log('🔍 Respuesta de enviar a SUNAT:', JSON.stringify(resultadoEnvio, null, 2))

    // 5. Obtener el ticket para consulta posterior
    const ticket = resultadoEnvio.ticket || resultadoEnvio.numero_ticket || resultadoEnvio.nroTicket || ''

    if (!ticket) {
      console.warn('⚠️ No se recibió ticket de SUNAT')
    }

    // 6. Esperar y consultar estado (el Resumen Diario es asíncrono)
    let estadoFinal = null
    if (ticket) {
      console.log(`🎫 Ticket recibido: ${ticket}`)
      console.log('⏳ Esperando respuesta de SUNAT...')

      // Esperar un poco antes de consultar (SUNAT necesita tiempo para procesar)
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Intentar consultar el estado hasta 3 veces (reducido para respuesta más rápida)
      for (let intento = 1; intento <= 3; intento++) {
        try {
          console.log(`🔍 Intento ${intento}/3 - Consultando estado del ticket...`)
          estadoFinal = await consultarEstado(nombreArchivo, token, config.environment || 'demo')
          console.log(`📋 Estado recibido:`, JSON.stringify(estadoFinal, null, 2))

          // Si ya tenemos respuesta definitiva, salir del bucle
          const codigo = estadoFinal.codigo || estadoFinal.code || estadoFinal.estado || ''
          if (codigo === '0' || codigo === '0000' || estadoFinal.sunat_success === true) {
            console.log('✅ SUNAT aceptó la anulación')
            break
          } else if (codigo && codigo !== '98' && codigo !== '99' && codigo !== 'PROCESANDO') {
            // Si hay un código de error diferente a "procesando/pendiente", salir
            console.log(`❌ SUNAT rechazó con código: ${codigo}`)
            break
          }

          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (errorConsulta) {
          console.warn(`⚠️ Error en consulta (intento ${intento}):`, errorConsulta.message)
          if (intento < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
      }
    }

    // 7. Parsear respuesta final
    const responseCode = estadoFinal?.codigo || estadoFinal?.code || resultadoEnvio.codigo || '98'
    const accepted = responseCode === '0' || responseCode === '0000' || estadoFinal?.sunat_success === true
    const description = estadoFinal?.descripcion || estadoFinal?.description || resultadoEnvio.descripcion ||
      (accepted ? 'Boleta anulada correctamente' : 'Pendiente de confirmación de SUNAT')

    return {
      accepted: accepted,
      responseCode: responseCode,
      description: description,
      notes: estadoFinal?.observaciones || estadoFinal?.errores?.join(' | ') || '',
      ticket: ticket,
      nombreArchivo: nombreArchivo,
      xmlFirmado: xmlFirmado,
      cdrUrl: estadoFinal?.url_cdr || '',
      rawResponse: {
        firma: resultadoFirma,
        envio: resultadoEnvio,
        estado: estadoFinal
      }
    }

  } catch (error) {
    console.error('❌ Error en anulación de boleta vía QPse:', error)
    throw error
  }
}

export { obtenerToken, consultarEstado }
