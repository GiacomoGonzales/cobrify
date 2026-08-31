import { ticketPageSize, pxAMm } from '@/utils/printPageSize'

/**
 * Imprime un HTML suelto (precuenta, ticket de compra) usando un iframe oculto
 * en la misma página, tanto en web como en la app.
 *
 * Antes cada sitio traía su propia copia de esta lógica y las dos estaban mal.
 * Reporte de 30-jul-2026: a un restaurante la precuenta le colgaba Chrome en
 * "Cargando vista previa..." hasta dejarlo sin responder, mientras la comanda y
 * la boleta salían perfectas —esas imprimen la página real, no pasan por acá—.
 *
 * Tres reglas que hay que respetar, y que eran justamente lo que fallaba:
 *
 *  1. **El HTML no debe auto-imprimirse.** Las plantillas venían de la época en
 *     que esto abría una ventana emergente, y cada una traía adentro su
 *     `window.onload = () => { print(); close() }`. Dentro de un iframe eso
 *     dispara una impresión extra que el guard de acá no ve, y el close()
 *     intenta cerrar algo que no es una ventana.
 *
 *  2. **No quitar el iframe con un temporizador.** El navegador necesita el
 *     documento VIVO mientras arma la vista previa; borrarlo a la mitad deja la
 *     previa cargando para siempre. La limpieza va en 'afterprint', cuando el
 *     diálogo ya se cerró.
 *
 *  3. **Esperar a las imágenes.** El logo baja de Cloudinary. Imprimir antes de
 *     que llegue lo saca sin logo o cuelga la previa. Esto explicaba por qué
 *     fallaba en una laptop y en otra no: era una carrera que se ganaba o se
 *     perdía según la máquina y la conexión.
 *
 *  4. **Decirle al navegador de qué tamaño es la hoja.** Un ticket en rollo no
 *     es A4, y si no se declara el tamaño el navegador usa el suyo y el ticket
 *     sale chiquito arriba con media hoja en blanco. Como CSS no permite pedir
 *     "este ancho y el alto que haga falta", el alto se MIDE del contenido ya
 *     renderizado — para eso el iframe necesita tener el ancho real del papel,
 *     aunque siga invisible.
 *
 * @param {string} html - documento completo, SIN script de auto-impresión
 * @param {string} id - id del iframe; uno por tipo de documento
 * @param {number} [anchoMm] - ancho del papel (58, 80...). Sin esto no se
 *                             ajusta la hoja y manda el tamaño del navegador.
 */
export const printHtmlIframe = (html, id = 'print-iframe', anchoMm = null) => {
  const existing = document.getElementById(id)
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = id
  // Con ancho 0 el contenido se renderiza aplastado y no se puede medir. Se le
  // da el ancho real del papel; sigue invisible por `visibility:hidden`.
  const anchoPx = anchoMm ? Math.round(anchoMm / (25.4 / 96)) : 0
  iframe.style.cssText = `position:fixed;top:0;left:0;width:${anchoPx}px;height:0;border:none;visibility:hidden;`
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  /**
   * Deja la hoja del alto del ticket. Se hace justo antes de imprimir, con el
   * contenido ya pintado y las imágenes cargadas: medirlo antes daría un alto
   * corto y cortaría el ticket.
   */
  const ajustarHoja = () => {
    if (!anchoMm) return
    try {
      const alto = doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 0
      const estilo = doc.createElement('style')
      estilo.textContent = `@page { size: ${ticketPageSize(anchoMm, pxAMm(alto))}; margin: 0; }`
      doc.head?.appendChild(estilo)
    } catch (e) {
      // Sin el tamaño el ticket sale igual, solo que en la hoja del navegador.
      console.warn('No se pudo ajustar el tamaño de hoja:', e)
    }
  }

  let printed = false
  const printOnce = () => {
    if (printed) return
    printed = true
    try {
      ajustarHoja()
      const win = iframe.contentWindow
      win.addEventListener('afterprint', () => {
        setTimeout(() => iframe.remove(), 500)
      }, { once: true })
      win.focus()
      win.print()
    } catch (e) {
      console.error('Error al imprimir:', e)
      iframe.remove()
    }
  }

  // Tope de 3 s: si una imagen no carga —logo caído, sin internet— se imprime
  // igual sin ella en vez de dejar a la persona esperando frente al cliente.
  const esperarImagenes = () => {
    const imgs = Array.from(doc.images || [])
    const pendientes = imgs.filter(img => !img.complete)
    if (pendientes.length === 0) return printOnce()

    let restantes = pendientes.length
    const listo = () => { if (--restantes <= 0) printOnce() }
    pendientes.forEach(img => {
      img.addEventListener('load', listo, { once: true })
      img.addEventListener('error', listo, { once: true })
    })
    setTimeout(printOnce, 3000)
  }

  if (doc.readyState === 'complete') esperarImagenes()
  else iframe.contentWindow.addEventListener('load', esperarImagenes, { once: true })
  // Red de seguridad por si el evento load nunca llega
  setTimeout(esperarImagenes, 1500)
}
