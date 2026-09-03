/**
 * EL TICKET, PERO COMO ARCHIVO PDF.
 *
 * Hasta ahora un ticket se podía IMPRIMIR pero no descargar: el PDF que baja el
 * sistema es A4. Un transportista que quiere mandar la guía por WhatsApp desde
 * el celular no tiene de dónde agarrarla (pedido de JMC, 03-sep-2026).
 *
 * ── Por qué se captura el ticket que ya existe ───────────────────────────────
 * La alternativa era escribir el ticket otra vez con las primitivas de jsPDF,
 * una versión por documento (comprobante, guía, cotización). Serían tres
 * maquetas nuevas que hay que mantener en paralelo a las tres que ya existen, y
 * que empiezan a diferenciarse el día que alguien toque una sola. Acá se
 * fotografía **el mismo elemento que se manda a la impresora**, así que el PDF
 * no puede quedar distinto del papel: es el papel.
 *
 * El costo es que el PDF lleva una imagen y no texto seleccionable. En un
 * ticket térmico eso no le importa a nadie; lo que importa es que se vea igual.
 *
 * ── El único obstáculo, y cómo se saltea ─────────────────────────────────────
 * Los tres tickets se esconden en pantalla con `@media screen { display: none }`
 * y solo aparecen al imprimir. El resto de sus estilos —tipografías, tamaños,
 * separadores— vive FUERA de las media queries, así que alcanza con anular esa
 * única regla para que el ticket se vea tal cual sin tocar los componentes.
 * Eso hace el atributo `data-ticket-pdf`: manda por `!important` y deja el
 * elemento pintado, del ancho del papel, detrás de la página.
 */
import { jsPDF } from 'jspdf'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

const ID_ESTILO = 'cobrify-ticket-pdf'
const ATRIBUTO = 'data-ticket-pdf'

/**
 * Tope de alto de página. El formato PDF no admite páginas infinitas y un
 * número disparado —por una medición mala— produce un archivo que ningún visor
 * abre. Un ticket de verdad no llega ni cerca.
 */
const ALTO_MAXIMO_MM = 5000

/** Escala de captura. 3x deja el texto nítido sin inflar el archivo de más. */
const ESCALA = 3

const ATRIBUTO_PADRE = 'data-ticket-pdf-host'

const mostrar = (el, anchoMm) => {
  let estilo = document.getElementById(ID_ESTILO)
  if (!estilo) {
    estilo = document.createElement('style')
    estilo.id = ID_ESTILO
    document.head.appendChild(estilo)
  }
  // `!important` porque compite contra `@media screen { display: none }`, que
  // tiene la misma especificidad. Va detrás de la página (z-index) en vez de
  // fuera de la pantalla: con coordenadas negativas html2canvas a veces recorta.
  estilo.textContent = `
    [${ATRIBUTO_PADRE}] { display: block !important; }
    /*
     * Sin esto el PDF sale con el texto CORTADO POR LA MITAD.
     *
     * El ticket usa \`overflow: hidden\` —en el contenedor y en cada fila
     * etiqueta/valor— para que un valor largo no desborde los 80 mm. Al
     * imprimir eso no molesta, pero html2canvas recorta a una caja más baja que
     * el texto y se come la mitad de abajo de cada renglón (reporte de JMC con
     * la guía T001-00000013).
     *
     * Quitarlo durante la captura es seguro: el ancho ya lo fija la regla de
     * acá abajo y los valores largos siguen cortándose solos por \`word-break\`.
     */
    [${ATRIBUTO}], [${ATRIBUTO}] * { overflow: visible !important; }
    /*
     * Y esto es la otra mitad del mismo problema.
     *
     * html2canvas ubica el texto con sus propias métricas de fuente, no con las
     * del navegador. Con interlineados apretados —1.2, o el que traiga la
     * fuente— los glifos le quedan por debajo de la caja que calculó para el
     * elemento, y se cortan igual: el renglón sobre un recuadro con fondo (el
     * cintillo negro, la caja del peso) perdía la mitad de abajo.
     *
     * Un interlineado holgado le da lugar al glifo dentro de su propia caja.
     *
     * 1.8 no es un número al azar: se probó contra la guía de JMC. Con 1.4 el
     * texto ya no se corta, pero la línea inferior de cada título de sección
     * —DESTINATARIO, DATOS DEL TRASLADO, BIENES— todavía pasa POR ENCIMA de las
     * letras. Recién a 1.8 el borde cae debajo de los glifos.
     *
     * El PDF sale unos milímetros más largo que el papel impreso; eso no
     * importa: esto es la copia que se manda, no la que sale del rollo.
     */
    [${ATRIBUTO}], [${ATRIBUTO}] * { line-height: 1.8 !important; }
    [${ATRIBUTO}] {
      display: block !important;
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: ${anchoMm}mm !important;
      max-width: ${anchoMm}mm !important;
      background: #ffffff !important;
      z-index: -1 !important;
      pointer-events: none !important;
    }
  `

  // Un padre con `display: none` saca del render a TODO lo que tiene adentro:
  // el ticket no se pinta por más que se lo fuerce a él solo. En Ventas y en
  // Cotizaciones el ticket cuelga de un `hidden print:block`, así que hay que
  // destapar la cadena.
  //
  // Se marcan ÚNICAMENTE los que hoy están en `none`. Forzar `display: block`
  // sobre un padre que es flex o grid reacomodaría la página visible por unos
  // milisegundos, y no hace falta para nada.
  const padres = []
  let n = el.parentElement
  while (n && n !== document.body) {
    if (window.getComputedStyle(n).display === 'none') {
      n.setAttribute(ATRIBUTO_PADRE, '')
      padres.push(n)
    }
    n = n.parentElement
  }

  el.setAttribute(ATRIBUTO, '')
  return padres
}

const esconder = (el, padres = []) => {
  el?.removeAttribute(ATRIBUTO)
  padres.forEach(p => p.removeAttribute(ATRIBUTO_PADRE))
  document.getElementById(ID_ESTILO)?.remove()
}

/**
 * Fotografía un ticket ya montado en el DOM y devuelve el PDF, con la hoja del
 * alto exacto del contenido.
 *
 * @param {HTMLElement} el       el contenedor del ticket (el mismo que se imprime)
 * @param {object} [opciones]
 * @param {number} [opciones.anchoMm=80]  ancho del papel
 * @returns {Promise<object>} el documento jsPDF
 */
export async function ticketAPdf(el, { anchoMm = 80 } = {}) {
  if (!el) throw new Error('No hay ticket para convertir')

  // html2canvas pesa ~200 KB y solo hace falta cuando alguien pide el PDF del
  // ticket: se carga en ese momento, no en el arranque de la app.
  const { default: html2canvas } = await import('html2canvas')

  const padres = mostrar(el, anchoMm)
  let canvas
  try {
    // Una pausa para que el navegador aplique los estilos nuevos antes de que
    // se lo fotografíe.
    //
    // Con `requestAnimationFrame` esto se colgaba: en una pestaña que no está a
    // la vista el navegador deja de entregar cuadros, así que la promesa no
    // resolvía nunca y la descarga quedaba en "Generando..." para siempre. Con
    // un temporizador corre igual esté visible o no.
    await new Promise(r => setTimeout(r, 80))
    canvas = await html2canvas(el, {
      scale: ESCALA,
      backgroundColor: '#ffffff',
      // El logo baja de Cloudinary: sin esto sale un hueco donde va la marca.
      useCORS: true,
      logging: false,
    })
  } finally {
    // Pase lo que pase, el ticket vuelve a esconderse. Si esto quedara colgado
    // el usuario se queda con el ticket pintado encima de la pantalla.
    esconder(el, padres)
  }

  if (!canvas?.width || !canvas?.height) throw new Error('No se pudo dibujar el ticket')

  const altoMm = Math.min(ALTO_MAXIMO_MM, (anchoMm * canvas.height) / canvas.width)
  const doc = new jsPDF({
    unit: 'mm',
    format: [anchoMm, altoMm],
    // La orientación NO es decorativa: jsPDF reordena el par que se le pasa
    // para que en 'portrait' el ancho sea el menor de los dos. Un ticket corto
    // —tres líneas— es más ancho que alto, y con 'portrait' fijo salía la hoja
    // dada vuelta, de 38 mm de ancho por 80 de alto.
    orientation: altoMm >= anchoMm ? 'portrait' : 'landscape',
  })
  // PNG y no JPEG: un ticket es texto negro sobre blanco, donde el JPEG ensucia
  // los bordes de las letras. Y con compresión: sin ella jsPDF mete el mapa de
  // bits crudo y un ticket de seis líneas pesaba 1,1 MB — imposible de mandar
  // por WhatsApp, que es justamente para lo que se pidió.
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, anchoMm, altoMm, undefined, 'FAST')
  return doc
}

/** Nombre de archivo utilizable en Android, iOS y Windows. */
const limpiarNombre = (nombre) =>
  (nombre || 'ticket').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 80)

/**
 * Genera el PDF del ticket y se lo entrega al usuario.
 *
 * En la web baja como archivo. En la app se guarda y se abre el menú de
 * compartir, que es de donde sale el envío por WhatsApp — el mismo camino que
 * ya usan los PDF A4.
 *
 * @param {HTMLElement} el
 * @param {object} opciones
 * @param {number} [opciones.anchoMm=80]
 * @param {string} opciones.nombreArchivo  sin extensión
 * @param {string} [opciones.titulo]       encabezado del menú de compartir
 * @returns {Promise<string|null>} la ruta del archivo en la app; null en la web
 */
export async function descargarTicketPdf(el, { anchoMm = 80, nombreArchivo, titulo } = {}) {
  const doc = await ticketAPdf(el, { anchoMm })
  const archivo = `${limpiarNombre(nombreArchivo)}.pdf`

  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output('datauristring').split(',')[1]
    const result = await Filesystem.writeFile({
      path: archivo,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    })
    await Share.share({
      title: titulo || archivo,
      url: result.uri,
      dialogTitle: 'Compartir ticket',
    })
    return result.uri
  }

  doc.save(archivo)
  return null
}
