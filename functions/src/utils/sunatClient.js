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
    const docTypeCode = documentType === 'factura' ? '01' : '03'
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
      timeout: 60000 // 60 segundos timeout
    })

    console.log('✅ Respuesta recibida de SUNAT')

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
 * Crea SOAP envelope para envío a SUNAT
 */
function createSoapEnvelope(fileName, zipBase64, ruc, solUser, solPassword) {
  // Usuario completo para SOL: RUC + Usuario
  const fullUser = `${ruc}${solUser}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ser="http://service.sunat.gob.pe"
                  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${fullUser}</wsse:Username>
        <wsse:Password>${solPassword}</wsse:Password>
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

      // Parsear CDR
      const cdr = parser.parse(cdrXML)

      // Extraer información del CDR
      const responseCode = cdr.ApplicationResponse?.['cbc:ResponseCode'] || '0'
      const description = cdr.ApplicationResponse?.['cbc:Note'] || 'Aceptado por SUNAT'

      // Código 0 = Aceptado
      const accepted = responseCode === '0' || responseCode === 0

      return {
        accepted,
        code: String(responseCode),
        description,
        cdrData: cdrXML,
        observations: []
      }
    }

    // Si no hay applicationResponse, puede ser un error
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
 * Verifica el estado de un comprobante en SUNAT
 */
export async function checkInvoiceStatus(config) {
  // TODO: Implementar consulta de estado
  // Endpoint: consultaCDR
  console.log('⚠️ checkInvoiceStatus not implemented yet')
  return null
}
