import jsPDF from 'jspdf'
import { storage } from '@/lib/firebase'
import { ref, getBlob, getDownloadURL } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getCurrencySymbol, getCurrencyLongName, normalizeCurrency } from '@/utils/currency'

// Sistema de caché compartido
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

    const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
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

/**
 * Genera un PDF para una orden de compra
 */
export const generatePurchaseOrderPDF = async (order, companySettings, download = true, branding = null) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })

  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [120, 120, 120]
  const ACCENT_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#464646')

  // Moneda del documento — 'S/' (PEN) o '$' (USD). Cae en PEN si no viene.
  const orderCurrency = normalizeCurrency(order?.currency)
  const currencySymbol = getCurrencySymbol(orderCurrency)
  const currencyLongName = getCurrencyLongName(orderCurrency).toUpperCase()

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
  doc.text('ORDEN DE COMPRA', docBoxX + docColumnWidth / 2, docBoxY + rucSectionHeight + 18, { align: 'center' })

  doc.setFontSize(12)
  doc.text(order.number || 'N/A', docBoxX + docColumnWidth / 2, docBoxY + rucSectionHeight + 38, { align: 'center' })

  // Bajar currentY asegurando que quede debajo del recuadro del documento
  const docBoxBottomY = currentY + headerHeight + 10
  currentY = Math.max(infoY + 5, docBoxBottomY)

  // Eslogan centrado debajo del encabezado (mismo patrón que la factura)
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

  // Formato de fecha
  let orderDate = new Date().toLocaleDateString('es-PE')
  const dateSource = order.createdAt || order.issueDate
  if (dateSource) {
    if (typeof dateSource === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateSource)) {
      const [year, month, day] = dateSource.split('-')
      orderDate = `${day}/${month}/${year}`
    } else if (dateSource.toDate) {
      const date = dateSource.toDate()
      orderDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
    }
  }

  let deliveryDateStr = '-'
  if (order.deliveryDate) {
    if (typeof order.deliveryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(order.deliveryDate)) {
      const [year, month, day] = order.deliveryDate.split('-')
      deliveryDateStr = `${day}/${month}/${year}`
    } else if (order.deliveryDate.toDate) {
      const date = order.deliveryDate.toDate()
      deliveryDateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
    }
  }

  const supplierDoc = order.supplier?.ruc || order.supplier?.documentNumber || '-'
  const supplierAddress = order.supplier?.address || '-'
  const startY = currentY
  let leftY = startY

  doc.setFont('helvetica', 'bold')
  doc.text('PROVEEDOR:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  const supplierName = order.supplier?.businessName || order.supplier?.name || 'PROVEEDOR'
  doc.text(supplierName.substring(0, 50), colLeftX + 65, leftY)
  leftY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('RUC:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  doc.text(supplierDoc, colLeftX + 65, leftY)
  leftY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('DIRECCIÓN:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  const addrLines = doc.splitTextToSize(supplierAddress, CONTENT_WIDTH * 0.4)
  addrLines.forEach((line, idx) => {
    doc.text(line, colLeftX + 65, leftY + (idx * dataLineHeight))
  })
  leftY += dataLineHeight * addrLines.length

  // Columna derecha
  let rightY = startY

  doc.setFont('helvetica', 'bold')
  doc.text('FECHA:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(orderDate, colRightX + 55, rightY)
  rightY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('ENTREGA:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(deliveryDateStr, colRightX + 55, rightY)
  rightY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('MONEDA:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(currencyLongName, colRightX + 55, rightY)
  rightY += dataLineHeight

  if (order.paymentCondition) {
    const paymentLabels = {
      contado: 'Contado',
      credito_7: 'Crédito 7 días',
      credito_15: 'Crédito 15 días',
      credito_30: 'Crédito 30 días',
      credito_45: 'Crédito 45 días',
      credito_60: 'Crédito 60 días',
    }
    const paymentText = paymentLabels[order.paymentCondition] || order.paymentCondition
    doc.setFont('helvetica', 'bold')
    doc.text('COND. PAGO:', colRightX, rightY)
    doc.setFont('helvetica', 'normal')
    doc.text(paymentText, colRightX + 70, rightY)
    rightY += dataLineHeight
  }

  currentY = Math.max(leftY, rightY) + 10

  // ========== TABLA DE PRODUCTOS ==========
  const tableY = currentY
  const headerRowHeight = 18
  const baseRowHeight = 15

  // Detectar modo farmacia — en farmacia se muestran columnas CÓDIGO, LABORATORIO y MARCA
  // y los detalles (presentación, concentración) se imprimen como sub-línea debajo de la descripción
  const isPharmacy = companySettings?.businessMode === 'pharmacy'

  // Farmacia: CANT | U.M. | CÓDIGO | DESCRIPCIÓN | LAB | MARCA | P.UNIT | IMPORTE
  // Normal:   CANT | U.M. | DESCRIPCIÓN | P.UNIT | IMPORTE
  const colWidths = isPharmacy ? {
    cant: CONTENT_WIDTH * 0.05,
    um: CONTENT_WIDTH * 0.05,
    code: CONTENT_WIDTH * 0.10,
    desc: CONTENT_WIDTH * 0.30,
    lab: CONTENT_WIDTH * 0.13,
    marca: CONTENT_WIDTH * 0.10,
    pu: CONTENT_WIDTH * 0.13,
    total: CONTENT_WIDTH * 0.14
  } : {
    cant: CONTENT_WIDTH * 0.08,
    um: CONTENT_WIDTH * 0.08,
    code: 0,
    desc: CONTENT_WIDTH * 0.49,
    lab: 0,
    marca: 0,
    pu: CONTENT_WIDTH * 0.17,
    total: CONTENT_WIDTH * 0.18
  }

  let colX = MARGIN_LEFT
  const cols = {
    cant: colX,
    um: colX += colWidths.cant,
    code: colX += colWidths.um,
    desc: colX += colWidths.code,
    lab: colX += colWidths.desc,
    marca: colX += colWidths.lab,
    pu: colX += colWidths.marca,
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
  if (isPharmacy) {
    doc.text('CÓDIGO', cols.code + colWidths.code / 2, headerTextY, { align: 'center' })
  }
  doc.text('DESCRIPCIÓN', cols.desc + 5, headerTextY)
  if (isPharmacy) {
    doc.text('LABORATORIO', cols.lab + colWidths.lab / 2, headerTextY, { align: 'center' })
    doc.text('MARCA', cols.marca + colWidths.marca / 2, headerTextY, { align: 'center' })
  }
  doc.text('P. UNIT.', cols.pu + colWidths.pu / 2, headerTextY, { align: 'center' })
  doc.text('IMPORTE', cols.total + colWidths.total / 2, headerTextY, { align: 'center' })

  // Filas de productos
  let dataRowY = tableY + headerRowHeight
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')

  const items = order.items || []
  const unitLabels = { 'UNIDAD': 'UND', 'CAJA': 'CAJA', 'KG': 'KG', 'LITRO': 'LT', 'METRO': 'MT' }
  // Alturas de línea en puntos (el PDF está configurado en unit: 'pt')
  const descLineHeight = 8 * 1.4 // desc 8pt con interlineado 1.4 → 11.2 pt
  const pharmaLineHeight = 6.5 * 1.4 // sub-detalles 6.5pt → 9.1 pt

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // Descripción principal — en farmacia, el código va en su propia columna
    const itemName = item.name || ''
    const rawCode = item.code || item.productCode || ''
    const isValidCode = rawCode && rawCode.trim() !== '' && rawCode.toUpperCase() !== 'CUSTOM'
    const itemDesc = (isValidCode && !isPharmacy) ? `${rawCode} - ${itemName}` : itemName
    doc.setFontSize(8)
    const descLines = doc.splitTextToSize(itemDesc, colWidths.desc - 8)

    // Sub-línea farmacéutica (presentación, concentración) en itálica, azul-gris
    let pharmaLines = []
    if (isPharmacy) {
      const parts = []
      if (item.presentation) parts.push(`Pres: ${item.presentation}`)
      if (item.concentration) parts.push(`Conc: ${item.concentration}`)
      if (parts.length > 0) {
        doc.setFontSize(6.5)
        pharmaLines = doc.splitTextToSize(parts.join('  |  '), colWidths.desc - 8)
      }
    }

    // Altura de fila: 10mm desde el top hasta la primera línea de texto + alto del texto + separación desc/pharma + margen inferior
    const pharmaGap = pharmaLines.length > 0 ? 2 : 0
    const textContentHeight = (descLines.length * descLineHeight) + pharmaGap + (pharmaLines.length * pharmaLineHeight)
    const productRowHeight = Math.max(baseRowHeight, 10 + textContentHeight + 4)

    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 248)
      doc.rect(MARGIN_LEFT, dataRowY, CONTENT_WIDTH, productRowHeight, 'F')
    }

    const precio = item.unitPrice || item.price || 0
    const importe = item.quantity * precio
    const centerY = dataRowY + productRowHeight / 2 + 3

    doc.setTextColor(...BLACK)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    const qtyText = Number.isInteger(item.quantity) ? item.quantity.toString() : item.quantity.toFixed(2)
    doc.text(qtyText, cols.cant + colWidths.cant / 2, centerY, { align: 'center' })

    const unitCode = item.unit || 'UNIDAD'
    doc.text(unitLabels[unitCode] || unitCode, cols.um + colWidths.um / 2, centerY, { align: 'center' })

    // Código (solo farmacia)
    if (isPharmacy && isValidCode) {
      doc.setFontSize(6.5)
      const codeLines = doc.splitTextToSize(rawCode, colWidths.code - 4)
      doc.text(codeLines[0], cols.code + colWidths.code / 2, centerY, { align: 'center' })
    }

    // Descripción — múltiples líneas desde arriba
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    const descStartY = dataRowY + 10
    descLines.forEach((line, idx) => {
      doc.text(line, cols.desc + 4, descStartY + (idx * descLineHeight))
    })

    // Sub-detalles farmacéuticos debajo de la descripción (con un pequeño gap para no pegarse al nombre)
    if (pharmaLines.length > 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(6.5)
      doc.setTextColor(80, 100, 120)
      const pharmaStartY = descStartY + (descLines.length * descLineHeight) + 2
      pharmaLines.forEach((line, idx) => {
        doc.text(line, cols.desc + 4, pharmaStartY + (idx * pharmaLineHeight))
      })
      doc.setTextColor(...BLACK)
    }

    // Laboratorio y Marca en columnas separadas (solo farmacia)
    if (isPharmacy) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      const labText = item.laboratoryName || ''
      if (labText) {
        const labLines = doc.splitTextToSize(labText, colWidths.lab - 4)
        labLines.slice(0, 3).forEach((line, idx) => {
          doc.text(line, cols.lab + colWidths.lab / 2, descStartY + (idx * 7), { align: 'center' })
        })
      }
      const marcaText = item.marca || ''
      if (marcaText) {
        const marcaLines = doc.splitTextToSize(marcaText, colWidths.marca - 4)
        marcaLines.slice(0, 3).forEach((line, idx) => {
          doc.text(line, cols.marca + colWidths.marca / 2, descStartY + (idx * 7), { align: 'center' })
        })
      }
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(precio.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.pu + colWidths.pu - 5, centerY, { align: 'right' })
    doc.text(importe.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.total + colWidths.total - 5, centerY, { align: 'right' })

    dataRowY += productRowHeight
  }

  currentY = dataRowY + 8

  // ========== SON (MONTO EN LETRAS) ==========
  const montoEnLetras = numeroALetras(order.total || 0) + ' ' + currencyLongName
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
  const totalsWidth = 160
  const totalsX = MARGIN_LEFT + CONTENT_WIDTH - totalsWidth
  const totalsRowHeight = 15

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight * 3 + 6)

  // Subtotal
  doc.setFillColor(250, 250, 250)
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'F')
  doc.setDrawColor(200, 200, 200)
  doc.line(totalsX, currentY + totalsRowHeight, totalsX + totalsWidth, currentY + totalsRowHeight)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  doc.text('SUBTOTAL', totalsX + 5, currentY + 10)
  doc.text(currencySymbol + ' ' + (order.subtotal || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, currentY + 10, { align: 'right' })
  currentY += totalsRowHeight

  // IGV
  doc.setFillColor(255, 255, 255)
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight, 'F')
  doc.line(totalsX, currentY + totalsRowHeight, totalsX + totalsWidth, currentY + totalsRowHeight)
  doc.text('IGV (18%)', totalsX + 5, currentY + 10)
  doc.text(currencySymbol + ' ' + (order.igv || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, currentY + 10, { align: 'right' })
  currentY += totalsRowHeight

  // Total
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(totalsX, currentY, totalsWidth, totalsRowHeight + 6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAL', totalsX + 5, currentY + 14)
  doc.setFontSize(11)
  doc.text(currencySymbol + ' ' + (order.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, currentY + 14, { align: 'right' })

  currentY += totalsRowHeight + 20

  // ========== NOTAS ==========
  if (order.notes) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('OBSERVACIONES:', MARGIN_LEFT, currentY)
    currentY += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...DARK_GRAY)
    const notesLines = doc.splitTextToSize(order.notes, CONTENT_WIDTH - 10)
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
    const fileName = `OrdenCompra_${(order.number || 'OC').replace(/\//g, '-')}.pdf`
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
            text: `Orden de Compra: ${fileName}`,
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

export const getPurchaseOrderPDFBlob = async (order, companySettings, branding = null) => {
  const doc = await generatePurchaseOrderPDF(order, companySettings, false, branding)
  return doc.output('blob')
}

export const previewPurchaseOrderPDF = async (order, companySettings, branding = null) => {
  const doc = await generatePurchaseOrderPDF(order, companySettings, false, branding)
  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      const pdfBase64 = doc.output('datauristring').split(',')[1]
      const fileName = `OrdenCompra_${(order.number || 'OC').replace(/\//g, '-')}.pdf`

      const result = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true
      })

      await Share.share({
        title: `Orden de Compra ${order.number || ''}`,
        url: result.uri,
        dialogTitle: 'Ver orden de compra'
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
