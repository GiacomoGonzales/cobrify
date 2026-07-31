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
 * @param {string} html - documento completo, SIN script de auto-impresión
 * @param {string} id - id del iframe; uno por tipo de documento
 */
export const printHtmlIframe = (html, id = 'print-iframe') => {
  const existing = document.getElementById(id)
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = id
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  let printed = false
  const printOnce = () => {
    if (printed) return
    printed = true
    try {
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
