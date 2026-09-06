/**
 * BAJAR UNA IMAGEN PARA METERLA EN UN PDF.
 *
 * jsPDF necesita la imagen como data URL, así que hay que descargarla y
 * convertirla. Suena simple y tiene tres caminos, porque ninguno funciona
 * siempre:
 *
 *   1. **CapacitorHttp** en la app. El `fetch` del WebView de Android falla con
 *      CORS en casos donde el plugin nativo no.
 *   2. **`getBlob` del SDK de Firebase**, que va autenticado y pasa por las
 *      reglas de Storage.
 *   3. **`fetch` a la URL tal cual**, que lleva el token de descarga y por eso
 *      NO pasa por las reglas.
 *
 * POR QUÉ ESTÁ ACÁ Y NO COPIADO (6-set-2026): esto vivía repetido en los OCHO
 * generadores de PDF, en seis variantes distintas, y en todas el tercer camino
 * era **inalcanzable**: el `getBlob` hacía `return` dentro de su `if`, y si
 * lanzaba, el `catch` general relanzaba sin llegar nunca al `fetch`. Así, el
 * logo de una sucursal —que hasta ese día solo el dueño podía leer por reglas—
 * dejaba el PDF con el recuadro "TU LOGO AQUÍ" para los doce sub-usuarios de
 * JMC, teniendo a mano una URL que habría funcionado.
 *
 * Acá los tres caminos se intentan en orden y de verdad: que uno falle no
 * cancela los siguientes.
 */
import { ref, getDownloadURL, getBlob } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { Capacitor, CapacitorHttp } from '@capacitor/core'

const CLAVE_CACHE = 'cobrify_logo_cache'
const VIGENCIA = 24 * 60 * 60 * 1000 // 24 horas
const MAX_ENTRADAS = 3

/** ¿Es una URL http(s) usable? CapacitorHttp con una URL inválida crashea en iOS. */
export const esUrlHttp = (valor) => {
  if (!valor || typeof valor !== 'string' || !valor.trim()) return false
  try {
    const url = new URL(valor)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** El path dentro del bucket, sacado de una URL de Firebase Storage. */
export const rutaDeStorage = (url) => {
  try {
    const m = String(url || '').match(/\/o\/(.+?)\?/)
    return m ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

/**
 * El tipo de imagen, adivinado por la extensión.
 * Ojo: muchas URLs de Storage NO tienen extensión (el logo de una sucursal se
 * guarda como `.../branches/{id}/logo` a secas), así que el jpeg es solo el
 * último recurso. jsPDF igual detecta el formato real del data URL.
 */
export const mimeSegunUrl = (url) => {
  const u = String(url || '').toLowerCase()
  if (u.includes('.png')) return 'image/png'
  if (u.includes('.webp')) return 'image/webp'
  if (u.includes('.gif')) return 'image/gif'
  return 'image/jpeg'
}

const leerCache = () => {
  try {
    const crudo = localStorage.getItem(CLAVE_CACHE)
    if (!crudo) return []
    const datos = JSON.parse(crudo)
    // El formato anterior guardaba UNA sola entrada suelta. Se descarta sin
    // ruido: la imagen se vuelve a bajar una vez y ya queda en el formato nuevo.
    return Array.isArray(datos) ? datos : []
  } catch {
    return []
  }
}

const desdeCache = (url) => {
  const entrada = leerCache().find(e => e?.url === url)
  if (!entrada) return null
  return (Date.now() - entrada.timestamp) < VIGENCIA ? entrada.data : null
}

const guardarEnCache = (url, data) => {
  try {
    const otras = leerCache().filter(e => e?.url !== url)
    const lista = [{ url, data, timestamp: Date.now() }, ...otras].slice(0, MAX_ENTRADAS)
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(lista))
  } catch {
    // localStorage lleno o bloqueado: se limpia y se sigue. Que no haya caché
    // no puede impedir que salga el PDF.
    try { localStorage.removeItem(CLAVE_CACHE) } catch { /* nada que hacer */ }
  }
}

/** Vaciar el caché. Se llama al cambiar el logo en Configuración. */
export const invalidarCacheDeImagenes = () => {
  try {
    localStorage.removeItem(CLAVE_CACHE)
    return true
  } catch {
    return false
  }
}

const blobADataUrl = (blob) => new Promise((resolve, reject) => {
  const lector = new FileReader()
  lector.onloadend = () => resolve(lector.result)
  lector.onerror = reject
  lector.readAsDataURL(blob)
})

/**
 * La imagen como data URL, lista para `doc.addImage`.
 *
 * @param {string} url
 * @param {{usarCache?: boolean}} [opciones]
 * @returns {Promise<string>} data URL
 * @throws si ninguno de los tres caminos funcionó
 */
export async function cargarImagenBase64(url, { usarCache = true } = {}) {
  if (!esUrlHttp(url)) throw new Error('URL de imagen inválida')

  if (usarCache) {
    const guardada = desdeCache(url)
    if (guardada) return guardada
  }

  const problemas = []

  // 1) En la app, el plugin nativo
  if (Capacitor.isNativePlatform()) {
    try {
      const ruta = rutaDeStorage(url)
      const destino = ruta ? await getDownloadURL(ref(storage, ruta)) : url
      if (!esUrlHttp(destino)) throw new Error('URL de descarga inválida')

      const respuesta = await CapacitorHttp.get({ url: destino, responseType: 'blob' })
      if (respuesta.status === 200 && respuesta.data) {
        // Con responseType 'blob', CapacitorHttp devuelve el base64 pelado.
        const dataUrl = `data:${mimeSegunUrl(url)};base64,${respuesta.data}`
        if (usarCache) guardarEnCache(url, dataUrl)
        return dataUrl
      }
      throw new Error(`CapacitorHttp respondió ${respuesta.status}`)
    } catch (e) {
      problemas.push(`nativo: ${e.message}`)
    }
  }

  // 2) El SDK de Firebase (pasa por las reglas de Storage)
  const ruta = rutaDeStorage(url)
  if (ruta) {
    try {
      const dataUrl = await blobADataUrl(await getBlob(ref(storage, ruta)))
      if (usarCache) guardarEnCache(url, dataUrl)
      return dataUrl
    } catch (e) {
      // Acá caía todo: un permiso denegado dejaba el PDF sin logo aunque la URL
      // de abajo hubiera funcionado.
      problemas.push(`SDK: ${e.message}`)
    }
  }

  // 3) La URL tal cual, con su token de descarga.
  // `cache: 'reload'` fuerza ir a la red en vez de usar la copia del navegador:
  // si el logo se cargó antes por un <img> quedó guardado SIN el permiso CORS y
  // el navegador lo reusaba por un año (Cache-Control: immutable), haciendo
  // fallar este fetch aunque el servidor ya devolviera el permiso correcto.
  try {
    const respuesta = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'reload' })
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
    const dataUrl = await blobADataUrl(await respuesta.blob())
    if (usarCache) guardarEnCache(url, dataUrl)
    return dataUrl
  } catch (e) {
    problemas.push(`fetch: ${e.message}`)
  }

  throw new Error(`No se pudo cargar la imagen. ${problemas.join(' | ')}`)
}

/**
 * Deja la imagen lista en el caché para que el PDF salga sin esperar la
 * descarga. Se llama al cargar la configuración de la empresa.
 * No lanza: si falla, el PDF la bajará en su momento.
 */
export async function precargarImagen(url) {
  if (!esUrlHttp(url)) return null
  try {
    return await cargarImagenBase64(url)
  } catch (e) {
    console.warn('No se pudo precargar la imagen:', e.message)
    return null
  }
}
