/**
 * El PDF de un consentimiento firmado: cabecera del negocio, datos del
 * paciente, el texto que leyó y su firma con fecha y hora.
 *
 * Se genera a partir del registro guardado (texto renderizado + firma), así
 * el PDF de hoy y el de dentro de dos años son el mismo. Se importa bajo
 * demanda: jsPDF pesa y solo hace falta al descargar.
 */
import jsPDF from 'jspdf'
import { fechaCorta } from '@/utils/fichaAtencion'

/**
 * @param {object} consent el consentimiento guardado (ver consentService)
 * @param {object} negocio businessSettings: tradeName/businessName, ruc, address, phone
 * @returns {jsPDF}
 */
export function generarPdfConsentimiento(consent, negocio = {}) {
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
  const datosNegocio = [
    negocio.ruc ? `RUC ${negocio.ruc}` : '',
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
  doc.text('CONSENTIMIENTO INFORMADO', W / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(11)
  doc.text(String(consent.templateName || ''), W / 2, y, { align: 'center' })
  y += 9

  // Datos del paciente y del procedimiento
  doc.setFontSize(10)
  const filas = [
    ['Paciente', consent.customerName],
    ['Documento', consent.customerDocument],
    ['Tratamiento', consent.treatment],
    ['Profesional', consent.professional],
    ['Fecha', fechaCorta(consent.signedDate)],
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
  y += 7

  // El texto que leyó
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  const parrafos = String(consent.text || '').split(/\n{2,}/)
  for (const parrafo of parrafos) {
    const lineas = doc.splitTextToSize(parrafo.replace(/\s*\n\s*/g, ' ').trim(), ancho)
    for (const linea of lineas) {
      if (y > 262) { doc.addPage(); y = 20 }
      doc.text(linea, M, y)
      y += 5.2
    }
    y += 3
  }

  // Firma
  if (y > 225) { doc.addPage(); y = 30 }
  y += 4
  const firmaW = 70
  const firmaH = 26
  if (consent.signatureDataUrl) {
    try {
      doc.addImage(consent.signatureDataUrl, 'PNG', M, y, firmaW, firmaH)
    } catch (e) {
      // Sin firma dibujable el documento igual sale: la línea queda para firmar a mano.
    }
  }
  y += firmaH + 2
  doc.setDrawColor(120)
  doc.line(M, y, M + firmaW, y)
  y += 4.5
  doc.setFontSize(9)
  doc.text('Firma del paciente', M, y)
  y += 4
  doc.text([consent.customerName, consent.customerDocument].filter(Boolean).join(' · '), M, y)

  // Sello de cuándo se firmó
  const firmado = consent.signedAt?.toDate ? consent.signedAt.toDate() : (consent.signedAt ? new Date(consent.signedAt) : null)
  doc.setFontSize(8)
  doc.setTextColor(120)
  const cuando = firmado
    ? ` el ${firmado.toLocaleDateString('es-PE')} a las ${firmado.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
    : ''
  doc.text(`Firmado en pantalla${cuando}${consent.id ? ` · Registro ${consent.id}` : ''}`, W - M, 285, { align: 'right' })
  doc.setTextColor(0)

  return doc
}
