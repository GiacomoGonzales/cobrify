import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'

const TRANSFER_REASONS = {
  '01': 'Venta',
  '02': 'Compra',
  '04': 'Traslado entre establecimientos',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
}

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

    if (isNative) {
      try {
        const storagePath = getStoragePathFromUrl(url)
        let downloadUrl = url

        if (storagePath) {
          const storageRef = ref(storage, storagePath)
          downloadUrl = await getDownloadURL(storageRef)
        }

        const response = await CapacitorHttp.get({
          url: downloadUrl,
          responseType: 'blob'
        })

        if (response.status === 200 && response.data) {
          const base64Data = response.data
          const mimeType = url.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg'
          return `data:${mimeType};base64,${base64Data}`
        }
        throw new Error('No se pudo descargar la imagen')
      } catch (nativeError) {
        console.warn('CapacitorHttp falló, intentando Firebase SDK:', nativeError.message)
      }
    }

    const storagePath = getStoragePathFromUrl(url)

    if (storagePath) {
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)

      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = reject
      img.src = url
    })
  } catch (error) {
    console.error('Error cargando imagen:', error)
    return null
  }
}

/**
 * Genera el código QR para la guía de remisión transportista
 */
const generateGuideQR = async (guide, companySettings) => {
  try {
    const [serie = '', numero = ''] = (guide.number || '').split('-')

    const qrData = [
      companySettings?.ruc || '',
      '31', // Tipo de documento: GRE Transportista
      serie,
      numero,
      guide.transferDate || '',
      guide.destination?.address || ''
    ].join('|')

    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 1,
      errorCorrectionLevel: 'M'
    })

    return qrDataUrl
  } catch (error) {
    console.error('Error generando QR:', error)
    return null
  }
}

/**
 * Formatea una fecha para mostrar en el PDF
 */
const formatDate = (dateValue) => {
  if (!dateValue) return '-'

  try {
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [year, month, day] = dateValue.split('-')
      return `${day}/${month}/${year}`
    }

    let date
    if (typeof dateValue === 'string') {
      date = new Date(dateValue + 'T12:00:00')
    } else if (dateValue.toDate) {
      date = dateValue.toDate()
    } else if (dateValue instanceof Date) {
      date = dateValue
    } else {
      return '-'
    }

    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  } catch {
    return '-'
  }
}

/**
 * Genera un PDF para Guía de Remisión Transportista - Diseño Profesional
 * Basado en el estilo visual de facturas y guías remitente
 */
export const generateCarrierDispatchGuidePDF = async (guide, companySettings, download = true) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  // Colores (mismo estilo que facturas y guías remitente)
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [100, 100, 100]
  const LIGHT_GRAY = [200, 200, 200]
  const ACCENT_COLOR = companySettings?.pdfAccentColor
    ? hexToRgb(companySettings.pdfAccentColor)
    : [230, 126, 34] // Naranja por defecto

  // Márgenes y dimensiones
  const MARGIN_LEFT = 30
  const MARGIN_RIGHT = 30
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = 25

  // Extraer datos
  const shipper = guide.shipper || {}
  const recipient = guide.recipient || {}
  const driver = guide.driver || {}
  const vehicle = guide.vehicle || {}
  const origin = guide.origin || {}
  const destination = guide.destination || {}
  const items = guide.items || []

  // ========== 1. ENCABEZADO ==========
  const headerHeight = 85
  const logoWidth = 70
  const docBoxWidth = 150
  const centerWidth = CONTENT_WIDTH - logoWidth - docBoxWidth - 20

  // Logo
  const logoX = MARGIN_LEFT
  const logoY = currentY

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
      let finalLogoWidth = logoWidth
      let finalLogoHeight = logoWidth / aspectRatio

      if (finalLogoHeight > headerHeight - 10) {
        finalLogoHeight = headerHeight - 10
        finalLogoWidth = finalLogoHeight * aspectRatio
      }

      doc.addImage(imgData, format, logoX, logoY + (headerHeight - finalLogoHeight) / 2, finalLogoWidth, finalLogoHeight, undefined, 'FAST')
    } catch (error) {
      // Placeholder de logo con color accent
      doc.setDrawColor(...ACCENT_COLOR)
      doc.setLineWidth(2)
      doc.roundedRect(logoX, logoY + 10, logoWidth, 60, 3, 3, 'S')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...ACCENT_COLOR)
      doc.text('TU', logoX + logoWidth/2, logoY + 32, { align: 'center' })
      doc.text('LOGO', logoX + logoWidth/2, logoY + 44, { align: 'center' })
      doc.text('AQUÍ', logoX + logoWidth/2, logoY + 56, { align: 'center' })
    }
  } else {
    // Placeholder de logo
    doc.setDrawColor(...ACCENT_COLOR)
    doc.setLineWidth(2)
    doc.roundedRect(logoX, logoY + 10, logoWidth, 60, 3, 3, 'S')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ACCENT_COLOR)
    doc.text('TU', logoX + logoWidth/2, logoY + 32, { align: 'center' })
    doc.text('LOGO', logoX + logoWidth/2, logoY + 44, { align: 'center' })
    doc.text('AQUÍ', logoX + logoWidth/2, logoY + 56, { align: 'center' })
  }

  // Datos de la empresa (centro)
  const centerX = logoX + logoWidth + 10
  const commercialName = (companySettings?.name || 'EMPRESA SAC').toUpperCase()
  const legalName = (companySettings?.businessName || '').toUpperCase()
  const address = companySettings?.address || ''

  let totalTextHeight = 14
  if (legalName && legalName !== commercialName) totalTextHeight += 12
  if (address) totalTextHeight += 20

  let centerY = currentY + (headerHeight - totalTextHeight) / 2 + 10

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(commercialName, centerX + centerWidth/2, centerY, { align: 'center' })
  centerY += 14

  if (legalName && legalName !== commercialName) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    doc.text(legalName, centerX + centerWidth/2, centerY, { align: 'center' })
    centerY += 12
  }

  if (address) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MEDIUM_GRAY)
    const addressLines = doc.splitTextToSize(`Dirección fiscal: ${address}`, centerWidth - 10)
    addressLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, centerX + centerWidth/2, centerY + (i * 9), { align: 'center' })
    })
  }

  // Recuadro del documento (derecha)
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docBoxWidth
  const docBoxY = currentY

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(1.5)
  doc.rect(docBoxX, docBoxY, docBoxWidth, headerHeight)

  // RUC
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(`R.U.C. ${companySettings?.ruc || ''}`, docBoxX + docBoxWidth/2, docBoxY + 18, { align: 'center' })

  // Línea divisoria
  doc.setLineWidth(0.5)
  doc.line(docBoxX, docBoxY + 25, docBoxX + docBoxWidth, docBoxY + 25)

  // Título
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('GUÍA DE REMISIÓN', docBoxX + docBoxWidth/2, docBoxY + 38, { align: 'center' })
  doc.text('TRANSPORTISTA ELECTRÓNICA', docBoxX + docBoxWidth/2, docBoxY + 50, { align: 'center' })

  // Número
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`N° ${guide.number || 'V001-00000001'}`, docBoxX + docBoxWidth/2, docBoxY + 72, { align: 'center' })

  currentY += headerHeight + 15

  // ========== 2. DATOS DEL TRASLADO ==========
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  // Fila 1: Fechas y MTC
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)

  doc.text('Fecha de inicio de traslado:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(guide.transferDate), MARGIN_LEFT + 115, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Fecha de emisión:', MARGIN_LEFT + 220, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(guide.createdAt || guide.transferDate), MARGIN_LEFT + 305, currentY)

  if (companySettings?.mtcRegistration) {
    doc.setFont('helvetica', 'bold')
    doc.text('MTC:', MARGIN_LEFT + 400, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(companySettings.mtcRegistration, MARGIN_LEFT + 430, currentY)
  }

  currentY += 14

  // Fila 2: Peso y Motivo
  doc.setFont('helvetica', 'bold')
  doc.text('Peso bruto total:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(`${(guide.totalWeight || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })} KGM`, MARGIN_LEFT + 75, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Motivo de traslado:', MARGIN_LEFT + 220, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(TRANSFER_REASONS[guide.transferReason] || guide.transferReason || '-', MARGIN_LEFT + 310, currentY)

  currentY += 18

  // ========== 3. REMITENTE Y DESTINATARIO ==========
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  const colMidX = MARGIN_LEFT + CONTENT_WIDTH * 0.5

  // Encabezados
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('REMITENTE', MARGIN_LEFT, currentY)
  doc.text('DESTINATARIO', colMidX, currentY)
  currentY += 12

  // Datos Remitente
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('RUC:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(shipper.ruc || '-', MARGIN_LEFT + 30, currentY)

  // Datos Destinatario
  doc.setFont('helvetica', 'bold')
  doc.text('RUC/DNI:', colMidX, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(recipient.documentNumber || '-', colMidX + 45, currentY)
  currentY += 11

  // Razón social
  doc.setFont('helvetica', 'bold')
  doc.text('Razón Social:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  const shipperName = doc.splitTextToSize(shipper.businessName || '-', CONTENT_WIDTH * 0.45 - 60)
  doc.text(shipperName[0], MARGIN_LEFT + 60, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Nombre:', colMidX, currentY)
  doc.setFont('helvetica', 'normal')
  const recipientName = doc.splitTextToSize(recipient.name || '-', CONTENT_WIDTH * 0.45 - 45)
  doc.text(recipientName[0], colMidX + 40, currentY)
  currentY += 18

  // ========== 4. PUNTOS DE PARTIDA Y LLEGADA ==========
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  // Encabezados
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('PUNTO DE PARTIDA', MARGIN_LEFT, currentY)
  doc.text('PUNTO DE LLEGADA', colMidX, currentY)
  currentY += 12

  // Direcciones
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')

  const originAddr = doc.splitTextToSize(origin.address || '-', CONTENT_WIDTH * 0.45)
  originAddr.slice(0, 2).forEach((line, i) => {
    doc.text(line, MARGIN_LEFT, currentY + (i * 10))
  })

  const destAddr = doc.splitTextToSize(destination.address || '-', CONTENT_WIDTH * 0.45)
  destAddr.slice(0, 2).forEach((line, i) => {
    doc.text(line, colMidX, currentY + (i * 10))
  })

  currentY += Math.max(originAddr.slice(0, 2).length, destAddr.slice(0, 2).length) * 10 + 5

  // Ubigeos
  if (origin.ubigeo || destination.ubigeo) {
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM_GRAY)
    if (origin.ubigeo) doc.text(`Ubigeo: ${origin.ubigeo}`, MARGIN_LEFT, currentY)
    if (destination.ubigeo) doc.text(`Ubigeo: ${destination.ubigeo}`, colMidX, currentY)
    currentY += 12
  }

  currentY += 5

  // ========== 5. TABLA DE BIENES ==========
  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('BIENES A TRANSPORTAR', MARGIN_LEFT, currentY)
  currentY += 12

  // Encabezado de tabla
  const tableX = MARGIN_LEFT
  const tableWidth = CONTENT_WIDTH
  const colWidths = {
    num: 30,
    desc: tableWidth - 30 - 60 - 70,
    qty: 60,
    unit: 70
  }

  // Fondo del encabezado con color accent
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(tableX, currentY, tableWidth, 18, 'F')
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(tableX, currentY, tableWidth, 18)

  // Textos del encabezado
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)

  let colX = tableX
  doc.text('N°', colX + colWidths.num/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.num, currentY, colX + colWidths.num, currentY + 18)
  colX += colWidths.num

  doc.text('DESCRIPCIÓN', colX + colWidths.desc/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.desc, currentY, colX + colWidths.desc, currentY + 18)
  colX += colWidths.desc

  doc.text('CANTIDAD', colX + colWidths.qty/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.qty, currentY, colX + colWidths.qty, currentY + 18)
  colX += colWidths.qty

  doc.text('UNIDAD', colX + colWidths.unit/2, currentY + 12, { align: 'center' })

  currentY += 18

  // Filas de datos
  const rowHeight = 18
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')

  const maxItems = Math.min(items.length || 1, 8)
  for (let i = 0; i < maxItems; i++) {
    const item = items[i] || {}

    doc.setDrawColor(...LIGHT_GRAY)
    doc.rect(tableX, currentY, tableWidth, rowHeight)

    colX = tableX
    doc.line(colX + colWidths.num, currentY, colX + colWidths.num, currentY + rowHeight)
    colX += colWidths.num
    doc.line(colX + colWidths.desc, currentY, colX + colWidths.desc, currentY + rowHeight)
    colX += colWidths.desc
    doc.line(colX + colWidths.qty, currentY, colX + colWidths.qty, currentY + rowHeight)

    // Datos
    doc.setFontSize(7)
    colX = tableX
    doc.text(String(i + 1), colX + colWidths.num/2, currentY + 12, { align: 'center' })
    colX += colWidths.num

    const descText = item.description || '-'
    const truncatedDesc = descText.length > 60 ? descText.substring(0, 57) + '...' : descText
    doc.text(truncatedDesc, colX + 5, currentY + 12)
    colX += colWidths.desc

    doc.text(String(item.quantity || 1), colX + colWidths.qty/2, currentY + 12, { align: 'center' })
    colX += colWidths.qty

    doc.text(item.unit || 'NIU', colX + colWidths.unit/2, currentY + 12, { align: 'center' })

    currentY += rowHeight
  }

  currentY += 15

  // ========== 6. DATOS DEL VEHÍCULO ==========
  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('DATOS DEL VEHÍCULO', MARGIN_LEFT, currentY)
  currentY += 12

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Placa:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(vehicle.plate || '-', MARGIN_LEFT + 35, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('N° Autorización MTC:', MARGIN_LEFT + 150, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(vehicle.mtcAuthorization || '-', MARGIN_LEFT + 255, currentY)

  currentY += 18

  // ========== 7. DATOS DEL CONDUCTOR ==========
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('DATOS DEL CONDUCTOR', MARGIN_LEFT, currentY)
  currentY += 12

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Documento:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(driver.documentNumber || '-', MARGIN_LEFT + 55, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Licencia:', MARGIN_LEFT + 150, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(driver.license || '-', MARGIN_LEFT + 195, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Nombre:', MARGIN_LEFT + 300, currentY)
  doc.setFont('helvetica', 'normal')
  const driverFullName = `${driver.name || ''} ${driver.lastName || ''}`.trim() || '-'
  doc.text(driverFullName.substring(0, 30), MARGIN_LEFT + 345, currentY)

  currentY += 18

  // ========== 8. GRE REMITENTE RELACIONADAS ==========
  if (guide.relatedGuides && guide.relatedGuides.length > 0 && guide.relatedGuides.some(g => g.number)) {
    doc.setLineWidth(0.5)
    doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
    currentY += 12

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('GRE REMITENTE RELACIONADAS', MARGIN_LEFT, currentY)
    currentY += 12

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const relatedText = guide.relatedGuides
      .filter(g => g.number)
      .map(g => `${g.number}${g.ruc ? ` (RUC: ${g.ruc})` : ''}`)
      .join(', ')
    doc.text(relatedText || '-', MARGIN_LEFT, currentY)
    currentY += 15
  }

  // ========== 9. FOOTER CON QR ==========
  const footerY = PAGE_HEIGHT - 90
  const qrSize = 55

  // Línea superior del footer
  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, footerY - 10, PAGE_WIDTH - MARGIN_RIGHT, footerY - 10)

  // QR
  try {
    const qrImage = await generateGuideQR(guide, companySettings)
    if (qrImage) {
      doc.addImage(qrImage, 'PNG', MARGIN_LEFT, footerY, qrSize, qrSize)
    }
  } catch (error) {
    console.warn('Error generando QR:', error)
    // Placeholder QR
    doc.setDrawColor(...LIGHT_GRAY)
    doc.rect(MARGIN_LEFT, footerY, qrSize, qrSize)
    doc.setFontSize(6)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('QR', MARGIN_LEFT + qrSize/2, footerY + qrSize/2, { align: 'center' })
  }

  // Texto legal
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM_GRAY)

  const legalX = MARGIN_LEFT + qrSize + 15
  doc.text('Representación impresa de la Guía de Remisión Transportista Electrónica', legalX, footerY + 15)
  doc.text('Autorizado mediante Resolución de Intendencia SUNAT', legalX, footerY + 27)

  // Hash si existe
  if (guide.cdrHash || guide.hashCode) {
    doc.setFontSize(6)
    doc.text(`Hash: ${guide.cdrHash || guide.hashCode}`, legalX, footerY + 40)
  }

  // Número de página
  doc.setFontSize(8)
  doc.setTextColor(...BLACK)
  doc.text('Página 1 de 1', PAGE_WIDTH - MARGIN_RIGHT, footerY + qrSize, { align: 'right' })

  // Generar o retornar
  if (download) {
    const filename = `GRE_Transportista_${guide.number || 'borrador'}.pdf`
    doc.save(filename)
    return { success: true, filename }
  } else {
    return {
      success: true,
      blob: doc.output('blob'),
      dataUrl: doc.output('dataurlstring')
    }
  }
}

/**
 * Convierte color hex a RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [230, 126, 34]
}

export default generateCarrierDispatchGuidePDF
