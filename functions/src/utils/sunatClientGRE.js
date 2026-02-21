import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import JSZip from 'jszip'

/**
 * Cliente para comunicación con SUNAT via SOAP Web Services
 * ESPECÍFICO para Guías de Remisión Electrónica (GRE)
 *
 * IMPORTANTE: Este archivo es INDEPENDIENTE de sunatClient.js
 * Los endpoints de GRE son DIFERENTES a los de facturas/boletas
 *
 * SUNAT proporciona dos ambientes:
 * - Beta (Homologación): Para pruebas
 * - Producción: Para documentos reales
 *
 * Referencias:
 * - Guía de servicios web GRE: https://cpe.sunat.gob.pe/landing/guia-de-remision-electronica-gre
 * - Manual: https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual_Servicios_GRE.pdf
 */

// URLs de SUNAT para GRE - SON DIFERENTES A FACTURAS
const SUNAT_GRE_URLS = {
  beta: 'https://e-beta.sunat.gob.pe/ol-ti-itemision-guia-gem-beta/billService',
  production: 'https://e-guiaremision.sunat.gob.pe/ol-ti-itemision-guia-gem/billService'
}

/**
 * Envía XML firmado de Guía de Remisión a SUNAT
 *
 * @param {string} signedXML - XML firmado de la guía de remisión
 * @param {Object} config - Configuración de envío
 * @param {string} config.ruc - RUC del emisor
 * @param {string} config.solUser - Usuario SOL
 * @param {string} config.solPassword - Contraseña SOL
 * @param {string} config.environment - 'beta' o 'production'
 * @param {string} config.series - Serie de la guía (ej: T001)
 * @param {number} config.number - Número correlativo
 * @returns {Promise<Object>} Resultado del envío
 */
export async function sendDispatchGuideToSunat(signedXML, config) {
  try {
    const { ruc, solUser, solPassword, environment, series, number } = config

    // Determinar URL según ambiente - USAR ENDPOINTS DE GRE
    const url = environment === 'production' ? SUNAT_GRE_URLS.production : SUNAT_GRE_URLS.beta

    console.log(`🚛 [GRE] Endpoint SUNAT: ${url}`)

    // Nombre del archivo ZIP para GRE
    // Formato: RUC-09-Serie-Numero (09 = Guía de Remisión Remitente)
    const docTypeCode = '09' // Guía de Remisión Remitente
    const fileName = `${ruc}-${docTypeCode}-${series}-${String(number).padStart(8, '0')}`

    console.log(`📄 [GRE] Nombre archivo: ${fileName}`)

    // Comprimir XML en ZIP (SUNAT requiere XML dentro de ZIP)
    const zipContent = await createZipWithXML(signedXML, `${fileName}.xml`)

    // Convertir ZIP a base64
    const zipBase64 = Buffer.from(zipContent).toString('base64')

    // Crear SOAP envelope
    const soapEnvelope = createSoapEnvelopeGRE(fileName, zipBase64, ruc, solUser, solPassword)

    // Enviar a SUNAT
    console.log('📤 [GRE] Enviando guía de remisión a SUNAT...')

    const response = await axios.post(url, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:sendBill'
      },
      timeout: 60000 // 60 segundos timeout
    })

    console.log('✅ [GRE] Respuesta recibida de SUNAT')
    console.log('📄 [GRE] Primeros 500 chars de respuesta:', response.data.substring(0, 500))

    // Parsear respuesta SOAP
    const result = await parseSunatResponseGRE(response.data)

    return result

  } catch (error) {
    console.error('❌ [GRE] Error al comunicarse con SUNAT:', error.message)

    // Si es error de axios con respuesta, parsearlo
    if (error.response) {
      console.log('📊 [GRE] Status:', error.response.status)
      console.log('📊 [GRE] Headers:', JSON.stringify(error.response.headers, null, 2))
      console.log('📄 [GRE] Respuesta XML de SUNAT (error):')
      console.log(typeof error.response.data, error.response.data)

      if (error.response.data) {
        const errorResult = parseSunatErrorGRE(error.response.data)
        throw new Error(errorResult.description || 'Error al enviar GRE a SUNAT')
      }
    }

    throw new Error(`Error de conexión con SUNAT GRE: ${error.message}`)
  }
}

/**
 * Crea ZIP con el XML (SUNAT requiere XML comprimido)
 */
async function createZipWithXML(xmlContent, fileName) {
  try {
    const zip = new JSZip()
    zip.file(fileName, xmlContent)
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    console.log(`📦 [GRE] ZIP creado: ${fileName} (${zipBuffer.length} bytes)`)
    return zipBuffer
  } catch (error) {
    console.error('❌ [GRE] Error al crear ZIP:', error)
    throw new Error(`Error al comprimir XML GRE: ${error.message}`)
  }
}

/**
 * Escapa caracteres especiales para XML
 */
function escapeXml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Crea SOAP envelope para envío de GRE a SUNAT
 */
function createSoapEnvelopeGRE(fileName, zipBase64, ruc, solUser, solPassword) {
  // Usuario completo para SOL: RUC + Usuario
  const fullUser = `${ruc}${solUser}`

  // Log para debugging (sin mostrar contraseña completa)
  console.log(`🔑 [GRE] Credenciales SOL: usuario=${fullUser}, password=${solPassword ? `***${solPassword.slice(-3)}` : 'NO DEFINIDA'}`)

  // Escapar caracteres especiales en credenciales
  const escapedUser = escapeXml(fullUser)
  const escapedPassword = escapeXml(solPassword)

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ser="http://service.sunat.gob.pe"
                  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${escapedUser}</wsse:Username>
        <wsse:Password>${escapedPassword}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${fileName}.zip</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`
}

/**
 * Parsea respuesta exitosa de SUNAT para GRE
 */
async function parseSunatResponseGRE(soapResponse) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    })

    const parsed = parser.parse(soapResponse)

    // Navegar estructura SOAP
    const envelope = parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed.Envelope || parsed['soap-env:Envelope'] || parsed['S:Envelope']

    if (!envelope) {
      console.log('❌ [GRE] No se encontró SOAP Envelope. Keys:', Object.keys(parsed))
      throw new Error('No se pudo encontrar el SOAP Envelope en respuesta GRE')
    }

    const body = envelope['soap:Body'] || envelope['soapenv:Body'] || envelope.Body || envelope['soap-env:Body'] || envelope['S:Body']

    if (!body) {
      console.log('❌ [GRE] No se encontró SOAP Body. Envelope keys:', Object.keys(envelope))
      throw new Error('No se pudo encontrar el SOAP Body en respuesta GRE')
    }

    // Verificar si hay un SOAP Fault (error)
    const fault = body['soap-env:Fault'] || body['soap:Fault'] || body['soapenv:Fault'] || body.Fault || body['S:Fault']

    if (fault) {
      const faultcode = fault.faultcode || fault['faultcode'] || 'UNKNOWN'
      const faultstring = fault.faultstring || fault['faultstring'] || 'Error desconocido'

      console.log(`🚨 [GRE] SUNAT devolvió SOAP Fault: [${faultcode}] ${faultstring}`)

      return {
        accepted: false,
        code: faultcode,
        description: faultstring,
        observations: []
      }
    }

    // Respuesta de sendBill (SUNAT usa diferentes prefijos)
    const sendBillResponse = body['br:sendBillResponse'] ||
                             body['ns2:sendBillResponse'] ||
                             body['sendBillResponse'] ||
                             body['ns1:sendBillResponse']

    if (sendBillResponse?.applicationResponse) {
      // Decodificar CDR (Constancia de Recepción) - viene en un ZIP
      const cdrBase64 = sendBillResponse.applicationResponse
      const cdrZipBuffer = Buffer.from(cdrBase64, 'base64')

      // Descomprimir ZIP para obtener el XML del CDR
      const zip = new JSZip()
      const cdrZip = await zip.loadAsync(cdrZipBuffer)

      // El CDR está dentro del ZIP con nombre R-{RUC}-09-{serie}-{numero}.xml
      const cdrFileName = Object.keys(cdrZip.files).find(name => name.startsWith('R-') && name.endsWith('.xml'))

      if (!cdrFileName) {
        console.log('❌ [GRE] No se encontró el archivo CDR en el ZIP')
        console.log('📁 [GRE] Archivos en ZIP:', Object.keys(cdrZip.files))
        throw new Error('CDR no encontrado en la respuesta GRE')
      }

      console.log(`📄 [GRE] CDR encontrado: ${cdrFileName}`)

      const cdrXML = await cdrZip.files[cdrFileName].async('text')

      // Parsear CDR
      const cdr = parser.parse(cdrXML)

      // Extraer información del CDR
      const responseCode = cdr.ApplicationResponse?.['cbc:ResponseCode'] || '0'

      // El mensaje puede estar en diferentes lugares
      let description = cdr.ApplicationResponse?.['cbc:Note']

      // Buscar en DocumentResponse para obtener mensaje más específico
      const docResponse = cdr.ApplicationResponse?.['cac:DocumentResponse']
      if (docResponse) {
        const response = docResponse['cac:Response']
        if (response?.['cbc:Description']) {
          description = response['cbc:Description']
        }
      }

      // Si aún no hay descripción, usar default según el código
      if (!description) {
        description = responseCode === '0' || responseCode === 0
          ? 'Guía de Remisión aceptada por SUNAT'
          : `Guía de Remisión rechazada por SUNAT (código ${responseCode})`
      }

      // Código 0 = Aceptado
      const accepted = responseCode === '0' || responseCode === 0

      console.log(`📋 [GRE] CDR parseado: code=${responseCode}, accepted=${accepted}, description=${description}`)

      return {
        accepted,
        code: String(responseCode),
        description,
        cdrData: cdrXML,
        observations: []
      }
    }

    // Si no hay applicationResponse ni Fault, registrar la estructura para debugging
    console.log('⚠️ [GRE] Respuesta SUNAT sin applicationResponse ni Fault')
    console.log('Body keys:', Object.keys(body))
    throw new Error('Respuesta SUNAT GRE sin applicationResponse')

  } catch (error) {
    console.error('[GRE] Error al parsear respuesta SUNAT:', error)
    throw new Error(`Error al procesar respuesta de SUNAT GRE: ${error.message}`)
  }
}

/**
 * Parsea error de SUNAT para GRE
 */
function parseSunatErrorGRE(soapResponse) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    })

    const parsed = parser.parse(soapResponse)

    // Buscar faultstring en diferentes formatos
    const envelope = parsed['soap-env:Envelope'] || parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed.Envelope || parsed['S:Envelope']
    const body = envelope?.['soap-env:Body'] || envelope?.['soap:Body'] || envelope?.['soapenv:Body'] || envelope?.Body || envelope?.['S:Body']
    const fault = body?.['soap-env:Fault'] || body?.['soap:Fault'] || body?.['soapenv:Fault'] || body?.Fault || body?.['S:Fault']

    if (fault) {
      const faultcode = fault.faultcode || 'UNKNOWN'
      const faultstring = fault.faultstring || 'Error desconocido'

      console.log(`🚨 [GRE] SUNAT Error: [${faultcode}] ${faultstring}`)

      return {
        accepted: false,
        code: faultcode,
        description: faultstring,
        observations: []
      }
    }

    return {
      accepted: false,
      code: 'ERROR',
      description: 'Error al comunicarse con SUNAT GRE',
      observations: []
    }

  } catch (error) {
    console.error('[GRE] Error al parsear SOAP fault:', error)
    return {
      accepted: false,
      code: 'PARSE_ERROR',
      description: 'Error al parsear respuesta de error de SUNAT GRE',
      observations: []
    }
  }
}

/**
 * Verifica el estado de una Guía de Remisión en SUNAT
 */
export async function checkDispatchGuideStatus(config) {
  // TODO: Implementar consulta de estado para GRE
  console.log('⚠️ [GRE] checkDispatchGuideStatus not implemented yet')
  return null
}

/**
 * Envía Comunicación de Baja de Guía de Remisión a SUNAT
 * Usa urn:sendSummary en el endpoint GRE (diferente al de facturas)
 *
 * @param {string} signedXML - XML firmado de la comunicación de baja
 * @param {Object} config - Configuración
 * @param {string} config.ruc - RUC del emisor
 * @param {string} config.solUser - Usuario SOL
 * @param {string} config.solPassword - Contraseña SOL
 * @param {string} config.environment - 'beta' o 'production'
 * @param {string} config.fileName - Nombre del archivo (RA-YYYYMMDD-correlativo)
 * @returns {Object} { success: boolean, ticket?: string, error?: string }
 */
export async function sendSummaryGRE(signedXML, config) {
  try {
    const { ruc, solUser, solPassword, environment, fileName } = config

    // IMPORTANTE: Usar endpoints GRE, NO los de facturas
    const url = environment === 'production' ? SUNAT_GRE_URLS.production : SUNAT_GRE_URLS.beta

    // Nombre completo del archivo: RUC-RA-YYYYMMDD-correlativo
    const fullFileName = fileName.startsWith(ruc) ? fileName : `${ruc}-${fileName}`

    console.log(`🚛 [GRE] Endpoint SUNAT (sendSummary): ${url}`)
    console.log(`📄 [GRE] Archivo: ${fullFileName}`)

    // Comprimir XML en ZIP
    const zipContent = await createZipWithXML(signedXML, `${fullFileName}.xml`)
    const zipBase64 = Buffer.from(zipContent).toString('base64')

    // Crear SOAP envelope para sendSummary
    const soapEnvelope = createSendSummaryEnvelopeGRE(fullFileName, zipBase64, ruc, solUser, solPassword)

    console.log('📤 [GRE] Enviando comunicación de baja de guía a SUNAT...')

    const response = await axios.post(url, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:sendSummary'
      },
      responseType: 'text',
      timeout: 60000
    })

    const responseData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

    console.log('✅ [GRE] Respuesta recibida de SUNAT')
    console.log('📄 [GRE] Status HTTP:', response.status)
    console.log('📄 [GRE] Respuesta (primeros 2000 chars):', responseData.substring(0, 2000))

    // Parsear respuesta para obtener ticket
    const result = parseSendSummaryResponseGRE(responseData)

    if (!result.success) {
      result.rawResponse = responseData.substring(0, 500)
    }

    return result

  } catch (error) {
    console.error('❌ [GRE] Error al enviar comunicación de baja:', error.message)
    console.error('❌ [GRE] Error code:', error.code, 'Status:', error.response?.status)

    if (error.response?.data) {
      const errData = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)
      console.log('📄 [GRE] Respuesta de error de SUNAT:', errData.substring(0, 1000))
      const errorResult = parseSunatErrorGRE(errData)
      return {
        success: false,
        error: errorResult.description || 'Error al enviar comunicación de baja GRE',
        rawResponse: errData.substring(0, 500)
      }
    }

    return {
      success: false,
      error: `Error de conexión: ${error.message}`
    }
  }
}

/**
 * Consulta el estado de un ticket de baja de GRE en SUNAT
 *
 * @param {string} ticket - Ticket obtenido de sendSummaryGRE
 * @param {Object} config - Configuración
 * @returns {Object} { success: boolean, accepted?: boolean, pending?: boolean, cdrData?: string, error?: string }
 */
export async function getStatusGRE(ticket, config) {
  try {
    const { ruc, solUser, solPassword, environment } = config

    // IMPORTANTE: Usar endpoints GRE
    const url = environment === 'production' ? SUNAT_GRE_URLS.production : SUNAT_GRE_URLS.beta

    console.log(`🚛 [GRE] Endpoint SUNAT (getStatus): ${url}`)
    console.log(`🎫 [GRE] Consultando ticket: ${ticket}`)

    const soapEnvelope = createGetStatusEnvelopeGRE(ticket, ruc, solUser, solPassword)

    const response = await axios.post(url, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:getStatus'
      },
      responseType: 'text',
      timeout: 60000
    })

    const responseData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

    console.log('✅ [GRE] Respuesta de getStatus recibida')

    const result = await parseGetStatusResponseGRE(responseData)
    return result

  } catch (error) {
    console.error('❌ [GRE] Error al consultar estado:', error.message)
    console.error('❌ [GRE] Error code:', error.code, 'Status:', error.response?.status)

    if (error.response?.data) {
      const errData = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)
      const errorResult = parseSunatErrorGRE(errData)
      return {
        success: false,
        error: errorResult.description || 'Error al consultar estado GRE'
      }
    }

    return {
      success: false,
      error: `Error de conexión: ${error.message}`
    }
  }
}

/**
 * Crea SOAP envelope para sendSummary en endpoint GRE
 */
function createSendSummaryEnvelopeGRE(fileName, zipBase64, ruc, solUser, solPassword) {
  const fullUser = `${ruc}${solUser}`
  const escapedUser = escapeXml(fullUser)
  const escapedPassword = escapeXml(solPassword)

  console.log(`🔑 [GRE] Credenciales SOL (sendSummary): usuario=${fullUser}`)

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ser="http://service.sunat.gob.pe"
                  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${escapedUser}</wsse:Username>
        <wsse:Password>${escapedPassword}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendSummary>
      <fileName>${fileName}.zip</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:sendSummary>
  </soapenv:Body>
</soapenv:Envelope>`
}

/**
 * Crea SOAP envelope para getStatus en endpoint GRE
 */
function createGetStatusEnvelopeGRE(ticket, ruc, solUser, solPassword) {
  const fullUser = `${ruc}${solUser}`
  const escapedUser = escapeXml(fullUser)
  const escapedPassword = escapeXml(solPassword)

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ser="http://service.sunat.gob.pe"
                  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${escapedUser}</wsse:Username>
        <wsse:Password>${escapedPassword}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:getStatus>
      <ticket>${ticket}</ticket>
    </ser:getStatus>
  </soapenv:Body>
</soapenv:Envelope>`
}

/**
 * Parsea respuesta de sendSummary GRE (retorna ticket)
 */
function parseSendSummaryResponseGRE(soapResponse) {
  try {
    console.log('📥 [GRE] Respuesta SOAP sendSummary:', soapResponse.substring(0, 1000))

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true
    })

    const parsed = parser.parse(soapResponse)

    const envelope = parsed.Envelope || parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed['soap-env:Envelope'] || parsed['S:Envelope']
    if (!envelope) {
      return { success: false, error: 'Respuesta SOAP inválida - no se encontró Envelope' }
    }

    const body = envelope.Body || envelope['soap:Body'] || envelope['soapenv:Body'] || envelope['soap-env:Body'] || envelope['S:Body']
    if (!body) {
      return { success: false, error: 'Respuesta SOAP inválida - no se encontró Body' }
    }

    // Verificar fault
    const fault = body.Fault || body['soap-env:Fault'] || body['soap:Fault'] || body['soapenv:Fault'] || body['S:Fault']
    if (fault) {
      const faultString = fault.faultstring || fault.Reason?.Text || 'Error desconocido de SUNAT'
      console.log('❌ [GRE] SOAP Fault:', faultString)
      return { success: false, error: faultString }
    }

    // Buscar ticket en la respuesta
    const sendSummaryResponse = body.sendSummaryResponse ||
                                 body['br:sendSummaryResponse'] ||
                                 body['ns2:sendSummaryResponse'] ||
                                 body['ns1:sendSummaryResponse']

    if (sendSummaryResponse?.ticket) {
      console.log(`🎫 [GRE] Ticket recibido: ${sendSummaryResponse.ticket}`)
      return { success: true, ticket: sendSummaryResponse.ticket }
    }

    // Buscar ticket recursivamente
    const ticketValue = findTicketInObjectGRE(body)
    if (ticketValue) {
      console.log(`🎫 [GRE] Ticket encontrado (recursivo): ${ticketValue}`)
      return { success: true, ticket: ticketValue }
    }

    console.log('⚠️ [GRE] No se encontró ticket. Body:', JSON.stringify(body, null, 2))
    return { success: false, error: 'No se recibió ticket de SUNAT' }

  } catch (error) {
    console.error('[GRE] Error al parsear respuesta sendSummary:', error)
    return { success: false, error: 'Error al procesar respuesta de SUNAT' }
  }
}

/**
 * Busca recursivamente el campo 'ticket' en un objeto
 */
function findTicketInObjectGRE(obj) {
  if (!obj || typeof obj !== 'object') return null
  if (obj.ticket) return obj.ticket
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === 'ticket') return obj[key]
    const found = findTicketInObjectGRE(obj[key])
    if (found) return found
  }
  return null
}

/**
 * Parsea respuesta de getStatus GRE
 */
async function parseGetStatusResponseGRE(soapResponse) {
  try {
    console.log('📥 [GRE] Respuesta getStatus (primeros 1000 chars):', soapResponse.substring(0, 1000))

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true
    })

    const parsed = parser.parse(soapResponse)

    const envelope = parsed.Envelope || parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed['soap-env:Envelope'] || parsed['S:Envelope']
    if (!envelope) {
      return { success: false, error: 'Respuesta SOAP inválida' }
    }

    const body = envelope.Body || envelope['soap:Body'] || envelope['soapenv:Body'] || envelope['soap-env:Body'] || envelope['S:Body']
    if (!body) {
      return { success: false, error: 'Respuesta SOAP inválida' }
    }

    // Verificar fault
    const fault = body.Fault || body['soap-env:Fault'] || body['soap:Fault'] || body['soapenv:Fault'] || body['S:Fault']
    if (fault) {
      const faultString = fault.faultstring || fault.Reason?.Text || 'Error desconocido de SUNAT'
      console.log('❌ [GRE] getStatus SOAP Fault:', faultString)
      return { success: false, error: faultString }
    }

    const getStatusResponse = body.getStatusResponse || body['br:getStatusResponse'] || body['ns2:getStatusResponse'] || body['ns1:getStatusResponse']

    if (!getStatusResponse) {
      console.log('❌ [GRE] No se encontró getStatusResponse. Body:', JSON.stringify(body, null, 2)?.substring(0, 500))
      return { success: false, error: 'Respuesta de getStatus no encontrada' }
    }

    const statusCode = getStatusResponse.status?.statusCode || getStatusResponse.statusCode
    console.log('📋 [GRE] statusCode:', statusCode)

    // Código 98 = En proceso
    if (statusCode === '98' || statusCode === 98) {
      return {
        success: true,
        pending: true,
        message: 'La comunicación de baja está siendo procesada por SUNAT'
      }
    }

    // Si hay CDR (content), procesarlo
    const cdrBase64 = getStatusResponse.status?.content || getStatusResponse.content

    if (cdrBase64) {
      const cdrZipBuffer = Buffer.from(cdrBase64, 'base64')
      const zip = new JSZip()
      const cdrZip = await zip.loadAsync(cdrZipBuffer)

      const cdrFileName = Object.keys(cdrZip.files).find(name => name.endsWith('.xml'))
      console.log('📋 [GRE] Archivos en ZIP del CDR:', Object.keys(cdrZip.files))

      if (cdrFileName) {
        const cdrXML = await cdrZip.files[cdrFileName].async('text')
        console.log('📋 [GRE] CDR XML (primeros 500 chars):', cdrXML.substring(0, 500))

        const cdrParser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
          removeNSPrefix: true
        })
        const cdr = cdrParser.parse(cdrXML)

        let responseCode = null
        let description = null

        if (cdr.ApplicationResponse) {
          const docResponse = cdr.ApplicationResponse.DocumentResponse
          if (docResponse?.Response) {
            responseCode = docResponse.Response.ResponseCode
            description = docResponse.Response.Description
          }

          if (responseCode === null || responseCode === undefined) {
            responseCode = cdr.ApplicationResponse.ResponseCode
            description = cdr.ApplicationResponse.Note
          }
        }

        // Handle object values from XML with attributes
        if (responseCode && typeof responseCode === 'object') {
          responseCode = responseCode['#text'] || Object.values(responseCode)[0]
        }
        if (description && typeof description === 'object') {
          description = description['#text'] || Object.values(description)[0]
        }

        responseCode = responseCode !== null && responseCode !== undefined ? String(responseCode) : null

        if (!responseCode) {
          responseCode = statusCode ? String(statusCode) : 'UNKNOWN'
        }

        console.log(`📋 [GRE] CDR de baja: statusCode=${statusCode}, responseCode=${responseCode}, description=${description}`)

        // statusCode 99 = proceso con errores
        if (statusCode === '99' || statusCode === 99) {
          return {
            success: false,
            accepted: false,
            code: responseCode || '99',
            error: description || 'SUNAT rechazó la comunicación de baja de guía',
            cdrData: cdrXML
          }
        }

        const accepted = (responseCode === '0' || responseCode.startsWith('4')) &&
                         (statusCode === '0' || statusCode === 0 || !statusCode)

        return {
          success: true,
          accepted,
          code: String(responseCode),
          description: description || 'Procesado por SUNAT',
          cdrData: cdrXML
        }
      }
    }

    // Sin CDR
    if (statusCode === '99' || statusCode === 99) {
      return {
        success: false,
        error: 'SUNAT rechazó la comunicación de baja de guía (sin CDR)'
      }
    }

    return {
      success: true,
      accepted: statusCode === '0' || statusCode === 0,
      code: String(statusCode),
      description: 'Procesado por SUNAT'
    }

  } catch (error) {
    console.error('[GRE] Error al parsear respuesta getStatus:', error)
    return {
      success: false,
      error: 'Error al procesar respuesta de SUNAT'
    }
  }
}
