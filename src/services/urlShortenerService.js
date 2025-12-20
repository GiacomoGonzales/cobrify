/**
 * Servicio para acortar URLs usando cbrfy.link
 * Reemplaza la dependencia de TinyURL con nuestro propio servicio
 */

const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_URL || 'https://us-central1-cobrify-395fe.cloudfunctions.net'

/**
 * Crea una URL corta para un enlace largo
 * @param {string} url - URL larga a acortar
 * @param {string} businessId - ID del negocio (opcional, para tracking)
 * @param {string} invoiceId - ID del comprobante (opcional, para tracking)
 * @returns {Promise<string>} URL corta (cbrfy.link/abc123)
 */
export async function shortenUrl(url, businessId = null, invoiceId = null) {
  try {
    const response = await fetch(`${FUNCTIONS_BASE_URL}/createShortUrl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        businessId,
        invoiceId
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    console.log('🔗 URL acortada:', data.shortUrl)
    return data.shortUrl

  } catch (error) {
    console.error('❌ Error acortando URL:', error)
    // Fallback: retornar URL original si falla
    return url
  }
}

/**
 * Genera un enlace de WhatsApp con el PDF del comprobante
 * @param {string} phone - Número de teléfono
 * @param {string} pdfUrl - URL del PDF
 * @param {string} invoiceNumber - Número de comprobante
 * @param {string} businessId - ID del negocio
 * @param {string} invoiceId - ID del comprobante
 * @returns {Promise<string>} URL de WhatsApp lista para abrir
 */
export async function generateWhatsAppLink(phone, pdfUrl, invoiceNumber, businessId = null, invoiceId = null) {
  // Acortar la URL del PDF
  const shortUrl = await shortenUrl(pdfUrl, businessId, invoiceId)

  // Limpiar número de teléfono
  const cleanPhone = phone.replace(/\D/g, '')

  // Formatear número peruano si es necesario
  const formattedPhone = cleanPhone.startsWith('51') ? cleanPhone : `51${cleanPhone}`

  // Mensaje predeterminado
  const message = `Aquí está su comprobante ${invoiceNumber}: ${shortUrl}`

  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
}
