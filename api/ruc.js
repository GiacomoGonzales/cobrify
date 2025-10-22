/**
 * Vercel Serverless Function para consultar RUC en API Perú
 *
 * Esta función actúa como proxy hacia apiperu.dev para evitar
 * exponer el token directamente en el frontend
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

    console.log(`🔍 Consultando RUC: ${ruc}`)

    // Hacer request a API Perú
    const apiResponse = await fetch(`https://apiperu.dev/api/ruc/${ruc}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${APIPERU_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    })

    if (!apiResponse.ok) {
      console.error(`❌ Error de API Perú: ${apiResponse.status}`)
      throw new Error('Error al consultar API Perú')
    }

    const result = await apiResponse.json()

    console.log(`✅ RUC encontrado: ${result.data?.nombre_o_razon_social || 'Sin datos'}`)

    // Devolver respuesta
    return res.status(200).json(result)

  } catch (error) {
    console.error('❌ Error en /api/ruc:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Error al consultar RUC'
    })
  }
}
