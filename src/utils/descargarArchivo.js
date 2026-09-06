/**
 * Descargar de verdad, no abrir en otra pestaña.
 *
 * El atributo `download` de un enlace NO funciona cuando el archivo está en
 * otro dominio —y el nuestro vive en media.cobrifymedia.site—: el navegador
 * lo ignora y navega. Por eso el clic abría una pestaña con la foto en vez de
 * bajarla (reporte de Giacomo, 06-sep-2026).
 *
 * La cura es traer el archivo con fetch y descargarlo desde la memoria. Ese
 * dominio responde `access-control-allow-origin: *`, así que se puede.
 * Si algo falla se cae al enlace de siempre: mejor abrir la pestaña que no
 * hacer nada.
 */
export async function descargarArchivo(url, nombre = 'archivo') {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const objeto = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objeto
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Sin esto el blob se queda en memoria toda la sesión.
    setTimeout(() => URL.revokeObjectURL(objeto), 10000)
    return true
  } catch {
    window.open(url, '_blank', 'noopener')
    return false
  }
}

/** Un nombre de archivo decente a partir de la dirección. */
export function nombreDeArchivo(media, porDefecto = 'foto.jpg') {
  if (media?.filename) return media.filename
  try {
    const ruta = new URL(media?.url || '').pathname
    const ultimo = ruta.split('/').pop()
    if (ultimo && ultimo.includes('.')) return ultimo
  } catch { /* dirección rara: se usa el nombre por defecto */ }
  return porDefecto
}
