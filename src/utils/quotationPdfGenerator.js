import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate } from '@/lib/utils'
import { storage } from '@/lib/firebase'
import { ref, getBlob } from 'firebase/storage'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Extrae el path de Firebase Storage desde una URL
 */
const getStoragePathFromUrl = (url) => {
  try {
    // Extraer path de URL de Firebase Storage
    // Formato: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?...
    const match = url.match(/\/o\/(.+?)\?/)
    if (match) {
      const encodedPath = match[1]
      return decodeURIComponent(encodedPath)
    }
    return null
  } catch (error) {
    console.error('Error extrayendo path:', error)
    return null
  }
}

/**
 * Carga una imagen desde Firebase Storage y la convierte a base64
 * Usa el SDK de Firebase para evitar problemas de CORS
 */
const loadImageAsBase64 = async (url) => {
  try {
    console.log('🔄 Cargando logo para cotización desde Firebase Storage')

    // Extraer el path del storage desde la URL
    const storagePath = getStoragePathFromUrl(url)

    if (storagePath) {
      console.log('📁 Path extraído:', storagePath)

      // Usar Firebase SDK para obtener el blob
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)

      // Convertir blob a base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          console.log('✅ Logo cargado correctamente para cotización')
          resolve(reader.result)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }

    // Fallback: intentar con fetch directo
    console.log('🔄 Fallback: Intentando fetch directo')
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'default'
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`)
    }

    const blob = await response.blob()

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

  } catch (error) {
    console.error('❌ Error cargando logo para cotización:', error)
    throw error
  }
}

/**
 * Genera un PDF para una cotización con el mismo estilo que los comprobantes
 * @param {Object} quotation - Datos de la cotización
 * @param {Object} companySettings - Configuración de la empresa
 * @param {boolean} download - Si se debe descargar automáticamente (default: true)
 * @returns {jsPDF} - El documento PDF generado
 */
export const generateQuotationPDF = async (quotation, companySettings, download = true) => {
  // Crear documento A4 en orientación vertical (portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  // Paleta de colores neutros - solo negros y grises
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [51, 51, 51]      // Gris muy oscuro para títulos
  const MEDIUM_GRAY = [102, 102, 102] // Gris medio para texto secundario
  const LIGHT_GRAY = [224, 224, 224]  // Gris claro para fondos
  const BORDER_GRAY = [189, 189, 189] // Gris para bordes

  // Márgenes y dimensiones - A4 portrait: 595pt x 842pt
  const MARGIN_LEFT = 40
  const MARGIN_RIGHT = 40
  const MARGIN_TOP = 40
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  // Coordenada Y actual
  let currentY = MARGIN_TOP

  // ========== 1. ENCABEZADO PRINCIPAL ==========

  // Barra superior negra elegante
  doc.setFillColor(...BLACK)
  doc.rect(0, 0, PAGE_WIDTH, 5, 'F')

  currentY += 8

  const headerY = currentY
  const headerHeight = 85

  // Columna izquierda - Información de la empresa (60%)
  const leftColumnWidth = CONTENT_WIDTH * 0.60
  const leftColumnX = MARGIN_LEFT

  // Logo de la empresa si existe
  let logoWidth = 0
  let textStartX = leftColumnX

  if (companySettings?.logoUrl) {
    try {
      console.log('📸 Intentando cargar logo para cotización desde:', companySettings.logoUrl)

      // Agregar un timeout para no bloquear la generación del PDF
      const imgData = await Promise.race([
        loadImageAsBase64(companySettings.logoUrl),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout loading logo')), 5000)
        )
      ])

      const logoHeight = 50
      logoWidth = 50

      // Determinar el formato de la imagen
      let format = 'PNG'
      if (companySettings.logoUrl.toLowerCase().includes('.jpg') ||
          companySettings.logoUrl.toLowerCase().includes('.jpeg')) {
        format = 'JPEG'
      }

      doc.addImage(imgData, format, leftColumnX, headerY, logoWidth, logoHeight, undefined, 'FAST')
      textStartX = leftColumnX + logoWidth + 15
      console.log('✅ Logo cargado correctamente en cotización')
    } catch (error) {
      console.warn('⚠️ No se pudo cargar el logo en cotización, continuando sin él:', error.message)
      textStartX = leftColumnX
    }
  }

  // Nombre de la empresa
  doc.setFontSize(14)
  doc.setTextColor(...DARK_GRAY)
  doc.setFont('helvetica', 'bold')

  let textY = headerY + 5
  const companyName = companySettings?.businessName || 'EMPRESA SAC'
  doc.text(companyName, textStartX, textY)
  textY += 16

  // RUC de la empresa
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  const ruc = companySettings?.ruc || ''
  if (ruc) {
    doc.text(`RUC: ${ruc}`, textStartX, textY)
    textY += 12
  }

  // Dirección
  doc.setFontSize(8)
  if (companySettings?.address) {
    const maxAddressWidth = leftColumnWidth - (textStartX - leftColumnX) - 10
    const addressLines = doc.splitTextToSize(companySettings.address, maxAddressWidth)
    doc.text(addressLines, textStartX, textY)
    textY += 10 * Math.min(addressLines.length, 2)
  }

  // Contacto
  const contactParts = []
  if (companySettings?.phone) contactParts.push(companySettings.phone)
  if (companySettings?.email) contactParts.push(companySettings.email)

  if (contactParts.length > 0) {
    doc.setFontSize(8)
    doc.text(contactParts.join(' • '), textStartX, textY)
  }

  // Columna derecha - Recuadro del comprobante (40%)
  const rightColumnWidth = CONTENT_WIDTH * 0.40
  const rightColumnX = MARGIN_LEFT + leftColumnWidth

  // Recuadro con borde negro
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(2)
  doc.roundedRect(rightColumnX, headerY, rightColumnWidth, headerHeight, 5, 5)

  // Contenido del recuadro - bien centrado
  const boxCenterX = rightColumnX + (rightColumnWidth / 2)
  let boxTextY = headerY + 25

  // Tipo de documento en negro
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('COTIZACIÓN', boxCenterX, boxTextY, { align: 'center' })

  boxTextY += 18

  // Número de cotización centrado
  doc.setFontSize(15)
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'bold')
  doc.text(quotation.number || 'N/A', boxCenterX, boxTextY, { align: 'center' })

  currentY = headerY + headerHeight + 20

  // Línea separadora
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(1)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)

  currentY += 20

  // ========== 2. DATOS DEL CLIENTE ==========

  // Recuadro con fondo gris claro
  const clientBoxHeight = 55
  doc.setFillColor(...LIGHT_GRAY)
  doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, clientBoxHeight, 'F')

  // Título de la sección
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK_GRAY)
  const clientTitleY = currentY + 15
  doc.text('DATOS DEL CLIENTE', MARGIN_LEFT + 10, clientTitleY)

  // Datos del cliente
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)

  let clientY = clientTitleY + 14
  const clientDataX = MARGIN_LEFT + 10

  // Nombre/Razón Social
  const customerName = quotation.customer?.name || 'Cliente General'
  const isRUC = quotation.customer?.documentType === 'RUC'
  doc.text(`${isRUC ? 'Razón Social' : 'Nombre'}: ${customerName}`, clientDataX, clientY)
  clientY += 10

  // Documento
  const docType = quotation.customer?.documentType || 'Documento'
  const docNumber = quotation.customer?.documentNumber || '-'
  doc.text(`${docType}: ${docNumber}`, clientDataX, clientY)

  // Columna derecha del cliente (si hay dirección o contacto)
  const clientRightX = MARGIN_LEFT + (CONTENT_WIDTH / 2) + 10
  clientY = clientTitleY + 14

  if (quotation.customer?.address) {
    const maxAddressWidth = (CONTENT_WIDTH / 2) - 20
    const addressLines = doc.splitTextToSize(`Dirección: ${quotation.customer.address}`, maxAddressWidth)
    doc.text(addressLines.slice(0, 2), clientRightX, clientY)
  }

  currentY += clientBoxHeight + 20

  // ========== 3. FECHAS ==========
  const datesY = currentY
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)

  // Fecha de emisión
  let quotationDate = 'N/A'
  if (quotation.createdAt) {
    if (quotation.createdAt.toDate) {
      quotationDate = formatDate(quotation.createdAt.toDate())
    } else {
      quotationDate = formatDate(quotation.createdAt)
    }
  }
  doc.text(`Fecha de emisión: ${quotationDate}`, MARGIN_LEFT, datesY)

  // Fecha de vencimiento
  if (quotation.expiryDate) {
    let expiryDate = 'N/A'
    if (quotation.expiryDate.toDate) {
      expiryDate = formatDate(quotation.expiryDate.toDate())
    } else {
      expiryDate = formatDate(quotation.expiryDate)
    }
    doc.text(`Válida hasta: ${expiryDate}`, PAGE_WIDTH - MARGIN_RIGHT, datesY, { align: 'right' })
  }

  currentY += 20

  // ========== 4. TABLA DE PRODUCTOS/SERVICIOS ==========

  const tableData = quotation.items?.map((item, index) => [
    (index + 1).toString(),
    item.name,
    item.quantity.toString(),
    item.unit || 'UNIDAD',
    formatCurrency(item.unitPrice),
    formatCurrency(item.subtotal || (item.quantity * item.unitPrice))
  ]) || []

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Descripción', 'Cant.', 'Unidad', 'P. Unit.', 'Subtotal']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: BLACK,
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 6
    },
    bodyStyles: {
      fontSize: 8,
      textColor: DARK_GRAY,
      cellPadding: 5
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 25 },
      1: { halign: 'left', cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 35 },
      3: { halign: 'center', cellWidth: 45 },
      4: { halign: 'right', cellWidth: 60 },
      5: { halign: 'right', cellWidth: 70 }
    },
    alternateRowStyles: {
      fillColor: LIGHT_GRAY
    },
    margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
    didDrawPage: (data) => {
      currentY = data.cursor.y
    }
  })

  currentY += 15

  // ========== 5. TOTALES ==========

  const totalsBoxWidth = 200
  const totalsBoxX = PAGE_WIDTH - MARGIN_RIGHT - totalsBoxWidth
  let totalsY = currentY

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)

  // Subtotal
  const labelX = totalsBoxX + 10
  const valueX = PAGE_WIDTH - MARGIN_RIGHT - 10

  doc.text('Subtotal:', labelX, totalsY)
  doc.text(formatCurrency(quotation.subtotal || 0), valueX, totalsY, { align: 'right' })
  totalsY += 12

  // Descuento (si existe)
  if (quotation.discount && quotation.discount > 0) {
    const discountLabel = quotation.discountType === 'percentage'
      ? `Descuento (${quotation.discount}%):`
      : 'Descuento:'

    doc.text(discountLabel, labelX, totalsY)
    const discountAmount = quotation.discountType === 'percentage'
      ? (quotation.subtotal * quotation.discount / 100)
      : quotation.discount

    doc.text(`- ${formatCurrency(discountAmount)}`, valueX, totalsY, { align: 'right' })
    totalsY += 12
  }

  // IGV
  doc.text('IGV (18%):', labelX, totalsY)
  doc.text(formatCurrency(quotation.igv || 0), valueX, totalsY, { align: 'right' })
  totalsY += 15

  // Total en caja negra
  const totalBoxHeight = 24
  const totalBoxY = totalsY - 8
  doc.setFillColor(...BLACK)
  doc.rect(totalsBoxX, totalBoxY, totalsBoxWidth, totalBoxHeight, 'F')

  // Texto del total - centrado verticalmente
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  const totalTextY = totalBoxY + (totalBoxHeight / 2) + 3.5
  doc.text('TOTAL:', labelX, totalTextY)
  doc.text(formatCurrency(quotation.total || 0), valueX, totalTextY, { align: 'right' })

  currentY = totalBoxY + totalBoxHeight + 20

  // ========== 6. INFORMACIÓN ADICIONAL ==========

  // Validez de la cotización
  if (quotation.validityDays) {
    doc.setFontSize(8)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.setFont('helvetica', 'italic')
    doc.text(`* Esta cotización tiene una validez de ${quotation.validityDays} días desde su emisión`, MARGIN_LEFT, currentY)
    currentY += 15
  }

  // Términos y condiciones
  if (quotation.terms) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK_GRAY)
    doc.text('Términos y condiciones:', MARGIN_LEFT, currentY)
    currentY += 12

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MEDIUM_GRAY)
    const termsLines = doc.splitTextToSize(quotation.terms, CONTENT_WIDTH - 20)
    doc.text(termsLines, MARGIN_LEFT + 10, currentY)
    currentY += 10 * termsLines.length + 10
  }

  // Observaciones
  if (quotation.notes) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK_GRAY)
    doc.text('Observaciones:', MARGIN_LEFT, currentY)
    currentY += 12

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MEDIUM_GRAY)
    const notesLines = doc.splitTextToSize(quotation.notes, CONTENT_WIDTH - 20)
    doc.text(notesLines, MARGIN_LEFT + 10, currentY)
    currentY += 10 * notesLines.length
  }

  // ========== 7. FOOTER ==========

  const footerY = PAGE_HEIGHT - 40

  // Línea separadora
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, footerY, PAGE_WIDTH - MARGIN_RIGHT, footerY)

  // Texto del footer
  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM_GRAY)
  doc.setFont('helvetica', 'italic')
  const footerText = companySettings?.website || 'www.cobrify.com'
  doc.text(footerText, PAGE_WIDTH / 2, footerY + 12, { align: 'center' })

  // Nota importante
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('Esta cotización no constituye un comprobante de pago', PAGE_WIDTH / 2, footerY + 22, { align: 'center' })

  // ========== GENERAR/RETORNAR PDF ==========

  if (download) {
    const fileName = `Cotizacion_${quotation.number.replace(/\//g, '-')}.pdf`
    const isNative = Capacitor.isNativePlatform()

    if (isNative) {
      // En app móvil, guardar usando Filesystem API
      try {
        // Convertir PDF a base64
        const pdfBase64 = doc.output('datauristring').split(',')[1]

        // Guardar en el directorio de documentos
        const result = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Documents
        })

        console.log('PDF guardado en:', result.uri)

        // Compartir el PDF usando el plugin Share
        await Share.share({
          title: fileName,
          text: `Cotización ${quotation.number}`,
          url: result.uri,
          dialogTitle: 'Compartir cotización'
        })

      } catch (error) {
        console.error('Error al guardar PDF en móvil:', error)
        // Fallback: intentar guardar de todos modos
        doc.save(fileName)
      }
    } else {
      // En web, usar el método normal
      doc.save(fileName)
    }
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
