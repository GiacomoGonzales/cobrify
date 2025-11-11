import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate } from '@/lib/utils'

/**
 * Carga una imagen desde una URL y la convierte a base64
 * @param {string} url - URL de la imagen
 * @returns {Promise<string>} - Imagen en formato base64
 */
const loadImageAsBase64 = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      try {
        const dataURL = canvas.toDataURL('image/png')
        resolve(dataURL)
      } catch (error) {
        reject(error)
      }
    }
    img.onerror = reject
    img.src = url
  })
}

/**
 * Genera un PDF para una factura o boleta
 * @param {Object} invoice - Datos de la factura
 * @param {Object} companySettings - Configuración de la empresa
 */
export const generateInvoicePDF = async (invoice, companySettings, download = true) => {
  const doc = new jsPDF()

  // Colores
  const primaryColor = [59, 130, 246] // primary-600
  const grayDark = [31, 41, 55] // gray-800
  const grayMedium = [107, 114, 128] // gray-500
  const grayLight = [243, 244, 246] // gray-100

  let yPos = 15

  // ========== ENCABEZADO - INFORMACIÓN DE EMPRESA (IZQUIERDA) ==========

  // Logo de empresa (si existe)
  let hasLogo = false
  if (companySettings?.logoUrl) {
    try {
      const imgData = await loadImageAsBase64(companySettings.logoUrl)
      doc.addImage(imgData, 'PNG', 15, yPos, 25, 25)
      hasLogo = true
    } catch (error) {
      console.error('Error cargando logo:', error)
    }
  }

  // Información de empresa
  const companyX = hasLogo ? 45 : 15
  doc.setFontSize(14)
  doc.setTextColor(...grayDark)
  doc.setFont('helvetica', 'bold')
  doc.text(companySettings?.businessName || 'MI EMPRESA SAC', companyX, yPos + 5)

  yPos += 10
  doc.setFontSize(8)
  doc.setTextColor(...grayMedium)
  doc.setFont('helvetica', 'normal')

  if (companySettings?.ruc) {
    doc.text(`RUC: ${companySettings.ruc}`, companyX, yPos)
    yPos += 4
  }

  if (companySettings?.address) {
    const addressLines = doc.splitTextToSize(companySettings.address, 80)
    doc.text(addressLines, companyX, yPos)
    yPos += 3.5 * addressLines.length
  }

  if (companySettings?.phone) {
    doc.text(`Teléfono: ${companySettings.phone}`, companyX, yPos)
    yPos += 4
  }

  if (companySettings?.email) {
    doc.text(`Email: ${companySettings.email}`, companyX, yPos)
  }

  // ========== CUADRO DE COMPROBANTE (DERECHA) ==========

  // Recuadro para el tipo de comprobante
  const boxX = 130
  const boxY = 15
  const boxWidth = 65
  const boxHeight = 35

  // Borde del recuadro
  doc.setDrawColor(...primaryColor)
  doc.setLineWidth(0.8)
  doc.rect(boxX, boxY, boxWidth, boxHeight)

  // Línea divisoria horizontal en el medio
  doc.setLineWidth(0.3)
  doc.line(boxX, boxY + 18, boxX + boxWidth, boxY + 18)

  // Tipo de documento (arriba del recuadro)
  doc.setFontSize(12)
  doc.setTextColor(...primaryColor)
  doc.setFont('helvetica', 'bold')
  const documentTitle = invoice.documentType === 'factura' ? 'FACTURA ELECTRÓNICA' :
                       invoice.documentType === 'boleta' ? 'BOLETA DE VENTA' : 'NOTA DE VENTA'
  const titleX = boxX + (boxWidth / 2)
  doc.text(documentTitle, titleX, boxY + 8, { align: 'center' })

  // Serie y número (centro del recuadro)
  doc.setFontSize(9)
  doc.setTextColor(...grayDark)
  doc.text(invoice.number || 'N/A', titleX, boxY + 14, { align: 'center' })

  // Fecha (abajo del recuadro)
  doc.setFontSize(8)
  doc.setTextColor(...grayMedium)
  doc.setFont('helvetica', 'normal')

  let invoiceDate = new Date().toLocaleDateString('es-PE')
  if (invoice.createdAt) {
    if (invoice.createdAt.toDate) {
      invoiceDate = formatDate(invoice.createdAt.toDate())
    } else if (invoice.createdAt instanceof Date) {
      invoiceDate = formatDate(invoice.createdAt)
    } else {
      invoiceDate = formatDate(new Date(invoice.createdAt))
    }
  }

  doc.text(`Fecha: ${invoiceDate}`, titleX, boxY + 26, { align: 'center' })

  // Resetear yPos después del header
  yPos = boxY + boxHeight + 8

  // Línea separadora
  doc.setDrawColor(...grayLight)
  doc.setLineWidth(0.5)
  doc.line(15, yPos, 195, yPos)

  yPos += 8

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

  autoTable(doc, {
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

  if (download) {
    const fileName = `${invoice.documentType === 'factura' ? 'Factura' : 'Boleta'}_${invoice.number.replace(/\//g, '-')}.pdf`
    doc.save(fileName)
  }

  return doc
}

/**
 * Genera un PDF simple para vista previa
 * @param {Object} invoice - Datos de la factura
 */
export const generateSimpleInvoicePDF = async (invoice) => {
  const companySettings = {
    businessName: 'MI EMPRESA',
    ruc: '20123456789',
    address: 'Dirección de la empresa',
    email: 'contacto@empresa.com',
    phone: '01-2345678'
  }

  return await generateInvoicePDF(invoice, companySettings)
}

/**
 * Exporta el PDF como blob para enviar por WhatsApp u otros usos
 * @param {Object} invoice - Datos de la factura
 * @param {Object} companySettings - Configuración de la empresa
 * @returns {Promise<Blob>} - PDF en formato blob
 */
export const getInvoicePDFBlob = async (invoice, companySettings) => {
  const doc = await generateInvoicePDF(invoice, companySettings, false)
  return doc.output('blob')
}
