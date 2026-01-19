import jsPDF from 'jspdf'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// Colores base
const BLACK = [0, 0, 0]
const DARK_GRAY = [55, 65, 81]
const LIGHT_GRAY = [156, 163, 175]
const WHITE = [255, 255, 255]

/**
 * Formatea fecha en formato peruano: "12/07/2026"
 */
const formatDatePeru = (date) => {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Formatea fecha y hora en formato peruano
 */
const formatDateTimePeru = (date) => {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

/**
 * Genera PDF de Constancia de Reclamo
 * Formato según Anexo I del D.S. N° 011-2011-PCM
 */
export const generateComplaintPDF = async (complaint, businessInfo = {}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin

  let y = margin

  // ===== ENCABEZADO =====
  // Título principal
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('LIBRO DE RECLAMACIONES', pageWidth / 2, y, { align: 'center' })

  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('(Ley N° 29571, Código de Protección y Defensa del Consumidor)', pageWidth / 2, y, { align: 'center' })

  // Línea separadora
  y += 5
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)

  // ===== DATOS DEL PROVEEDOR =====
  y += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('1. IDENTIFICACIÓN DEL PROVEEDOR', margin, y)

  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const labelWidth = 40

  // Razón Social
  doc.setFont('helvetica', 'bold')
  doc.text('Razón Social:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(complaint.business?.name || businessInfo?.businessName || '', margin + labelWidth, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('RUC:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(complaint.business?.ruc || businessInfo?.ruc || '', margin + labelWidth, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Dirección:', margin, y)
  doc.setFont('helvetica', 'normal')
  const addressLines = doc.splitTextToSize(complaint.business?.address || businessInfo?.address || '', contentWidth - labelWidth)
  doc.text(addressLines, margin + labelWidth, y)
  y += addressLines.length * 4

  // ===== DATOS DEL CONSUMIDOR =====
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('2. IDENTIFICACIÓN DEL CONSUMIDOR RECLAMANTE', margin, y)

  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  // Nombre
  doc.setFont('helvetica', 'bold')
  doc.text('Nombre:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(complaint.consumer?.fullName || '', margin + labelWidth, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Documento:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`${complaint.consumer?.documentType || 'DNI'} ${complaint.consumer?.documentNumber || ''}`, margin + labelWidth, y)

  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Domicilio:', margin, y)
  doc.setFont('helvetica', 'normal')
  const consumerAddressLines = doc.splitTextToSize(complaint.consumer?.address || 'No especificado', contentWidth - labelWidth)
  doc.text(consumerAddressLines, margin + labelWidth, y)
  y += consumerAddressLines.length * 4

  y += 1
  doc.setFont('helvetica', 'bold')
  doc.text('Teléfono:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(complaint.consumer?.phone || 'No especificado', margin + labelWidth, y)

  doc.setFont('helvetica', 'bold')
  doc.text('Email:', margin + 70, y)
  doc.setFont('helvetica', 'normal')
  doc.text(complaint.consumer?.email || '', margin + 70 + 15, y)

  // Padre o apoderado (si es menor)
  if (complaint.isMinor && complaint.guardian) {
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.text('Padre/Madre/Apoderado:', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(complaint.guardian.fullName || '', margin + labelWidth + 10, y)

    y += 5
    doc.setFont('helvetica', 'bold')
    doc.text('Documento Apoderado:', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(`${complaint.guardian.documentType || 'DNI'} ${complaint.guardian.documentNumber || ''}`, margin + labelWidth + 10, y)
  }

  // ===== TIPO DE RECLAMO =====
  y += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('3. TIPO DE RECLAMO', margin, y)

  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')

  // Checkbox para Reclamo
  const checkboxSize = 4
  doc.rect(margin, y - 3, checkboxSize, checkboxSize)
  if (complaint.type === 'reclamo') {
    doc.setFont('helvetica', 'bold')
    doc.text('X', margin + 1, y)
    doc.setFont('helvetica', 'normal')
  }
  doc.text('RECLAMO: Disconformidad relacionada a los productos o servicios.', margin + checkboxSize + 3, y)

  y += 6
  doc.rect(margin, y - 3, checkboxSize, checkboxSize)
  if (complaint.type === 'queja') {
    doc.setFont('helvetica', 'bold')
    doc.text('X', margin + 1, y)
    doc.setFont('helvetica', 'normal')
  }
  doc.text('QUEJA: Malestar o descontento respecto a la atención al público.', margin + checkboxSize + 3, y)

  // ===== DETALLE DEL RECLAMO =====
  y += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('4. DETALLE DE LA RECLAMACIÓN', margin, y)

  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Producto/Servicio:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(complaint.productOrService || '', margin + 35, y)

  if (complaint.amount) {
    doc.setFont('helvetica', 'bold')
    doc.text('Monto:', margin + 110, y)
    doc.setFont('helvetica', 'normal')
    doc.text(`S/ ${parseFloat(complaint.amount).toFixed(2)}`, margin + 125, y)
  }

  // Descripción
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Descripción:', margin, y)

  y += 5
  doc.setFont('helvetica', 'normal')
  const descriptionLines = doc.splitTextToSize(complaint.description || '', contentWidth)
  doc.text(descriptionLines, margin, y)
  y += descriptionLines.length * 4

  // Pedido del consumidor
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.text('Pedido del Consumidor:', margin, y)

  y += 5
  doc.setFont('helvetica', 'normal')
  const requestLines = doc.splitTextToSize(complaint.consumerRequest || '', contentWidth)
  doc.text(requestLines, margin, y)
  y += requestLines.length * 4

  // ===== OBSERVACIONES Y ACCIONES DEL PROVEEDOR =====
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('5. OBSERVACIONES Y ACCIONES ADOPTADAS POR EL PROVEEDOR', margin, y)

  y += 6
  doc.setFontSize(9)

  if (complaint.response) {
    doc.setFont('helvetica', 'normal')
    const responseLines = doc.splitTextToSize(complaint.response.text || '', contentWidth)
    doc.text(responseLines, margin, y)
    y += responseLines.length * 4

    y += 4
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...LIGHT_GRAY)
    doc.text(`Fecha de respuesta: ${formatDateTimePeru(complaint.response.respondedAt)}`, margin, y)
    doc.setTextColor(...BLACK)
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...LIGHT_GRAY)
    doc.text('Pendiente de respuesta', margin, y)
    doc.setTextColor(...BLACK)
  }

  // ===== DATOS DEL RECLAMO =====
  y += 12
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)

  y += 6
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK_GRAY)

  doc.text(`N° de Reclamo: ${complaint.complaintNumber || ''}`, margin, y)
  doc.text(`Código de Seguimiento: ${complaint.trackingCode || ''}`, pageWidth / 2, y)

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text(`Fecha de Registro: ${formatDateTimePeru(complaint.createdAt)}`, margin, y)
  doc.text(`Fecha Límite de Respuesta: ${formatDatePeru(complaint.dueDate)}`, pageWidth / 2, y)

  // ===== PIE DE PÁGINA =====
  y = pageHeight - 30
  doc.setFontSize(7)
  doc.setTextColor(...LIGHT_GRAY)
  doc.setFont('helvetica', 'normal')

  const legalText = 'De acuerdo con lo establecido en el Código de Protección y Defensa del Consumidor, el proveedor deberá dar respuesta al reclamo en un plazo no mayor a treinta (30) días calendario, pudiendo ampliar el plazo hasta por treinta (30) días más, previa comunicación al consumidor.'
  const legalLines = doc.splitTextToSize(legalText, contentWidth)
  doc.text(legalLines, margin, y)

  y += legalLines.length * 3 + 4
  doc.text('Este documento constituye constancia de la presentación del reclamo.', pageWidth / 2, y, { align: 'center' })

  // Guardar o descargar
  const fileName = `Reclamo_${complaint.complaintNumber || complaint.trackingCode}.pdf`
  await savePDF(doc, fileName)

  return doc
}

/**
 * Guarda el PDF (descarga en web, comparte en móvil)
 */
const savePDF = async (doc, fileName) => {
  const isNative = Capacitor.isNativePlatform()

  if (isNative) {
    try {
      const pdfOutput = doc.output('datauristring')
      const base64Data = pdfOutput.split(',')[1]

      const pdfDir = 'Reclamos'

      // Crear directorio si no existe
      try {
        await Filesystem.mkdir({
          path: pdfDir,
          directory: Directory.Documents,
          recursive: true
        })
      } catch (mkdirError) {
        console.log('Directorio ya existe:', mkdirError)
      }

      const result = await Filesystem.writeFile({
        path: `${pdfDir}/${fileName}`,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true
      })

      console.log('PDF guardado en:', result.uri)

      try {
        await Share.share({
          title: fileName,
          text: `Constancia de Reclamo: ${fileName}`,
          url: result.uri,
          dialogTitle: 'Compartir Constancia'
        })
      } catch (shareError) {
        console.log('Compartir cancelado o no disponible:', shareError)
      }

      return { success: true, uri: result.uri, fileName }
    } catch (error) {
      console.error('Error al guardar PDF en móvil:', error)
      throw error
    }
  } else {
    doc.save(fileName)
  }
}

/**
 * Genera PDF con múltiples reclamos para reporte
 */
export const generateComplaintsReportPDF = async (complaints, businessInfo = {}, dateRange = {}) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 10
  const contentWidth = pageWidth - 2 * margin

  let y = margin

  // Título
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('REPORTE DE LIBRO DE RECLAMACIONES', pageWidth / 2, y, { align: 'center' })

  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(businessInfo?.businessName || '', pageWidth / 2, y, { align: 'center' })

  if (dateRange.start || dateRange.end) {
    y += 5
    doc.setFontSize(8)
    const rangeText = `Período: ${dateRange.start ? formatDatePeru(dateRange.start) : 'Inicio'} - ${dateRange.end ? formatDatePeru(dateRange.end) : 'Actualidad'}`
    doc.text(rangeText, pageWidth / 2, y, { align: 'center' })
  }

  y += 10

  // Encabezados de tabla
  const colWidths = [25, 20, 50, 60, 35, 25, 45]
  const headers = ['N° Reclamo', 'Fecha', 'Consumidor', 'Descripción', 'Producto/Servicio', 'Estado', 'Respuesta']

  doc.setFillColor(55, 65, 81)
  doc.rect(margin, y, contentWidth, 7, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')

  let x = margin + 2
  headers.forEach((header, i) => {
    doc.text(header, x, y + 5)
    x += colWidths[i]
  })

  y += 7
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)

  // Filas de datos
  complaints.forEach((complaint, index) => {
    if (y > 190) {
      doc.addPage()
      y = margin
    }

    // Alternar color de fondo
    if (index % 2 === 0) {
      doc.setFillColor(249, 250, 251)
      doc.rect(margin, y, contentWidth, 8, 'F')
    }

    x = margin + 2
    const rowHeight = 8

    // N° Reclamo
    doc.text(complaint.complaintNumber || '', x, y + 5)
    x += colWidths[0]

    // Fecha
    doc.text(formatDatePeru(complaint.createdAt), x, y + 5)
    x += colWidths[1]

    // Consumidor
    const consumerText = `${complaint.consumer?.fullName || ''}\n${complaint.consumer?.documentType || ''}: ${complaint.consumer?.documentNumber || ''}`
    const consumerLines = doc.splitTextToSize(consumerText, colWidths[2] - 2)
    doc.text(consumerLines[0] || '', x, y + 5)
    x += colWidths[2]

    // Descripción (truncada)
    const descText = (complaint.description || '').substring(0, 80) + ((complaint.description || '').length > 80 ? '...' : '')
    const descLines = doc.splitTextToSize(descText, colWidths[3] - 2)
    doc.text(descLines[0] || '', x, y + 5)
    x += colWidths[3]

    // Producto/Servicio
    const productText = (complaint.productOrService || '').substring(0, 35)
    doc.text(productText, x, y + 5)
    x += colWidths[4]

    // Estado
    const statusText = complaint.status === 'pending' ? 'Pendiente' :
                       complaint.status === 'in_progress' ? 'En Proceso' : 'Resuelto'
    doc.text(statusText, x, y + 5)
    x += colWidths[5]

    // Respuesta (truncada)
    const responseText = complaint.response?.text ?
      (complaint.response.text.substring(0, 50) + (complaint.response.text.length > 50 ? '...' : '')) :
      'Sin respuesta'
    doc.text(responseText, x, y + 5)

    y += rowHeight
  })

  // Resumen al final
  y += 10
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total de registros: ${complaints.length}`, margin, y)

  const pending = complaints.filter(c => c.status === 'pending').length
  const resolved = complaints.filter(c => c.status === 'resolved').length
  doc.text(`Pendientes: ${pending}`, margin + 50, y)
  doc.text(`Resueltos: ${resolved}`, margin + 90, y)

  // Guardar
  const fileName = `Reporte_Reclamos_${new Date().toISOString().split('T')[0]}.pdf`
  await savePDF(doc, fileName)

  return doc
}
