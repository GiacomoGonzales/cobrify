import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

const TRANSFER_REASONS = {
  '01': 'Venta',
  '02': 'Compra',
  '03': 'Venta sujeta a confirmación del comprador',
  '04': 'Traslado entre establecimientos de la misma empresa',
  '05': 'Consignación',
  '06': 'Devolución',
  '07': 'Recojo de bienes transformados',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
  '14': 'Venta sujeta a confirmación del comprador',
  '17': 'Traslado emisor itinerante CP',
  '18': 'Traslado a zona primaria',
}

const TRANSFER_REASONS_FULL = [
  { code: '01', label: 'Venta' },
  { code: '03', label: 'Venta sujeta a confirmación del comprador' },
  { code: '02', label: 'Compra' },
  { code: '04', label: 'Traslado entre establecimientos de la misma' },
  { code: '08', label: 'Importación' },
  { code: '17', label: 'Traslado emisor itinerante CP' },
  { code: '09', label: 'Exportación' },
  { code: '18', label: 'Traslado a zona primaria' },
  { code: '13', label: 'Otros' },
]

const TRANSPORT_MODES = {
  '01': 'TRANSPORTE PÚBLICO',
  '02': 'TRANSPORTE PRIVADO',
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
    console.error('Error cargando imagen:', error)
    throw error
  }
}

/**
 * Genera el código QR para la guía de remisión
 */
const generateGuideQR = async (guide, companySettings) => {
  try {
    const [serie = '', numero = ''] = (guide.number || '').split('-')

    const qrData = [
      companySettings?.ruc || '',
      '09', // Tipo de documento: Guía de Remisión
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
 * Maneja correctamente fechas en formato YYYY-MM-DD sin problemas de zona horaria
 */
const formatDate = (dateValue) => {
  if (!dateValue) return '-'

  try {
    // Si es formato YYYY-MM-DD, formatear directamente sin pasar por Date
    // Esto evita problemas de zona horaria donde "2024-12-14" se interpreta como UTC
    // y en Perú (UTC-5) se muestra como el día anterior
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [year, month, day] = dateValue.split('-')
      return `${day}/${month}/${year}`
    }

    let date
    if (typeof dateValue === 'string') {
      // Añadir T12:00:00 para evitar problemas de zona horaria
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
 * Dibuja un checkbox
 */
const drawCheckbox = (doc, x, y, size, checked) => {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.rect(x, y, size, size)

  if (checked) {
    // Dibujar una X más visible
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(1.5)
    doc.line(x + 1.5, y + 1.5, x + size - 1.5, y + size - 1.5)
    doc.line(x + size - 1.5, y + 1.5, x + 1.5, y + size - 1.5)
    doc.setLineWidth(0.5)
  }
}

/**
 * Genera un PDF para Guía de Remisión Electrónica - Diseño Profesional
 */
export const generateDispatchGuidePDF = async (guide, companySettings, download = true) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  // Colores
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [100, 100, 100]
  const LIGHT_GRAY = [200, 200, 200]
  const ORANGE = [230, 126, 34]

  // Márgenes y dimensiones
  const MARGIN_LEFT = 30
  const MARGIN_RIGHT = 30
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = 25

  // Extraer datos de transporte
  const driver = guide.transport?.driver || guide.driver || {}
  const vehicle = guide.transport?.vehicle || guide.vehicle || {}
  const carrier = guide.transport?.carrier || guide.carrier || {}
  const recipient = guide.recipient || guide.customer || {}

  // ========== 1. ENCABEZADO ==========

  const headerHeight = 85
  const logoWidth = 70
  const docBoxWidth = 150
  const centerWidth = CONTENT_WIDTH - logoWidth - docBoxWidth - 20

  // Logo (placeholder si no hay)
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
      const maxLogoHeight = headerHeight - 10
      const logoColumnWidth = logoWidth // 70pt designado para logo
      let finalLogoWidth, finalLogoHeight

      if (aspectRatio >= 3) {
        // Logo EXTREMADAMENTE horizontal (3:1 o más)
        const maxWidth = logoColumnWidth + 35
        finalLogoHeight = 35
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxWidth) {
          finalLogoWidth = maxWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
          if (finalLogoHeight < 30) {
            finalLogoHeight = 30
            finalLogoWidth = finalLogoHeight * aspectRatio
          }
        }
      } else if (aspectRatio >= 2.5) {
        // Logo MUY horizontal (2.5:1 a 3:1)
        const maxWidth = logoColumnWidth + 30
        finalLogoHeight = 40
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxWidth) {
          finalLogoWidth = maxWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
        if (finalLogoHeight < 30) {
          finalLogoHeight = 30
          finalLogoWidth = finalLogoHeight * aspectRatio
        }
      } else if (aspectRatio >= 2) {
        // Logo muy horizontal (2:1 a 2.5:1)
        const maxWidth = logoColumnWidth + 25
        finalLogoHeight = maxLogoHeight * 0.6
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxWidth) {
          finalLogoWidth = maxWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else if (aspectRatio >= 1.3) {
        // Logo horizontal moderado (1.3:1 a 2:1)
        const maxWidth = logoColumnWidth + 20
        finalLogoWidth = maxWidth
        finalLogoHeight = finalLogoWidth / aspectRatio
        if (finalLogoHeight > maxLogoHeight) {
          finalLogoHeight = maxLogoHeight
          finalLogoWidth = finalLogoHeight * aspectRatio
        }
      } else if (aspectRatio >= 1) {
        // Logo cuadrado o casi cuadrado
        finalLogoHeight = maxLogoHeight * 0.8
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > logoColumnWidth) {
          finalLogoWidth = logoColumnWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else {
        // Logo vertical
        finalLogoHeight = maxLogoHeight
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > logoColumnWidth) {
          finalLogoWidth = logoColumnWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      }

      doc.addImage(imgData, format, logoX, logoY + (headerHeight - finalLogoHeight) / 2, finalLogoWidth, finalLogoHeight, undefined, 'FAST')
    } catch (error) {
      // Dibujar placeholder de logo
      doc.setDrawColor(...LIGHT_GRAY)
      doc.setFillColor(250, 250, 250)
      doc.roundedRect(logoX, logoY + 10, logoWidth, 60, 3, 3, 'FD')
      doc.setFontSize(8)
      doc.setTextColor(...MEDIUM_GRAY)
      doc.text('TU', logoX + logoWidth/2, logoY + 30, { align: 'center' })
      doc.text('LOGO', logoX + logoWidth/2, logoY + 42, { align: 'center' })
      doc.text('AQUÍ', logoX + logoWidth/2, logoY + 54, { align: 'center' })
    }
  } else {
    // Dibujar placeholder de logo
    doc.setDrawColor(...ORANGE)
    doc.setLineWidth(2)
    doc.roundedRect(logoX, logoY + 10, logoWidth, 60, 3, 3, 'S')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ORANGE)
    doc.text('TU', logoX + logoWidth/2, logoY + 32, { align: 'center' })
    doc.text('LOGO', logoX + logoWidth/2, logoY + 44, { align: 'center' })
    doc.text('AQUÍ', logoX + logoWidth/2, logoY + 56, { align: 'center' })
  }

  // Datos de la empresa (centro)
  const centerX = logoX + logoWidth + 10

  const commercialName = (companySettings?.name || 'EMPRESA SAC').toUpperCase()
  const legalName = (companySettings?.businessName || '').toUpperCase()
  const address = companySettings?.address || ''

  // Calcular altura total del contenido para centrarlo verticalmente
  let totalTextHeight = 14 // Nombre comercial
  if (legalName && legalName !== commercialName) {
    totalTextHeight += 12 // Razón social
  }
  if (address) {
    totalTextHeight += 20 // Dirección (aprox 2 líneas)
  }

  // Centrar verticalmente respecto al header (alineado con el logo)
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
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('GUÍA DE REMISIÓN', docBoxX + docBoxWidth/2, docBoxY + 40, { align: 'center' })
  doc.text('ELECTRÓNICA REMITENTE', docBoxX + docBoxWidth/2, docBoxY + 52, { align: 'center' })

  // Número
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`N° ${guide.number || 'T001-00000001'}`, docBoxX + docBoxWidth/2, docBoxY + 72, { align: 'center' })

  currentY += headerHeight + 15

  // ========== 2. DATOS PRINCIPALES ==========

  // Línea superior
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  // Fecha de inicio de traslado
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('Fecha de inicio de traslado:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(guide.transferDate), MARGIN_LEFT + 115, currentY)
  currentY += 14

  // Fila: Destinatario | Punto de partida
  const colMidX = MARGIN_LEFT + CONTENT_WIDTH * 0.45

  doc.setFont('helvetica', 'bold')
  doc.text('Destinatario', MARGIN_LEFT, currentY)
  doc.text('Punto de partida', colMidX, currentY)

  // Ubigeo de partida
  const originUbigeo = guide.origin?.ubigeo || ''
  if (originUbigeo) {
    doc.setFont('helvetica', 'normal')
    doc.text(originUbigeo, colMidX + 85, currentY)
  }
  currentY += 11

  // Nombre destinatario | Dirección partida
  const recipientName = recipient.name || recipient.businessName || '-'
  doc.setFont('helvetica', 'normal')
  const recipientNameMaxWidth = CONTENT_WIDTH * 0.48
  const recipientNameLines = doc.splitTextToSize(recipientName, recipientNameMaxWidth)
  doc.text(recipientNameLines[0], MARGIN_LEFT, currentY)
  if (recipientNameLines.length > 1 && recipientNameLines[1]) {
    currentY += 9
    doc.text(recipientNameLines[1], MARGIN_LEFT, currentY)
  }

  const originAddress = guide.origin?.address || companySettings?.address || '-'
  const originLines = doc.splitTextToSize(originAddress, CONTENT_WIDTH * 0.5)
  doc.text(originLines[0], colMidX, currentY)
  currentY += 11

  // RUC destinatario | Punto de llegada
  doc.setFont('helvetica', 'bold')

  let recipientDocLabel = 'RUC'
  if (recipient.documentType === '1' || recipient.documentType === 'DNI') {
    recipientDocLabel = 'DNI'
  }
  doc.text(recipientDocLabel, MARGIN_LEFT, currentY)
  doc.text('Punto de llegada', colMidX, currentY)

  // Ubigeo de llegada
  const destUbigeo = guide.destination?.ubigeo || ''
  if (destUbigeo) {
    doc.setFont('helvetica', 'normal')
    doc.text(destUbigeo, colMidX + 85, currentY)
  }
  currentY += 11

  // Número doc destinatario | Dirección llegada
  doc.setFont('helvetica', 'normal')
  doc.text(recipient.documentNumber || '-', MARGIN_LEFT, currentY)

  const destAddress = guide.destination?.address || '-'
  const destLines = doc.splitTextToSize(destAddress, CONTENT_WIDTH * 0.5)
  doc.text(destLines[0], colMidX, currentY)
  if (destLines[1]) {
    currentY += 10
    doc.text(destLines[1], colMidX, currentY)
  }
  currentY += 18

  // Línea divisoria
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  // ========== 3. MOTIVO DE TRASLADO (CHECKBOXES) ==========

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('Motivo de traslado', MARGIN_LEFT, currentY)
  currentY += 12

  // Dibujar checkboxes en 3 columnas
  const checkboxSize = 8
  const colWidth = CONTENT_WIDTH / 3
  let checkCol = 0
  let checkRow = 0

  TRANSFER_REASONS_FULL.forEach((reason, index) => {
    const x = MARGIN_LEFT + (checkCol * colWidth)
    const y = currentY + (checkRow * 14)

    const isChecked = guide.transferReason === reason.code
    drawCheckbox(doc, x, y - 6, checkboxSize, isChecked)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(reason.label, x + checkboxSize + 3, y)

    checkCol++
    if (checkCol >= 3) {
      checkCol = 0
      checkRow++
    }
  })

  currentY += (Math.ceil(TRANSFER_REASONS_FULL.length / 3) * 14) + 10

  // Línea divisoria
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  // ========== 4. TABLA DE BIENES ==========

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Datos del bien transportado', MARGIN_LEFT, currentY)
  currentY += 12

  // Encabezado de tabla
  const tableX = MARGIN_LEFT
  const tableWidth = CONTENT_WIDTH
  const colWidths = {
    num: 30,
    code: 80,
    desc: tableWidth - 30 - 80 - 60 - 70,
    qty: 60,
    unit: 70
  }

  // Fondo del encabezado
  doc.setFillColor(245, 245, 245)
  doc.rect(tableX, currentY, tableWidth, 18, 'F')
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(tableX, currentY, tableWidth, 18)

  // Textos del encabezado
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)

  let colX = tableX
  doc.text('N°', colX + colWidths.num/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.num, currentY, colX + colWidths.num, currentY + 18)
  colX += colWidths.num

  doc.text('CÓDIGO', colX + colWidths.code/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.code, currentY, colX + colWidths.code, currentY + 18)
  colX += colWidths.code

  doc.text('DESCRIPCIÓN', colX + colWidths.desc/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.desc, currentY, colX + colWidths.desc, currentY + 18)
  colX += colWidths.desc

  doc.text('CANTIDAD', colX + colWidths.qty/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.qty, currentY, colX + colWidths.qty, currentY + 18)
  colX += colWidths.qty

  doc.text('UNIDAD DE', colX + colWidths.unit/2, currentY + 7, { align: 'center' })
  doc.text('DESPACHO', colX + colWidths.unit/2, currentY + 14, { align: 'center' })

  currentY += 18

  // Filas de datos con altura dinámica
  const items = guide.items || []
  const minRowHeight = 20
  const lineHeight = 9 // Altura por línea de texto

  // Función para calcular altura dinámica de cada item
  const calculateItemHeight = (item) => {
    const itemDesc = item.description || item.name || '-'
    doc.setFontSize(8)
    const descLines = doc.splitTextToSize(itemDesc, colWidths.desc - 10)
    const calculatedHeight = Math.max(minRowHeight, descLines.length * lineHeight + 8)
    return { height: calculatedHeight, descLines }
  }

  // Calcular alturas de todos los items
  const itemHeights = items.map(item => calculateItemHeight(item))
  const totalItemsHeight = itemHeights.reduce((sum, ih) => sum + ih.height, 0)
  const tableBodyHeight = Math.max(totalItemsHeight, 100) // Mínimo 100pt de altura

  // Dibujar el cuerpo de la tabla
  doc.rect(tableX, currentY, tableWidth, tableBodyHeight)

  // Datos de items con alturas dinámicas
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  let itemY = currentY
  items.forEach((item, index) => {
    const { height: rowHeight, descLines } = itemHeights[index]
    const centerY = itemY + rowHeight / 2 + 3 // Centro vertical de la fila

    colX = tableX
    doc.text((index + 1).toString(), colX + colWidths.num/2, centerY, { align: 'center' })

    // Línea vertical N°
    doc.line(colX + colWidths.num, itemY, colX + colWidths.num, itemY + rowHeight)
    colX += colWidths.num

    // Solo mostrar código si es "real" (no vacío, no CUSTOM)
    const rawCode = item.code || ''
    const isValidCode = rawCode && rawCode.trim() !== '' && rawCode.toUpperCase() !== 'CUSTOM'
    const itemCode = isValidCode ? rawCode : '-'
    doc.text(itemCode.substring(0, 12), colX + 5, centerY)

    // Línea vertical Código
    doc.line(colX + colWidths.code, itemY, colX + colWidths.code, itemY + rowHeight)
    colX += colWidths.code

    // Descripción - múltiples líneas
    const descStartY = itemY + 10
    descLines.forEach((line, lineIdx) => {
      doc.text(line, colX + 5, descStartY + (lineIdx * lineHeight))
    })

    // Línea vertical Descripción
    doc.line(colX + colWidths.desc, itemY, colX + colWidths.desc, itemY + rowHeight)
    colX += colWidths.desc

    doc.text((item.quantity || 1).toString(), colX + colWidths.qty/2, centerY, { align: 'center' })

    // Línea vertical Cantidad
    doc.line(colX + colWidths.qty, itemY, colX + colWidths.qty, itemY + rowHeight)
    colX += colWidths.qty

    doc.text(item.unit || 'UNIDAD', colX + colWidths.unit/2, centerY, { align: 'center' })

    // Línea horizontal entre filas
    if (index < items.length - 1) {
      doc.setDrawColor(...LIGHT_GRAY)
      doc.line(tableX, itemY + rowHeight, tableX + tableWidth, itemY + rowHeight)
      doc.setDrawColor(...BLACK)
    }

    itemY += rowHeight
  })

  currentY += tableBodyHeight + 15

  // ========== 5. UNIDAD DE TRANSPORTE Y CONDUCTOR ==========

  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 10

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('UNIDAD DE TRANSPORTE Y CONDUCTOR', MARGIN_LEFT, currentY)
  currentY += 14

  // Valores
  const plateValue = vehicle.plate || '-'
  const dniValue = driver.documentNumber || '-'
  const driverFullName = [driver.name, driver.lastName].filter(Boolean).join(' ') || '-'

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)

  // Posiciones fijas para alineación vertical
  const labelWidth = 95 // Ancho para las etiquetas
  const leftValueX = MARGIN_LEFT + labelWidth // Donde empiezan los valores izquierdos
  const leftBoxWidth = 120 // Ancho uniforme para todos los recuadros izquierdos (Placa, DNI, Nombre)

  const rightLabelX = PAGE_WIDTH - MARGIN_RIGHT - 170 // Columna derecha
  const rightValueX = PAGE_WIDTH - MARGIN_RIGHT - 75 // Valores derechos alineados

  doc.setFontSize(7)

  // Fila 1: Placa del vehículo | Modalidad de transporte
  doc.setFont('helvetica', 'normal')
  doc.text('Placa del vehículo:', MARGIN_LEFT, currentY)
  doc.rect(leftValueX, currentY - 8, leftBoxWidth, 12)
  doc.text(plateValue, leftValueX + 5, currentY)

  doc.text('Modalidad de transporte:', rightLabelX, currentY)
  doc.setFont('helvetica', 'bold')
  doc.text(TRANSPORT_MODES[guide.transportMode] || 'TRANSPORTE PRIVADO', rightValueX, currentY)

  currentY += 16

  // Fila 2: DNI del Conductor | Peso Total
  doc.setFont('helvetica', 'normal')
  doc.text('DNI del Conductor:', MARGIN_LEFT, currentY)
  doc.rect(leftValueX, currentY - 8, leftBoxWidth, 12)
  doc.text(dniValue, leftValueX + 5, currentY)

  doc.text('Peso Total Aprox. (KGM):', rightLabelX, currentY)
  doc.setFont('helvetica', 'bold')
  doc.text(`${guide.totalWeight || '0'}`, rightValueX, currentY)

  currentY += 16

  // Fila 3: Nombre del Conductor | Licencia
  doc.setFont('helvetica', 'normal')
  doc.text('Nombre del Conductor:', MARGIN_LEFT, currentY)
  doc.rect(leftValueX, currentY - 8, leftBoxWidth, 12) // Mismo ancho que Placa y DNI
  doc.text(driverFullName.substring(0, 22), leftValueX + 5, currentY) // Truncar para que quepa en el recuadro

  doc.text('Licencia:', rightLabelX, currentY)
  doc.rect(rightValueX - 5, currentY - 8, 70, 12)
  doc.text(driver.license || '-', rightValueX, currentY)

  currentY += 18

  // ========== 6. OBSERVACIONES ==========

  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 10

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('Observaciones', MARGIN_LEFT, currentY)
  currentY += 10

  // Documento de referencia
  if (guide.referencedInvoice) {
    const refDoc = guide.referencedInvoice
    const docTypeName = refDoc.documentType === '01' ? 'Factura' : refDoc.documentType === '03' ? 'Boleta' : 'Comprobante'
    const refNumber = refDoc.fullNumber || `${refDoc.series}-${refDoc.number}`

    doc.setFont('helvetica', 'bold')
    doc.text('Doc. Referencia:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(`${docTypeName}:${refNumber}`, MARGIN_LEFT + 65, currentY)
  }

  currentY += 20

  // ========== 7. PIE DE PÁGINA - QR Y FIRMA ==========

  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 10

  const footerY = currentY
  const qrSize = 70

  // QR Code
  try {
    const qrImage = await generateGuideQR(guide, companySettings)
    if (qrImage) {
      doc.addImage(qrImage, 'PNG', MARGIN_LEFT, footerY, qrSize, qrSize)
    }
  } catch (error) {
    console.error('Error generando QR:', error)
    // Placeholder QR
    doc.setDrawColor(...LIGHT_GRAY)
    doc.rect(MARGIN_LEFT, footerY, qrSize, qrSize)
    doc.setFontSize(6)
    doc.text('QR', MARGIN_LEFT + qrSize/2, footerY + qrSize/2, { align: 'center' })
  }

  // Sección de firma (centro-derecha)
  const signatureX = MARGIN_LEFT + qrSize + 40
  const signatureWidth = CONTENT_WIDTH - qrSize - 60

  // Recuadro para firma
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(signatureX, footerY, signatureWidth, qrSize)

  // Línea para firma
  doc.line(signatureX + 20, footerY + 45, signatureX + signatureWidth - 20, footerY + 45)

  // Textos de firma (alineados a la izquierda para dejar espacio para escribir)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('Conformidad del cliente:', signatureX + 5, footerY + 52)
  doc.text('Nombre:', signatureX + 5, footerY + 60)
  doc.text('DNI:', signatureX + 5, footerY + 68)

  currentY = footerY + qrSize + 15

  // Textos legales
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  doc.text('Representación Impresa de la GUÍA DE REMISIÓN', MARGIN_LEFT, currentY)
  currentY += 9
  doc.text('ELECTRÓNICA', MARGIN_LEFT, currentY)
  currentY += 9

  if (guide.sunatHash) {
    doc.text(`Autorizado mediante Resolución ${guide.sunatHash}`, MARGIN_LEFT, currentY)
    currentY += 12
  }

  // Mensaje de agradecimiento
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('GRACIAS POR SU COMPRA!', PAGE_WIDTH/2, currentY, { align: 'center' })
  currentY += 10

  doc.setTextColor(200, 0, 0)
  doc.text('** NOTA IMPORTANTE**', PAGE_WIDTH/2, currentY, { align: 'center' })
  currentY += 10
  doc.text('NO SE ACEPTAN DEVOLUCIONES', PAGE_WIDTH/2, currentY, { align: 'center' })
  currentY += 15

  // Pie final
  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  doc.text('LA MERCADERIA VIAJA POR CUENTA Y RIESGO DEL COMPRADOR NO ADMITIMOS RECLAMO POR ROBO O AVERIA', PAGE_WIDTH/2, currentY, { align: 'center' })
  currentY += 10

  doc.setDrawColor(...LIGHT_GRAY)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 8

  doc.setFontSize(7)
  doc.text('Documento generado por Cobrify - Sistema de Facturación Electrónica - www.cobrify.pe', PAGE_WIDTH/2, currentY, { align: 'center' })

  // ========== GENERAR PDF ==========

  if (download) {
    const fileName = `Guia_Remision_${(guide.number || 'T001-00000001').replace(/\//g, '-')}.pdf`

    const isNativePlatform = Capacitor.isNativePlatform()

    if (isNativePlatform) {
      try {
        const pdfOutput = doc.output('datauristring')
        const base64Data = pdfOutput.split(',')[1]

        const pdfDir = 'PDFs'
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
        return { success: true, uri: result.uri, fileName, doc }
      } catch (error) {
        console.error('Error al guardar PDF en móvil:', error)
        throw error
      }
    } else {
      doc.save(fileName)
    }
  }

  return doc
}
