import axios from 'axios'
import JSZip from 'jszip'
import crypto from 'crypto'

/**
 * Cliente REST para comunicación con SUNAT - Guías de Remisión Electrónica (GRE)
 *
 * NUEVA API REST de SUNAT (reemplaza el método SOAP antiguo)
 *
 * Documentación oficial:
 * - https://cpe.sunat.gob.pe/landing/guia-de-remision-electronica-gre
 * - https://github.com/thegreenter/gre-api
 *
 * IMPORTANTE: Requiere credenciales API generadas en el portal SOL de SUNAT:
 * - client_id y client_secret (generados en Menú SOL > Empresa > Credenciales API)
 */

// URLs de la API REST de SUNAT
const SUNAT_API_URLS = {
  // Autenticación
  auth: {
    beta: 'https://gre-beta.sunat.gob.pe/v1',
    production: 'https://api-seguridad.sunat.gob.pe/v1'
  },
  // Envío de documentos
  cpe: {
    beta: 'https://gre-beta.sunat.gob.pe/v1',
    production: 'https://api-cpe.sunat.gob.pe/v1'
  }
}

/**
 * Obtiene token de acceso OAuth2 de SUNAT
 *
 * @param {Object} config - Configuración de autenticación
 * @param {string} config.ruc - RUC del emisor
 * @param {string} config.solUser - Usuario SOL
 * @param {string} config.solPassword - Contraseña SOL
 * @param {string} config.clientId - Client ID de la API (generado en SOL)
 * @param {string} config.clientSecret - Client Secret de la API (generado en SOL)
 * @param {string} config.environment - 'beta' o 'production'
 * @returns {Promise<string>} Token de acceso
 */
async function getAccessToken(config) {
  const { ruc, solUser, solPassword, clientId, clientSecret, environment } = config

  const baseUrl = environment === 'production'
    ? SUNAT_API_URLS.auth.production
    : SUNAT_API_URLS.auth.beta

  const url = `${baseUrl}/clientessol/${clientId}/oauth2/token/`

  console.log(`🔑 [GRE-REST] Obteniendo token de SUNAT...`)
  console.log(`   URL: ${url}`)
  console.log(`   RUC: ${ruc}`)
  console.log(`   Usuario SOL: ${solUser}`)
  console.log(`   Usuario completo: ${ruc}${solUser}`)
  console.log(`   Client ID: ${clientId}`)
  console.log(`   Client Secret: ${clientSecret ? clientSecret.substring(0, 4) + '****' : 'NO CONFIGURADO'}`)

  try {
    const response = await axios.post(url,
      new URLSearchParams({
        grant_type: 'password',
        scope: 'https://api-cpe.sunat.gob.pe',
        client_id: clientId,
        client_secret: clientSecret,
        username: `${ruc}${solUser}`,
        password: solPassword
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    )

    console.log(`✅ [GRE-REST] Token obtenido, expira en ${response.data.expires_in} segundos`)
    return response.data.access_token

  } catch (error) {
    console.error('❌ [GRE-REST] Error al obtener token:', error.response?.data || error.message)

    if (error.response?.status === 401) {
      throw new Error('Credenciales API inválidas. Verifica client_id, client_secret y credenciales SOL.')
    }

    throw new Error(`Error de autenticación SUNAT: ${error.response?.data?.error_description || error.message}`)
  }
}

/**
 * Calcula hash SHA-256 de un buffer
 */
function calculateSHA256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Crea ZIP con el XML firmado
 */
async function createZipWithXML(xmlContent, fileName) {
  const zip = new JSZip()
  zip.file(fileName, xmlContent)
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  console.log(`📦 [GRE-REST] ZIP creado: ${fileName} (${zipBuffer.length} bytes)`)
  return zipBuffer
}

/**
 * Envía Guía de Remisión a SUNAT vía API REST
 *
 * @param {string} signedXML - XML firmado de la guía
 * @param {Object} config - Configuración
 * @param {string} config.ruc - RUC del emisor
 * @param {string} config.series - Serie de la guía (ej: T001)
 * @param {number} config.number - Número correlativo
 * @param {string} config.solUser - Usuario SOL
 * @param {string} config.solPassword - Contraseña SOL
 * @param {string} config.clientId - Client ID de la API
 * @param {string} config.clientSecret - Client Secret de la API
 * @param {string} config.environment - 'beta' o 'production'
 * @returns {Promise<Object>} Resultado del envío
 */
export async function sendDispatchGuideToSunatREST(signedXML, config) {
  try {
    const { ruc, series, number, environment } = config

    // 1. Obtener token de acceso
    const accessToken = await getAccessToken(config)

    // 2. Preparar nombre del archivo
    // Formato: RUC-09-Serie-Numero (09 = Guía de Remisión Remitente)
    const docTypeCode = '09'
    const fileName = `${ruc}-${docTypeCode}-${series}-${String(number).padStart(8, '0')}`

    console.log(`📄 [GRE-REST] Archivo: ${fileName}`)

    // 3. Crear ZIP con el XML
    const zipBuffer = await createZipWithXML(signedXML, `${fileName}.xml`)

    // 4. Calcular hash SHA-256 del ZIP
    const hashZip = calculateSHA256(zipBuffer)
    console.log(`🔐 [GRE-REST] Hash SHA-256: ${hashZip}`)

    // 5. Convertir ZIP a base64
    const zipBase64 = zipBuffer.toString('base64')

    // 6. Enviar a SUNAT
    const baseUrl = environment === 'production'
      ? SUNAT_API_URLS.cpe.production
      : SUNAT_API_URLS.cpe.beta

    const url = `${baseUrl}/contribuyente/gem/comprobantes/${fileName}`

    console.log(`📤 [GRE-REST] Enviando a: ${url}`)

    const response = await axios.post(url, {
      archivo: {
        nomArchivo: `${fileName}.zip`,
        arcGreZip: zipBase64,
        hashZip: hashZip
      }
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    })

    console.log(`✅ [GRE-REST] Respuesta de SUNAT:`, JSON.stringify(response.data, null, 2))

    // 7. SUNAT devuelve un ticket, debemos consultar el estado
    const { numTicket, fecRecepcion } = response.data

    console.log(`🎫 [GRE-REST] Ticket recibido: ${numTicket}`)
    console.log(`📅 [GRE-REST] Fecha recepción: ${fecRecepcion}`)

    // 8. Consultar estado del documento (polling)
    const result = await pollDocumentStatus(numTicket, accessToken, environment)

    return result

  } catch (error) {
    console.error('❌ [GRE-REST] Error al enviar GRE:', error.response?.data || error.message)

    if (error.response?.data) {
      const errorData = error.response.data
      throw new Error(errorData.mensaje || errorData.error || JSON.stringify(errorData))
    }

    throw new Error(`Error al enviar GRE a SUNAT: ${error.message}`)
  }
}

/**
 * Consulta el estado del documento enviado (polling)
 * SUNAT procesa el documento de forma asíncrona
 *
 * @param {string} numTicket - Número de ticket del envío
 * @param {string} accessToken - Token de acceso
 * @param {string} environment - 'beta' o 'production'
 * @returns {Promise<Object>} Estado del documento
 */
async function pollDocumentStatus(numTicket, accessToken, environment) {
  const baseUrl = environment === 'production'
    ? SUNAT_API_URLS.cpe.production
    : SUNAT_API_URLS.cpe.beta

  const url = `${baseUrl}/contribuyente/gem/comprobantes/envios/${numTicket}`

  // Intentar hasta 10 veces con espera de 2 segundos
  const maxAttempts = 10
  const delayMs = 2000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`🔄 [GRE-REST] Consultando estado (intento ${attempt}/${maxAttempts})...`)

    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 30000
      })

      const { codRespuesta, error, arcCdr, indCdrGenerado } = response.data

      console.log(`📋 [GRE-REST] Código respuesta: ${codRespuesta}, CDR generado: ${indCdrGenerado}`)

      // Códigos de respuesta:
      // 0 = Aceptado
      // 98 = En proceso
      // 99 = Rechazado con errores

      if (codRespuesta === '98') {
        // Aún en proceso, esperar y reintentar
        console.log(`⏳ [GRE-REST] Documento en proceso, esperando ${delayMs}ms...`)
        await sleep(delayMs)
        continue
      }

      if (codRespuesta === '0') {
        // Aceptado
        let cdrXML = null
        if (arcCdr) {
          cdrXML = await decodeCDR(arcCdr)
        }

        return {
          accepted: true,
          code: '0',
          description: 'Guía de Remisión aceptada por SUNAT',
          cdrData: cdrXML,
          ticket: numTicket,
          observations: []
        }
      }

      if (codRespuesta === '99') {
        // Rechazado
        const errorMsg = error ? `${error.numError}: ${error.desError}` : 'Error desconocido'

        return {
          accepted: false,
          code: error?.numError || '99',
          description: error?.desError || 'Guía de Remisión rechazada por SUNAT',
          ticket: numTicket,
          observations: []
        }
      }

      // Código desconocido
      return {
        accepted: false,
        code: codRespuesta,
        description: `Respuesta inesperada de SUNAT: ${codRespuesta}`,
        ticket: numTicket,
        observations: []
      }

    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(`Error al consultar estado después de ${maxAttempts} intentos: ${error.message}`)
      }

      console.log(`⚠️ [GRE-REST] Error en consulta, reintentando...`)
      await sleep(delayMs)
    }
  }

  // Si llegamos aquí, el documento sigue en proceso
  return {
    accepted: false,
    code: '98',
    description: 'Documento aún en proceso. Consulte más tarde.',
    ticket: numTicket,
    pending: true,
    observations: []
  }
}

/**
 * Decodifica el CDR (Constancia de Recepción) de SUNAT
 */
async function decodeCDR(arcCdr) {
  try {
    // El CDR puede venir como ZIP o directamente como XML en base64
    const buffer = Buffer.from(arcCdr, 'base64')

    // Intentar descomprimir como ZIP
    try {
      const zip = new JSZip()
      const zipContent = await zip.loadAsync(buffer)

      // Buscar el archivo XML del CDR
      const cdrFileName = Object.keys(zipContent.files).find(name => name.endsWith('.xml'))

      if (cdrFileName) {
        const cdrXML = await zipContent.files[cdrFileName].async('text')
        console.log(`📄 [GRE-REST] CDR extraído: ${cdrFileName}`)
        return cdrXML
      }
    } catch {
      // No es un ZIP, probablemente es XML directo
    }

    // Si no es ZIP, devolver como string
    return buffer.toString('utf8')

  } catch (error) {
    console.error('⚠️ [GRE-REST] Error al decodificar CDR:', error.message)
    return null
  }
}

/**
 * Función auxiliar para esperar
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Verifica si las credenciales API están configuradas
 */
export function hasAPICredentials(sunatConfig) {
  return !!(sunatConfig?.clientId && sunatConfig?.clientSecret)
}

/**
 * Recupera el CDR de una guía ya enviada usando su numTicket.
 *
 * Útil cuando la emisión original aceptó la guía pero por algún motivo el
 * CDR no quedó guardado (red, timeout, respuesta truncada, etc.). SUNAT
 * mantiene el CDR consultable por ticket por un tiempo.
 *
 * @param {string} ticket - numTicket devuelto al emitir
 * @param {Object} config - Mismo shape que sendDispatchGuideToSunatREST
 * @returns {Promise<Object>} { accepted, cdrData, code, description, ticket }
 */
export async function recoverCdrByTicket(ticket, config) {
  if (!ticket) {
    throw new Error('Ticket es requerido para recuperar el CDR')
  }
  const accessToken = await getAccessToken(config)
  return await pollDocumentStatus(ticket, accessToken, config.environment)
}
