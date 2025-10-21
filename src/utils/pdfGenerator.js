import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { formatCurrency, formatDate } from '@/lib/utils'

/**
 * Genera un PDF para una factura o boleta
 * @param {Object} invoice - Datos de la factura
 * @param {Object} companySettings - Configuración de la empresa
 */
export const generateInvoicePDF = (invoice, companySettings) => {
  const doc = new jsPDF()

  // Colores
  const primaryColor = [59, 130, 246] // primary-600
  const grayDark = [31, 41, 55] // gray-800
  const grayMedium = [107, 114, 128] // gray-500
  const grayLight = [243, 244, 246] // gray-100

  let yPos = 20

  // ========== ENCABEZADO ==========

  // Logo o nombre de empresa (izquierda)
  doc.setFontSize(18)
  doc.setTextColor(...primaryColor)
  doc.setFont('helvetica', 'bold')
  doc.text(companySettings?.businessName || 'MI EMPRESA SAC', 20, yPos)

  // Tipo de documento (derecha)
  doc.setFontSize(16)
  doc.setTextColor(...grayDark)
  const documentTitle = invoice.documentType === 'factura' ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA'
  doc.text(documentTitle, 200, yPos, { align: 'right' })

  yPos += 8

  // Información de empresa (izquierda)
  doc.setFontSize(9)
  doc.setTextColor(...grayMedium)
  doc.setFont('helvetica', 'normal')

  if (companySettings?.ruc) {
    doc.text(`RUC: ${companySettings.ruc}`, 20, yPos)
    yPos += 4
  }

  if (companySettings?.address) {
    const addressLines = doc.splitTextToSize(companySettings.address, 80)
    doc.text(addressLines, 20, yPos)
    yPos += 4 * addressLines.length
  }

  if (companySettings?.phone) {
    doc.text(`Tel: ${companySettings.phone}`, 20, yPos)
    yPos += 4
  }

  if (companySettings?.email) {
    doc.text(`Email: ${companySettings.email}`, 20, yPos)
  }

  // Número de documento y fecha (derecha)
  yPos = 28
  doc.setFontSize(10)
  doc.setTextColor(...grayDark)
  doc.setFont('helvetica', 'bold')
  doc.text(invoice.number, 200, yPos, { align: 'right' })

  yPos += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...grayMedium)

  const invoiceDate = invoice.createdAt
    ? formatDate(invoice.createdAt.toDate())
    : 'N/A'
  doc.text(`Fecha: ${invoiceDate}`, 200, yPos, { align: 'right' })

  yPos += 10

  // Línea separadora
  doc.setDrawColor(...grayMedium)
  doc.setLineWidth(0.5)
  doc.line(20, yPos, 190, yPos)

  yPos += 10

  // ========== DATOS DEL CLIENTE ==========

  doc.setFontSize(11)
  doc.setTextColor(...grayDark)
  doc.setFont('helvetica', 'bold')
  doc.text('DATOS DEL CLIENTE', 20, yPos)

  yPos += 6

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grayMedium)

  // Nombre/Razón Social
  const customerName = invoice.customer?.name || 'Cliente General'
  doc.text(`${invoice.documentType === 'factura' ? 'Razón Social' : 'Nombre'}: ${customerName}`, 20, yPos)
  yPos += 5

  // Documento
  const docType = invoice.customer?.documentType === 'RUC' ? 'RUC' :
                  invoice.customer?.documentType === 'DNI' ? 'DNI' :
                  invoice.customer?.documentType || 'Documento'
  const docNumber = invoice.customer?.documentNumber || '-'
  doc.text(`${docType}: ${docNumber}`, 20, yPos)
  yPos += 5

  // Dirección (si existe)
  if (invoice.customer?.address) {
    const addressLines = doc.splitTextToSize(`Dirección: ${invoice.customer.address}`, 170)
    doc.text(addressLines, 20, yPos)
    yPos += 5 * addressLines.length
  }

  // Email y Teléfono en la misma línea si existen
  const contactInfo = []
  if (invoice.customer?.email) contactInfo.push(`Email: ${invoice.customer.email}`)
  if (invoice.customer?.phone) contactInfo.push(`Tel: ${invoice.customer.phone}`)

  if (contactInfo.length > 0) {
    doc.text(contactInfo.join(' | '), 20, yPos)
    yPos += 5
  }

  yPos += 5

  // ========== TABLA DE ITEMS ==========

  const tableData = invoice.items?.map((item, index) => [
    (index + 1).toString(),
    item.name,
    item.quantity.toString(),
    item.unit || 'UNIDAD',
    formatCurrency(item.unitPrice),
    formatCurrency(item.subtotal || (item.quantity * item.unitPrice))
  ]) || []

  doc.autoTable({
    startY: yPos,
    head: [['#', 'Descripción', 'Cant.', 'Unidad', 'P. Unit.', 'Subtotal']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: grayDark
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 25 },
      4: { halign: 'right', cellWidth: 30 },
      5: { halign: 'right', cellWidth: 30 }
    },
    margin: { left: 20, right: 20 },
    didDrawPage: (data) => {
      yPos = data.cursor.y
    }
  })

  yPos += 10

  // ========== TOTALES ==========

  const totalsX = 140
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grayMedium)

  // Subtotal
  doc.text('Subtotal:', totalsX, yPos)
  doc.text(formatCurrency(invoice.subtotal || 0), 190, yPos, { align: 'right' })
  yPos += 5

  // IGV
  doc.text('IGV (18%):', totalsX, yPos)
  doc.text(formatCurrency(invoice.igv || 0), 190, yPos, { align: 'right' })
  yPos += 7

  // Total
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...grayDark)
  doc.text('TOTAL:', totalsX, yPos)
  doc.setTextColor(...primaryColor)
  doc.text(formatCurrency(invoice.total || 0), 190, yPos, { align: 'right' })

  yPos += 10

  // ========== INFORMACIÓN ADICIONAL ==========

  // Método de pago
  if (invoice.paymentMethod) {
    doc.setFontSize(8)
    doc.setTextColor(...grayMedium)
    doc.setFont('helvetica', 'normal')
    doc.text(`Método de pago: ${invoice.paymentMethod}`, 20, yPos)
    yPos += 5
  }

  // Estado
  const statusText = invoice.status === 'paid' ? 'PAGADA' :
                     invoice.status === 'pending' ? 'PENDIENTE' :
                     invoice.status === 'overdue' ? 'VENCIDA' :
                     invoice.status?.toUpperCase()

  doc.text(`Estado: ${statusText}`, 20, yPos)
  yPos += 5

  // Observaciones
  if (invoice.notes) {
    yPos += 5
    doc.setFont('helvetica', 'bold')
    doc.text('Observaciones:', 20, yPos)
    yPos += 4
    doc.setFont('helvetica', 'normal')
    const notesLines = doc.splitTextToSize(invoice.notes, 170)
    doc.text(notesLines, 20, yPos)
    yPos += 4 * notesLines.length
  }

  // ========== FOOTER ==========

  // Línea separadora
  const footerY = 270
  doc.setDrawColor(...grayMedium)
  doc.setLineWidth(0.3)
  doc.line(20, footerY, 190, footerY)

  // Texto del footer
  doc.setFontSize(7)
  doc.setTextColor(...grayMedium)
  doc.setFont('helvetica', 'italic')
  const footerText = `Documento generado por Cobrify | ${companySettings?.website || 'www.cobrify.com'}`
  doc.text(footerText, 105, footerY + 5, { align: 'center' })

  // Representación impresa
  doc.setFont('helvetica', 'normal')
  doc.text('Representación impresa de comprobante electrónico', 105, footerY + 10, { align: 'center' })

  // ========== GENERAR PDF ==========

  const fileName = `${invoice.documentType === 'factura' ? 'Factura' : 'Boleta'}_${invoice.number.replace(/\//g, '-')}.pdf`
  doc.save(fileName)
}

/**
 * Genera un PDF simple para vista previa
 * @param {Object} invoice - Datos de la factura
 */
export const generateSimpleInvoicePDF = (invoice) => {
  const companySettings = {
    businessName: 'MI EMPRESA',
    ruc: '20123456789',
    address: 'Dirección de la empresa',
    email: 'contacto@empresa.com',
    phone: '01-2345678'
  }

  generateInvoicePDF(invoice, companySettings)
}
