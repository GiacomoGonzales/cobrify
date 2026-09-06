/**
 * EL TICKET DE UNA GUÍA, EN PDF.
 *
 * POR QUÉ (reclamo de JMC, 6-set-2026): *"no se puede descargar las guías en
 * formato ticket por el aplicativo"*. En la app, si no hay ticketera Bluetooth
 * configurada, la impresión del ticket caía a `window.print()` — y el WebView de
 * Android no tiene diálogo de impresión, así que el botón no hacía nada. No
 * había ninguna forma de sacar el ticket.
 *
 * Con el PDF el papel sale igual en los dos lados: en la app abre el menú de
 * guardar/compartir y en la web se descarga.
 *
 * El CONTENIDO no se escribe acá: sale de `guiaTicketDatos`, el mismo módulo que
 * alimenta el ticket de pantalla. Es el tercer formato de la misma guía, y ese
 * mismo día se arregló que el A4 imprimiera un motivo de traslado distinto al
 * del ticket porque cada uno tenía su propia tabla.
 */
import {
  seccionesDeGuiaParaTicket,
  encabezadoDeGuia,
  datosQrDeLaGuia,
  PIE_DE_TICKET,
} from '@/utils/guiaTicketDatos'

const MARGEN = 3 // mm

const medidas = (anchoMm) => (anchoMm <= 58
  ? { fuente: 7, titulo: 8, numero: 11, linea: 3.2, qr: 26 }
  : { fuente: 8, titulo: 9, numero: 13, linea: 3.6, qr: 32 })

/**
 * Dibuja el ticket completo en `doc` y devuelve el alto ocupado, en mm.
 *
 * Se llama DOS veces (ver `generarGuiaTicketPdf`): la primera sobre una hoja larga solo
 * para medir, la segunda sobre la hoja del alto exacto. Por eso no crea el
 * documento ni decide el tamaño: solo dibuja donde le digan.
 */
function dibujarTicket(doc, guia, empresa, anchoMm, qrDataUrl) {
  const m = medidas(anchoMm)
  const util = anchoMm - MARGEN * 2
  const centro = anchoMm / 2
  let y = MARGEN + 3

  const escribir = (texto, { negrita = false, tamano = m.fuente, centrado = false } = {}) => {
    doc.setFont('courier', negrita ? 'bold' : 'normal').setFontSize(tamano)
    for (const linea of doc.splitTextToSize(String(texto ?? ''), util)) {
      if (centrado) doc.text(linea, centro, y, { align: 'center' })
      else doc.text(linea, MARGEN, y)
      y += m.linea
    }
  }

  const separador = () => {
    doc.setLineDashPattern([0.6, 0.6], 0).setDrawColor(120)
    doc.line(MARGEN, y - m.linea + 1.4, anchoMm - MARGEN, y - m.linea + 1.4)
    doc.setLineDashPattern([], 0).setDrawColor(0)
    y += 1.2
  }

  // Etiqueta en negrita y valor pegado a ella; si el valor no entra, las líneas
  // siguientes van sangradas para que se lea a qué etiqueta pertenecen.
  const fila = (etiqueta, valor) => {
    doc.setFont('courier', 'bold').setFontSize(m.fuente)
    const titulo = `${etiqueta}: `
    const anchoTitulo = doc.getTextWidth(titulo)
    doc.text(titulo, MARGEN, y)
    doc.setFont('courier', 'normal')
    const lineas = doc.splitTextToSize(String(valor ?? '-'), Math.max(util - anchoTitulo, 10))
    doc.text(lineas[0] || '', MARGEN + anchoTitulo, y)
    y += m.linea
    for (const resto of lineas.slice(1)) {
      doc.text(resto, MARGEN + anchoTitulo, y)
      y += m.linea
    }
  }

  // ---------- Encabezado
  const enc = encabezadoDeGuia(guia, empresa)
  escribir(enc.nombre, { negrita: true, tamano: m.titulo, centrado: true })
  escribir(`RUC: ${enc.ruc}`, { centrado: true })
  if (enc.direccion) escribir(enc.direccion, { centrado: true })
  if (enc.telefono) escribir(`Tel: ${enc.telefono}`, { centrado: true })
  if (enc.sucursal) escribir(`Sucursal: ${enc.sucursal}`, { centrado: true })
  y += 1
  escribir(enc.tipo, { negrita: true, centrado: true })
  escribir(enc.numero, { negrita: true, tamano: m.numero, centrado: true })
  y += 1.5
  separador()

  // ---------- Secciones
  for (const seccion of seccionesDeGuiaParaTicket(guia)) {
    if (seccion.titulo) escribir(seccion.titulo.toUpperCase(), { negrita: true })
    for (const f of (seccion.filas || [])) fila(f.etiqueta, f.valor)

    if (seccion.destacado) {
      // El peso va en recuadro: es lo primero que mira quien controla en ruta.
      const alto = m.linea + 1.6
      doc.setFillColor(228, 228, 228).rect(MARGEN, y - m.linea + 0.6, util, alto, 'F')
      doc.setFont('courier', 'bold').setFontSize(m.fuente)
      doc.text(seccion.destacado, centro, y, { align: 'center' })
      y += alto + 0.6
    }

    if (seccion.texto) escribir(seccion.texto)
    if (seccion.nota) escribir(seccion.nota, { centrado: true })

    if (seccion.items) {
      const anchoCant = util * 0.22
      const anchoUnd = util * 0.18
      const xDesc = MARGEN + anchoCant + anchoUnd
      doc.setFont('courier', 'bold').setFontSize(m.fuente)
      doc.text('CANT', MARGEN, y)
      doc.text('UND', MARGEN + anchoCant, y)
      doc.text('DESCRIPCION', xDesc, y)
      y += m.linea
      doc.setFont('courier', 'normal')
      for (const item of seccion.items) {
        const lineas = doc.splitTextToSize(item.descripcion, Math.max(util - anchoCant - anchoUnd, 10))
        doc.text(String(item.cantidad), MARGEN, y)
        doc.text(item.unidad, MARGEN + anchoCant, y)
        doc.text(lineas[0] || '', xDesc, y)
        y += m.linea
        for (const resto of lineas.slice(1)) {
          doc.text(resto, xDesc, y)
          y += m.linea
        }
        if (item.serie) {
          doc.setFontSize(m.fuente - 1)
          doc.text(`S/N: ${item.serie}`, xDesc, y)
          doc.setFontSize(m.fuente)
          y += m.linea
        }
      }
    }

    y += 0.8
    separador()
  }

  // ---------- QR
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', centro - m.qr / 2, y, m.qr, m.qr)
    y += m.qr + 2.5
  }

  // ---------- Pie
  for (const linea of PIE_DE_TICKET) {
    escribir(linea, { centrado: true, tamano: m.fuente - 1 })
  }

  return y + MARGEN
}

/**
 * El PDF listo, en una hoja del alto exacto del contenido.
 *
 * Un rollo no tiene páginas: si se declara A4, el ticket sale chiquito arriba
 * con media hoja en blanco debajo. jsPDF no sabe achicar una página ya creada,
 * así que se dibuja una vez para medir y otra sobre la hoja definitiva.
 */
export async function generarGuiaTicketPdf(guia, empresa, { anchoMm = 80 } = {}) {
  const { jsPDF } = await import('jspdf')

  // El QR se arma una sola vez y se reusa en las dos pasadas.
  let qrDataUrl = null
  try {
    const QRCode = (await import('qrcode')).default
    qrDataUrl = await QRCode.toDataURL(datosQrDeLaGuia(guia, empresa?.ruc), {
      width: 300, margin: 1, errorCorrectionLevel: 'M',
    })
  } catch (e) {
    // Sin QR el ticket sigue sirviendo; no se cancela la descarga por esto.
    console.warn('No se pudo generar el QR del ticket:', e)
  }

  const medidor = new jsPDF({ unit: 'mm', format: [anchoMm, 1200] })
  const alto = dibujarTicket(medidor, guia, empresa, anchoMm, qrDataUrl)

  const doc = new jsPDF({ unit: 'mm', format: [anchoMm, Math.max(alto, 40)] })
  dibujarTicket(doc, guia, empresa, anchoMm, qrDataUrl)
  return doc
}

/**
 * Entrega el ticket: en la app abre el menú de guardar/compartir y en la web lo
 * descarga. `downloadBlob` ya resuelve esa diferencia.
 */
export async function descargarGuiaTicketPdf(guia, empresa, { anchoMm = 80 } = {}) {
  const doc = await generarGuiaTicketPdf(guia, empresa, { anchoMm })
  const { downloadBlob } = await import('@/utils/nativeDownload')
  const nombre = `guia-${String(guia?.number || 'sin-numero').replace(/[^\w-]/g, '')}-ticket.pdf`
  await downloadBlob(doc.output('blob'), nombre, {
    title: `Guía ${guia?.number || ''}`.trim(),
    dialogTitle: 'Guardar o compartir',
  })
}
