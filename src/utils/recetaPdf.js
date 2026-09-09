/**
 * El PDF de una receta: cabecera del negocio, paciente y fecha, una fila por
 * indicación y las indicaciones generales, con una línea para firmar a mano.
 *
 * Se genera a partir del registro guardado, así el PDF de hoy y el de dentro
 * de un año son el mismo. Se importa bajo demanda: jsPDF pesa y solo hace
 * falta al compartir. Misma cabecera que el consentimiento.
 */
import jsPDF from 'jspdf'
import { fechaCorta } from '@/utils/fichaAtencion'
import { rucDeEmpresa } from '@/utils/rucDeEmpresa'
import { textoDeIndicacion } from '@/utils/receta'

/**
 * @param {object} receta la receta guardada (ver prescriptionService)
 * @param {object} negocio businessSettings: tradeName/businessName, ruc, address, phone
 * @returns {jsPDF}
 */
export function generarPdfReceta(receta, negocio = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 20
  const ancho = W - 2 * M
  let y = 18

  // Cabecera del negocio
  const nombreNegocio = negocio.tradeName || negocio.businessName || ''
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  if (nombreNegocio) {
    doc.text(doc.splitTextToSize(nombreNegocio, ancho), W / 2, y, { align: 'center' })
    y += 5
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  const ruc = rucDeEmpresa(negocio)
  const datosNegocio = [
    ruc ? `RUC ${ruc}` : '',
    negocio.address || '',
    negocio.phone ? `Tel. ${negocio.phone}` : '',
  ].filter(Boolean).join(' · ')
  if (datosNegocio) {
    const lineas = doc.splitTextToSize(datosNegocio, ancho)
    doc.text(lineas, W / 2, y, { align: 'center' })
    y += 4 * lineas.length + 2
  }
  doc.setTextColor(0)

  // Título
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('RECETA', W / 2, y, { align: 'center' })
  y += 9

  // Paciente y fecha
  doc.setFontSize(10)
  const filas = [
    ['Paciente', receta.customerName],
    ['Documento', receta.customerDocument],
    ['Fecha', fechaCorta(receta.date)],
  ].filter(([, v]) => v)
  for (const [k, v] of filas) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${k}:`, M, y)
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(String(v), ancho - 30), M + 30, y)
    y += 5.5
  }
  y += 2
  doc.setDrawColor(200)
  doc.line(M, y, W - M, y)
  y += 8

  // Una fila por indicación: el producto en negrita y, debajo, cómo usarlo.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text('INDICACIONES', M, y)
  doc.setTextColor(0)
  y += 6
  const items = Array.isArray(receta.items) ? receta.items : []
  items.forEach((item, i) => {
    if (y > 250) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    const titulo = doc.splitTextToSize(`${i + 1}. ${item.producto || ''}`, ancho)
    doc.text(titulo, M, y)
    y += 5 * titulo.length
    const detalle = textoDeIndicacion(item)
    if (detalle) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(70)
      const lineas = doc.splitTextToSize(detalle, ancho - 6)
      doc.text(lineas, M + 6, y)
      doc.setTextColor(0)
      y += 5 * lineas.length
    }
    y += 3
  })

  // Indicaciones generales
  if (receta.notes) {
    if (y > 235) { doc.addPage(); y = 20 }
    y += 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(90)
    doc.text('INDICACIONES GENERALES', M, y)
    doc.setTextColor(0)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    for (const parrafo of String(receta.notes).split(/\n{2,}/)) {
      const lineas = doc.splitTextToSize(parrafo.replace(/\s*\n\s*/g, ' ').trim(), ancho)
      for (const linea of lineas) {
        if (y > 262) { doc.addPage(); y = 20 }
        doc.text(linea, M, y)
        y += 5.2
      }
      y += 3
    }
  }

  // Línea para firmar a mano, a la derecha
  if (y > 240) { doc.addPage(); y = 30 }
  y = Math.max(y + 18, 200)
  const firmaW = 70
  doc.setDrawColor(120)
  doc.line(W - M - firmaW, y, W - M, y)
  y += 4.5
  doc.setFontSize(9)
  doc.text('Firma y sello', W - M - firmaW / 2, y, { align: 'center' })

  // Pie
  const emitida = receta.issuedAt?.toDate ? receta.issuedAt.toDate() : (receta.issuedAt ? new Date(receta.issuedAt) : null)
  doc.setFontSize(8)
  doc.setTextColor(120)
  const cuando = emitida ? ` el ${emitida.toLocaleDateString('es-PE')}` : ''
  doc.text(`Receta emitida${cuando}${receta.id ? ` · Registro ${receta.id}` : ''}`, W - M, 285, { align: 'right' })
  doc.setTextColor(0)

  return doc
}
