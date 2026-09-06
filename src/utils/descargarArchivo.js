/**
 * Descargar de verdad, no abrir en otra pestaña.
 *
 * El atributo `download` de un enlace NO funciona cuando el archivo está en
 * otro dominio —y el nuestro vive en media.cobrifymedia.site—: el navegador
 * lo ignora y navega. Por eso el clic abría una pestaña con la foto en vez de
 * bajarla (reporte de Giacomo, 06-sep-2026).
 *
 * La cura es traer el archivo con fetch y descargarlo desde la memoria. Si
 * eso falla se abre la pestaña como antes —mejor eso que nada— pero se
 * devuelve el motivo, para poder decirlo en pantalla en vez de dejar al
 * usuario adivinando.
 */
export async function descargarArchivo(url, nombre = 'archivo') {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error(`el servidor respondió ${res.status}`)
    const blob = await res.blob()
    const objeto = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objeto
    a.download = nombre
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Sin esto el archivo se queda en memoria toda la sesión.
    setTimeout(() => URL.revokeObjectURL(objeto), 10000)
    return { ok: true }
  } catch (e) {
    console.warn('[descarga] no se pudo bajar directo:', e)
    window.open(url, '_blank', 'noopener')
    return { ok: false, motivo: e?.message || 'no se pudo leer el archivo' }
  }
}

/** ".jpg" a partir del tipo o de la dirección. */
function extension(media) {
  const mime = media?.mimeType || ''
  const porMime = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/pdf': 'pdf',
  }[mime]
  if (porMime) return porMime
  try {
    const ext = new URL(media?.url || '').pathname.split('.').pop()
    if (ext && ext.length <= 5 && /^[a-z0-9]+$/i.test(ext)) return ext.toLowerCase()
  } catch { /* dirección rara */ }
  return 'jpg'
}

/**
 * Un nombre entendible para la carpeta de descargas.
 *
 * Siempre el mismo por tipo, a propósito: el navegador numera solo los
 * repetidos ("Cobrify Chat imagen (1).jpg"), que es justo lo que se busca.
 * Antes salía el nombre interno del archivo, que es una ristra de letras y
 * números sin sentido.
 */
export function nombreDeArchivo(media, porDefecto = 'imagen') {
  const tipo = media?.tipo
    || (String(media?.mimeType || '').startsWith('video/') ? 'video' : null)
    || (String(media?.mimeType || '').startsWith('audio/') ? 'audio' : null)
    || porDefecto
  const nombre = { image: 'imagen', video: 'video', audio: 'audio', document: 'documento' }[tipo] || porDefecto
  return `Cobrify Chat ${nombre}.${extension(media)}`
}
