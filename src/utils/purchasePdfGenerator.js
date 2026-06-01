import jsPDF from 'jspdf'
import { storage } from '@/lib/firebase'
import { ref, getBlob, getDownloadURL } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getCurrencySymbol, getCurrencyLongName, normalizeCurrency } from '@/utils/currency'

// ============================================================
// GENERADOR DE PDF PARA COMPRAS REGISTRADAS (módulo Compras)
// ------------------------------------------------------------
// Imprime el comprobante interno de una compra que el negocio
// registró (factura/boleta/guía del proveedor). Reutiliza el
// mismo estilo visual que la Orden de Compra.
// ============================================================

// Sistema de caché compartido para el logo
const LOGO_CACHE_KEY = 'cobrify_logo_cache'
const LOGO_CACHE_EXPIRY = 24 * 60 * 60 * 1000

const getLogoFromCache = (logoUrl) => {
  try {
    const cached = localStorage.getItem(LOGO_CACHE_KEY)
    if (!cached) return null
    const { url, data, timestamp } = JSON.parse(cached)
    if (url === logoUrl && (Date.now() - timestamp) < LOGO_CACHE_EXPIRY) {
      return data
    }
    return null
  } catch (error) {
    return null
  }
}

const saveLogoToCache = (logoUrl, base64Data) => {
  try {
    localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify({
      url: logoUrl,
      data: base64Data,
      timestamp: Date.now()
    }))
  } catch (error) {}
}

const numeroALetras = (num) => {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
  const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const veintis = ['VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

  const convertirGrupo = (n) => {
    if (n === 0) return ''
    if (n === 100) return 'CIEN'
    const c = Math.floor(n / 100)
    const d = Math.floor((n % 100) / 10)
    const u = n % 10
    let resultado = ''
    if (c > 0) resultado += centenas[c]
    if (d === 1) {
      resultado += (resultado ? ' ' : '') + especiales[u]
    } else if (d === 2) {
      resultado += (resultado ? ' ' : '') + veintis[u]
    } else {
      if (d > 0) resultado += (resultado ? ' ' : '') + decenas[d]
      if (u > 0) {
        if (d > 0) resultado += ' Y '
        else if (resultado) resultado += ' '
        resultado += unidades[u]
      }
    }
    return resultado
  }

  const entero = Math.floor(num)
  const decimales = Math.round((num - entero) * 100)
  if (entero === 0) return `CERO CON ${decimales.toString().padStart(2, '0')}/100`

  const millones = Math.floor(entero / 1000000)
  const restoMillones = entero % 1000000
  const miles = Math.floor(restoMillones / 1000)
  const unidadesFinales = restoMillones % 1000
  let resultado = ''

  if (millones > 0) {
    resultado = millones === 1 ? 'UN MILLON' : convertirGrupo(millones) + ' MILLONES'
  }
  if (miles > 0) {
    if (resultado) resultado += ' '
    resultado += miles === 1 ? 'MIL' : convertirGrupo(miles) + ' MIL'
  }
  if (unidadesFinales > 0) {
    if (resultado) resultado += ' '
    resultado += convertirGrupo(unidadesFinales)
  }

  return `${resultado} CON ${decimales.toString().padStart(2, '0')}/100`
}

const getStoragePathFromUrl = (url) => {
  try {
    const match = url.match(/\/o\/(.+?)\?/)
    if (match) return decodeURIComponent(match[1])
    return null
  } catch (error) {
    return null
  }
}

const loadImageAsBase64 = async (url) => {
  try {
    const cachedLogo = getLogoFromCache(url)
    if (cachedLogo) return cachedLogo

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
          const result = `data:${mimeType};base64,${response.data}`
          saveLogoToCache(url, result)
          return result
        }
      } catch (nativeError) {
        console.warn('CapacitorHttp falló:', nativeError.message)
      }
    }

    const storagePath = getStoragePathFromUrl(url)
    if (storagePath) {
      const storageRef = ref(storage, storagePath)
      const blob = await getBlob(storageRef)
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          saveLogoToCache(url, reader.result)
          resolve(reader.result)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }

    const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'reload' })
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        saveLogoToCache(url, reader.result)
        resolve(reader.result)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error('Error cargando logo:', error)
    throw error
  }
}

const loadImageWithRetry = async (url, maxRetries = 2, timeout = 10000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        loadImageAsBase64(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
      ])
      if (result) return result
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }
  return null
}

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [70, 70, 70]
}

// Etiqueta del tipo de documento de la compra (factura/boleta/guía/etc.)
const getDocTypeLabel = (type) => {
  switch (type) {
    case 'factura': return 'Factura'
    case 'boleta': return 'Boleta'
    case 'guia_interna': return 'Guía interna'
    case 'dam': return 'DAM'
    case 'dua': return 'DUA'
    case 'nota_credito': return 'Nota de Crédito'
    case 'ticket': return 'Ticket'
    case 'otros': return 'Otros'
    default: return 'Factura'
  }
}

// Convierte cualquier formato de fecha (string YYYY-MM-DD, Timestamp Firestore o Date) a DD/MM/YYYY
const formatDateValue = (value) => {
  if (!value) return '-'
  try {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const [year, month, day] = value.substring(0, 10).split('-')
      return `${day}/${month}/${year}`
    }
    const date = value.toDate ? value.toDate() : new Date(value)
    if (isNaN(date.getTime())) return '-'
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  } catch (error) {
    return '-'
  }
}

/**
 * Genera un PDF para una compra registrada
 * @param {Object} purchase - La compra (con supplier, items, total, etc.)
 * @param {Object} companySettings - Datos del negocio (logo, ruc, dirección...)
 * @param {boolean} download - true descarga/comparte; false solo retorna el doc
 * @param {Object} branding - Marca blanca opcional (nombre en el footer)
 */
export const generatePurchasePDF = async (purchase, companySettings, download = true, branding = null) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })

  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [120, 120, 120]
  const ACCENT_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#464646')

  // Moneda del documento — 'S/' (PEN) o '$' (USD). Cae en PEN si no viene.
  const purchaseCurrency = normalizeCurrency(purchase?.currency)
  const currencySymbol = getCurrencySymbol(purchaseCurrency)
  const currencyLongName = getCurrencyLongName(purchaseCurrency).toUpperCase()

  const MARGIN_LEFT = 20
  const MARGIN_RIGHT = 20
  const MARGIN_TOP = 20
  const MARGIN_BOTTOM = 15
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = MARGIN_TOP

  // ========== ENCABEZADO ==========
  const headerHeight = 100
  const defaultLogoWidth = 100
  const docColumnWidth = 145
  const logoX = MARGIN_LEFT
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docColumnWidth
  let actualLogoWidth = defaultLogoWidth

  // Logo
  if (companySettings?.logoUrl) {
    try {
      const imgData = await loadImageWithRetry(companySettings.logoUrl, 3, 30000)
      if (imgData) {
        let format = 'PNG'
        if (companySettings.logoUrl.toLowerCase().includes('.jpg') || companySettings.logoUrl.toLowerCase().includes('.jpeg')) {
          format = 'JPEG'
        }

        const img = new Image()
        img.src = imgData
        await new Promise((resolve) => { img.onload = resolve })

        const aspectRatio = img.width / img.height
        const maxLogoHeight = headerHeight - 15
        const maxAllowedWidth = CONTENT_WIDTH - docColumnWidth - 30

        let logoWidth, logoHeight
        if (aspectRatio >= 2) {
          logoHeight = maxLogoHeight * 0.75
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > maxAllowedWidth * 0.6) {
            logoWidth = maxAllowedWidth * 0.6
            logoHeight = logoWidth / aspectRatio
          }
        } else {
          logoHeight = maxLogoHeight * 0.85
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > defaultLogoWidth + 10) {
            logoWidth = defaultLogoWidth + 10
            logoHeight = logoWidth / aspectRatio
          }
        }

        actualLogoWidth = logoWidth
        const logoYPos = currentY + (headerHeight - logoHeight) / 2 - 10
        doc.addImage(imgData, format, logoX, logoYPos, logoWidth, logoHeight, undefined, 'FAST')
      }
    } catch (error) {
      console.warn('No se pudo cargar el logo:', error.message)
    }
  }

  // Datos de la empresa (centro) — mismo layout que la factura
  const infoColumnWidth = CONTENT_WIDTH - actualLogoWidth - docColumnWidth - 20
  const infoCenterX = MARGIN_LEFT + actualLogoWidth + 10 + (infoColumnWidth / 2)

  const companyName = (companySettings?.name || companySettings?.businessName || 'EMPRESA SAC').toUpperCase()
  const businessName = companySettings?.businessName ? companySettings.businessName.toUpperCase() : ''
  const showBusinessName = businessName && businessName !== companyName

  // Dirección completa (con distrito / provincia / departamento si están)
  let fullAddress = ''
  if (companySettings?.address) {
    fullAddress = companySettings.address
    const locationParts = [companySettings?.district, companySettings?.province, companySettings?.department].filter(Boolean)
    if (locationParts.length > 0) fullAddress += ' - ' + locationParts.join(', ')
    fullAddress = fullAddress.toUpperCase()
  }
  const phone = companySettings?.phone || ''
  const email = companySettings?.email || ''
  const website = companySettings?.website || ''

  // Pre-calcular líneas para centrar verticalmente
  const maxWidth = infoColumnWidth - 10
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  const nameLines = doc.splitTextToSize(companyName, maxWidth)

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  const businessNameLines = showBusinessName
    ? doc.splitTextToSize(businessName, maxWidth).slice(0, 2)
    : []
  const addressLines = fullAddress
    ? doc.splitTextToSize('DIRECCIÓN: ' + fullAddress, maxWidth).slice(0, 3)
    : []

  let totalLines = nameLines.length + businessNameLines.length + addressLines.length
  if (phone) totalLines += 1
  if (email) totalLines += 1
  if (website) totalLines += 1

  const lineSpacing = 10
  const totalTextHeight = totalLines * lineSpacing + 15
  let infoY = currentY + (headerHeight - totalTextHeight) / 2 + 12

  // Nombre comercial (centrado)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  nameLines.forEach((line) => {
    doc.text(line, infoCenterX, infoY, { align: 'center' })
    infoY += 12
  })

  // Razón social (si es diferente)
  if (businessNameLines.length > 0) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    businessNameLines.forEach((line, idx) => {
      doc.text(line, infoCenterX, infoY + (idx * 9), { align: 'center' })
    })
    infoY += businessNameLines.length * 9 + 1
  }

  // Dirección
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  addressLines.forEach((line) => {
    doc.text(line, infoCenterX, infoY, { align: 'center' })
    infoY += 9
  })

  // Teléfono
  if (phone) {
    doc.text('TELF: ' + phone.toUpperCase(), infoCenterX, infoY, { align: 'center' })
    infoY += 9
  }

  // Email
  if (email) {
    doc.text('EMAIL: ' + email.toUpperCase(), infoCenterX, infoY, { align: 'center' })
    infoY += 9
  }

  // Sitio web
  if (website) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK_GRAY)
    doc.text(website.toUpperCase(), infoCenterX, infoY, { align: 'center' })
    infoY += 9
  }

  // Recuadro del documento
  const docBoxY = currentY
  const rucSectionHeight = 26

  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(docBoxX, docBoxY, docColumnWidth, rucSectionHeight, 'F')

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(1.5)
  doc.rect(docBoxX, docBoxY, docColumnWidth, headerHeight)

  doc.setLineWidth(0.5)
  doc.line(docBoxX, docBoxY + rucSectionHeight, docBoxX + docColumnWidth, docBoxY + rucSectionHeight)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`R.U.C. ${companySettings?.ruc || ''}`, docBoxX + docColumnWidth / 2, docBoxY + 16, { align: 'center' })

  doc.setTextColor(...BLACK)
  doc.setFontSize(10)
  doc.text('COMPRA', docBoxX + docColumnWidth / 2, docBoxY + rucSectionHeight + 18, { align: 'center' })

  doc.setFontSize(12)
  doc.text(purchase.invoiceNumber || 'S/N', docBoxX + docColumnWidth / 2, docBoxY + rucSectionHeight + 38, { align: 'center' })

  // Bajar currentY asegurando que quede debajo del recuadro del documento
  const docBoxBottomY = currentY + headerHeight + 10
  currentY = Math.max(infoY + 5, docBoxBottomY)

  // Eslogan centrado debajo del encabezado
  if (companySettings?.companySlogan) {
    const slogan = companySettings.companySlogan.toUpperCase()
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    const sloganMaxWidth = CONTENT_WIDTH - 20
    const sloganLines = doc.splitTextToSize(slogan, sloganMaxWidth).slice(0, 2)
    const sloganCenterX = MARGIN_LEFT + CONTENT_WIDTH / 2
    sloganLines.forEach((line) => {
      doc.text(line, sloganCenterX, currentY, { align: 'center' })
      currentY += 14
    })
    currentY += 5
  } else {
    currentY += 5
  }

  // ========== DATOS DEL PROVEEDOR ==========
  doc.setFontSize(9)
  doc.setTextColor(...BLACK)

  const colLeftX = MARGIN_LEFT
  const colRightX = MARGIN_LEFT + CONTENT_WIDTH * 0.5 + 10
  const dataLineHeight = 12

  const purchaseDate = formatDateValue(purchase.invoiceDate || purchase.createdAt)
  const supplierDocType = (purchase.supplier?.documentType || 'RUC').toUpperCase()
  const supplierDoc = purchase.supplier?.documentNumber || purchase.supplier?.ruc || '-'
  const supplierAddress = purchase.supplier?.address || '-'
  const startY = currentY
  let leftY = startY

  doc.setFont('helvetica', 'bold')
  doc.text('PROVEEDOR:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  const supplierName = purchase.supplier?.businessName || purchase.supplier?.name || 'PROVEEDOR'
  doc.text(supplierName.substring(0, 50), colLeftX + 65, leftY)
  leftY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text(supplierDocType + ':', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  doc.text(supplierDoc, colLeftX + 65, leftY)
  leftY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('DIRECCIÓN:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  const addrLines = doc.splitTextToSize(supplierAddress, CONTENT_WIDTH * 0.4)
  addrLines.slice(0, 2).forEach((line, idx) => {
    doc.text(line, colLeftX + 65, leftY + (idx * dataLineHeight))
  })
  leftY += dataLineHeight * Math.min(addrLines.length, 2)

  // Columna derecha
  let rightY = startY

  doc.setFont('helvetica', 'bold')
  doc.text('FECHA:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(purchaseDate, colRightX + 70, rightY)
  rightY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('TIPO DOC:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(getDocTypeLabel(purchase.invoiceDocType), colRightX + 70, rightY)
  rightY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('MONEDA:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(currencyLongName, colRightX + 70, rightY)
  rightY += dataLineHeight

  // Condición de pago (contado / crédito)
  const paymentText = purchase.paymentType === 'credito'
    ? (purchase.paymentStatus === 'paid' ? 'Crédito (Pagado)' : 'Crédito (Pendiente)')
    : 'Contado'
  doc.setFont('helvetica', 'bold')
  doc.text('COND. PAGO:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(paymentText, colRightX + 70, rightY)
  rightY += dataLineHeight

  currentY = Math.max(leftY, rightY) + 10

  // ========== TABLA DE PRODUCTOS ==========
  const tableY = currentY
  const headerRowHeight = 18
  const baseRowHeight = 15

  // CANT | U.M. | DESCRIPCIÓN | P.UNIT | IMPORTE
  const colWidths = {
    cant: CONTENT_WIDTH * 0.08,
    um: CONTENT_WIDTH * 0.08,
    desc: CONTENT_WIDTH * 0.49,
    pu: CONTENT_WIDTH * 0.17,
    total: CONTENT_WIDTH * 0.18
  }

  let colX = MARGIN_LEFT
  const cols = {
    cant: colX,
    um: colX += colWidths.cant,
    desc: colX += colWidths.um,
    pu: colX += colWidths.desc,
    total: colX += colWidths.pu
  }

  // Encabezado de tabla
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(MARGIN_LEFT, tableY, CONTENT_WIDTH, headerRowHeight, 'F')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)

  const headerTextY = tableY + 12
  doc.text('CANT.', cols.cant + colWidths.cant / 2, headerTextY, { align: 'center' })
  doc.text('U.M.', cols.um + colWidths.um / 2, headerTextY, { align: 'center' })
  doc.text('DESCRIPCIÓN', cols.desc + 5, headerTextY)
  doc.text('P. UNIT.', cols.pu + colWidths.pu / 2, headerTextY, { align: 'center' })
  doc.text('IMPORTE', cols.total + colWidths.total / 2, headerTextY, { align: 'center' })

  // Filas de productos
  let dataRowY = tableY + headerRowHeight
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')

  const items = purchase.items || []
  const unitLabels = { 'UNIDAD': 'UND', 'CAJA': 'CAJA', 'KG': 'KG', 'LITRO': 'LT', 'METRO': 'MT' }
  const descLineHeight = 8 * 1.4 // desc 8pt con interlineado 1.4 → 11.2 pt

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    const itemName = item.productName || item.name || ''
    const rawCode = item.productCode || item.code || item.variantSku || ''
    const isValidCode = rawCode && rawCode.trim() !== '' && rawCode.toUpperCase() !== 'CUSTOM'
    const itemDesc = isValidCode ? `${rawCode} - ${itemName}` : itemName
    doc.setFontSize(8)
    const descLines = doc.splitTextToSize(itemDesc, colWidths.desc - 8)

    const textContentHeight = descLines.length * descLineHeight
    const productRowHeight = Math.max(baseRowHeight, 10 + textContentHeight + 4)

    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 248)
      doc.rect(MARGIN_LEFT, dataRowY, CONTENT_WIDTH, productRowHeight, 'F')
    }

    const precio = item.unitPrice || item.price || 0
    const cantidad = item.quantity || 0
    const importe = cantidad * precio
    const centerY = dataRowY + productRowHeight / 2 + 3

    doc.setTextColor(...BLACK)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    const qtyText = Number.isInteger(cantidad) ? cantidad.toString() : cantidad.toFixed(2)
    doc.text(qtyText, cols.cant + colWidths.cant / 2, centerY, { align: 'center' })

    const unitCode = item.unit || 'UNIDAD'
    doc.text(unitLabels[unitCode] || unitCode, cols.um + colWidths.um / 2, centerY, { align: 'center' })

    // Descripción — múltiples líneas desde arriba
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    const descStartY = dataRowY + 10
    descLines.forEach((line, idx) => {
      doc.text(line, cols.desc + 4, descStartY + (idx * descLineHeight))
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(precio.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.pu + colWidths.pu - 5, centerY, { align: 'right' })
    doc.text(importe.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.total + colWidths.total - 5, centerY, { align: 'right' })

    dataRowY += productRowHeight
  }

  currentY = dataRowY + 8

  // ========== SON (MONTO EN LETRAS) ==========
  const montoEnLetras = numeroALetras(purchase.total || 0) + ' ' + currencyLongName
  const sonSectionHeight = 22

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN_LEFT, currentY, CONTENT_WIDTH, sonSectionHeight)

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('SON:', MARGIN_LEFT + 5, currentY + 14)
  doc.setFont('helvetica', 'normal')
  const letrasLines = doc.splitTextToSize(montoEnLetras, CONTENT_WIDTH - 35)
  doc.text(letrasLines[0], MARGIN_LEFT + 28, currentY + 14)

  currentY += sonSectionHeight + 5

  // ========== TOTALES ==========
  // Subtotal e IGV solo si la compra los tiene desglosados; si no, solo TOTAL.
  const hasBreakdown = (purchase.subtotal != null && purchase.subtotal !== 0) || (purchase.igv != null && purchase.igv !== 0)
  const totalsWidth = 160
  const totalsX = MARGIN_LEFT + CONTENT_WIDTH - totalsWidth
  const totalsRowHeight = 15
  const totalsBoxHeight = hasBreakdown ? (totalsRowHeight * 3 + 6) : (totalsRowHeight + 6)

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(totalsX, currentY, totalsWidth, totalsBoxHeight)

  if (hasBreakdown) {
    // Subtotal
    doc.setFillColor(250, 250, 250)
    doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.line(totalsX, currentY + totalsRowHeight, totalsX + totalsWidth, currentY + totalsRowHeight)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.text('SUBTOTAL', totalsX + 5, currentY + 10)
    doc.text(currencySymbol + ' ' + (purchase.subtotal || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, currentY + 10, { align: 'right' })
    currentY += totalsRowHeight

    // IGV
    doc.setFillColor(255, 255, 255)
    doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'F')
    doc.line(totalsX, currentY + totalsRowHeight, totalsX + totalsWidth, currentY + totalsRowHeight)
    doc.text('IGV (18%)', totalsX + 5, currentY + 10)
    doc.text(currencySymbol + ' ' + (purchase.igv || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, currentY + 10, { align: 'right' })
    currentY += totalsRowHeight
  }

  // Total
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight + 6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('TOTAL', totalsX + 5, currentY + 14)
  doc.setFontSize(11)
  doc.text(currencySymbol + ' ' + (purchase.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, currentY + 14, { align: 'right' })

  currentY += totalsRowHeight + 6

  // Tipo de cambio (solo si la compra es en USD)
  if (purchaseCurrency === 'USD' && purchase.exchangeRate) {
    const aproxPen = (purchase.total || 0) * (purchase.exchangeRate || 1)
    doc.setTextColor(...MEDIUM_GRAY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(
      `T.C. ${purchase.exchangeRate}  ·  Aprox. S/ ${aproxPen.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`,
      totalsX + totalsWidth - 5,
      currentY + 8,
      { align: 'right' }
    )
  }

  currentY += 20

  // ========== NOTAS ==========
  if (purchase.notes) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('OBSERVACIONES:', MARGIN_LEFT, currentY)
    currentY += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...DARK_GRAY)
    const notesLines = doc.splitTextToSize(purchase.notes, CONTENT_WIDTH - 10)
    notesLines.slice(0, 4).forEach(line => {
      doc.text(line, MARGIN_LEFT + 5, currentY)
      currentY += 9
    })
  }

  // ========== FOOTER ==========
  doc.setDrawColor(...MEDIUM_GRAY)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, PAGE_HEIGHT - MARGIN_BOTTOM - 12, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - MARGIN_BOTTOM - 12)

  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  const footerCompany = branding?.companyName || 'Cobrify'
  doc.text(`Documento generado en ${footerCompany} - Sistema de Facturación Electrónica`, MARGIN_LEFT + CONTENT_WIDTH / 2, PAGE_HEIGHT - MARGIN_BOTTOM - 3, { align: 'center' })

  // ========== GENERAR PDF ==========
  if (download) {
    const fileName = `Compra_${(purchase.invoiceNumber || 'SN').replace(/\//g, '-')}.pdf`
    const isNativePlatform = Capacitor.isNativePlatform()

    if (isNativePlatform) {
      try {
        const pdfOutput = doc.output('datauristring')
        const base64Data = pdfOutput.split(',')[1]

        const result = await Filesystem.writeFile({
          path: `PDFs/${fileName}`,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true
        })

        try {
          await Share.share({
            title: fileName,
            text: `Compra: ${fileName}`,
            url: result.uri,
            dialogTitle: 'Compartir PDF'
          })
        } catch (shareError) {
          console.log('Compartir cancelado:', shareError)
        }

        return { success: true, uri: result.uri, fileName, doc }
      } catch (error) {
        console.error('Error al guardar PDF:', error)
        throw error
      }
    } else {
      doc.save(fileName)
    }
  }

  return doc
}

export const getPurchasePDFBlob = async (purchase, companySettings, branding = null) => {
  const doc = await generatePurchasePDF(purchase, companySettings, false, branding)
  return doc.output('blob')
}

export const previewPurchasePDF = async (purchase, companySettings, branding = null) => {
  const doc = await generatePurchasePDF(purchase, companySettings, false, branding)
  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      const pdfBase64 = doc.output('datauristring').split(',')[1]
      const fileName = `Compra_${(purchase.invoiceNumber || 'SN').replace(/\//g, '-')}.pdf`

      const result = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true
      })

      await Share.share({
        title: `Compra ${purchase.invoiceNumber || ''}`,
        url: result.uri,
        dialogTitle: 'Ver compra'
      })

      return result.uri
    } catch (error) {
      console.error('Error al generar vista previa:', error)
      throw error
    }
  } else {
    const blobUrl = doc.output('bloburl')
    window.open(blobUrl, '_blank')
    return blobUrl
  }
}
