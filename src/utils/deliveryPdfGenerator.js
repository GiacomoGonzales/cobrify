import jsPDF from 'jspdf'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// ============================================================
// Helpers
// ============================================================

const getStoragePathFromUrl = (url) => {
  try {
    const match = url.match(/\/o\/(.+?)\?/)
    if (match) return decodeURIComponent(match[1])
    return null
  } catch { return null }
}

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
        const response = await CapacitorHttp.get({ url: downloadUrl, responseType: 'blob' })
        if (response.status === 200 && response.data) {
          const mimeType = url.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg'
          return `data:${mimeType};base64,${response.data}`
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

    const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'default' })
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
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

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [70, 70, 70]
}

const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  card: 'Tarjeta',
  tarjeta: 'Tarjeta',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  yape: 'Yape',
  plin: 'Plin',
}

const DELIVERY_STATUS_LABELS = {
  assigned: 'Asignado',
  in_transit: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

// ============================================================
// PDF Generation – A4 Portrait (mismo estilo que facturas/guías)
// ============================================================

/**
 * Genera un PDF de Guía de Envío (documento interno para repartidores)
 * Formato A4 portrait – mismo estilo visual que facturas y guías de remisión
 */
export const generateDeliveryPDF = async (delivery, companySettings) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  })

  // Paleta de colores (misma que facturas y guías)
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [120, 120, 120]
  const LIGHT_GRAY = [200, 200, 200]
  const ACCENT_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#464646')

  // Márgenes y dimensiones – A4: 595pt x 842pt
  const MARGIN_LEFT = 30
  const MARGIN_RIGHT = 30
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = 25

  // ========== 1. ENCABEZADO – 3 COLUMNAS (Logo | Empresa | Recuadro) ==========

  const headerHeight = 85
  const logoWidth = 70
  const docBoxWidth = 150
  const centerWidth = CONTENT_WIDTH - logoWidth - docBoxWidth - 20

  const logoX = MARGIN_LEFT
  const logoY = currentY

  // ===== COLUMNA 1: LOGO =====
  if (companySettings?.logoUrl) {
    try {
      const imgData = await Promise.race([
        loadImageAsBase64(companySettings.logoUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000)),
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
      const logoColumnWidth = logoWidth
      let finalLogoWidth, finalLogoHeight

      if (aspectRatio >= 3) {
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
        const maxWidth = logoColumnWidth + 25
        finalLogoHeight = maxLogoHeight * 0.6
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxWidth) {
          finalLogoWidth = maxWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else if (aspectRatio >= 1.3) {
        const maxWidth = logoColumnWidth + 20
        finalLogoWidth = maxWidth
        finalLogoHeight = finalLogoWidth / aspectRatio
        if (finalLogoHeight > maxLogoHeight) {
          finalLogoHeight = maxLogoHeight
          finalLogoWidth = finalLogoHeight * aspectRatio
        }
      } else if (aspectRatio >= 1) {
        finalLogoHeight = maxLogoHeight * 0.8
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > logoColumnWidth) {
          finalLogoWidth = logoColumnWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else {
        finalLogoHeight = maxLogoHeight
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > logoColumnWidth) {
          finalLogoWidth = logoColumnWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      }

      doc.addImage(imgData, format, logoX, logoY + (headerHeight - finalLogoHeight) / 2, finalLogoWidth, finalLogoHeight, undefined, 'FAST')
    } catch (error) {
      // Placeholder de logo
      doc.setDrawColor(...LIGHT_GRAY)
      doc.setFillColor(250, 250, 250)
      doc.roundedRect(logoX, logoY + 10, logoWidth, 60, 3, 3, 'FD')
      doc.setFontSize(8)
      doc.setTextColor(...MEDIUM_GRAY)
      doc.text('TU', logoX + logoWidth / 2, logoY + 30, { align: 'center' })
      doc.text('LOGO', logoX + logoWidth / 2, logoY + 42, { align: 'center' })
      doc.text('AQUÍ', logoX + logoWidth / 2, logoY + 54, { align: 'center' })
    }
  } else {
    // Placeholder con color accent
    doc.setDrawColor(...ACCENT_COLOR)
    doc.setLineWidth(2)
    doc.roundedRect(logoX, logoY + 10, logoWidth, 60, 3, 3, 'S')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ACCENT_COLOR)
    doc.text('TU', logoX + logoWidth / 2, logoY + 32, { align: 'center' })
    doc.text('LOGO', logoX + logoWidth / 2, logoY + 44, { align: 'center' })
    doc.text('AQUÍ', logoX + logoWidth / 2, logoY + 56, { align: 'center' })
  }

  // ===== COLUMNA 2: DATOS DE LA EMPRESA (centro) =====
  const centerX = logoX + logoWidth + 10

  const commercialName = (companySettings?.name || 'EMPRESA SAC').toUpperCase()
  const legalName = (companySettings?.businessName || '').toUpperCase()
  const phone = companySettings?.phone || ''
  const email = companySettings?.email || ''

  // Dirección completa con ubicación
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

  let centerTextY = currentY + (headerHeight - totalTextHeight) / 2 + 10

  // Nombre comercial
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(commercialName, centerX + centerWidth / 2, centerTextY, { align: 'center' })
  centerTextY += 14

  // Razón social (si es diferente)
  if (legalName && legalName !== commercialName) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    doc.text(legalName, centerX + centerWidth / 2, centerTextY, { align: 'center' })
    centerTextY += 12
  }

  // Dirección y teléfono
  if (fullAddress || phone) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MEDIUM_GRAY)
    let addressLine = fullAddress
    if (phone) addressLine += (fullAddress ? ' - ' : '') + 'Tel: ' + phone
    const addressLines = doc.splitTextToSize(addressLine, centerWidth - 10)
    addressLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, centerX + centerWidth / 2, centerTextY + (i * 9), { align: 'center' })
    })
    centerTextY += addressLines.slice(0, 2).length * 9
  }

  // Email
  if (email) {
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text(`Email: ${email}`, centerX + centerWidth / 2, centerTextY + 2, { align: 'center' })
  }

  // ===== COLUMNA 3: RECUADRO DEL DOCUMENTO (derecha) =====
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docBoxWidth
  const docBoxY = currentY

  // Sección RUC con fondo de color
  const rucSectionHeight = 26
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(docBoxX, docBoxY, docBoxWidth, rucSectionHeight, 'F')

  // Recuadro completo con borde
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(1.5)
  doc.rect(docBoxX, docBoxY, docBoxWidth, headerHeight)

  // Línea separadora después del RUC
  doc.setLineWidth(0.5)
  doc.line(docBoxX, docBoxY + rucSectionHeight, docBoxX + docBoxWidth, docBoxY + rucSectionHeight)

  // RUC (texto blanco sobre fondo)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`R.U.C. ${companySettings?.ruc || ''}`, docBoxX + docBoxWidth / 2, docBoxY + 17, { align: 'center' })
  doc.setTextColor(...BLACK)

  // Título
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('GUÍA DE ENVÍO', docBoxX + docBoxWidth / 2, docBoxY + 45, { align: 'center' })

  // Número de factura asociada
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`N° ${delivery.orderNumber || '-'}`, docBoxX + docBoxWidth / 2, docBoxY + 65, { align: 'center' })

  currentY += headerHeight + 15

  // ========== 2. DATOS DEL ENVÍO ==========

  // Línea superior
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 14

  const colMidX = MARGIN_LEFT + CONTENT_WIDTH * 0.5

  // Fecha de creación
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('Fecha de creación:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')

  let createdStr = '-'
  if (delivery.createdAt) {
    const d = delivery.createdAt.toDate ? delivery.createdAt.toDate() : new Date(delivery.createdAt)
    createdStr = d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  }
  doc.text(createdStr, MARGIN_LEFT + 90, currentY)

  // Estado
  doc.setFont('helvetica', 'bold')
  doc.text('Estado:', colMidX, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(DELIVERY_STATUS_LABELS[delivery.status] || delivery.status || '-', colMidX + 40, currentY)
  currentY += 18

  // Línea divisoria
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 14

  // ========== 3. DATOS DEL CLIENTE ==========

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...ACCENT_COLOR)
  doc.text('DATOS DEL CLIENTE', MARGIN_LEFT, currentY)
  currentY += 14

  doc.setFontSize(8)
  doc.setTextColor(...BLACK)

  // Nombre del cliente
  doc.setFont('helvetica', 'bold')
  doc.text('Cliente:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(delivery.customerName || '-', MARGIN_LEFT + 45, currentY)
  currentY += 14

  // Dirección
  doc.setFont('helvetica', 'bold')
  doc.text('Dirección:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  const addrText = delivery.customerAddress || '-'
  const addrLines = doc.splitTextToSize(addrText, CONTENT_WIDTH - 55)
  doc.text(addrLines, MARGIN_LEFT + 50, currentY)
  currentY += addrLines.length * 11 + 6

  // Línea divisoria
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 14

  // ========== 4. DATOS DEL MOTORISTA ==========

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...ACCENT_COLOR)
  doc.text('DATOS DEL MOTORISTA', MARGIN_LEFT, currentY)
  currentY += 14

  doc.setFontSize(8)
  doc.setTextColor(...BLACK)

  // Nombre motorista | Código
  doc.setFont('helvetica', 'bold')
  doc.text('Motorista:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(delivery.motoristaName || '-', MARGIN_LEFT + 52, currentY)

  if (delivery.motoristaCode) {
    doc.setFont('helvetica', 'bold')
    doc.text('Código:', colMidX, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(delivery.motoristaCode, colMidX + 40, currentY)
  }
  currentY += 18

  // Línea divisoria
  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 14

  // ========== 5. DETALLE FINANCIERO (tabla) ==========

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...ACCENT_COLOR)
  doc.text('DETALLE FINANCIERO', MARGIN_LEFT, currentY)
  currentY += 14

  // Encabezado de tabla
  const tableX = MARGIN_LEFT
  const tableWidth = CONTENT_WIDTH
  const tableHeaderHeight = 20

  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(tableX, currentY, tableWidth, tableHeaderHeight, 'F')
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(tableX, currentY, tableWidth, tableHeaderHeight)

  // Columnas: Concepto | Valor
  const col1W = tableWidth * 0.6
  const col2W = tableWidth * 0.4

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('CONCEPTO', tableX + col1W / 2, currentY + 13, { align: 'center' })
  doc.line(tableX + col1W, currentY, tableX + col1W, currentY + tableHeaderHeight)
  doc.text('VALOR', tableX + col1W + col2W / 2, currentY + 13, { align: 'center' })

  currentY += tableHeaderHeight

  // Filas de datos
  const rows = [
    ['Monto total', `S/ ${(delivery.amount || 0).toFixed(2)}`],
    ['Método de pago', PAYMENT_METHOD_LABELS[delivery.paymentMethod] || delivery.paymentMethod || '-'],
  ]

  const cashToCollect = delivery.cashCollected || 0
  if (cashToCollect > 0) {
    rows.push(['Monto a cobrar en efectivo', `S/ ${cashToCollect.toFixed(2)}`])
  }

  if (delivery.deliveryFee) {
    rows.push(['Costo de envío', `S/ ${(delivery.deliveryFee || 0).toFixed(2)}`])
  }

  const rowHeight = 18
  doc.setTextColor(...BLACK)

  rows.forEach((row, i) => {
    const rowY = currentY + (i * rowHeight)
    // Fondo alterno
    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 248)
      doc.rect(tableX, rowY, tableWidth, rowHeight, 'F')
    }
    // Bordes
    doc.setDrawColor(...LIGHT_GRAY)
    doc.rect(tableX, rowY, tableWidth, rowHeight)
    doc.line(tableX + col1W, rowY, tableX + col1W, rowY + rowHeight)

    // Concepto
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(row[0], tableX + 8, rowY + 12)

    // Valor
    doc.setFont('helvetica', 'bold')
    doc.text(row[1], tableX + col1W + col2W / 2, rowY + 12, { align: 'center' })
  })

  currentY += rows.length * rowHeight + 30

  // ========== 6. FIRMAS ==========

  const sigLineW = CONTENT_WIDTH / 2 - 50
  const leftSigX = MARGIN_LEFT + 25
  const rightSigX = MARGIN_LEFT + CONTENT_WIDTH / 2 + 25

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)

  // Firma receptor
  doc.line(leftSigX, currentY, leftSigX + sigLineW, currentY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK_GRAY)
  doc.text('Firma de recepción', leftSigX + sigLineW / 2, currentY + 12, { align: 'center' })

  // Firma motorista
  doc.line(rightSigX, currentY, rightSigX + sigLineW, currentY)
  doc.text('Firma del motorista', rightSigX + sigLineW / 2, currentY + 12, { align: 'center' })

  currentY += 20

  // Nombre y DNI debajo de firma receptor
  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM_GRAY)
  doc.text('Nombre: ________________________________', leftSigX, currentY + 10)
  doc.text('DNI: ______________', leftSigX, currentY + 22)

  // Nombre debajo de firma motorista
  doc.text(`Nombre: ${delivery.motoristaName || '________________________________'}`, rightSigX, currentY + 10)
  if (delivery.motoristaCode) {
    doc.text(`Código: ${delivery.motoristaCode}`, rightSigX, currentY + 22)
  }

  // ========== FOOTER ==========

  const now = new Date()
  const printStr = now.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(...MEDIUM_GRAY)
  doc.text(`Impreso: ${printStr}`, MARGIN_LEFT, PAGE_HEIGHT - 20)
  doc.text('Documento interno - no tiene valor tributario', PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 20, { align: 'right' })

  return doc
}

// ============================================================
// Preview / Share helpers
// ============================================================

/**
 * Abre el PDF en una nueva pestaña (web) o comparte (móvil)
 */
export const previewDeliveryPDF = async (delivery, companySettings) => {
  const doc = await generateDeliveryPDF(delivery, companySettings)
  const isNative = Capacitor.isNativePlatform()
  const fileName = `Guia_Envio_${delivery.orderNumber || 'sin-numero'}.pdf`

  if (isNative) {
    try {
      const pdfBase64 = doc.output('datauristring').split(',')[1]
      const result = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true,
      })
      await Share.share({
        title: `Guía de Envío ${delivery.orderNumber || ''}`,
        url: result.uri,
        dialogTitle: 'Ver guía de envío',
      })
      return result.uri
    } catch (error) {
      console.error('Error al generar vista previa en móvil:', error)
      const pdfDataUri = doc.output('datauristring')
      window.open(pdfDataUri, '_blank')
      return pdfDataUri
    }
  } else {
    const blob = doc.output('blob')
    const blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank')
    return blobUrl
  }
}

// ============================================================
// Thermal Ticket (ESC/POS)
// ============================================================

const PAPER_FORMATS = {
  58: { charsPerLine: 24, separator: '------------------------' },
  80: { charsPerLine: 42, separator: '------------------------------------------' },
}

/**
 * Genera los bytes ESC/POS para un ticket térmico de guía de envío
 * Retorna un string base64 listo para enviar a la impresora
 */
export const buildDeliveryTicketEscPos = (delivery, business, paperWidth = 58) => {
  const fmt = PAPER_FORMATS[paperWidth] || PAPER_FORMATS[58]
  const cmds = []

  // Helper: push raw bytes
  const raw = (...bytes) => cmds.push(new Uint8Array(bytes))
  // Helper: push text as bytes
  const textBytes = (str) => {
    const encoder = new TextEncoder()
    cmds.push(encoder.encode(str))
  }
  const newLine = () => raw(0x0A)
  const bold = (on) => raw(0x1B, 0x45, on ? 0x01 : 0x00)
  const alignCenter = () => raw(0x1B, 0x61, 0x01)
  const alignLeft = () => raw(0x1B, 0x61, 0x00)
  const init = () => raw(0x1B, 0x40) // ESC @
  const cut = () => { raw(0x1D, 0x56, 0x42, 0x03) } // GS V B 3

  const line = (text) => { textBytes(text); newLine() }

  // Truncate / pad helper
  const trunc = (str, max) => {
    if (!str) return ''
    return str.length > max ? str.substring(0, max) : str
  }

  // Build ticket
  init()
  alignCenter()
  bold(true)
  line(trunc((business?.tradeName || business?.name || 'MI EMPRESA').toUpperCase(), fmt.charsPerLine))
  bold(false)

  if (business?.ruc) {
    line(`RUC: ${business.ruc}`)
  }
  newLine()

  bold(true)
  line('GUIA DE ENVIO')
  bold(false)
  line(fmt.separator)

  alignLeft()

  // Invoice #
  line(`Factura: ${delivery.orderNumber || '-'}`)

  // Status
  line(`Estado: ${DELIVERY_STATUS_LABELS[delivery.status] || delivery.status || '-'}`)

  // Created
  let createdStr = '-'
  if (delivery.createdAt) {
    const d = delivery.createdAt.toDate ? delivery.createdAt.toDate() : new Date(delivery.createdAt)
    createdStr = d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  }
  line(`Fecha: ${createdStr}`)

  line(fmt.separator)

  bold(true)
  line('CLIENTE')
  bold(false)
  line(trunc(delivery.customerName || '-', fmt.charsPerLine))
  if (delivery.customerAddress) {
    const addrLines = splitText(delivery.customerAddress, fmt.charsPerLine)
    addrLines.forEach(l => line(l))
  }

  line(fmt.separator)

  bold(true)
  line('MOTORISTA')
  bold(false)
  line(trunc(delivery.motoristaName || '-', fmt.charsPerLine))
  if (delivery.motoristaCode) {
    line(`Cod: ${delivery.motoristaCode}`)
  }

  line(fmt.separator)

  bold(true)
  line('DETALLE')
  bold(false)
  line(`Monto: S/ ${(delivery.amount || 0).toFixed(2)}`)
  line(`Pago: ${PAYMENT_METHOD_LABELS[delivery.paymentMethod] || delivery.paymentMethod || '-'}`)

  const cash = delivery.cashCollected || 0
  if (cash > 0) {
    line(`Cobrar: S/ ${cash.toFixed(2)}`)
  }
  if (delivery.deliveryFee) {
    line(`Envio: S/ ${(delivery.deliveryFee || 0).toFixed(2)}`)
  }

  line(fmt.separator)
  newLine()
  newLine()

  alignCenter()
  line(fmt.separator)
  line('Firma de recepcion')
  newLine()

  // Print time
  const now = new Date()
  const printStr = now.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  line(`Impreso: ${printStr}`)
  newLine()
  newLine()
  newLine()

  cut()

  // Merge all Uint8Arrays into one
  const totalLen = cmds.reduce((s, c) => s + c.length, 0)
  const merged = new Uint8Array(totalLen)
  let offset = 0
  for (const c of cmds) {
    merged.set(c, offset)
    offset += c.length
  }

  // Return base64
  let binary = ''
  for (let i = 0; i < merged.length; i++) {
    binary += String.fromCharCode(merged[i])
  }
  return btoa(binary)
}

// Simple text wrap helper for ticket
function splitText(str, maxLen) {
  if (!str) return ['-']
  const words = str.split(' ')
  const lines = []
  let current = ''
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxLen) {
      if (current) lines.push(current)
      current = w
    } else {
      current = current ? current + ' ' + w : w
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['-']
}
