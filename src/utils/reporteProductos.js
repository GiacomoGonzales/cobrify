/**
 * IMPRIMIR "QUÉ SE VENDIÓ DE CADA PRODUCTO" desde Reportes > Productos.
 *
 * Pedido de varios clientes: el resumen por producto ya salía al pie del cierre
 * de caja, pero solo del turno que se estaba cerrando. Querían pedirlo cuando
 * quisieran y del día que quisieran — hoy, ayer, la semana pasada.
 *
 * De dónde salen los números: de `topProducts`, LO MISMO que la pantalla está
 * mostrando en ese momento. No se recalcula por otro camino a propósito: si el
 * papel dijera algo distinto de la tabla que el usuario tiene delante, no habría
 * forma de saber cuál de los dos creer.
 *
 * El formato del ticket sí es el del cierre de caja (`lineasDeProductosParaTicket`
 * de `cashClosureProducts`), así que los dos papeles se leen igual.
 */
import { lineasDeProductosParaTicket } from '@/utils/cashClosureProducts'

/**
 * Pasa las filas de Reportes al molde que entiende el formateador del ticket.
 *
 * `topProducts` trae `{ name, sku, quantity, revenue, cost }` y viene ordenado
 * por importe; el resumen del cierre usa `{ nombre, codigo, cantidad, importe }`.
 */
export function resumenDeProductos(topProducts = []) {
  const lineas = (topProducts || [])
    .filter(p => (Number(p?.quantity) || 0) !== 0)
    .map(p => ({
      nombre: String(p.name || '').trim() || 'Sin nombre',
      codigo: p.sku || '',
      cantidad: Number(p.quantity) || 0,
      importe: Math.round((Number(p.revenue) || 0) * 100) / 100,
    }))

  return {
    lineas,
    totalUnidades: Math.round(lineas.reduce((s, l) => s + l.cantidad, 0) * 1000) / 1000,
    totalImporte: Math.round(lineas.reduce((s, l) => s + l.importe, 0) * 100) / 100,
  }
}

/** Las líneas de texto listas para una impresora térmica. */
export const lineasParaTermica = (resumen, ancho = 48) =>
  lineasDeProductosParaTicket(resumen, ancho)

const escapar = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const cantidadCorta = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)
}

const monto = (n) => (Math.round((Number(n) || 0) * 100) / 100)
  .toFixed(2)
  .replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * El ticket en HTML, para `printHtmlIframe`.
 *
 * OJO: sin script de auto-impresión adentro — printHtmlIframe se encarga, y un
 * `window.print()` acá dispara una impresión extra que su guard no ve (está
 * explicado en la cabecera de ese archivo).
 */
export function ticketProductosHtml(resumen, { negocio = {}, periodo = '', sucursal = '', anchoMm = 80 } = {}) {
  const fuente = anchoMm <= 58 ? 10 : 11
  const filas = resumen.lineas.map(l => `
    <tr>
      <td class="c">${cantidadCorta(l.cantidad)}</td>
      <td class="n">${escapar(l.nombre)}</td>
      <td class="i">${monto(l.importe)}</td>
    </tr>`).join('')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Productos vendidos</title>
<style>
  @page { margin: 3mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Courier New', monospace; font-size: ${fuente}px; color: #000; }
  .c1 { text-align: center; }
  .b { font-weight: bold; }
  .t { font-size: ${fuente + 2}px; font-weight: bold; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.c { width: 12%; }
  td.n { width: 58%; word-break: break-word; }
  td.i { width: 30%; text-align: right; white-space: nowrap; }
  .tot { display: flex; justify-content: space-between; font-weight: bold; }
  .pie { margin-top: 6px; font-size: ${fuente - 1}px; text-align: center; }
</style></head>
<body>
  <div class="c1 t">${escapar(negocio.razonSocial || negocio.businessName || negocio.name || '')}</div>
  ${negocio.ruc ? `<div class="c1">RUC ${escapar(negocio.ruc)}</div>` : ''}
  <hr>
  <div class="c1 b">PRODUCTOS VENDIDOS</div>
  ${periodo ? `<div class="c1">${escapar(periodo)}</div>` : ''}
  ${sucursal ? `<div class="c1">${escapar(sucursal)}</div>` : ''}
  <hr>
  <table>${filas}</table>
  <hr>
  <div class="tot"><span>${cantidadCorta(resumen.totalUnidades)} unidades</span><span>${monto(resumen.totalImporte)}</span></div>
  <div class="pie">Impreso el ${new Date().toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
</body></html>`
}

/**
 * El mismo resumen en PDF (A4), para mandarlo por correo o archivarlo.
 * jsPDF entra por import dinámico: pesa, y esto se usa a demanda.
 */
export async function descargarProductosPdf(resumen, { negocio = {}, periodo = '', sucursal = '' } = {}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const M = 40
  let y = M

  doc.setFont('helvetica', 'bold').setFontSize(14)
  doc.text(String(negocio.razonSocial || negocio.businessName || negocio.name || ''), M, y)
  y += 16
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  if (negocio.ruc) { doc.text(`RUC ${negocio.ruc}`, M, y); y += 12 }

  doc.setTextColor(0).setFont('helvetica', 'bold').setFontSize(12)
  doc.text('Productos vendidos', M, y); y += 14
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  if (periodo) { doc.text(periodo, M, y); y += 11 }
  if (sucursal) { doc.text(`Sucursal: ${sucursal}`, M, y); y += 11 }
  y += 6

  // Encabezado de la tabla
  const dibujarCabecera = () => {
    doc.setFillColor(243, 244, 246).rect(M, y, ancho - M * 2, 18, 'F')
    doc.setTextColor(60).setFont('helvetica', 'bold').setFontSize(9)
    doc.text('Cant.', M + 6, y + 12)
    doc.text('Producto', M + 52, y + 12)
    doc.text('Importe', ancho - M - 6, y + 12, { align: 'right' })
    y += 22
    doc.setFont('helvetica', 'normal').setTextColor(0)
  }
  dibujarCabecera()

  for (const l of resumen.lineas) {
    if (y > alto - M - 40) { doc.addPage(); y = M; dibujarCabecera() }
    doc.setFontSize(9)
    doc.text(cantidadCorta(l.cantidad), M + 6, y)
    // El nombre se recorta al ancho disponible: partirlo en dos duplicaría el
    // alto de una lista que puede tener cientos de filas.
    const nombre = doc.splitTextToSize(l.nombre, ancho - M * 2 - 130)[0] || ''
    doc.text(nombre, M + 52, y)
    doc.text(monto(l.importe), ancho - M - 6, y, { align: 'right' })
    y += 14
  }

  y += 4
  doc.setDrawColor(200).line(M, y, ancho - M, y); y += 14
  doc.setFont('helvetica', 'bold').setFontSize(10)
  doc.text(`${cantidadCorta(resumen.totalUnidades)} unidades`, M + 6, y)
  doc.text(monto(resumen.totalImporte), ancho - M - 6, y, { align: 'right' })

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130)
  doc.text(
    `Impreso el ${new Date().toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    M, alto - 24,
  )

  const { downloadBlob } = await import('@/utils/nativeDownload')
  const sello = new Date().toISOString().slice(0, 10)
  await downloadBlob(doc.output('blob'), `productos-vendidos-${sello}.pdf`, {
    title: 'Productos vendidos', dialogTitle: 'Guardar o compartir',
  })
}
