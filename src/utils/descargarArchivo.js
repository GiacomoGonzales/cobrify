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
/** Guarda el contenido con el nombre pedido. */
function guardar(blob, nombre) {
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
}

/**
 * Segundo camino, solo para fotos: cargarla como imagen y sacarla del lienzo.
 *
 * Existe porque en algunos navegadores —con ciertas extensiones puestas— el
 * `fetch` a otro dominio no llega, pero la MISMA foto sí se carga como
 * imagen: de hecho ya se está viendo en pantalla. Se paga un reencodeado
 * (la copia no es byte a byte la original), y a cambio la descarga funciona.
 */
function bajarComoImagen(url) {
  return new Promise((listo, falla) => {
    const img = new Image()
    // Sin esto el lienzo queda "manchado" y no deja sacar el contenido.
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const lienzo = document.createElement('canvas')
      lienzo.width = img.naturalWidth
      lienzo.height = img.naturalHeight
      lienzo.getContext('2d').drawImage(img, 0, 0)
      lienzo.toBlob((b) => (b ? listo(b) : falla(new Error('el lienzo salió vacío'))), 'image/jpeg', 0.92)
    }
    img.onerror = () => falla(new Error('la foto no se pudo cargar'))
    img.src = url
  })
}

/**
 * El camino seguro: el archivo pasa por nuestro propio dominio (/descargar),
 * que lo devuelve con la orden de guardar. No hay pedido a otro dominio, así
 * que no hay CORS que pueda cortarse — es el unico que funciona en un
 * navegador con extensiones que bloquean esos pedidos.
 */
function porNuestroServidor(url, nombre) {
  // En el sitio publicado va por /descargar, que es el MISMO dominio. En el
  // servidor de desarrollo esa ruta no existe (devolveria la propia pagina),
  // asi que ahi se llama a la funcion por su direccion.
  const local = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
  const base = local
    ? 'https://us-central1-cobrify-395fe.cloudfunctions.net/descargarMedia'
    : '/descargar'
  const a = document.createElement('a')
  a.href = `${base}?url=${encodeURIComponent(url)}&nombre=${encodeURIComponent(nombre)}`
  a.download = nombre
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function descargarArchivo(url, nombre = 'archivo', tipo = '') {
  const problemas = []
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error(`el servidor respondió ${res.status}`)
    guardar(await res.blob(), nombre)
    return { ok: true }
  } catch (e) {
    problemas.push(e?.message || 'no se pudo leer el archivo')
    console.warn('[descarga] el camino normal falló:', e)
  }

  // Solo las fotos tienen segundo camino; un PDF o un video no se pueden
  // sacar de un lienzo.
  const esFoto = tipo === 'image' || /\.(jpe?g|png|webp|gif)$/i.test(String(url).split('?')[0])
  if (esFoto) {
    try {
      guardar(await bajarComoImagen(url), nombre)
      return { ok: true, reencodeada: true }
    } catch (e) {
      problemas.push(e?.message || 'tampoco se pudo por imagen')
      console.warn('[descarga] el camino por imagen también falló:', e)
    }
  }

  // Ninguno de los dos caminos directos llegó: se pasa por nuestro servidor.
  console.warn('[descarga] se usa el servidor:', problemas.join(' · '))
  porNuestroServidor(url, nombre)
  return { ok: true, porServidor: true }
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
