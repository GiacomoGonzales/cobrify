import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import { storage } from '@/lib/firebase'
import { ref, getDownloadURL, getBlob } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { DEPARTAMENTOS, PROVINCIAS, DISTRITOS } from '@/data/peruUbigeos'

const TRANSFER_REASONS = {
  '01': 'Venta',
  '02': 'Compra',
  '04': 'Traslado entre establecimientos',
  '08': 'Importación',
  '09': 'Exportación',
  '13': 'Otros',
}

const TRANSPORT_TYPES = {
  '01': 'Público',
  '02': 'Privado',
}

/**
 * Obtiene el nombre de ubicación desde códigos de ubigeo
 */
const getLocationName = (departamento, provincia, distrito) => {
  const parts = []

  if (distrito && departamento && provincia) {
    const distList = DISTRITOS[`${departamento}${provincia}`] || []
    const dist = distList.find(d => d.code === distrito)
    if (dist) parts.push(dist.name)
  }

  if (provincia && departamento) {
    const provList = PROVINCIAS[departamento] || []
    const prov = provList.find(p => p.code === provincia)
    if (prov) parts.push(prov.name)
  }

  if (departamento) {
    const dept = DEPARTAMENTOS.find(d => d.code === departamento)
    if (dept) parts.push(dept.name)
  }

  return parts.join(', ')
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
    orientation: 'portrait', // Formato vertical
    unit: 'pt',
    format: 'a4'
  })

  // Colores (mismo estilo que facturas y guías remitente)
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

  let currentY = 25

  // Extraer datos
  const shipper = guide.shipper || {}
  const recipient = guide.recipient || {}
  const driver = guide.driver || {}
  const vehicle = guide.vehicle || {}
  const origin = guide.origin || {}
  const destination = guide.destination || {}
  const items = guide.items || []
  const drivers = guide.drivers || [driver]
  const vehicles = guide.vehicles || [vehicle]
  const transportType = guide.transportType || '02'
  const transferDescription = guide.transferDescription || ''
  const observations = guide.observations || ''
  const isM1OrLVehicle = guide.isM1OrLVehicle || false

  // ========== 1. ENCABEZADO ==========
  const headerHeight = 85
  const defaultLogoWidth = 60
  const docBoxWidth = 140

  // Logo
  const logoX = MARGIN_LEFT
  const logoY = currentY
  let actualLogoWidth = defaultLogoWidth // Ancho real del logo (se actualiza dinámicamente)

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
      // Ancho máximo: hasta donde empieza el recuadro del documento menos margen
      const maxAllowedWidth = CONTENT_WIDTH - docBoxWidth - 30
      let finalLogoWidth, finalLogoHeight

      if (aspectRatio >= 3) {
        // Logo EXTREMADAMENTE horizontal (3:1 o más): permitir más ancho
        finalLogoHeight = 45
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxAllowedWidth) {
          finalLogoWidth = maxAllowedWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
        if (finalLogoHeight < 35) {
          finalLogoHeight = 35
          finalLogoWidth = finalLogoHeight * aspectRatio
        }
      } else if (aspectRatio >= 2.5) {
        // Logo MUY horizontal (2.5:1 a 3:1)
        finalLogoHeight = 50
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxAllowedWidth) {
          finalLogoWidth = maxAllowedWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
        if (finalLogoHeight < 38) {
          finalLogoHeight = 38
          finalLogoWidth = finalLogoHeight * aspectRatio
        }
      } else if (aspectRatio >= 2) {
        // Logo muy horizontal (2:1 a 2.5:1)
        finalLogoHeight = maxLogoHeight * 0.7
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxAllowedWidth * 0.6) {
          finalLogoWidth = maxAllowedWidth * 0.6
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else if (aspectRatio >= 1.3) {
        // Logo horizontal moderado (1.3:1 a 2:1)
        finalLogoHeight = maxLogoHeight * 0.85
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > maxAllowedWidth * 0.5) {
          finalLogoWidth = maxAllowedWidth * 0.5
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else if (aspectRatio >= 1) {
        // Logo cuadrado o casi cuadrado
        finalLogoHeight = maxLogoHeight * 0.85
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > defaultLogoWidth + 10) {
          finalLogoWidth = defaultLogoWidth + 10
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      } else {
        // Logo vertical
        finalLogoHeight = maxLogoHeight
        finalLogoWidth = finalLogoHeight * aspectRatio
        if (finalLogoWidth > defaultLogoWidth) {
          finalLogoWidth = defaultLogoWidth
          finalLogoHeight = finalLogoWidth / aspectRatio
        }
      }

      actualLogoWidth = finalLogoWidth // Guardar el ancho real para posicionar el texto
      doc.addImage(imgData, format, logoX, logoY + (headerHeight - finalLogoHeight) / 2, finalLogoWidth, finalLogoHeight, undefined, 'FAST')
    } catch (error) {
      // Placeholder de logo con color accent
      doc.setDrawColor(...ACCENT_COLOR)
      doc.setLineWidth(2)
      doc.roundedRect(logoX, logoY + 10, defaultLogoWidth, 60, 3, 3, 'S')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...ACCENT_COLOR)
      doc.text('TU', logoX + defaultLogoWidth/2, logoY + 32, { align: 'center' })
      doc.text('LOGO', logoX + defaultLogoWidth/2, logoY + 44, { align: 'center' })
      doc.text('AQUÍ', logoX + defaultLogoWidth/2, logoY + 56, { align: 'center' })
    }
  } else {
    // Placeholder de logo
    doc.setDrawColor(...ACCENT_COLOR)
    doc.setLineWidth(2)
    doc.roundedRect(logoX, logoY + 10, defaultLogoWidth, 60, 3, 3, 'S')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ACCENT_COLOR)
    doc.text('TU', logoX + defaultLogoWidth/2, logoY + 32, { align: 'center' })
    doc.text('LOGO', logoX + defaultLogoWidth/2, logoY + 44, { align: 'center' })
    doc.text('AQUÍ', logoX + defaultLogoWidth/2, logoY + 56, { align: 'center' })
  }

  // Datos de la empresa (centro) - posición dinámica basada en el logo
  const centerX = logoX + actualLogoWidth + 10
  const centerWidth = CONTENT_WIDTH - actualLogoWidth - docBoxWidth - 20
  const commercialName = (companySettings?.name || 'EMPRESA SAC').toUpperCase()
  const legalName = (companySettings?.businessName || '').toUpperCase()
  const phone = companySettings?.phone || ''
  const email = companySettings?.email || ''

  // Construir dirección completa con ubicación (igual que facturas)
  let fullAddress = companySettings?.address || ''
  if (companySettings?.district || companySettings?.province || companySettings?.department) {
    const locationParts = [companySettings?.district, companySettings?.province, companySettings?.department].filter(Boolean)
    if (locationParts.length > 0) {
      fullAddress += ' - ' + locationParts.join(', ')
    }
  }

  // Calcular altura total del texto
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

  // Fila 1: Tipo transporte y Fechas
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)

  doc.text('Tipo de transporte:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(TRANSPORT_TYPES[transportType] || 'Privado', MARGIN_LEFT + 85, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Fecha traslado:', MARGIN_LEFT + 150, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(guide.transferDate), MARGIN_LEFT + 225, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Fecha emisión:', MARGIN_LEFT + 310, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(guide.createdAt || guide.transferDate), MARGIN_LEFT + 380, currentY)

  currentY += 14

  // Fila 2: Peso, Motivo y MTC
  doc.setFont('helvetica', 'bold')
  doc.text('Peso bruto total:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(`${(guide.totalWeight || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })} KGM`, MARGIN_LEFT + 75, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Motivo de traslado:', MARGIN_LEFT + 180, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(TRANSFER_REASONS[guide.transferReason] || guide.transferReason || '-', MARGIN_LEFT + 270, currentY)

  if (companySettings?.mtcRegistration) {
    doc.setFont('helvetica', 'bold')
    doc.text('MTC:', MARGIN_LEFT + 400, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(companySettings.mtcRegistration, MARGIN_LEFT + 425, currentY)
  }

  currentY += 14

  // Fila 3: M1/L si aplica
  if (isM1OrLVehicle) {
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...MEDIUM_GRAY)
    doc.text('(Vehículo categoría M1 o L)', MARGIN_LEFT, currentY)
    doc.setTextColor(...BLACK)
    currentY += 14
  }

  // Fila 3: Descripción del traslado (si existe)
  if (transferDescription) {
    doc.setFont('helvetica', 'bold')
    doc.text('Descripción:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    const descLines = doc.splitTextToSize(transferDescription, CONTENT_WIDTH - 60)
    doc.text(descLines[0], MARGIN_LEFT + 55, currentY)
    currentY += 14
  }

  currentY += 4

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

  // Datos Remitente - RUC
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('RUC:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(shipper.ruc || '-', MARGIN_LEFT + 30, currentY)

  // Datos Destinatario - RUC/DNI
  doc.setFont('helvetica', 'bold')
  doc.text('RUC/DNI:', colMidX, currentY)
  doc.setFont('helvetica', 'normal')
  doc.text(recipient.documentNumber || '-', colMidX + 45, currentY)
  currentY += 11

  // Razón social
  doc.setFont('helvetica', 'bold')
  doc.text('Razón Social:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')
  const shipperNameText = doc.splitTextToSize(shipper.businessName || '-', CONTENT_WIDTH * 0.45 - 60)
  doc.text(shipperNameText[0], MARGIN_LEFT + 60, currentY)

  doc.setFont('helvetica', 'bold')
  doc.text('Nombre:', colMidX, currentY)
  doc.setFont('helvetica', 'normal')
  const recipientNameText = doc.splitTextToSize(recipient.name || '-', CONTENT_WIDTH * 0.45 - 45)
  doc.text(recipientNameText[0], colMidX + 40, currentY)
  currentY += 11

  // Dirección
  if (shipper.address || recipient.address) {
    doc.setFont('helvetica', 'bold')
    doc.text('Dirección:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    const shipperAddr = doc.splitTextToSize(shipper.address || '-', CONTENT_WIDTH * 0.45 - 50)
    doc.text(shipperAddr[0], MARGIN_LEFT + 50, currentY)

    doc.setFont('helvetica', 'bold')
    doc.text('Dirección:', colMidX, currentY)
    doc.setFont('helvetica', 'normal')
    const recipientAddr = doc.splitTextToSize(recipient.address || '-', CONTENT_WIDTH * 0.45 - 50)
    doc.text(recipientAddr[0], colMidX + 50, currentY)
    currentY += 11
  }

  // Ciudad
  if (shipper.city || recipient.city) {
    doc.setFont('helvetica', 'bold')
    doc.text('Ciudad:', MARGIN_LEFT, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(shipper.city || '-', MARGIN_LEFT + 40, currentY)

    doc.setFont('helvetica', 'bold')
    doc.text('Ciudad:', colMidX, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(recipient.city || '-', colMidX + 40, currentY)
    currentY += 11
  }

  currentY += 5

  // ========== 3.5 PAGADOR DEL FLETE ==========
  const freightPayer = guide.freightPayer || 'remitente'
  const thirdPartyPayer = guide.thirdPartyPayer || {}

  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('PAGADOR DEL FLETE', MARGIN_LEFT, currentY)
  currentY += 12

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Pagador:', MARGIN_LEFT, currentY)
  doc.setFont('helvetica', 'normal')

  let payerText = ''
  if (freightPayer === 'remitente') {
    payerText = `REMITENTE - ${shipper.businessName || ''} (RUC: ${shipper.ruc || ''})`
  } else if (freightPayer === 'destinatario') {
    payerText = `DESTINATARIO - ${recipient.name || ''} (${recipient.documentNumber || ''})`
  } else if (freightPayer === 'tercero' && thirdPartyPayer.name) {
    payerText = `TERCERO - ${thirdPartyPayer.name || ''} (${thirdPartyPayer.documentNumber || ''})`
  } else {
    payerText = 'REMITENTE'
  }

  const payerLines = doc.splitTextToSize(payerText, CONTENT_WIDTH - 60)
  doc.text(payerLines[0], MARGIN_LEFT + 45, currentY)
  currentY += 14

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

  // Ubicación (Departamento/Provincia/Distrito o Ubigeo)
  const originLocation = origin.departamento
    ? getLocationName(origin.departamento, origin.provincia, origin.distrito)
    : (origin.ubigeo ? `Ubigeo: ${origin.ubigeo}` : '')
  const destLocation = destination.departamento
    ? getLocationName(destination.departamento, destination.provincia, destination.distrito)
    : (destination.ubigeo ? `Ubigeo: ${destination.ubigeo}` : '')

  if (originLocation || destLocation) {
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM_GRAY)
    if (originLocation) doc.text(originLocation, MARGIN_LEFT, currentY)
    if (destLocation) doc.text(destLocation, colMidX, currentY)
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

  // Encabezado de tabla con columnas ajustadas para formato vertical
  const tableX = MARGIN_LEFT
  const tableWidth = CONTENT_WIDTH
  const colWidths = {
    num: 20,
    code: 50,
    sunatCode: 55,
    gtin: 60,
    desc: tableWidth - 20 - 50 - 55 - 60 - 45 - 40,
    qty: 45,
    unit: 40
  }

  // Fondo del encabezado con color accent
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(tableX, currentY, tableWidth, 18, 'F')
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(tableX, currentY, tableWidth, 18)

  // Textos del encabezado
  doc.setFontSize(6)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)

  let colX = tableX
  doc.text('N°', colX + colWidths.num/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.num, currentY, colX + colWidths.num, currentY + 18)
  colX += colWidths.num

  doc.text('CÓDIGO', colX + colWidths.code/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.code, currentY, colX + colWidths.code, currentY + 18)
  colX += colWidths.code

  doc.text('COD. SUNAT', colX + colWidths.sunatCode/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.sunatCode, currentY, colX + colWidths.sunatCode, currentY + 18)
  colX += colWidths.sunatCode

  doc.text('GTIN', colX + colWidths.gtin/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.gtin, currentY, colX + colWidths.gtin, currentY + 18)
  colX += colWidths.gtin

  doc.text('DESCRIPCIÓN', colX + colWidths.desc/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.desc, currentY, colX + colWidths.desc, currentY + 18)
  colX += colWidths.desc

  doc.text('CANT.', colX + colWidths.qty/2, currentY + 12, { align: 'center' })
  doc.line(colX + colWidths.qty, currentY, colX + colWidths.qty, currentY + 18)
  colX += colWidths.qty

  doc.text('UNID.', colX + colWidths.unit/2, currentY + 12, { align: 'center' })

  currentY += 18

  // Filas de datos
  const rowHeight = 16
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
    doc.line(colX + colWidths.code, currentY, colX + colWidths.code, currentY + rowHeight)
    colX += colWidths.code
    doc.line(colX + colWidths.sunatCode, currentY, colX + colWidths.sunatCode, currentY + rowHeight)
    colX += colWidths.sunatCode
    doc.line(colX + colWidths.gtin, currentY, colX + colWidths.gtin, currentY + rowHeight)
    colX += colWidths.gtin
    doc.line(colX + colWidths.desc, currentY, colX + colWidths.desc, currentY + rowHeight)
    colX += colWidths.desc
    doc.line(colX + colWidths.qty, currentY, colX + colWidths.qty, currentY + rowHeight)

    // Datos
    doc.setFontSize(6)
    colX = tableX
    doc.text(String(i + 1), colX + colWidths.num/2, currentY + 10, { align: 'center' })
    colX += colWidths.num

    doc.text((item.code || '-').substring(0, 10), colX + colWidths.code/2, currentY + 10, { align: 'center' })
    colX += colWidths.code

    doc.text((item.sunatCode || '-').substring(0, 12), colX + colWidths.sunatCode/2, currentY + 10, { align: 'center' })
    colX += colWidths.sunatCode

    doc.text((item.gtin || '-').substring(0, 14), colX + colWidths.gtin/2, currentY + 10, { align: 'center' })
    colX += colWidths.gtin

    const descText = item.description || '-'
    const truncatedDesc = descText.length > 35 ? descText.substring(0, 32) + '...' : descText
    doc.text(truncatedDesc, colX + 3, currentY + 10)
    colX += colWidths.desc

    doc.text(String(item.quantity || 1), colX + colWidths.qty/2, currentY + 10, { align: 'center' })
    colX += colWidths.qty

    doc.text(item.unit || 'NIU', colX + colWidths.unit/2, currentY + 10, { align: 'center' })

    currentY += rowHeight
  }

  currentY += 15

  // ========== 6. DATOS DEL VEHÍCULO(S) ==========
  doc.setLineWidth(0.5)
  doc.setDrawColor(...BLACK)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text(`DATOS DEL VEHÍCULO${vehicles.length > 1 ? 'S' : ''}`, MARGIN_LEFT, currentY)
  currentY += 12

  // Mostrar todos los vehículos con etiquetas Principal/Secundario
  const validVehicles = vehicles.filter(v => v && v.plate)
  validVehicles.forEach((v, idx) => {
    doc.setFontSize(7)

    // Etiqueta Principal/Secundario
    const vehicleLabel = idx === 0 ? 'PRINCIPAL' : 'SECUNDARIO'
    doc.setFont('helvetica', 'bold')
    if (idx === 0) {
      doc.setFillColor(...ACCENT_COLOR) // Color de acento para principal
    } else {
      doc.setFillColor(128, 128, 128) // Gris para secundario
    }
    doc.roundedRect(MARGIN_LEFT, currentY - 8, 55, 12, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(6)
    doc.text(vehicleLabel, MARGIN_LEFT + 27.5, currentY - 1, { align: 'center' })
    doc.setTextColor(...BLACK)
    doc.setFontSize(7)

    // Primera línea: Placa y TUCE
    doc.setFont('helvetica', 'bold')
    doc.text('Placa:', MARGIN_LEFT + 60, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(v.plate || '-', MARGIN_LEFT + 85, currentY)

    if (v.tuce) {
      doc.setFont('helvetica', 'bold')
      doc.text('TUCE:', MARGIN_LEFT + 150, currentY)
      doc.setFont('helvetica', 'normal')
      doc.text(v.tuce, MARGIN_LEFT + 175, currentY)
    }

    if (v.mtcAuthorization) {
      doc.setFont('helvetica', 'bold')
      doc.text('N° Aut.:', MARGIN_LEFT + 280, currentY)
      doc.setFont('helvetica', 'normal')
      doc.text(v.mtcAuthorization, MARGIN_LEFT + 315, currentY)
    }

    if (v.mtcEntity) {
      doc.setFont('helvetica', 'bold')
      doc.text('Entidad:', MARGIN_LEFT + 400, currentY)
      doc.setFont('helvetica', 'normal')
      doc.text((v.mtcEntity || '').substring(0, 15), MARGIN_LEFT + 435, currentY)
    }

    currentY += 14
  })

  currentY += 6

  // ========== 7. DATOS DEL CONDUCTOR(ES) ==========
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
  currentY += 12

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`DATOS DEL CONDUCTOR${drivers.length > 1 ? 'ES' : ''}`, MARGIN_LEFT, currentY)
  currentY += 12

  // Mostrar todos los conductores con etiquetas Principal/Secundario
  const validDrivers = drivers.filter(d => d && (d.documentNumber || d.name))
  validDrivers.forEach((d, idx) => {
    doc.setFontSize(7)

    // Etiqueta Principal/Secundario
    const driverLabel = idx === 0 ? 'PRINCIPAL' : 'SECUNDARIO'
    doc.setFont('helvetica', 'bold')
    if (idx === 0) {
      doc.setFillColor(...ACCENT_COLOR) // Color de acento para principal
    } else {
      doc.setFillColor(128, 128, 128) // Gris para secundario
    }
    doc.roundedRect(MARGIN_LEFT, currentY - 8, 55, 12, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(6)
    doc.text(driverLabel, MARGIN_LEFT + 27.5, currentY - 1, { align: 'center' })
    doc.setTextColor(...BLACK)
    doc.setFontSize(7)

    doc.setFont('helvetica', 'bold')
    doc.text('Doc:', MARGIN_LEFT + 60, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(d.documentNumber || '-', MARGIN_LEFT + 80, currentY)

    doc.setFont('helvetica', 'bold')
    doc.text('Licencia:', MARGIN_LEFT + 160, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(d.license || '-', MARGIN_LEFT + 200, currentY)

    doc.setFont('helvetica', 'bold')
    doc.text('Nombre:', MARGIN_LEFT + 290, currentY)
    doc.setFont('helvetica', 'normal')
    const fullName = `${d.name || ''} ${d.lastName || ''}`.trim() || '-'
    doc.text(fullName.substring(0, 30), MARGIN_LEFT + 330, currentY)

    currentY += 14
  })

  currentY += 6

  // ========== 8. GRE REMITENTE RELACIONADAS ==========
  if (guide.relatedGuides && guide.relatedGuides.length > 0 && guide.relatedGuides.some(g => g.number)) {
    doc.setLineWidth(0.5)
    doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
    currentY += 12

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('DOCUMENTOS RELACIONADOS', MARGIN_LEFT, currentY)
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

  // ========== 9. OBSERVACIONES ==========
  if (observations) {
    doc.setLineWidth(0.5)
    doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY)
    currentY += 12

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('OBSERVACIONES', MARGIN_LEFT, currentY)
    currentY += 12

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const obsLines = doc.splitTextToSize(observations, CONTENT_WIDTH)
    obsLines.slice(0, 3).forEach((line, i) => {
      doc.text(line, MARGIN_LEFT, currentY + (i * 10))
    })
    currentY += Math.min(obsLines.length, 3) * 10 + 5
  }

  // ========== 10. FOOTER CON QR Y SELLO SUNAT ==========
  const footerY = PAGE_HEIGHT - 100
  const qrSize = 60

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
  doc.text('Representación impresa de la Guía de Remisión Transportista Electrónica', legalX, footerY + 12)
  doc.text('Autorizado mediante Resolución de Superintendencia N° 000123-2023/SUNAT', legalX, footerY + 24)

  // OSE Info
  if (companySettings?.oseProvider || guide.oseCode) {
    doc.text(`OSE: ${companySettings?.oseProvider || 'NUBEFACT'} - ${guide.oseCode || 'Código de envío'}`, legalX, footerY + 36)
  }

  // Hash si existe
  if (guide.cdrHash || guide.hashCode) {
    doc.setFontSize(6)
    doc.text(`Hash: ${guide.cdrHash || guide.hashCode}`, legalX, footerY + 48)
  }

  // ===== SELLO DE VERIFICACIÓN SUNAT =====
  const sealX = PAGE_WIDTH - MARGIN_RIGHT - 110
  const sealY = footerY + 5
  const sealWidth = 100
  const sealHeight = 50

  // Borde del sello
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

  // Número de página
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  doc.text('Página 1 de 1', PAGE_WIDTH - MARGIN_RIGHT, footerY + qrSize + 10, { align: 'right' })

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
