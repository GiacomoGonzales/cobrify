import jsPDF from 'jspdf'
import { formatCurrency, formatDate } from '@/lib/utils'
import { storage } from '@/lib/firebase'
import { ref, getBlob, getDownloadURL } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Extrae el path de Firebase Storage desde una URL
 */
const getStoragePathFromUrl = (url) => {
  try {
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
 */
const loadImageAsBase64 = async (url) => {
  try {
    const isNative = Capacitor.isNativePlatform()
    console.log('🔄 Cargando logo para cotización, isNative:', isNative)

    // En plataformas nativas, usar CapacitorHttp que es más confiable
    if (isNative) {
      console.log('📱 Usando CapacitorHttp para cargar logo')
      try {
        // Primero obtener la URL de descarga directa
        const storagePath = getStoragePathFromUrl(url)
        let downloadUrl = url

        if (storagePath) {
          const storageRef = ref(storage, storagePath)
          downloadUrl = await getDownloadURL(storageRef)
          console.log('🔗 URL de descarga obtenida')
        }

        // Usar CapacitorHttp para descargar la imagen
        const response = await CapacitorHttp.get({
          url: downloadUrl,
          responseType: 'blob'
        })

        if (response.status === 200 && response.data) {
          const base64Data = response.data
          const mimeType = url.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg'
          console.log('✅ Logo cargado con CapacitorHttp')
          return `data:${mimeType};base64,${base64Data}`
        }
        throw new Error('No se pudo descargar la imagen')
      } catch (nativeError) {
        console.warn('⚠️ CapacitorHttp falló, intentando Firebase SDK:', nativeError.message)
      }
    }

    // Método estándar: Firebase SDK
    console.log('🔄 Cargando logo desde Firebase Storage usando SDK')
    const storagePath = getStoragePathFromUrl(url)

    if (storagePath) {
      console.log('📁 Path extraído:', storagePath)
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)

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
 * Genera un PDF para una cotización con el mismo estilo que facturas/boletas
 * @param {Object} quotation - Datos de la cotización
 * @param {Object} companySettings - Configuración de la empresa
 * @param {boolean} download - Si se debe descargar automáticamente (default: true)
 * @returns {jsPDF} - El documento PDF generado
 */
export const generateQuotationPDF = async (quotation, companySettings, download = true) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  // Paleta de colores - Solo negro y grises (IGUAL que facturas/boletas)
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [120, 120, 120]
  const LIGHT_GRAY = [240, 240, 240]
  const TABLE_HEADER_BG = [245, 245, 245]
  const BORDER_COLOR = [0, 0, 0]

  // Márgenes y dimensiones - A4: 595pt x 842pt (IGUAL que facturas/boletas)
  const MARGIN_LEFT = 40
  const MARGIN_RIGHT = 40
  const MARGIN_TOP = 35
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = MARGIN_TOP

  // ========== 1. ENCABEZADO - 3 COLUMNAS (IGUAL que facturas/boletas) ==========

  const headerHeight = 95
  const logoMaxWidth = 90
  const docColumnWidth = 160
  let actualLogoWidth = 0

  // COLUMNA 1: Logo (izquierda)
  if (companySettings?.logoUrl) {
    try {
      const imgData = await Promise.race([
        loadImageAsBase64(companySettings.logoUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
      ])

      let format = 'PNG'
      if (companySettings.logoUrl.toLowerCase().includes('.jpg') ||
          companySettings.logoUrl.toLowerCase().includes('.jpeg')) {
        format = 'JPEG'
      }

      const img = new Image()
      img.src = imgData
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })

      const aspectRatio = img.width / img.height
      let logoHeight = headerHeight - 10
      let logoWidth = logoHeight * aspectRatio

      if (logoWidth > logoMaxWidth) {
        logoWidth = logoMaxWidth
        logoHeight = logoWidth / aspectRatio
      }

      actualLogoWidth = logoWidth
      const logoX = MARGIN_LEFT
      const logoY = currentY + (headerHeight - logoHeight) / 2
      doc.addImage(imgData, format, logoX, logoY, logoWidth, logoHeight, undefined, 'FAST')
    } catch (error) {
      console.warn('⚠️ No se pudo cargar el logo:', error.message)
    }
  }

  // COLUMNA 2: Información de la empresa - justo al lado del logo
  const logoPadding = 8
  const infoX = MARGIN_LEFT + (actualLogoWidth > 0 ? actualLogoWidth : 0) + logoPadding
  const infoColumnWidth = CONTENT_WIDTH - (actualLogoWidth > 0 ? actualLogoWidth : 0) - logoPadding - docColumnWidth - 10

  // Obtener nombre comercial y razón social (en MAYÚSCULAS)
  const commercialName = (companySettings?.name || companySettings?.businessName || 'EMPRESA SAC').toUpperCase()
  const legalName = (companySettings?.businessName || '').toUpperCase()
  const hasLegalName = legalName && legalName !== commercialName

  // Calcular altura total del contenido de empresa para centrar
  doc.setFontSize(13)
  const commercialNameLines = doc.splitTextToSize(commercialName, infoColumnWidth)
  const commercialNameHeight = commercialNameLines.length * 14
  const legalNameHeight = hasLegalName ? 12 : 0
  const addressHeight = companySettings?.address ? 20 : 0
  const totalInfoHeight = commercialNameHeight + legalNameHeight + addressHeight

  // Centrar verticalmente
  let infoY = currentY + (headerHeight - totalInfoHeight) / 2 + 10

  // Nombre comercial - GRANDE y en negrita (MAYÚSCULAS)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  commercialNameLines.forEach((line, i) => {
    doc.text(line, infoX, infoY + (i * 14))
  })
  infoY += commercialNameLines.length * 14 + 2

  // Razón social - más pequeña (MAYÚSCULAS)
  if (hasLegalName) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    const legalNameLines = doc.splitTextToSize(legalName, infoColumnWidth)
    doc.text(legalNameLines[0], infoX, infoY)
    infoY += 11
  }

  // Dirección - más pequeña (MAYÚSCULAS)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  if (companySettings?.address) {
    const addressText = companySettings.address.toUpperCase()
    const addressLines = doc.splitTextToSize(addressText, infoColumnWidth)
    addressLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, infoX, infoY + (i * 10))
    })
  }

  // COLUMNA 3: Recuadro del documento (derecha) - IGUAL que facturas/boletas
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docColumnWidth
  const docBoxY = currentY

  // Recuadro con borde negro (esquinas rectas como facturas)
  doc.setDrawColor(...BORDER_COLOR)
  doc.setLineWidth(1.5)
  doc.rect(docBoxX, docBoxY, docColumnWidth, headerHeight)

  // Línea separadora después del RUC
  const rucLineY = docBoxY + 28
  doc.setLineWidth(0.5)
  doc.line(docBoxX, rucLineY, docBoxX + docColumnWidth, rucLineY)

  // RUC
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(`R.U.C. N° ${companySettings?.ruc || ''}`, docBoxX + docColumnWidth / 2, docBoxY + 18, { align: 'center' })

  // Tipo de documento (en dos líneas para que sea igual que facturas/boletas)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  const titleY = rucLineY + 20
  doc.text('COTIZACIÓN', docBoxX + docColumnWidth / 2, titleY, { align: 'center' })

  // Número de cotización
  doc.setFontSize(13)
  const numberY = titleY + 18
  doc.text(quotation.number || 'N/A', docBoxX + docColumnWidth / 2, numberY, { align: 'center' })

  currentY += headerHeight + 20

  // ========== 2. DATOS DEL CLIENTE (IGUAL que facturas/boletas) ==========

  // Calcular ancho de etiquetas para alinear valores
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')

  const labels = ['RAZÓN SOCIAL:', 'RUC:', 'DIRECCIÓN:', 'EMISIÓN:', 'VÁLIDO HASTA:']
  let maxLabelWidth = 0
  labels.forEach(label => {
    const width = doc.getTextWidth(label)
    if (width > maxLabelWidth) maxLabelWidth = width
  })
  maxLabelWidth += 5

  const labelValueGap = 5
  const valueX = MARGIN_LEFT + maxLabelWidth + labelValueGap

  // Razón Social / Nombre
  const isRUC = quotation.customer?.documentType === 'RUC'
  const labelName = isRUC ? 'RAZÓN SOCIAL:' : 'CLIENTE:'
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(labelName, MARGIN_LEFT + maxLabelWidth - doc.getTextWidth(labelName), currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(quotation.customer?.name || 'CLIENTE GENERAL', valueX, currentY)
  currentY += 13

  // RUC/DNI
  const docType = quotation.customer?.documentType === 'RUC' ? 'RUC' :
                  quotation.customer?.documentType === 'DNI' ? 'DNI' : 'DOC'
  doc.setFont('helvetica', 'bold')
  doc.text(`${docType}:`, MARGIN_LEFT + maxLabelWidth - doc.getTextWidth(`${docType}:`), currentY)
  doc.setFont('helvetica', 'normal')
  const docNumber = quotation.customer?.documentNumber || '-'
  doc.text(docNumber, valueX, currentY)
  currentY += 13

  // Dirección
  doc.setFont('helvetica', 'bold')
  doc.text('DIRECCIÓN:', MARGIN_LEFT + maxLabelWidth - doc.getTextWidth('DIRECCIÓN:'), currentY)
  doc.setFont('helvetica', 'normal')
  const customerAddress = quotation.customer?.address || '-'
  const addrLines = doc.splitTextToSize(customerAddress, CONTENT_WIDTH - maxLabelWidth)
  doc.text(addrLines[0], valueX, currentY)
  currentY += 15

  // Fecha de emisión
  let quotationDate = new Date().toLocaleDateString('es-PE')
  if (quotation.createdAt) {
    if (quotation.createdAt.toDate) {
      const date = quotation.createdAt.toDate()
      quotationDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    } else if (quotation.createdAt instanceof Date) {
      quotationDate = `${quotation.createdAt.getFullYear()}-${String(quotation.createdAt.getMonth() + 1).padStart(2, '0')}-${String(quotation.createdAt.getDate()).padStart(2, '0')}`
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.text('EMISIÓN:', MARGIN_LEFT + maxLabelWidth - doc.getTextWidth('EMISIÓN:'), currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(quotationDate, valueX, currentY)
  currentY += 13

  // Fecha de validez
  if (quotation.expiryDate || quotation.validityDays) {
    let expiryDateStr = '-'
    if (quotation.expiryDate) {
      if (quotation.expiryDate.toDate) {
        const date = quotation.expiryDate.toDate()
        expiryDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      } else if (quotation.expiryDate instanceof Date) {
        expiryDateStr = `${quotation.expiryDate.getFullYear()}-${String(quotation.expiryDate.getMonth() + 1).padStart(2, '0')}-${String(quotation.expiryDate.getDate()).padStart(2, '0')}`
      }
    } else if (quotation.validityDays) {
      expiryDateStr = `${quotation.validityDays} días desde emisión`
    }
    doc.setFont('helvetica', 'bold')
    doc.text('VÁLIDO HASTA:', MARGIN_LEFT + maxLabelWidth - doc.getTextWidth('VÁLIDO HASTA:'), currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(expiryDateStr, valueX, currentY)
    currentY += 13
  }

  currentY += 5

  // ========== 3. TABLA DE PRODUCTOS (IGUAL que facturas/boletas) ==========

  const tableY = currentY
  const headerRowHeight = 22

  // Definir columnas
  const colWidths = {
    cant: CONTENT_WIDTH * 0.15,
    desc: CONTENT_WIDTH * 0.45,
    pu: CONTENT_WIDTH * 0.20,
    total: CONTENT_WIDTH * 0.20
  }

  let colX = MARGIN_LEFT
  const cols = {
    cant: colX,
    desc: colX += colWidths.cant,
    pu: colX += colWidths.desc,
    total: colX += colWidths.pu
  }

  // Encabezado de tabla con fondo gris oscuro y texto blanco
  doc.setFillColor(70, 70, 70)
  doc.rect(MARGIN_LEFT, tableY, CONTENT_WIDTH, headerRowHeight, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 255, 255)

  const headerRowY = tableY + 14

  doc.text('CANTIDAD', cols.cant + colWidths.cant / 2, headerRowY, { align: 'center' })
  doc.text('CÓDIGO y DESCRIPCIÓN', cols.desc + 10, headerRowY)
  doc.text('PRECIO UNITARIO', cols.pu + colWidths.pu / 2, headerRowY, { align: 'center' })
  doc.text('PRECIO TOTAL', cols.total + colWidths.total / 2, headerRowY, { align: 'center' })

  // Filas de datos
  let dataRowY = tableY + headerRowHeight
  const items = quotation.items || []
  const lineHeight = 11
  const minRowHeight = 20
  const rowPadding = 6

  const unitLabels = {
    'UNIDAD': 'UNIDAD',
    'CAJA': 'CAJA',
    'KG': 'KG',
    'LITRO': 'LITRO',
    'METRO': 'METRO',
    'HORA': 'HORA',
    'SERVICIO': 'SERVICIO'
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...BLACK)

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const precioConIGV = item.unitPrice || item.price || 0
    const importeConIGV = item.quantity * precioConIGV

    // Descripción con posible descripción adicional
    let itemDesc = item.name || item.description || ''
    if (item.description && item.name && item.description !== item.name) {
      itemDesc = `${item.name}\n${item.description}`
    }
    const descLines = doc.splitTextToSize(itemDesc, colWidths.desc - 15)

    // Calcular altura dinámica de la fila
    const descHeight = descLines.length * lineHeight
    const currentRowHeight = Math.max(minRowHeight, descHeight + rowPadding)

    // Línea inferior sutil
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.5)
    doc.line(MARGIN_LEFT, dataRowY + currentRowHeight, MARGIN_LEFT + CONTENT_WIDTH, dataRowY + currentRowHeight)

    const firstLineY = dataRowY + 14

    // Cantidad con unidad
    const quantityText = Number.isInteger(item.quantity)
      ? item.quantity.toString()
      : item.quantity.toFixed(3).replace(/\.?0+$/, '')
    const unitCode = item.unit || 'UNIDAD'
    const unitText = unitLabels[unitCode] || unitCode
    doc.text(`${quantityText} ${unitText}`, cols.cant + colWidths.cant / 2, firstLineY, { align: 'center' })

    // Descripción
    descLines.forEach((line, lineIndex) => {
      doc.text(line, cols.desc + 8, firstLineY + (lineIndex * lineHeight))
    })

    // Precio unitario
    const puFormatted = precioConIGV.toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    doc.text(puFormatted, cols.pu + colWidths.pu - 10, firstLineY, { align: 'right' })

    // Precio total
    const totalFormatted = importeConIGV.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    doc.text(totalFormatted, cols.total + colWidths.total - 10, firstLineY, { align: 'right' })

    dataRowY += currentRowHeight
  }

  currentY = dataRowY + 8

  // ========== 4. TOTALES (estilo tabla con filas grises intercaladas - IGUAL que facturas) ==========

  const totalsWidth = 220
  const totalsRowHeight = 18
  const totalsX = MARGIN_LEFT + CONTENT_WIDTH - totalsWidth

  // Solo mostrar desglose si no está oculto el IGV
  if (!quotation.hideIgv) {
    // OP. GRAVADA - Fondo gris claro (IGUAL que facturas)
    doc.setFillColor(245, 245, 245)
    doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.5)
    doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'S')

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.text('OP. GRAVADA', totalsX + totalsWidth - 90, currentY + 12, { align: 'right' })
    doc.text((quotation.subtotal || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 8, currentY + 12, { align: 'right' })
    currentY += totalsRowHeight

    // Descuento (si existe)
    if (quotation.discount && quotation.discount > 0) {
      doc.setDrawColor(200, 200, 200)
      doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'S')

      const discountLabel = quotation.discountType === 'percentage'
        ? `DESCUENTO (${quotation.discount}%)`
        : 'DESCUENTO'
      const discountAmount = quotation.discountType === 'percentage'
        ? (quotation.subtotal * quotation.discount / 100)
        : quotation.discount

      doc.text(discountLabel, totalsX + totalsWidth - 90, currentY + 12, { align: 'right' })
      doc.text(`-${discountAmount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, totalsX + totalsWidth - 8, currentY + 12, { align: 'right' })
      currentY += totalsRowHeight
    }

    // IGV - Sin fondo (blanco) (IGUAL que facturas)
    doc.setDrawColor(200, 200, 200)
    doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'S')

    doc.text('IGV', totalsX + totalsWidth - 90, currentY + 12, { align: 'right' })
    doc.text((quotation.igv || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 8, currentY + 12, { align: 'right' })
    currentY += totalsRowHeight
  }

  // IMPORTE TOTAL - Fondo gris claro, texto más grande (IGUAL que facturas)
  doc.setFillColor(245, 245, 245)
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(1)
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight + 6, 'FD')

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('IMPORTE TOTAL (S/)', totalsX + 8, currentY + 15)
  doc.setFontSize(14)
  doc.text((quotation.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 8, currentY + 15, { align: 'right' })
  currentY += totalsRowHeight + 20

  // ========== 5. INFORMACIÓN ADICIONAL ==========

  // Términos y condiciones
  if (quotation.terms) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('TÉRMINOS Y CONDICIONES:', MARGIN_LEFT, currentY)
    currentY += 12

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK_GRAY)
    const termsLines = doc.splitTextToSize(quotation.terms, CONTENT_WIDTH - 20)
    doc.text(termsLines, MARGIN_LEFT + 10, currentY)
    currentY += 10 * termsLines.length + 10
  }

  // Observaciones
  if (quotation.notes) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('OBSERVACIONES:', MARGIN_LEFT, currentY)
    currentY += 12

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK_GRAY)
    const notesLines = doc.splitTextToSize(quotation.notes, CONTENT_WIDTH - 20)
    doc.text(notesLines, MARGIN_LEFT + 10, currentY)
    currentY += 10 * notesLines.length
  }

  // ========== 6. FOOTER ==========

  const footerY = PAGE_HEIGHT - 40

  // Línea separadora
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, footerY, PAGE_WIDTH - MARGIN_RIGHT, footerY)

  // Texto del footer
  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM_GRAY)
  doc.setFont('helvetica', 'italic')
  const footerText = companySettings?.website || ''
  if (footerText) {
    doc.text(footerText, PAGE_WIDTH / 2, footerY + 12, { align: 'center' })
  }

  // Nota importante
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('Esta cotización no constituye un comprobante de pago', PAGE_WIDTH / 2, footerY + 22, { align: 'center' })

  // ========== GENERAR/RETORNAR PDF ==========

  if (download) {
    const fileName = `Cotizacion_${quotation.number.replace(/\//g, '-')}.pdf`
    const isNative = Capacitor.isNativePlatform()

    if (isNative) {
      try {
        const pdfBase64 = doc.output('datauristring').split(',')[1]

        const result = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Documents
        })

        console.log('PDF guardado en:', result.uri)

        await Share.share({
          title: fileName,
          text: `Cotización ${quotation.number}`,
          url: result.uri,
          dialogTitle: 'Compartir cotización'
        })

      } catch (error) {
        console.error('Error al guardar PDF en móvil:', error)
        doc.save(fileName)
      }
    } else {
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
