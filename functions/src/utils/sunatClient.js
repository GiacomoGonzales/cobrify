import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import JSZip from 'jszip'

/**
 * Cliente para comunicación con SUNAT via SOAP Web Services
 *
 * SUNAT proporciona dos ambientes:
 * - Beta (Homologación): Para pruebas
 * - Producción: Para documentos reales
 *
 * Referencias:
 * - Guía de servicios web: https://cpe.sunat.gob.pe/
 */

// URLs de SUNAT según ambiente
const SUNAT_URLS = {
  beta: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  production: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService'
}

// URLs de consulta CDR (billConsultService) - diferente endpoint que billService
const SUNAT_CONSULT_URLS = {
  beta: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billConsultService',
  production: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billConsultService'
}

/**
 * Envía XML firmado a SUNAT
 */
export async function sendToSunat(signedXML, config) {
  try {
    const { ruc, solUser, solPassword, environment, documentType, series, number } = config

    // Determinar URL según ambiente
    const url = environment === 'production' ? SUNAT_URLS.production : SUNAT_URLS.beta

    console.log(`🌐 Endpoint SUNAT: ${url}`)

    // Nombre del archivo ZIP (RUC-TipoDoc-Serie-Numero.xml)
    // Catálogo 01: 01=Factura, 03=Boleta, 07=Nota de Crédito, 08=Nota de Débito
    const docTypeMap = {
      'factura': '01',
      'boleta': '03',
      'nota_credito': '07',
      'nota_debito': '08'
    }
    const docTypeCode = docTypeMap[documentType] || '03'
    const fileName = `${ruc}-${docTypeCode}-${series}-${String(number).padStart(8, '0')}`

    // Comprimir XML en ZIP (SUNAT requiere XML dentro de ZIP)
    const zipContent = await createZipWithXML(signedXML, `${fileName}.xml`)

    // Convertir ZIP a base64
    const zipBase64 = Buffer.from(zipContent).toString('base64')

    // Crear SOAP envelope
    const soapEnvelope = createSoapEnvelope(fileName, zipBase64, ruc, solUser, solPassword)

    // Enviar a SUNAT
    console.log('📤 Enviando documento a SUNAT...')

    const response = await axios.post(url, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:sendBill'
      },
      timeout: 120000 // 120 segundos timeout (SUNAT puede tardar)
    })

    console.log('✅ Respuesta recibida de SUNAT')
    console.log('📄 Primeros 500 chars de respuesta:', response.data.substring(0, 500))

    // Parsear respuesta SOAP
    const result = await parseSunatResponse(response.data)

    return result

  } catch (error) {
    console.error('❌ Error al comunicarse con SUNAT:', error.message)

    // Si es error de axios con respuesta, parsearlo
    if (error.response) {
      console.log('📊 Status:', error.response.status)
      console.log('📊 Headers:', JSON.stringify(error.response.headers, null, 2))
      console.log('📄 Respuesta XML de SUNAT (error):')
      console.log(typeof error.response.data, error.response.data)

      if (error.response.data) {
        const errorResult = parseSunatError(error.response.data)

        // IMPORTANTE: Si el SOAP Fault indica que el documento fue ACEPTADO,
        // retornar el resultado en vez de lanzar error.
        // SUNAT a veces responde con HTTP 500 + SOAP Fault "ha sido aceptada"
        // cuando el documento ya fue procesado (timeout en envío anterior, reintentos, etc.)
        if (errorResult.accepted) {
          console.log('✅ SOAP Fault (HTTP error) indica aceptación - retornando resultado exitoso')
          return errorResult
        }

        throw new Error(errorResult.description || 'Error al enviar a SUNAT')
      }
    }

    throw new Error(`Error de conexión con SUNAT: ${error.message}`)
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
    console.log(`📦 ZIP creado: ${fileName} (${zipBuffer.length} bytes)`)
    return zipBuffer
  } catch (error) {
    console.error('❌ Error al crear ZIP:', error)
    throw new Error(`Error al comprimir XML: ${error.message}`)
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
 * Crea SOAP envelope para envío a SUNAT
 */
function createSoapEnvelope(fileName, zipBase64, ruc, solUser, solPassword) {
  // Usuario completo para SOL: RUC + Usuario
  const fullUser = `${ruc}${solUser}`

  // Log para debugging (sin mostrar contraseña completa)
  console.log(`🔑 Credenciales SOL: usuario=${fullUser}, password=${solPassword ? `***${solPassword.slice(-3)}` : 'NO DEFINIDA'}`)

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
 * Parsea respuesta exitosa de SUNAT
 */
async function parseSunatResponse(soapResponse) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    })

    const parsed = parser.parse(soapResponse)

    // Navegar estructura SOAP
    const envelope = parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed.Envelope || parsed['soap-env:Envelope']

    if (!envelope) {
      throw new Error('No se pudo encontrar el SOAP Envelope')
    }

    const body = envelope['soap:Body'] || envelope['soapenv:Body'] || envelope.Body || envelope['soap-env:Body']

    if (!body) {
      throw new Error('No se pudo encontrar el SOAP Body')
    }

    // Verificar si hay un SOAP Fault (error)
    const fault = body['soap-env:Fault'] || body['soap:Fault'] || body['soapenv:Fault'] || body.Fault

    if (fault) {
      const faultcode = fault.faultcode || 'UNKNOWN'
      const faultstring = fault.faultstring || 'Error desconocido'

      console.log(`🚨 SUNAT devolvió SOAP Fault: [${faultcode}] ${faultstring}`)

      // Extraer código numérico del faultcode (e.g. "soap-env:Client.1033" → "1033")
      const numericCode = faultcode.match(/\.(\d+)$/)?.[1] || faultcode

      // Detectar si el SOAP Fault indica que el documento fue ACEPTADO
      // SUNAT a veces retorna Fault con mensajes como "ha sido aceptada" o "registrado previamente"
      // IMPORTANTE: "con otros datos" significa que la serie-número ya fue usada con datos DIFERENTES → NO es aceptación
      const faultLower = faultstring.toLowerCase()
      const hasConOtrosDatos = faultLower.includes('con otros datos')
      const isAcceptedFault = !hasConOtrosDatos && (
                              faultLower.includes('ha sido aceptada') ||
                              faultLower.includes('ha sido aceptado') ||
                              (numericCode === '1033' && !faultLower.includes('rechaz')))

      if (isAcceptedFault) {
        console.log(`✅ SOAP Fault indica aceptación: [${faultcode}] ${faultstring}`)
        return {
          accepted: true,
          code: numericCode,
          description: faultstring,
          observations: ['Documento aceptado (detectado en SOAP Fault)']
        }
      }

      return {
        accepted: false,
        code: numericCode,
        description: faultstring,
        observations: []
      }
    }

    // Respuesta de sendBill (SUNAT usa diferentes prefijos: ns2, br, etc.)
    const sendBillResponse = body['br:sendBillResponse'] || body['ns2:sendBillResponse'] || body.sendBillResponse

    if (sendBillResponse?.applicationResponse) {
      // Decodificar CDR (Constancia de Recepción) - viene en un ZIP
      const cdrBase64 = sendBillResponse.applicationResponse
      const cdrZipBuffer = Buffer.from(cdrBase64, 'base64')

      // Descomprimir ZIP para obtener el XML del CDR
      const zip = new JSZip()
      const cdrZip = await zip.loadAsync(cdrZipBuffer)

      // El CDR está dentro del ZIP con nombre R-{RUC}-{tipo}-{serie}-{numero}.xml
      const cdrFileName = Object.keys(cdrZip.files).find(name => name.startsWith('R-') && name.endsWith('.xml'))

      if (!cdrFileName) {
        console.log('❌ No se encontró el archivo CDR en el ZIP')
        throw new Error('CDR no encontrado en la respuesta')
      }

      const cdrXML = await cdrZip.files[cdrFileName].async('text')

      // Parsear CDR con removeNSPrefix para manejar prefijos como ar:ApplicationResponse
      const cdrParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        removeNSPrefix: true
      })
      const cdr = cdrParser.parse(cdrXML)

      // Extraer información del CDR
      // IMPORTANTE: El ResponseCode puede estar en diferentes ubicaciones según el tipo de CDR:
      // 1. Directamente en ApplicationResponse/ResponseCode (CDRs simples)
      // 2. En ApplicationResponse/DocumentResponse/Response/ResponseCode (CDRs con errores)

      // Helper: extraer valor de texto de un nodo XML parseado
      // fast-xml-parser con ignoreAttributes:false puede devolver:
      // - valor simple: 0, '0', 'texto'
      // - objeto con atributos: { '#text': 0, '@_listAgencyName': 'PE:SUNAT' }
      const extractText = (node) => {
        if (node === null || node === undefined) return undefined
        if (typeof node === 'object' && node['#text'] !== undefined) return node['#text']
        return node
      }

      let responseCode = extractText(cdr.ApplicationResponse?.ResponseCode)

      // El mensaje puede estar en diferentes lugares:
      // 1. Note - mensaje general
      // 2. DocumentResponse > Response > Description - mensaje específico de error
      let description = extractText(cdr.ApplicationResponse?.Note)

      // Buscar en DocumentResponse para obtener código y mensaje más específico
      const docResponse = cdr.ApplicationResponse?.DocumentResponse
      if (docResponse) {
        const response = docResponse.Response
        // CRÍTICO: Si el ResponseCode no estaba en el nivel superior, buscarlo aquí
        if ((responseCode === null || responseCode === undefined) && response?.ResponseCode) {
          responseCode = extractText(response.ResponseCode)
          console.log(`📋 ResponseCode encontrado en DocumentResponse/Response: ${responseCode}`)
        }
        if (response?.Description) {
          description = extractText(response.Description)
        }
      }

      // IMPORTANTE: Solo usar default si realmente no se encontró código en ningún lugar
      if (responseCode === null || responseCode === undefined) {
        console.warn('⚠️ No se encontró ResponseCode en el CDR. Estructura:', JSON.stringify(Object.keys(cdr), null, 2))
        responseCode = 'UNKNOWN'
      }

      // Normalizar a string para comparaciones consistentes
      responseCode = String(responseCode)

      // Determinar si fue aceptado:
      // - Código 0 = Aceptado sin observaciones
      // - Códigos 4xxx = Aceptado CON observaciones (warnings, no errores)
      // - Códigos 2xxx/3xxx = Rechazado
      const accepted = responseCode === '0' || responseCode.startsWith('4')

      // Si aún no hay descripción, usar default según el código
      if (!description) {
        description = accepted
          ? 'Aceptado por SUNAT'
          : `Rechazado por SUNAT (código ${responseCode})`
      }

      if (responseCode.startsWith('4')) {
        console.log(`📋 Documento aceptado con observaciones (código ${responseCode}): ${description}`)
      }

      console.log(`📋 CDR parseado: code=${responseCode}, accepted=${accepted}, description=${description}`)

      return {
        accepted,
        code: String(responseCode),
        description,
        cdrData: cdrXML,
        observations: []
      }
    }

    // Si no hay applicationResponse ni Fault, registrar la estructura para debugging
    console.log('⚠️ Respuesta SUNAT sin applicationResponse ni Fault')
    console.log('Body keys:', Object.keys(body))
    throw new Error('Respuesta SUNAT sin applicationResponse')

  } catch (error) {
    console.error('Error al parsear respuesta SUNAT:', error)
    throw new Error('Error al procesar respuesta de SUNAT')
  }
}

/**
 * Parsea error de SUNAT
 */
function parseSunatError(soapResponse) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    })

    const parsed = parser.parse(soapResponse)

    // Buscar faultstring en diferentes formatos (SUNAT usa 'soap-env:', 'soap:', 'soapenv:')
    const envelope = parsed['soap-env:Envelope'] || parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed.Envelope
    const body = envelope?.['soap-env:Body'] || envelope?.['soap:Body'] || envelope?.['soapenv:Body'] || envelope?.Body
    const fault = body?.['soap-env:Fault'] || body?.['soap:Fault'] || body?.['soapenv:Fault'] || body?.Fault

    if (fault) {
      const faultcode = fault.faultcode || 'UNKNOWN'
      const faultstring = fault.faultstring || 'Error desconocido'

      console.log(`🚨 SUNAT Error: [${faultcode}] ${faultstring}`)

      // Extraer código numérico del faultcode (e.g. "soap-env:Client.1033" → "1033")
      const numericCode = faultcode.match(/\.(\d+)$/)?.[1] || faultcode

      // Detectar si el SOAP Fault indica que el documento fue ACEPTADO
      // IMPORTANTE: "con otros datos" significa conflicto de datos → NO es aceptación
      const faultLower = faultstring.toLowerCase()
      const hasConOtrosDatos = faultLower.includes('con otros datos')
      const isAcceptedFault = !hasConOtrosDatos && (
                              faultLower.includes('ha sido aceptada') ||
                              faultLower.includes('ha sido aceptado') ||
                              (numericCode === '1033' && !faultLower.includes('rechaz')))

      if (isAcceptedFault) {
        console.log(`✅ SOAP Fault (error path) indica aceptación: [${faultcode}] ${faultstring}`)
        return {
          accepted: true,
          code: numericCode,
          description: faultstring,
          observations: ['Documento aceptado (detectado en SOAP Fault - HTTP error)']
        }
      }

      return {
        accepted: false,
        code: numericCode,
        description: faultstring,
        observations: []
      }
    }

    return {
      accepted: false,
      code: 'ERROR',
      description: 'Error al comunicarse con SUNAT',
      observations: []
    }

  } catch (error) {
    console.error('Error al parsear SOAP fault:', error)
    return {
      accepted: false,
      code: 'PARSE_ERROR',
      description: 'Error al parsear respuesta de error de SUNAT',
      observations: []
    }
  }
}

/**
 * Consulta el CDR de un comprobante en SUNAT usando getStatusCdr
 *
 * IMPORTANTE: Solo funciona para facturas (01), notas de crédito (07) y notas de débito (08).
 * NO funciona para boletas (03).
 *
 * @param {Object} config
 * @param {string} config.ruc - RUC del emisor
 * @param {string} config.solUser - Usuario SOL
 * @param {string} config.solPassword - Contraseña SOL
 * @param {string} config.environment - 'beta' o 'production'
 * @param {string} config.documentType - Código de tipo de documento: '01', '07', '08'
 * @param {string} config.series - Serie del documento (ej: 'F001')
 * @param {number|string} config.number - Número correlativo del documento
 * @returns {Object} { success, accepted, code, description, cdrData } o { success: false, error }
 */
export async function getStatusCdr(config) {
  try {
    const { ruc, solUser, solPassword, environment, documentType, series, number } = config

    // Validar que no sea boleta
    if (documentType === '03') {
      console.log('⚠️ getStatusCdr no soporta boletas (03)')
      return { success: false, error: 'getStatusCdr no soporta boletas' }
    }

    // Validar tipo de documento soportado
    if (!['01', '07', '08'].includes(documentType)) {
      console.log(`⚠️ getStatusCdr: tipo de documento no soportado: ${documentType}`)
      return { success: false, error: `Tipo de documento no soportado: ${documentType}` }
    }

    const url = environment === 'production' ? SUNAT_CONSULT_URLS.production : SUNAT_CONSULT_URLS.beta

    console.log(`🌐 Endpoint SUNAT (getStatusCdr): ${url}`)
    console.log(`📋 Consultando CDR: ${ruc}-${documentType}-${series}-${number}`)

    const soapEnvelope = createGetStatusCdrEnvelope(ruc, documentType, series, String(number), solUser, solPassword)

    const response = await axios.post(url, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:getStatusCdr'
      },
      timeout: 60000
    })

    console.log('✅ Respuesta de getStatusCdr recibida')

    const result = await parseGetStatusCdrResponse(response.data)
    return result

  } catch (error) {
    console.error('❌ Error al consultar CDR:', error.message)

    if (error.response?.data) {
      console.log('📄 Respuesta de error SUNAT (getStatusCdr):', String(error.response.data).substring(0, 500))
      const errorResult = parseSunatError(error.response.data)
      return {
        success: false,
        error: errorResult.description || 'Error al consultar CDR'
      }
    }

    return {
      success: false,
      error: `Error de conexión: ${error.message}`
    }
  }
}

/**
 * Crea SOAP envelope para getStatusCdr
 */
function createGetStatusCdrEnvelope(ruc, documentType, series, number, solUser, solPassword) {
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
    <ser:getStatusCdr>
      <rucComprobante>${escapeXml(ruc)}</rucComprobante>
      <tipoComprobante>${escapeXml(documentType)}</tipoComprobante>
      <serieComprobante>${escapeXml(series)}</serieComprobante>
      <numeroComprobante>${escapeXml(number)}</numeroComprobante>
    </ser:getStatusCdr>
  </soapenv:Body>
</soapenv:Envelope>`
}

/**
 * Parsea la respuesta de getStatusCdr
 * La respuesta contiene statusCode, statusMessage y content (CDR en base64 ZIP)
 */
async function parseGetStatusCdrResponse(soapResponse) {
  try {
    console.log('📥 Respuesta getStatusCdr (primeros 500 chars):', soapResponse.substring(0, 500))

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true
    })

    const parsed = parser.parse(soapResponse)

    const envelope = parsed.Envelope || parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed['soap-env:Envelope']
    if (!envelope) {
      return { success: false, error: 'Respuesta SOAP inválida - no se encontró Envelope' }
    }

    const body = envelope.Body || envelope['soap:Body'] || envelope['soapenv:Body'] || envelope['soap-env:Body']
    if (!body) {
      return { success: false, error: 'Respuesta SOAP inválida - no se encontró Body' }
    }

    // Verificar fault
    const fault = body.Fault || body['soap-env:Fault'] || body['soap:Fault'] || body['soapenv:Fault']
    if (fault) {
      const faultString = fault.faultstring || 'Error desconocido de SUNAT'
      console.log('❌ getStatusCdr SOAP Fault:', faultString)
      return { success: false, error: faultString }
    }

    // Buscar getStatusCdrResponse
    const statusCdrResponse = body.getStatusCdrResponse || body['br:getStatusCdrResponse'] || body['ns2:getStatusCdrResponse']

    if (!statusCdrResponse) {
      console.log('❌ No se encontró getStatusCdrResponse. Body keys:', Object.keys(body))
      return { success: false, error: 'Respuesta de getStatusCdr no encontrada' }
    }

    const statusCode = statusCdrResponse.status?.statusCode ?? statusCdrResponse.statusCode
    const statusMessage = statusCdrResponse.status?.statusMessage ?? statusCdrResponse.statusMessage
    const cdrBase64 = statusCdrResponse.status?.content ?? statusCdrResponse.content

    console.log(`📋 getStatusCdr: statusCode=${statusCode}, statusMessage=${statusMessage}, hasCDR=${!!cdrBase64}`)

    // Código 0 = Encontrado con CDR, 98 = en proceso, 99 = no encontrado/error
    if (statusCode === '0' || statusCode === 0) {
      if (!cdrBase64) {
        return {
          success: true,
          accepted: true,
          code: String(statusCode),
          description: statusMessage || 'Documento encontrado pero sin contenido CDR'
        }
      }

      // Descomprimir CDR del ZIP base64
      const cdrZipBuffer = Buffer.from(cdrBase64, 'base64')
      const zip = new JSZip()
      const cdrZip = await zip.loadAsync(cdrZipBuffer)

      const cdrFileName = Object.keys(cdrZip.files).find(name => name.endsWith('.xml'))
      console.log('📋 Archivos en ZIP del CDR (getStatusCdr):', Object.keys(cdrZip.files))

      if (!cdrFileName) {
        return {
          success: true,
          accepted: true,
          code: '0',
          description: statusMessage || 'CDR recuperado pero sin XML dentro del ZIP'
        }
      }

      const cdrXML = await cdrZip.files[cdrFileName].async('text')

      // Parsear CDR para extraer código y descripción
      const cdrParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        removeNSPrefix: true
      })
      const cdr = cdrParser.parse(cdrXML)

      const extractText = (node) => {
        if (node === null || node === undefined) return undefined
        if (typeof node === 'object' && node['#text'] !== undefined) return node['#text']
        return node
      }

      let responseCode = extractText(cdr.ApplicationResponse?.ResponseCode)
      let description = extractText(cdr.ApplicationResponse?.Note)

      const docResponse = cdr.ApplicationResponse?.DocumentResponse
      if (docResponse?.Response) {
        if (responseCode === null || responseCode === undefined) {
          responseCode = extractText(docResponse.Response.ResponseCode)
        }
        if (!description && docResponse.Response.Description) {
          description = extractText(docResponse.Response.Description)
        }
      }

      if (responseCode === null || responseCode === undefined) {
        responseCode = '0'
      }
      responseCode = String(responseCode)

      const accepted = responseCode === '0' || responseCode.startsWith('4')

      console.log(`📋 CDR recuperado via getStatusCdr: code=${responseCode}, accepted=${accepted}`)

      return {
        success: true,
        accepted,
        code: responseCode,
        description: description || statusMessage || 'CDR recuperado de SUNAT',
        cdrData: cdrXML
      }
    }

    // Otros códigos de estado
    return {
      success: false,
      code: String(statusCode),
      error: statusMessage || `Estado ${statusCode} al consultar CDR`
    }

  } catch (error) {
    console.error('Error al parsear respuesta getStatusCdr:', error)
    return {
      success: false,
      error: 'Error al procesar respuesta de getStatusCdr'
    }
  }
}

/**
 * Envía Comunicación de Baja o Resumen Diario a SUNAT
 * Este método es asíncrono - retorna un ticket que debe consultarse después
 *
 * @param {string} signedXML - XML firmado
 * @param {Object} config - Configuración
 * @param {string} config.ruc - RUC del emisor
 * @param {string} config.solUser - Usuario SOL
 * @param {string} config.solPassword - Contraseña SOL
 * @param {string} config.environment - 'beta' o 'production'
 * @param {string} config.fileName - Nombre del archivo (RA-YYYYMMDD-correlativo)
 * @returns {Object} { success: boolean, ticket?: string, error?: string }
 */
export async function sendSummary(signedXML, config) {
  try {
    const { ruc, solUser, solPassword, environment, fileName } = config

    // Determinar URL según ambiente
    const url = environment === 'production' ? SUNAT_URLS.production : SUNAT_URLS.beta

    // Nombre completo del archivo: RUC-RA-YYYYMMDD-correlativo
    // Si fileName ya incluye el RUC, usarlo tal cual; si no, agregarlo
    const fullFileName = fileName.startsWith(ruc) ? fileName : `${ruc}-${fileName}`

    console.log(`🌐 Endpoint SUNAT (sendSummary): ${url}`)
    console.log(`📄 Archivo: ${fullFileName}`)

    // Comprimir XML en ZIP
    const zipContent = await createZipWithXML(signedXML, `${fullFileName}.xml`)

    // Convertir ZIP a base64
    const zipBase64 = Buffer.from(zipContent).toString('base64')

    // Crear SOAP envelope para sendSummary
    const soapEnvelope = createSendSummaryEnvelope(fullFileName, zipBase64, ruc, solUser, solPassword)

    // Enviar a SUNAT
    console.log('📤 Enviando comunicación de baja a SUNAT...')

    const response = await axios.post(url, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:sendSummary'
      },
      timeout: 60000
    })

    console.log('✅ Respuesta recibida de SUNAT')
    console.log('📄 Status HTTP:', response.status)
    console.log('📄 Respuesta completa (primeros 2000 chars):', response.data.substring(0, 2000))

    // Parsear respuesta para obtener ticket
    const result = parseSendSummaryResponse(response.data)

    // Si no hay ticket, incluir la respuesta raw para debug
    if (!result.success) {
      result.rawResponse = response.data.substring(0, 500)
    }

    return result

  } catch (error) {
    console.error('❌ Error al enviar comunicación de baja:', error.message)
    console.error('❌ Error completo:', JSON.stringify({
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data?.substring?.(0, 1000) || error.response?.data
    }, null, 2))

    if (error.response?.data) {
      console.log('📄 Respuesta de error de SUNAT:', error.response.data.substring(0, 1000))
      const errorResult = parseSunatError(error.response.data)
      return {
        success: false,
        error: errorResult.description || 'Error al enviar comunicación de baja',
        rawResponse: error.response.data.substring(0, 500)
      }
    }

    return {
      success: false,
      error: `Error de conexión: ${error.message}`
    }
  }
}

/**
 * Crea SOAP envelope para sendSummary
 */
function createSendSummaryEnvelope(fileName, zipBase64, ruc, solUser, solPassword) {
  const fullUser = `${ruc}${solUser}`
  const escapedUser = escapeXml(fullUser)
  const escapedPassword = escapeXml(solPassword)

  console.log(`🔑 Credenciales SOL (sendSummary): usuario=${fullUser}`)

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
 * Parsea respuesta de sendSummary (retorna ticket)
 */
function parseSendSummaryResponse(soapResponse) {
  try {
    console.log('📥 Respuesta SOAP completa:', soapResponse.substring(0, 1000))

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true // Remover prefijos de namespace para simplificar
    })

    const parsed = parser.parse(soapResponse)
    console.log('📋 Parsed structure keys:', Object.keys(parsed))

    // Navegar estructura SOAP (con removeNSPrefix, los prefijos se eliminan)
    const envelope = parsed.Envelope || parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed['soap-env:Envelope']
    if (!envelope) {
      console.log('❌ No se encontró Envelope. Parsed:', JSON.stringify(parsed, null, 2).substring(0, 500))
      return { success: false, error: 'Respuesta SOAP inválida - no se encontró Envelope' }
    }

    const body = envelope.Body || envelope['soap:Body'] || envelope['soapenv:Body'] || envelope['soap-env:Body']
    if (!body) {
      console.log('❌ No se encontró Body. Envelope keys:', Object.keys(envelope))
      return { success: false, error: 'Respuesta SOAP inválida - no se encontró Body' }
    }

    console.log('📋 Body keys:', Object.keys(body))

    // Verificar fault
    const fault = body.Fault || body['soap-env:Fault'] || body['soap:Fault'] || body['soapenv:Fault']
    if (fault) {
      const faultString = fault.faultstring || fault.Reason?.Text || 'Error desconocido de SUNAT'
      console.log('❌ SOAP Fault:', faultString)
      return {
        success: false,
        error: faultString
      }
    }

    // Buscar ticket en la respuesta (con removeNSPrefix, buscar sin prefijo)
    const sendSummaryResponse = body.sendSummaryResponse ||
                                 body['br:sendSummaryResponse'] ||
                                 body['ns2:sendSummaryResponse']

    console.log('📋 sendSummaryResponse:', JSON.stringify(sendSummaryResponse, null, 2))

    if (sendSummaryResponse?.ticket) {
      console.log(`🎫 Ticket recibido: ${sendSummaryResponse.ticket}`)
      return {
        success: true,
        ticket: sendSummaryResponse.ticket
      }
    }

    // Intentar buscar ticket recursivamente en el body
    const ticketValue = findTicketInObject(body)
    if (ticketValue) {
      console.log(`🎫 Ticket encontrado (recursivo): ${ticketValue}`)
      return {
        success: true,
        ticket: ticketValue
      }
    }

    console.log('⚠️ No se encontró ticket en la respuesta')
    console.log('Body completo:', JSON.stringify(body, null, 2))

    return {
      success: false,
      error: 'No se recibió ticket de SUNAT'
    }

  } catch (error) {
    console.error('Error al parsear respuesta sendSummary:', error)
    return {
      success: false,
      error: 'Error al procesar respuesta de SUNAT'
    }
  }
}

/**
 * Busca recursivamente el campo 'ticket' en un objeto
 */
function findTicketInObject(obj) {
  if (!obj || typeof obj !== 'object') return null

  if (obj.ticket) return obj.ticket

  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === 'ticket') return obj[key]

    const found = findTicketInObject(obj[key])
    if (found) return found
  }

  return null
}

/**
 * Busca recursivamente un valor por nombre de campo en un objeto
 * Útil para encontrar ResponseCode, Description, etc. en estructuras XML anidadas
 */
function findValueInObject(obj, fieldName) {
  if (!obj || typeof obj !== 'object') return null

  // Buscar directamente
  if (obj[fieldName] !== undefined) return obj[fieldName]

  // Buscar en claves que contengan el nombre del campo
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase().includes(fieldName.toLowerCase())) {
      return obj[key]
    }
  }

  // Buscar recursivamente
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object') {
      const found = findValueInObject(obj[key], fieldName)
      if (found !== null && found !== undefined) return found
    }
  }

  return null
}

/**
 * Consulta el estado de un ticket en SUNAT
 * Se usa para obtener el CDR de comunicaciones de baja y resúmenes
 *
 * @param {string} ticket - Ticket obtenido de sendSummary
 * @param {Object} config - Configuración
 * @returns {Object} { success: boolean, accepted?: boolean, cdrData?: string, error?: string }
 */
export async function getStatus(ticket, config) {
  try {
    const { ruc, solUser, solPassword, environment } = config

    const url = environment === 'production' ? SUNAT_URLS.production : SUNAT_URLS.beta

    console.log(`🌐 Endpoint SUNAT (getStatus): ${url}`)
    console.log(`🎫 Consultando ticket: ${ticket}`)

    // Crear SOAP envelope para getStatus
    const soapEnvelope = createGetStatusEnvelope(ticket, ruc, solUser, solPassword)

    const response = await axios.post(url, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:getStatus'
      },
      timeout: 60000
    })

    console.log('✅ Respuesta de getStatus recibida')

    // Parsear respuesta
    const result = await parseGetStatusResponse(response.data)

    return result

  } catch (error) {
    console.error('❌ Error al consultar estado:', error.message)

    if (error.response?.data) {
      const errorResult = parseSunatError(error.response.data)
      return {
        success: false,
        error: errorResult.description || 'Error al consultar estado'
      }
    }

    return {
      success: false,
      error: `Error de conexión: ${error.message}`
    }
  }
}

/**
 * Crea SOAP envelope para getStatus
 */
function createGetStatusEnvelope(ticket, ruc, solUser, solPassword) {
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
 * Parsea respuesta de getStatus
 */
async function parseGetStatusResponse(soapResponse) {
  try {
    console.log('📥 Respuesta getStatus (primeros 1000 chars):', soapResponse.substring(0, 1000))

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true
    })

    const parsed = parser.parse(soapResponse)
    console.log('📋 getStatus parsed keys:', Object.keys(parsed))

    const envelope = parsed.Envelope || parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed['soap-env:Envelope']
    if (!envelope) {
      console.log('❌ No se encontró Envelope en getStatus')
      return { success: false, error: 'Respuesta SOAP inválida' }
    }

    const body = envelope.Body || envelope['soap:Body'] || envelope['soapenv:Body'] || envelope['soap-env:Body']
    if (!body) {
      console.log('❌ No se encontró Body en getStatus. Envelope keys:', Object.keys(envelope))
      return { success: false, error: 'Respuesta SOAP inválida' }
    }

    console.log('📋 getStatus Body keys:', Object.keys(body))

    // Verificar fault
    const fault = body.Fault || body['soap-env:Fault'] || body['soap:Fault'] || body['soapenv:Fault']
    if (fault) {
      const faultString = fault.faultstring || fault.Reason?.Text || 'Error desconocido de SUNAT'
      console.log('❌ getStatus SOAP Fault:', faultString)
      return {
        success: false,
        error: faultString
      }
    }

    // Buscar respuesta de getStatus (con removeNSPrefix, no hay prefijos)
    const getStatusResponse = body.getStatusResponse || body['br:getStatusResponse'] || body['ns2:getStatusResponse']

    console.log('📋 getStatusResponse:', JSON.stringify(getStatusResponse, null, 2)?.substring(0, 500))

    if (!getStatusResponse) {
      console.log('❌ No se encontró getStatusResponse. Body completo:', JSON.stringify(body, null, 2)?.substring(0, 500))
      return {
        success: false,
        error: 'Respuesta de getStatus no encontrada'
      }
    }

    // Verificar código de estado
    const statusCode = getStatusResponse.status?.statusCode || getStatusResponse.statusCode
    console.log('📋 statusCode:', statusCode)

    // Código 0 = Proceso terminado exitosamente
    // Código 98 = En proceso
    // Código 99 = Proceso con errores

    if (statusCode === '98' || statusCode === 98) {
      return {
        success: true,
        pending: true,
        message: 'El documento está siendo procesado por SUNAT'
      }
    }

    // Si hay CDR (content), procesarlo
    const cdrBase64 = getStatusResponse.status?.content || getStatusResponse.content

    if (cdrBase64) {
      // Descomprimir CDR
      const cdrZipBuffer = Buffer.from(cdrBase64, 'base64')
      const zip = new JSZip()
      const cdrZip = await zip.loadAsync(cdrZipBuffer)

      // Buscar XML del CDR - puede empezar con R- (respuesta normal)
      const cdrFileName = Object.keys(cdrZip.files).find(name => name.endsWith('.xml'))
      console.log('📋 Archivos en ZIP del CDR:', Object.keys(cdrZip.files))
      console.log('📋 Archivo CDR encontrado:', cdrFileName)

      if (cdrFileName) {
        const cdrXML = await cdrZip.files[cdrFileName].async('text')
        console.log('📋 CDR XML (primeros 500 chars):', cdrXML.substring(0, 500))

        // Parsear CDR con removeNSPrefix para simplificar
        const cdrParser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
          removeNSPrefix: true
        })
        const cdr = cdrParser.parse(cdrXML)

        console.log('📋 CDR parsed structure:', JSON.stringify(cdr, null, 2).substring(0, 1500))

        // Buscar ResponseCode en diferentes ubicaciones posibles
        let responseCode = null
        let description = null

        // Intentar diferentes rutas según la estructura del CDR
        if (cdr.ApplicationResponse) {
          // Ruta 1: DocumentResponse/Response (común en facturas)
          const docResponse = cdr.ApplicationResponse.DocumentResponse
          if (docResponse?.Response) {
            responseCode = docResponse.Response.ResponseCode
            description = docResponse.Response.Description
          }

          // Ruta 2: Directamente en ApplicationResponse
          if (responseCode === null || responseCode === undefined) {
            responseCode = cdr.ApplicationResponse.ResponseCode
            description = cdr.ApplicationResponse.Note
          }

          // Ruta 3: En cac:DocumentResponse/cac:Response (para comunicaciones de baja)
          if (responseCode === null || responseCode === undefined) {
            // Buscar recursivamente
            responseCode = findValueInObject(cdr, 'ResponseCode')
            description = findValueInObject(cdr, 'Description') || findValueInObject(cdr, 'Note')
          }
        }

        // Si el responseCode es un objeto con #text (viene de XML con atributos)
        if (responseCode && typeof responseCode === 'object') {
          responseCode = responseCode['#text'] || responseCode['_'] || Object.values(responseCode)[0]
        }
        // Lo mismo para description
        if (description && typeof description === 'object') {
          description = description['#text'] || description['_'] || Object.values(description)[0]
        }

        // Normalizar a string
        responseCode = responseCode !== null && responseCode !== undefined ? String(responseCode) : null

        // Si no encontramos código, usar statusCode o UNKNOWN
        if (!responseCode) {
          responseCode = statusCode ? String(statusCode) : 'UNKNOWN'
        }

        console.log(`📋 CDR de baja: statusCode=${statusCode}, responseCode=${responseCode}, description=${description}`)

        // statusCode 99 = proceso con errores, aunque el CDR diga otra cosa
        if (statusCode === '99' || statusCode === 99) {
          return {
            success: false,
            accepted: false,
            code: responseCode || '99',
            error: description || 'SUNAT rechazó la comunicación de baja',
            cdrData: cdrXML
          }
        }

        // Código 0 = Aceptado, 4xxx = Aceptado con observaciones
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

    // Si statusCode es 99, hubo error
    if (statusCode === '99' || statusCode === 99) {
      return {
        success: false,
        error: 'SUNAT rechazó la comunicación de baja (sin CDR)'
      }
    }

    return {
      success: true,
      accepted: statusCode === '0' || statusCode === 0,
      code: String(statusCode),
      description: 'Procesado por SUNAT'
    }

  } catch (error) {
    console.error('Error al parsear respuesta getStatus:', error)
    return {
      success: false,
      error: 'Error al procesar respuesta de SUNAT'
    }
  }
}
