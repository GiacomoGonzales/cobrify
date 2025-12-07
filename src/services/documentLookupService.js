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

    // Formatear respuesta
    return {
      success: true,
      data: {
        ruc: data.ruc || ruc,
        razonSocial: data.nombre_o_razon_social || data.razon_social || '',
        nombreComercial: data.nombre_comercial || '',
        estado: data.estado || '',
        condicion: data.condicion || '',
        direccion: data.direccion_completa || data.direccion || '',
        departamento: data.departamento || '',
        provincia: data.provincia || '',
        distrito: data.distrito || '',
        ubigeo: data.ubigeo || ''
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
