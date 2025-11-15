/**
 * Servicio para consultar datos de DNI y RUC en APIs públicas de Perú
 *
 * APIs Soportadas:
 * - apiperu.dev (API Perú - Requiere token)
 */

import { Capacitor } from '@capacitor/core'

// Obtener el token de las variables de entorno
const APIPERU_TOKEN = import.meta.env.VITE_APIPERU_TOKEN

// URLs de la API según plataforma
const getApiUrl = (type) => {
  const isNative = Capacitor.isNativePlatform()

  if (isNative) {
    // En app móvil, usar URL directa
    return type === 'dni'
      ? 'https://api.apis.net.pe/v2/reniec/dni'
      : 'https://api.apis.net.pe/v2/sunat/ruc'
  } else {
    // En web, usar proxy de Vite
    return `/api/${type}`
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

    // Usar API según plataforma (proxy en web, URL directa en app móvil)
    const apiUrl = getApiUrl('dni')
    const isNative = Capacitor.isNativePlatform()

    // En app móvil, usar parámetros GET. En web, usar POST con el proxy
    const url = isNative ? `${apiUrl}?numero=${dni}` : apiUrl
    const options = isNative ? {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
      }
    } : {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dni })
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      throw new Error('No se pudo consultar el DNI')
    }

    const result = await response.json()

    // Verificar si se encontraron datos
    if (!result || !result.data || result.success === false) {
      return {
        success: false,
        error: result.message || 'No se encontraron datos para este DNI'
      }
    }

    const data = result.data

    // Formatear respuesta
    return {
      success: true,
      data: {
        dni: data.numero || dni,
        nombres: data.nombre_completo || '',
        apellidoPaterno: data.apellido_paterno || '',
        apellidoMaterno: data.apellido_materno || '',
        nombreCompleto: data.nombre_completo || ''
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

    // Usar API según plataforma (proxy en web, URL directa en app móvil)
    const apiUrl = getApiUrl('ruc')
    const isNative = Capacitor.isNativePlatform()

    // En app móvil, usar parámetros GET. En web, usar POST con el proxy
    const url = isNative ? `${apiUrl}?numero=${ruc}` : apiUrl
    const options = isNative ? {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
      }
    } : {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ruc })
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      throw new Error('No se pudo consultar el RUC')
    }

    const result = await response.json()

    // Verificar si se encontraron datos
    if (!result || !result.data || result.success === false) {
      return {
        success: false,
        error: result.message || 'No se encontraron datos para este RUC'
      }
    }

    const data = result.data

    // Formatear respuesta
    return {
      success: true,
      data: {
        ruc: data.ruc || ruc,
        razonSocial: data.nombre_o_razon_social || '',
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
