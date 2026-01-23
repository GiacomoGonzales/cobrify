import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

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
 * Convierte color hex a RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [70, 70, 70] // Color por defecto gris oscuro
}

/**
 * Genera un PDF para Guía de Remisión Electrónica - Diseño Profesional
 * Basado en el estilo visual de la Guía de Remisión Transportista
 * Con soporte para paginación dinámica cuando hay muchos items
 */
export const generateDispatchGuidePDF = async (guide, companySettings, download = true, products = []) => {
  // Crear mapa de productos para buscar SKU por productId
  const productsMap = {}
  products.forEach(p => { productsMap[p.id] = p })
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  // Colores (mismo estilo que GRE Transportista)
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [100, 100, 100]
  const LIGHT_GRAY = [200, 200, 200]
  const ACCENT_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#464646')

  // Márgenes y dimensiones
  const MARGIN_LEFT = 30
  const MARGIN_RIGHT = 30
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  // Constantes para paginación
  const MARGIN_TOP = 25
  const MARGIN_BOTTOM = 40
  const FOOTER_HEIGHT = 120 // Espacio reservado para el footer con QR
  const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM

  let currentY = MARGIN_TOP
  let currentPage = 1
  let totalPages = 1 // Se calculará después

  // Función helper para verificar espacio y agregar nueva página si es necesario
  const checkPageBreak = (neededHeight, reserveFooter = false) => {
    const maxY = reserveFooter ? PAGE_HEIGHT - MARGIN_BOTTOM - FOOTER_HEIGHT : PAGE_HEIGHT - MARGIN_BOTTOM
    if (currentY + neededHeight > maxY) {
      doc.addPage()
      currentPage++
      currentY = MARGIN_TOP

      // Header reducido en páginas siguientes
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...BLACK)
      doc.text(`GUÍA DE REMISIÓN ELECTRÓNICA REMITENTE - ${guide.number || 'T001-00000001'}`, MARGIN_LEFT, currentY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...MEDIUM_GRAY)
      doc.text(`(Continuación - Página ${currentPage})`, PAGE_WIDTH - MARGIN_RIGHT, currentY, { align: 'right' })
      currentY += 20

      // Línea separadora
      doc.setDrawColor(...LIGHT_GRAY)
      doc.setLineWidth(0.5)
      doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
      currentY += 15

      return true // Indica que se creó nueva página
    }
    return false
  }

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
    // Placeholder de logo con color accent (mismo estilo que GRE Transportista)
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

  // Datos de la empresa (centro) - mismo estilo que GRE Transportista y facturas
  const centerX = logoX + logoWidth + 10

  const commercialName = (companySettings?.name || 'EMPRESA SAC').toUpperCase()
  const legalName = (companySettings?.businessName || '').toUpperCase()
  const phone = companySettings?.phone || ''
  const email = companySettings?.email || ''

  // Construir dirección completa con ubicación (igual que facturas y transportista)
  let fullAddress = companySettings?.address || ''
  if (companySettings?.district || companySettings?.province || companySettings?.department) {
    const locationParts = [companySettings?.district, companySettings?.province, companySettings?.department].filter(Boolean)
    if (locationParts.length > 0) {
      fullAddress += ' - ' + locationParts.join(', ')
    }
  }

  // Calcular altura total del texto para centrarlo verticalmente
  let totalTextHeight = 14 // Nombre comercial
  if (legalName && legalName !== commercialName) totalTextHeight += 12
  if (fullAddress || phone) totalTextHeight += 18
  if (email) totalTextHeight += 10

  let centerY = currentY + (headerHeight - totalTextHeight) / 2 + 10

  // Nombre comercial
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(commercialName, centerX + centerWidth/2, centerY, { align: 'center' })
  centerY += 14

  // Razón social (si es diferente)
  if (legalName && legalName !== commercialName) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    doc.text(legalName, centerX + centerWidth/2, centerY, { align: 'center' })
    centerY += 12
  }

  // Dirección y teléfono (mismo formato que facturas)
  if (fullAddress || phone) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MEDIUM_GRAY)
    let addressLine = fullAddress
    if (phone) addressLine += (fullAddress ? ' - ' : '') + 'Tel: ' + phone
    const addressLines = doc.splitTextToSize(addressLine, centerWidth - 10)
    addressLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, centerX + centerWidth/2, centerY + (i * 9), { align: 'center' })
    })
    centerY += addressLines.slice(0, 2).length * 9
  }

  // Email
  if (email) {
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text(`Email: ${email}`, centerX + centerWidth/2, centerY + 2, { align: 'center' })
  }

  // Recuadro del documento (derecha)
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docBoxWidth
  const docBoxY = currentY

  // Altura de la sección del RUC (parte superior con fondo de color)
  const rucSectionHeight = 26

  // Fondo de color para la sección del RUC
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(docBoxX, docBoxY, docBoxWidth, rucSectionHeight, 'F')

  // Recuadro completo con borde
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(1.5)
  doc.rect(docBoxX, docBoxY, docBoxWidth, headerHeight)

  // Línea separadora después del RUC
  doc.setLineWidth(0.5)
  doc.line(docBoxX, docBoxY + rucSectionHeight, docBoxX + docBoxWidth, docBoxY + rucSectionHeight)

  // RUC (texto blanco sobre fondo de color)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`R.U.C. ${companySettings?.ruc || ''}`, docBoxX + docBoxWidth/2, docBoxY + 17, { align: 'center' })
  doc.setTextColor(...BLACK) // Restaurar color negro

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

  // Encabezado de tabla (sin columna código temporalmente)
  const tableX = MARGIN_LEFT
  const tableWidth = CONTENT_WIDTH
  const colWidths = {
    num: 30,
    desc: tableWidth - 30 - 60 - 70, // Sin columna código
    qty: 60,
    unit: 70
  }

  // Filas de datos con altura dinámica y PAGINACIÓN
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

  // Función para dibujar el encabezado de la tabla (se usa en cada página)
  const drawTableHeader = () => {
    doc.setFillColor(...ACCENT_COLOR)
    doc.rect(tableX, currentY, tableWidth, 18, 'F')
    doc.setDrawColor(...BLACK)
    doc.setLineWidth(0.5)
    doc.rect(tableX, currentY, tableWidth, 18)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)

    let hColX = tableX
    doc.text('N°', hColX + colWidths.num/2, currentY + 12, { align: 'center' })
    doc.line(hColX + colWidths.num, currentY, hColX + colWidths.num, currentY + 18)
    hColX += colWidths.num

    doc.text('DESCRIPCIÓN', hColX + colWidths.desc/2, currentY + 12, { align: 'center' })
    doc.line(hColX + colWidths.desc, currentY, hColX + colWidths.desc, currentY + 18)
    hColX += colWidths.desc

    doc.text('CANTIDAD', hColX + colWidths.qty/2, currentY + 12, { align: 'center' })
    doc.line(hColX + colWidths.qty, currentY, hColX + colWidths.qty, currentY + 18)
    hColX += colWidths.qty

    doc.text('UNIDAD DE', hColX + colWidths.unit/2, currentY + 7, { align: 'center' })
    doc.text('DESPACHO', hColX + colWidths.unit/2, currentY + 14, { align: 'center' })

    currentY += 18
    doc.setTextColor(...BLACK)
  }

  // Función para dibujar una fila de item
  const drawItemRow = (item, index, rowHeight, descLines) => {
    const centerYRow = currentY + rowHeight / 2 + 3

    // Fondo de la fila
    doc.setDrawColor(...LIGHT_GRAY)
    doc.rect(tableX, currentY, tableWidth, rowHeight)

    let itemColX = tableX
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...BLACK)

    doc.text((index + 1).toString(), itemColX + colWidths.num/2, centerYRow, { align: 'center' })

    // Línea vertical N°
    doc.line(itemColX + colWidths.num, currentY, itemColX + colWidths.num, currentY + rowHeight)
    itemColX += colWidths.num

    // Descripción - múltiples líneas
    const descStartY = currentY + 10
    descLines.forEach((line, lineIdx) => {
      doc.text(line, itemColX + 5, descStartY + (lineIdx * lineHeight))
    })

    // Línea vertical Descripción
    doc.line(itemColX + colWidths.desc, currentY, itemColX + colWidths.desc, currentY + rowHeight)
    itemColX += colWidths.desc

    doc.text((item.quantity || 1).toString(), itemColX + colWidths.qty/2, centerYRow, { align: 'center' })

    // Línea vertical Cantidad
    doc.line(itemColX + colWidths.qty, currentY, itemColX + colWidths.qty, currentY + rowHeight)
    itemColX += colWidths.qty

    doc.text(item.unit || 'UNIDAD', itemColX + colWidths.unit/2, centerYRow, { align: 'center' })

    currentY += rowHeight
  }

  // Dibujar el encabezado de la tabla inicial
  drawTableHeader()

  // Dibujar items con paginación
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  items.forEach((item, index) => {
    const { height: rowHeight, descLines } = calculateItemHeight(item)

    // Verificar si necesitamos nueva página (reservar espacio para el resto del contenido en la última)
    const isLastItem = index === items.length - 1
    const reserveSpace = isLastItem ? FOOTER_HEIGHT + 150 : 0 // 150pt para transporte/observaciones

    if (checkPageBreak(rowHeight + 20 + reserveSpace, isLastItem)) {
      // Nueva página - redibujar encabezado de tabla
      drawTableHeader()
    }

    drawItemRow(item, index, rowHeight, descLines)
  })

  // Si no hay items, dibujar un espacio mínimo
  if (items.length === 0) {
    doc.setDrawColor(...LIGHT_GRAY)
    doc.rect(tableX, currentY, tableWidth, 40)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('Sin items', tableX + tableWidth/2, currentY + 25, { align: 'center' })
    currentY += 40
  }

  currentY += 15

  // ========== 5. DATOS DE TRANSPORTE ==========

  // Verificar espacio para sección de transporte (~100pt)
  checkPageBreak(100, false)

  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 10

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)

  // Determinar si es transporte público o privado
  const isPublicTransport = guide.transportMode === '01'

  if (isPublicTransport) {
    // ========== TRANSPORTE PÚBLICO - Mostrar datos del transportista ==========
    doc.text('DATOS DEL TRANSPORTISTA', MARGIN_LEFT, currentY)
    currentY += 14

    doc.setDrawColor(...BLACK)
    doc.setLineWidth(0.5)

    // Posiciones
    const labelWidth = 95
    const leftValueX = MARGIN_LEFT + labelWidth
    const leftBoxWidth = 180
    const rightLabelX = PAGE_WIDTH - MARGIN_RIGHT - 170
    const rightValueX = PAGE_WIDTH - MARGIN_RIGHT - 75

    doc.setFontSize(7)

    // Fila 1: Modalidad de transporte
    doc.setFont('helvetica', 'bold')
    doc.text('Modalidad de transporte:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text('TRANSPORTE PÚBLICO', leftValueX + 5, currentY)

    doc.setFont('helvetica', 'bold')
    doc.text('Peso Total Aprox. (KGM):', rightLabelX, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(`${guide.totalWeight || '0'}`, rightValueX, currentY)

    currentY += 16

    // Fila 2: RUC del Transportista
    doc.setFont('helvetica', 'bold')
    doc.text('RUC Transportista:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    doc.rect(leftValueX, currentY - 8, leftBoxWidth, 12)
    const carrierRuc = carrier.ruc || guide.carrier?.ruc || '-'
    doc.text(carrierRuc, leftValueX + 5, currentY)

    currentY += 16

    // Fila 3: Razón Social del Transportista
    doc.setFont('helvetica', 'bold')
    doc.text('Razón Social:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    doc.rect(leftValueX, currentY - 8, leftBoxWidth + 100, 12)
    const carrierName = carrier.businessName || guide.carrier?.businessName || '-'
    const carrierNameLines = doc.splitTextToSize(carrierName, leftBoxWidth + 90)
    doc.text(carrierNameLines[0], leftValueX + 5, currentY)

    currentY += 18
  } else {
    // ========== TRANSPORTE PRIVADO - Mostrar datos del vehículo y conductor ==========
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
    // Si es M1/L y no hay placa, mostrar "N/A (Vehículo M1/L)"
    const plateDisplay = plateValue === '-' && guide.isM1LVehicle ? 'N/A (Vehículo M1/L)' : plateValue
    doc.text(plateDisplay, leftValueX + 5, currentY)

    doc.text('Modalidad de transporte:', rightLabelX, currentY)
    doc.setFont('helvetica', 'bold')
    doc.text('TRANSPORTE PRIVADO', rightValueX, currentY)

    currentY += 16

    // Fila 1.5: Indicador vehículo M1 o L (si aplica)
    doc.setFont('helvetica', 'normal')
    doc.text('Indicador vehículo M1 o L:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'bold')
    const m1lIndicator = guide.isM1LVehicle ? 'SI' : 'NO'
    doc.text(m1lIndicator, leftValueX + 5, currentY)

    if (guide.isM1LVehicle) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.text('(Motos, mototaxis, autos, taxis - hasta 8 asientos)', leftValueX + 25, currentY)
      doc.setFontSize(7)
    }

    currentY += 16

    // Fila 2: DNI del Conductor | Peso Total
    doc.setFont('helvetica', 'normal')
    doc.text('DNI del Conductor:', MARGIN_LEFT, currentY)
    doc.rect(leftValueX, currentY - 8, leftBoxWidth, 12)
    // Si es M1/L y no hay DNI, mostrar "N/A"
    const dniDisplay = dniValue === '-' && guide.isM1LVehicle ? 'N/A' : dniValue
    doc.text(dniDisplay, leftValueX + 5, currentY)

    doc.text('Peso Total Aprox. (KGM):', rightLabelX, currentY)
    doc.setFont('helvetica', 'bold')
    doc.text(`${guide.totalWeight || '0'}`, rightValueX, currentY)

    currentY += 16

    // Fila 3: Nombre del Conductor | Licencia
    doc.setFont('helvetica', 'normal')
    doc.text('Nombre del Conductor:', MARGIN_LEFT, currentY)
    doc.rect(leftValueX, currentY - 8, leftBoxWidth, 12) // Mismo ancho que Placa y DNI
    // Si es M1/L y no hay nombre, mostrar "N/A"
    const nameDisplay = driverFullName === '-' && guide.isM1LVehicle ? 'N/A' : driverFullName.substring(0, 22)
    doc.text(nameDisplay, leftValueX + 5, currentY) // Truncar para que quepa en el recuadro

    doc.text('Licencia:', rightLabelX, currentY)
    doc.rect(rightValueX - 5, currentY - 8, 70, 12)
    // Si es M1/L y no hay licencia, mostrar "N/A"
    const licenseDisplay = (!driver.license || driver.license === '-') && guide.isM1LVehicle ? 'N/A' : (driver.license || '-')
    doc.text(licenseDisplay, rightValueX, currentY)

    currentY += 18
  }

  // ========== 6. OBSERVACIONES ==========

  // Verificar espacio para observaciones (~50pt)
  checkPageBreak(50, false)

  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 10

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('Observaciones', MARGIN_LEFT, currentY)
  currentY += 10

  // Información adicional (observaciones del usuario)
  if (guide.additionalInfo && guide.additionalInfo.trim()) {
    doc.setFont('helvetica', 'normal')
    // Dividir el texto en líneas si es muy largo
    const maxWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
    const additionalInfoLines = doc.splitTextToSize(guide.additionalInfo.trim(), maxWidth)

    for (const line of additionalInfoLines) {
      // Verificar espacio antes de cada línea
      if (currentY > PAGE_HEIGHT - MARGIN_BOTTOM - 20) {
        doc.addPage()
        currentY = MARGIN_TOP
        // Agregar número de página
        totalPages++
        doc.setFontSize(6)
        doc.setFont('helvetica', 'normal')
        doc.text(`Página ${totalPages}`, PAGE_WIDTH - MARGIN_RIGHT - 30, MARGIN_TOP - 5)
        doc.setFontSize(7)
      }
      doc.text(line, MARGIN_LEFT, currentY)
      currentY += 8
    }
    currentY += 5
  }

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

  // Verificar espacio para footer (~110pt)
  checkPageBreak(110, false)

  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
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
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('QR', MARGIN_LEFT + qrSize/2, footerY + qrSize/2, { align: 'center' })
  }

  // ===== SELLO DE VERIFICACIÓN SUNAT (derecha) =====
  const sealWidth = 100
  const sealHeight = 50
  const sealX = PAGE_WIDTH - MARGIN_RIGHT - sealWidth
  const sealY = footerY + 10

  // Borde del sello con color accent
  doc.setDrawColor(...ACCENT_COLOR)
  doc.setLineWidth(1.5)
  doc.roundedRect(sealX, sealY, sealWidth, sealHeight, 3, 3, 'S')

  // Texto del sello
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...ACCENT_COLOR)
  doc.text('VERIFICACIÓN SUNAT', sealX + sealWidth/2, sealY + 12, { align: 'center' })

  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)
  doc.text('Consulte en:', sealX + sealWidth/2, sealY + 24, { align: 'center' })
  doc.text('www.sunat.gob.pe', sealX + sealWidth/2, sealY + 34, { align: 'center' })

  // Fecha de emisión en el sello
  const emissionDate = formatDate(guide.createdAt || guide.transferDate)
  doc.setFontSize(5)
  doc.text(`Emitido: ${emissionDate}`, sealX + sealWidth/2, sealY + 44, { align: 'center' })

  // Sección de texto legal (centro)
  const legalX = MARGIN_LEFT + qrSize + 15
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM_GRAY)

  doc.text('Representación impresa de la Guía de', legalX, footerY + 12)
  doc.text('Remisión Electrónica Remitente', legalX, footerY + 22)
  doc.text('Autorizado mediante Resolución de', legalX, footerY + 34)
  doc.text('Superintendencia N° 000123-2023/SUNAT', legalX, footerY + 44)

  if (guide.sunatHash) {
    doc.setFontSize(6)
    doc.text(`Hash: ${guide.sunatHash}`, legalX, footerY + 56)
  }

  currentY = footerY + qrSize + 15

  // Pie final con número de páginas
  doc.setDrawColor(...LIGHT_GRAY)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 8

  // Obtener número total de páginas
  totalPages = doc.internal.getNumberOfPages()

  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM_GRAY)
  doc.text('Documento generado por Cobrify - Sistema de Facturación Electrónica - www.cobrifyperu.com', PAGE_WIDTH/2, currentY, { align: 'center' })

  // Agregar números de página a todas las páginas
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text(`Página ${i} de ${totalPages}`, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 15, { align: 'right' })
  }

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

        // Abrir el diálogo de compartir para que el usuario pueda ver/compartir el PDF
        try {
          await Share.share({
            title: fileName,
            text: `Guía de Remisión: ${fileName}`,
            url: result.uri,
            dialogTitle: 'Compartir Guía de Remisión'
          })
        } catch (shareError) {
          console.log('Compartir cancelado o no disponible:', shareError)
        }

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

/**
 * Exporta el PDF como blob para enviar por WhatsApp u otros usos
 */
export const getDispatchGuidePDFBlob = async (guide, companySettings) => {
  const doc = await generateDispatchGuidePDF(guide, companySettings, false)
  return doc.output('blob')
}

/**
 * Abre el PDF en una nueva pestaña para vista previa (o comparte en móvil)
 */
export const previewDispatchGuidePDF = async (guide, companySettings) => {
  const doc = await generateDispatchGuidePDF(guide, companySettings, false)
  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      // En móvil, guardar el PDF y abrirlo con Share para vista previa
      const pdfBase64 = doc.output('datauristring').split(',')[1]
      const fileName = `Guia_Remision_${(guide.number || 'T001-00000001').replace(/\//g, '-')}.pdf`

      // Guardar directamente en Documents (mejor compatibilidad con Share)
      const result = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true
      })

      console.log('PDF para vista previa guardado en:', result.uri)

      // Abrir con el visor de PDF del sistema
      await Share.share({
        title: `Guía de Remisión ${guide.number || ''}`,
        url: result.uri,
        dialogTitle: 'Ver guía de remisión'
      })

      return result.uri
    } catch (error) {
      console.error('Error al generar vista previa en móvil:', error)
      // Fallback: abrir como data URL si Share falla
      const pdfDataUri = doc.output('datauristring')
      window.open(pdfDataUri, '_blank')
      return pdfDataUri
    }
  } else {
    // En web, abrir en nueva pestaña
    const blob = doc.output('blob')
    const blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank')
    return blobUrl
  }
}

/**
 * Comparte el PDF por WhatsApp u otras apps
 */
export const shareDispatchGuidePDF = async (guide, companySettings, method = 'share') => {
  const doc = await generateDispatchGuidePDF(guide, companySettings, false)
  const isNativePlatform = Capacitor.isNativePlatform()
  const fileName = `Guia_Remision_${(guide.number || 'T001-00000001').replace(/\//g, '-')}.pdf`

  if (isNativePlatform) {
    try {
      const pdfBase64 = doc.output('datauristring').split(',')[1]

      const result = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true
      })

      console.log('PDF para compartir guardado en:', result.uri)

      // Compartir usando Share API nativo
      await Share.share({
        title: `Guía de Remisión ${guide.number || ''}`,
        text: `Guía de Remisión Electrónica ${guide.number || ''}`,
        url: result.uri,
        dialogTitle: 'Compartir guía de remisión'
      })

      return { success: true, uri: result.uri }
    } catch (error) {
      console.error('Error al compartir PDF en móvil:', error)
      throw error
    }
  } else {
    // En web, descargar o abrir WhatsApp Web
    if (method === 'whatsapp') {
      // En web no podemos adjuntar archivos a WhatsApp, solo enviar texto
      const text = `Guía de Remisión Electrónica: ${guide.number || ''}`
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
      window.open(whatsappUrl, '_blank')
      return { success: true, method: 'whatsapp-text' }
    } else {
      // Descargar el PDF
      doc.save(fileName)
      return { success: true, method: 'download' }
    }
  }
}
