import { useEffect } from 'react'

/**
 * Ajusta el "cromo" del navegador en las páginas PÚBLICAS (catálogo, carta,
 * mi-reserva, registro): las que ve un cliente del negocio, no el dueño.
 *
 * Hace dos cosas:
 *
 * 1. APAGA la instalación de la PWA. El visitante de una tienda veía el
 *    banner "Instalar Cobrify" de Chrome y, al abrirlo, terminaba en una
 *    pantalla de inicio de sesión de un sistema de facturación que no es
 *    suyo. Se quita el <link rel="manifest"> mientras dura la visita (sin
 *    manifest no hay instalabilidad) y se cancela el evento
 *    beforeinstallprompt por si el navegador insiste.
 *
 * 2. Pinta la barra del navegador con el COLOR DEL NEGOCIO. Sin esto, la
 *    tienda de cualquier cliente salía con el azul de Cobrify arriba.
 *
 * Todo se restaura al salir de la página: el dashboard sí es instalable y
 * conserva su color.
 */
export function usePublicPageChrome(colorTema) {
  useEffect(() => {
    const head = document.head

    // --- manifest: se guarda y se retira ---
    const linkManifest = head.querySelector('link[rel="manifest"]')
    const manifestHref = linkManifest?.getAttribute('href') || null
    if (linkManifest) linkManifest.remove()

    const cancelarPrompt = (e) => e.preventDefault()
    window.addEventListener('beforeinstallprompt', cancelarPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', cancelarPrompt)
      if (manifestHref && !head.querySelector('link[rel="manifest"]')) {
        const nuevo = document.createElement('link')
        nuevo.rel = 'manifest'
        nuevo.href = manifestHref
        head.appendChild(nuevo)
      }
    }
  }, [])

  // --- color de la barra del navegador ---
  useEffect(() => {
    if (!colorTema) return
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')]
    const previos = metas.map(m => ({ el: m, valor: m.getAttribute('content') }))
    if (metas.length === 0) {
      const m = document.createElement('meta')
      m.name = 'theme-color'
      m.content = colorTema
      document.head.appendChild(m)
      return () => m.remove()
    }
    metas.forEach(m => m.setAttribute('content', colorTema))
    return () => previos.forEach(({ el, valor }) => {
      if (valor) el.setAttribute('content', valor)
    })
  }, [colorTema])
}
