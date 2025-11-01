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
 * Genera un PDF para una cotización
 * @param {Object} quotation - Datos de la cotización
 * @param {Object} companySettings - Configuración de la empresa
 * @param {boolean} download - Si se debe descargar automáticamente (default: true)
 * @returns {jsPDF} - El documento PDF generado
 */
export const generateQuotationPDF = async (quotation, companySettings, download = true) => {
  const doc = new jsPDF()

  // Colores
  const primaryColor = [59, 130, 246] // primary-600
  const warningColor = [245, 158, 11] // amber-500
  const grayDark = [31, 41, 55] // gray-800
  const grayMedium = [107, 114, 128] // gray-500
  const grayLight = [243, 244, 246] // gray-100

  let yPos = 20

  // ========== ENCABEZADO ==========

  // Logo de empresa (si existe)
  if (companySettings?.logoUrl) {
    try {
      // Cargar logo como imagen
      const imgData = await loadImageAsBase64(companySettings.logoUrl)
      doc.addImage(imgData, 'PNG', 20, yPos, 30, 30)

      // Mover texto a la derecha del logo
      doc.setFontSize(18)
      doc.setTextColor(...primaryColor)
      doc.setFont('helvetica', 'bold')
      doc.text(companySettings?.businessName || 'MI EMPRESA SAC', 55, yPos + 5)

      // Ajustar posición para información de empresa
      const companyInfoX = 55
      yPos += 13

      // Información de empresa (debajo del nombre)
      doc.setFontSize(9)
      doc.setTextColor(...grayMedium)
      doc.setFont('helvetica', 'normal')

      if (companySettings?.ruc) {
        doc.text(`RUC: ${companySettings.ruc}`, companyInfoX, yPos)
        yPos += 4
      }

      if (companySettings?.address) {
        const addressLines = doc.splitTextToSize(companySettings.address, 80)
        doc.text(addressLines, companyInfoX, yPos)
        yPos += 4 * addressLines.length
      }

      if (companySettings?.phone) {
        doc.text(`Tel: ${companySettings.phone}`, companyInfoX, yPos)
        yPos += 4
      }

      if (companySettings?.email) {
        doc.text(`Email: ${companySettings.email}`, companyInfoX, yPos)
      }

      // Resetear yPos para continuar
      yPos = 20
    } catch (error) {
      console.error('Error cargando logo:', error)
      // Si falla, usar el diseño sin logo
      doc.setFontSize(18)
      doc.setTextColor(...primaryColor)
      doc.setFont('helvetica', 'bold')
      doc.text(companySettings?.businessName || 'MI EMPRESA SAC', 20, yPos)
    }
  } else {
    // Diseño sin logo (original)
    doc.setFontSize(18)
    doc.setTextColor(...primaryColor)
    doc.setFont('helvetica', 'bold')
    doc.text(companySettings?.businessName || 'MI EMPRESA SAC', 20, yPos)

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
  }

  // Tipo de documento (derecha)
  doc.setFontSize(16)
  doc.setTextColor(...grayDark)
  doc.text('COTIZACIÓN', 200, yPos, { align: 'right' })

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

  // Número de cotización y fecha (derecha)
  yPos = 28
  doc.setFontSize(10)
  doc.setTextColor(...grayDark)
  doc.setFont('helvetica', 'bold')
  doc.text(quotation.number, 200, yPos, { align: 'right' })

  yPos += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...grayMedium)

  let quotationDate = 'N/A'
  if (quotation.createdAt) {
    if (quotation.createdAt.toDate) {
      // Es un Timestamp de Firestore
      quotationDate = formatDate(quotation.createdAt.toDate())
    } else {
      // Es un objeto Date normal
      quotationDate = formatDate(quotation.createdAt)
    }
  }
  doc.text(`Fecha: ${quotationDate}`, 200, yPos, { align: 'right' })

  // Fecha de expiración
  if (quotation.expiryDate) {
    yPos += 5
    let expiryDate = 'N/A'
    if (quotation.expiryDate.toDate) {
      expiryDate = formatDate(quotation.expiryDate.toDate())
    } else {
      expiryDate = formatDate(quotation.expiryDate)
    }

    doc.setTextColor(...warningColor)
    doc.setFont('helvetica', 'bold')
    doc.text(`Válida hasta: ${expiryDate}`, 200, yPos, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...grayMedium)
  }

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
  const customerName = quotation.customer?.name || 'Cliente General'
  const isRUC = quotation.customer?.documentType === 'RUC'
  doc.text(`${isRUC ? 'Razón Social' : 'Nombre'}: ${customerName}`, 20, yPos)
  yPos += 5

  // Documento
  const docType = quotation.customer?.documentType || 'Documento'
  const docNumber = quotation.customer?.documentNumber || '-'
  doc.text(`${docType}: ${docNumber}`, 20, yPos)
  yPos += 5

  // Dirección (si existe)
  if (quotation.customer?.address) {
    const addressLines = doc.splitTextToSize(`Dirección: ${quotation.customer.address}`, 170)
    doc.text(addressLines, 20, yPos)
    yPos += 5 * addressLines.length
  }

  // Email y Teléfono en la misma línea si existen
  const contactInfo = []
  if (quotation.customer?.email) contactInfo.push(`Email: ${quotation.customer.email}`)
  if (quotation.customer?.phone) contactInfo.push(`Tel: ${quotation.customer.phone}`)

  if (contactInfo.length > 0) {
    doc.text(contactInfo.join(' | '), 20, yPos)
    yPos += 5
  }

  yPos += 5

  // ========== TABLA DE ITEMS ==========

  const tableData = quotation.items?.map((item, index) => [
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
  doc.text(formatCurrency(quotation.subtotal || 0), 190, yPos, { align: 'right' })
  yPos += 5

  // Descuento (si existe)
  if (quotation.discount && quotation.discount > 0) {
    const discountLabel = quotation.discountType === 'percentage'
      ? `Descuento (${quotation.discount}%):`
      : 'Descuento:'

    doc.text(discountLabel, totalsX, yPos)
    const discountAmount = quotation.discountType === 'percentage'
      ? (quotation.subtotal * quotation.discount / 100)
      : quotation.discount

    doc.text(`- ${formatCurrency(discountAmount)}`, 190, yPos, { align: 'right' })
    yPos += 5

    // Subtotal después del descuento
    const discountedSubtotal = quotation.subtotal - discountAmount
    doc.text('Subtotal con descuento:', totalsX, yPos)
    doc.text(formatCurrency(discountedSubtotal), 190, yPos, { align: 'right' })
    yPos += 5
  }

  // IGV
  doc.text('IGV (18%):', totalsX, yPos)
  doc.text(formatCurrency(quotation.igv || 0), 190, yPos, { align: 'right' })
  yPos += 7

  // Total
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...grayDark)
  doc.text('TOTAL:', totalsX, yPos)
  doc.setTextColor(...primaryColor)
  doc.text(formatCurrency(quotation.total || 0), 190, yPos, { align: 'right' })

  yPos += 10

  // ========== INFORMACIÓN ADICIONAL ==========

  // Validez
  if (quotation.validityDays) {
    doc.setFontSize(8)
    doc.setTextColor(...grayMedium)
    doc.setFont('helvetica', 'normal')
    doc.text(`Validez de la cotización: ${quotation.validityDays} días`, 20, yPos)
    yPos += 5
  }

  // Términos y condiciones
  if (quotation.terms) {
    yPos += 5
    doc.setFont('helvetica', 'bold')
    doc.text('Términos y condiciones:', 20, yPos)
    yPos += 4
    doc.setFont('helvetica', 'normal')
    const termsLines = doc.splitTextToSize(quotation.terms, 170)
    doc.text(termsLines, 20, yPos)
    yPos += 4 * termsLines.length
  }

  // Observaciones
  if (quotation.notes) {
    yPos += 5
    doc.setFont('helvetica', 'bold')
    doc.text('Observaciones:', 20, yPos)
    yPos += 4
    doc.setFont('helvetica', 'normal')
    const notesLines = doc.splitTextToSize(quotation.notes, 170)
    doc.text(notesLines, 20, yPos)
    yPos += 4 * notesLines.length
  }

  // ========== BANNER DE VALIDEZ ==========

  if (quotation.expiryDate) {
    yPos += 10

    // Verificar si está próxima a vencer o vencida
    const expiryDate = quotation.expiryDate.toDate ?
      quotation.expiryDate.toDate() :
      new Date(quotation.expiryDate)

    const now = new Date()
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry < 0) {
      // Vencida
      doc.setFillColor(239, 68, 68) // red-500
      doc.setTextColor(255, 255, 255)
      doc.rect(20, yPos, 170, 8, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('COTIZACIÓN VENCIDA', 105, yPos + 5.5, { align: 'center' })
    } else if (daysUntilExpiry <= 7) {
      // Próxima a vencer
      doc.setFillColor(...warningColor)
      doc.setTextColor(255, 255, 255)
      doc.rect(20, yPos, 170, 8, 'F')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`VÁLIDA POR ${daysUntilExpiry} DÍA${daysUntilExpiry !== 1 ? 'S' : ''} MÁS`, 105, yPos + 5.5, { align: 'center' })
    }
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

  // Nota importante
  doc.setFont('helvetica', 'normal')
  doc.text('Esta cotización no constituye un comprobante de pago', 105, footerY + 10, { align: 'center' })

  // ========== GENERAR/RETORNAR PDF ==========

  if (download) {
    const fileName = `Cotizacion_${quotation.number.replace(/\//g, '-')}.pdf`
    doc.save(fileName)
  }

  return doc
}

/**
 * Obtiene el PDF como blob para enviar por WhatsApp
 * @param {Object} quotation - Datos de la cotización
 * @param {Object} companySettings - Configuración de la empresa
 * @returns {Promise<Blob>} - El PDF como blob
 */
export const getQuotationPDFBlob = async (quotation, companySettings) => {
  const doc = await generateQuotationPDF(quotation, companySettings, false)
  return doc.output('blob')
}

/**
 * Obtiene el PDF como base64 para enviar por WhatsApp
 * @param {Object} quotation - Datos de la cotización
 * @param {Object} companySettings - Configuración de la empresa
 * @returns {Promise<string>} - El PDF en base64
 */
export const getQuotationPDFBase64 = async (quotation, companySettings) => {
  const doc = await generateQuotationPDF(quotation, companySettings, false)
  return doc.output('datauristring')
}
