/**
 * Vercel Serverless Function para consultar el DOMICILIO FISCAL de un RUC
 * en API Perú (https://apiperu.dev/api/ruc-domicilio-fiscal).
 *
 * Por qué existe, si /api/ruc ya trae una dirección:
 *
 * Porque para los RUC de PERSONA NATURAL (los que empiezan con 10) esa
 * dirección viene VACÍA. Verificado contra tres RUC 10 distintos: nombre,
 * estado y condición llegan bien, y `direccion`, `direccion_completa`,
 * departamento, provincia, distrito y ubigeo llegan todos en blanco. Con un
 * RUC 20 el mismo endpoint los devuelve completos.
 *
 * Este endpoint sí los tiene, para los dos tipos de RUC.
 *
 * Actúa como proxy hacia apiperu.dev para no exponer el token en el frontend.
 * Es una consulta APARTE de /api/ruc (consume un crédito adicional), así que
 * el cliente solo la usa cuando la dirección llegó vacía.
 */

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  // Manejar preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { ruc } = req.body

    // Validar RUC
    if (!ruc || !/^\d{11}$/.test(ruc)) {
      return res.status(400).json({
        success: false,
        error: 'RUC debe tener 11 dígitos numéricos'
      })
    }

    // Obtener token de las variables de entorno de Vercel
    const APIPERU_TOKEN = process.env.VITE_APIPERU_TOKEN

    if (!APIPERU_TOKEN) {
      console.error('❌ VITE_APIPERU_TOKEN no está configurado en Vercel')
      return res.status(500).json({
        success: false,
        error: 'Token de API no configurado en el servidor'
      })
    }

    console.log(`🔍 Consultando domicilio fiscal del RUC: ${ruc}`)

    const apiResponse = await fetch('https://apiperu.dev/api/ruc-domicilio-fiscal', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ruc })
    })

    // Leer el cuerpo siempre (apiperu manda JSON con el detalle, incluso en error)
    const result = await apiResponse.json().catch(() => null)

    if (!apiResponse.ok) {
      console.error(`❌ Error de API Perú (domicilio fiscal): ${apiResponse.status}`, result)
      // Reenviar el estado y el mensaje REAL de apiperu para poder diagnosticar
      // (p.ej. 401/403 = el plan/token no incluye este endpoint).
      return res.status(apiResponse.status).json({
        success: false,
        error: result?.message || result?.error || `API Perú respondió ${apiResponse.status}`,
        apiStatus: apiResponse.status
      })
    }

    // Devolver respuesta tal cual ({ success, data: {...} })
    return res.status(200).json(result)

  } catch (error) {
    console.error('❌ Error en /api/ruc-domicilio:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Error al consultar domicilio fiscal'
    })
  }
}
