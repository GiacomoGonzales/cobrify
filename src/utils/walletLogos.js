// Logos de marca de billeteras (Yape/Plin) para los PDF, con esquinas redondeadas.
// jsPDF no recorta imágenes a esquinas redondeadas, así que las redondeamos en runtime
// con un canvas (el PDF se genera en el navegador / webview, donde canvas está disponible)
// y devolvemos un PNG en base64 ya redondeado, listo para doc.addImage. Cacheado.
import yapeLogoUrl from '@/assets/wallets/yape.png'
import plinLogoUrl from '@/assets/wallets/plin.png'

const LOGO_URLS = {
  yape: yapeLogoUrl,
  plin: plinLogoUrl,
}

const _cache = new Map()

/**
 * Devuelve el logo de la billetera como dataURL PNG con esquinas redondeadas, o null.
 * @param {string} provider - 'Yape' | 'Plin' (case-insensitive)
 * @param {number} size - lado del canvas en px
 * @param {number} radius - radio de las esquinas en px
 */
export const getWalletLogoDataUrl = (provider, size = 96, radius = 18) => {
  const key = String(provider || '').trim().toLowerCase()
  const url = LOGO_URLS[key]
  if (!url) return Promise.resolve(null)

  const cacheKey = `${key}_${size}_${radius}`
  if (_cache.has(cacheKey)) return _cache.get(cacheKey)

  const promise = new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')

          // Clip a rectángulo con esquinas redondeadas
          const r = Math.min(radius, size / 2)
          ctx.beginPath()
          ctx.moveTo(r, 0)
          ctx.arcTo(size, 0, size, size, r)
          ctx.arcTo(size, size, 0, size, r)
          ctx.arcTo(0, size, 0, 0, r)
          ctx.arcTo(0, 0, size, 0, r)
          ctx.closePath()
          ctx.clip()

          // object-fit: cover (centrado). Ambos logos son cuadrados → encajan exacto.
          const iw = img.naturalWidth || size
          const ih = img.naturalHeight || size
          const scale = Math.max(size / iw, size / ih)
          const dw = iw * scale
          const dh = ih * scale
          ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)

          resolve(canvas.toDataURL('image/png'))
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = url
    } catch {
      resolve(null)
    }
  })

  _cache.set(cacheKey, promise)
  return promise
}
