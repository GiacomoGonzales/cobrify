import { downloadBlob } from '@/utils/nativeDownload'

/**
 * Arma un ZIP con un PDF por elemento y lo descarga (web) o lo comparte (app).
 *
 * Lo usan las dos páginas de guías (Remitente y Transportista) con su propio
 * generador de PDF: el armado, el desempate de nombres y el avance son los
 * mismos, y así se corrigen en un solo lugar.
 *
 * - generarBlob(item) → Promise<Blob>
 * - nombreDe(item)    → nombre del archivo SIN extensión (el número de la guía)
 * - nombreZip         → nombre del ZIP que se descarga
 * - onAvance(hechas, total) se llama después de cada PDF, salga bien o mal
 *
 * Devuelve { listas, fallidas }. Si no salió ninguno, no descarga nada.
 */
export async function descargarZipDePdfs(items, { generarBlob, nombreDe, nombreZip, onAvance }) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const usados = new Set()
  let listas = 0
  let fallidas = 0

  for (const item of items) {
    try {
      const blob = await generarBlob(item)
      // Dos guías pueden compartir número (series distintas, datos viejos):
      // sin desempatar, JSZip pisa la anterior y el ZIP sale corto.
      const base = String(nombreDe(item) || 'documento').replace(/[\\/:*?"<>|]/g, '-')
      let nombre = `${base}.pdf`
      let n = 2
      while (usados.has(nombre)) nombre = `${base} (${n++}).pdf`
      usados.add(nombre)
      zip.file(nombre, blob)
      listas++
    } catch (e) {
      console.warn('No se pudo generar un PDF para el ZIP:', e)
      fallidas++
    }
    onAvance?.(listas + fallidas, items.length)
    // Ceder el hilo: jsPDF dibuja de forma sincrónica y sin esto el navegador
    // no llega a repintar, así que el contador de avance se quedaría clavado
    // en 0 hasta que termine todo.
    await new Promise(r => setTimeout(r, 0))
  }

  if (listas > 0) {
    const contenido = await zip.generateAsync({ type: 'blob' })
    await downloadBlob(contenido, nombreZip, { title: nombreZip, dialogTitle: 'Guardar o compartir' })
  }
  return { listas, fallidas }
}
