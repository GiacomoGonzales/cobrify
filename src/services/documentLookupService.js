/**
 * Servicio para consultar datos de DNI y RUC en APIs públicas de Perú
 *
 * APIs Soportadas:
 * - apiperu.dev (API Perú - Requiere token)
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core'

// Obtener el token de las variables de entorno
const APIPERU_TOKEN = import.meta.env.VITE_APIPERU_TOKEN

// URL base de la API apiperu.dev
const API_BASE_URL = 'https://apiperu.dev'

// Función para hacer request HTTP (usa CapacitorHttp en nativo, fetch en web)
const httpRequest = async (url, options) => {
  const isNative = Capacitor.isNativePlatform()

  if (isNative) {
    // Usar CapacitorHttp para peticiones nativas (evita problemas de CORS/ATS)
    const response = await CapacitorHttp.request({
      url,
      method: options.method || 'POST',
      headers: options.headers,
      data: options.body ? JSON.parse(options.body) : undefined
    })

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.data
    }
  } else {
    // Usar fetch estándar en web
    return fetch(url, options)
  }
}

/**
 * Consultar DNI en RENIEC
 * @param {string} dni - Número de DNI (8 dígitos)
 * @returns {Promise<Object>} - Datos de la persona
 */
export const consultarDNI = async (dni) => {
  try {
    // Validar formato
    if (!dni || dni.length !== 8 || !/^\d{8}$/.test(dni)) {
      return {
        success: false,
        error: 'DNI debe tener 8 dígitos numéricos'
      }
    }

    // Validar que existe el token
    if (!APIPERU_TOKEN) {
      return {
        success: false,
        error: 'Token de API no configurado. Verifica tu archivo .env.local'
      }
    }

    const isNative = Capacitor.isNativePlatform()

    // Usar apiperu.dev - siempre POST con body JSON
    const url = isNative ? `${API_BASE_URL}/api/dni` : '/api/dni'
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dni })
    }

    const response = await httpRequest(url, options)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'No se pudo consultar el DNI')
    }

    const result = await response.json()

    // Verificar si se encontraron datos
    if (!result || result.success === false) {
      return {
        success: false,
        error: result.message || 'No se encontraron datos para este DNI'
      }
    }

    // apiperu.dev devuelve los datos directamente o en result.data
    const data = result.data || result

    // Formatear respuesta
    return {
      success: true,
      data: {
        dni: data.numero || dni,
        nombres: data.nombres || '',
        apellidoPaterno: data.apellido_paterno || '',
        apellidoMaterno: data.apellido_materno || '',
        nombreCompleto: data.nombre_completo || `${data.nombres || ''} ${data.apellido_paterno || ''} ${data.apellido_materno || ''}`.trim()
      }
    }
  } catch (error) {
    console.error('Error al consultar DNI:', error)
    return {
      success: false,
      error: error.message || 'Error al consultar DNI. Verifique su conexión a internet.'
    }
  }
}

/**
 * Consultar RUC en SUNAT
 * @param {string} ruc - Número de RUC (11 dígitos)
 * @returns {Promise<Object>} - Datos de la empresa
 */
export const consultarRUC = async (ruc) => {
  try {
    // Validar formato
    if (!ruc || ruc.length !== 11 || !/^\d{11}$/.test(ruc)) {
      return {
        success: false,
        error: 'RUC debe tener 11 dígitos numéricos'
      }
    }

    // Validar que existe el token
    if (!APIPERU_TOKEN) {
      return {
        success: false,
        error: 'Token de API no configurado. Verifica tu archivo .env.local'
      }
    }

    const isNative = Capacitor.isNativePlatform()

    // Usar apiperu.dev - siempre POST con body JSON
    const url = isNative ? `${API_BASE_URL}/api/ruc` : '/api/ruc'
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ruc })
    }

    const response = await httpRequest(url, options)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'No se pudo consultar el RUC')
    }

    const result = await response.json()

    // Verificar si se encontraron datos
    if (!result || result.success === false) {
      return {
        success: false,
        error: result.message || 'No se encontraron datos para este RUC'
      }
    }

    // apiperu.dev devuelve los datos directamente o en result.data
    const data = result.data || result

    // Sin direccion es un RUC de persona natural: el dato vive en el endpoint
    // del domicilio fiscal. Ver consultarDomicilioFiscal.
    let domicilio = data
    if (!data.direccion_completa && !data.direccion) {
      const extra = await consultarDomicilioFiscal(ruc)
      if (extra) domicilio = extra
    }

    // Formatear respuesta
    return {
      success: true,
      data: {
        ruc: data.ruc || ruc,
        razonSocial: data.nombre_o_razon_social || data.razon_social || '',
        nombreComercial: data.nombre_comercial || '',
        estado: data.estado || '',
        condicion: data.condicion || '',
        direccion: domicilio.direccion_completa || domicilio.direccion || '',
        departamento: domicilio.departamento || '',
        provincia: domicilio.provincia || '',
        distrito: domicilio.distrito || '',
        ubigeo: ubigeoDe(domicilio)
      }
    }
  } catch (error) {
    console.error('Error al consultar RUC:', error)
    return {
      success: false,
      error: error.message || 'Error al consultar RUC. Verifique su conexión a internet.'
    }
  }
}

/**
 * El UBIGEO como CODIGO de 6 digitos.
 *
 * apiperu manda dos cosas con nombres parecidos: `ubigeo_sunat` es el codigo
 * ("150141") y `ubigeo` es un ARRAY de tres niveles (["15","1501","150141"]).
 * Devolver el array dejaba a las guias de remision sin ubigeo en silencio: el
 * consumidor pregunta por `.length === 6` y un array de tres da 3.
 */
const ubigeoDe = (data) => {
  if (!data) return ''
  const codigo = data.ubigeo_sunat || ''
  if (codigo) return String(codigo)
  const partes = data.ubigeo
  if (Array.isArray(partes)) {
    const ultimo = partes.filter(Boolean).pop()
    return ultimo ? String(ultimo) : ''
  }
  return partes ? String(partes) : ''
}

/**
 * El DOMICILIO FISCAL de un RUC, en su endpoint propio.
 *
 * Hace falta porque /api/ruc devuelve la direccion VACIA cuando el RUC es de
 * PERSONA NATURAL (empieza con 10): nombre, estado y condicion llegan bien, y
 * direccion, departamento, provincia, distrito y ubigeo llegan todos en
 * blanco. Con un RUC 20 el mismo endpoint los devuelve completos (verificado
 * contra tres RUC 10 y un RUC 20, 03-sep-2026; reporte de JMC).
 *
 * Consume un credito APARTE, asi que consultarRUC solo lo llama cuando de
 * verdad falto la direccion — y no "cuando el RUC empieza con 10": si manana
 * apiperu completa el endpoint principal, esta segunda consulta deja de
 * hacerse sola.
 *
 * Nunca tira: es un complemento. Si falla, el RUC igual se devuelve con lo que
 * si vino.
 */
const consultarDomicilioFiscal = async (ruc) => {
  try {
    const isNative = Capacitor.isNativePlatform()
    const url = isNative ? `${API_BASE_URL}/api/ruc-domicilio-fiscal` : '/api/ruc-domicilio'
    const response = await httpRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ruc })
    })
    if (!response.ok) return null
    const result = await response.json()
    if (!result || result.success === false) return null
    return result.data || null
  } catch (error) {
    console.warn('No se pudo consultar el domicilio fiscal:', error?.message || error)
    return null
  }
}

/**
 * Consultar los ESTABLECIMIENTOS (anexos) de un RUC en SUNAT.
 * Es una consulta APARTE de consultarRUC (consume un crédito adicional de apiperu).
 * Útil para RUCs con varios locales: devuelve la lista para que el usuario elija.
 * @param {string} ruc - Número de RUC (11 dígitos)
 * @returns {Promise<Object>} - { success, data: [{ codigo, tipo, direccion, direccionCompleta, departamento, provincia, distrito, ubigeo }] }
 */
export const consultarEstablecimientos = async (ruc) => {
  try {
    // Validar formato
    if (!ruc || ruc.length !== 11 || !/^\d{11}$/.test(ruc)) {
      return {
        success: false,
        error: 'RUC debe tener 11 dígitos numéricos'
      }
    }

    // Validar que existe el token
    if (!APIPERU_TOKEN) {
      return {
        success: false,
        error: 'Token de API no configurado. Verifica tu archivo .env.local'
      }
    }

    const isNative = Capacitor.isNativePlatform()

    // Web: usa el proxy /api/ruc-establecimientos. Nativo: directo a apiperu.dev.
    const url = isNative
      ? `${API_BASE_URL}/api/ruc-establecimientos-anexos`
      : '/api/ruc-establecimientos'
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ruc })
    }

    const response = await httpRequest(url, options)

    // apiperu responde con "error" cuando el RUC no tiene LOCALES ANEXOS (solo el
    // domicilio fiscal) — le pasa a la mayoría de RUCs de un solo local. Puede venir
    // como 404 o con mensajes variados ("No se encontró información para locales
    // anexos", "Recurso no encontrado"). Como el endpoint y el token están
    // confirmados, un "no encontrado" aquí = sin anexos (NO es un fallo).
    const esSinAnexos = (txt, status) => {
      if (status === 404) return true
      const t = String(txt || '').toLowerCase()
      if (/anexos/.test(t) && /(no se encontr|no hay|sin |no tiene|not found)/.test(t)) return true
      if (/recurso no encontrad|resource not found|no se encontr.*informaci/.test(t)) return true
      return false
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const detalle = errorData.error || errorData.message || `HTTP ${response.status}`
      // 401/402/403 = el plan/token de apiperu no incluye este endpoint
      if ([401, 402, 403].includes(response.status)) {
        throw new Error(`Tu plan de apiperu.dev no incluye la consulta de establecimientos (${detalle})`)
      }
      // 404 / "recurso no encontrado" / "sin anexos" = el RUC solo tiene domicilio fiscal
      if (esSinAnexos(detalle, response.status)) {
        return { success: true, data: [] }
      }
      throw new Error(`No se pudieron consultar los establecimientos: ${detalle}`)
    }

    const result = await response.json()

    if (!result || result.success === false) {
      const msg = result?.message || result?.error || ''
      if (esSinAnexos(msg)) {
        return { success: true, data: [] }
      }
      return {
        success: false,
        error: msg || 'No se encontraron establecimientos para este RUC'
      }
    }

    // La data es un array de establecimientos
    const list = Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : [])

    const data = list.map(e => ({
      codigo: e.codigo || '',
      tipo: e.tipo_de_establecimiento || '',
      actividad: e.actividad_economica || '',
      direccion: e.direccion || '',
      direccionCompleta: e.direccion_completa || e.direccion || '',
      departamento: e.departamento || '',
      provincia: e.provincia || '',
      distrito: e.distrito || '',
      // Mismo criterio que el domicilio fiscal: el CODIGO, no el array de niveles
      ubigeo: ubigeoDe(e)
    }))

    return { success: true, data }
  } catch (error) {
    console.error('Error al consultar establecimientos:', error)
    return {
      success: false,
      error: error.message || 'Error al consultar establecimientos. Verifique su conexión a internet.'
    }
  }
}

/**
 * Consultar documento (DNI o RUC) automáticamente según longitud
 * @param {string} documento - Número de documento
 * @returns {Promise<Object>} - Datos del documento
 */
export const consultarDocumento = async (documento) => {
  if (!documento) {
    return {
      success: false,
      error: 'Debe ingresar un número de documento'
    }
  }

  const cleanDoc = documento.replace(/\D/g, '')

  if (cleanDoc.length === 8) {
    return await consultarDNI(cleanDoc)
  } else if (cleanDoc.length === 11) {
    return await consultarRUC(cleanDoc)
  } else {
    return {
      success: false,
      error: 'Documento inválido. Debe ser DNI (8 dígitos) o RUC (11 dígitos)'
    }
  }
}
