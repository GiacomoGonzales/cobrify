import jsPDF from 'jspdf'
import { storage } from '@/lib/firebase'
import { ref, getBlob, getDownloadURL } from 'firebase/storage'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// Sistema de caché compartido con pdfGenerator
const LOGO_CACHE_KEY = 'cobrify_logo_cache'
const LOGO_CACHE_EXPIRY = 24 * 60 * 60 * 1000 // 24 horas

const getLogoFromCache = (logoUrl) => {
  try {
    const cached = localStorage.getItem(LOGO_CACHE_KEY)
    if (!cached) return null

    const { url, data, timestamp } = JSON.parse(cached)

    if (url === logoUrl && (Date.now() - timestamp) < LOGO_CACHE_EXPIRY) {
      console.log('✅ Logo obtenido desde caché (cotización)')
      return data
    }

    return null
  } catch (error) {
    return null
  }
}

const saveLogoToCache = (logoUrl, base64Data) => {
  try {
    const cacheData = {
      url: logoUrl,
      data: base64Data,
      timestamp: Date.now()
    }
    localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(cacheData))
    console.log('✅ Logo guardado en caché (cotización)')
  } catch (error) {
    // Si localStorage está lleno, ignorar
  }
}

/**
 * Convierte un número a texto en español (para montos en cotizaciones peruanas)
 * Soporta hasta 999,999,999 (millones)
 */
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
    if (millones === 1) {
      resultado = 'UN MILLON'
    } else {
      resultado = convertirGrupo(millones) + ' MILLONES'
    }
  }

  if (miles > 0) {
    if (resultado) resultado += ' '
    if (miles === 1) {
      resultado += 'MIL'
    } else {
      resultado += convertirGrupo(miles) + ' MIL'
    }
  }

  if (unidadesFinales > 0) {
    if (resultado) resultado += ' '
    resultado += convertirGrupo(unidadesFinales)
  }

  return `${resultado} CON ${decimales.toString().padStart(2, '0')}/100`
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
 * Utiliza caché para mejorar rendimiento
 */
const loadImageAsBase64 = async (url) => {
  try {
    // Primero intentar obtener del caché
    const cachedLogo = getLogoFromCache(url)
    if (cachedLogo) {
      return cachedLogo
    }

    console.log('🔄 Logo no está en caché, descargando...')
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
          const result = `data:${mimeType};base64,${base64Data}`
          saveLogoToCache(url, result)
          return result
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
        reader.onloadend = () => {
          const result = reader.result
          saveLogoToCache(url, result)
          resolve(result)
        }
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
      reader.onloadend = () => {
        const result = reader.result
        saveLogoToCache(url, result)
        resolve(result)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

  } catch (error) {
    console.error('Error cargando logo:', error)
    throw error
  }
}

/**
 * Carga imagen con reintentos
 * Retorna null si falla (no lanza error para no bloquear la generación del PDF)
 */
const loadImageWithRetry = async (url, maxRetries = 2, timeout = 10000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Intento ${attempt}/${maxRetries} de cargar logo (cotización)...`)

      const result = await Promise.race([
        loadImageAsBase64(url),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout después de ${timeout/1000}s`)), timeout)
        )
      ])

      if (result) {
        console.log(`✅ Logo cargado en intento ${attempt}`)
        return result
      }
    } catch (error) {
      console.warn(`⚠️ Intento ${attempt} falló:`, error.message)

      if (attempt < maxRetries) {
        const waitTime = 1000
        console.log(`⏳ Esperando ${waitTime}ms antes de reintentar...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  // Retornar null en lugar de lanzar error - el PDF se generará sin logo
  console.warn('⚠️ No se pudo cargar el logo, continuando sin logo')
  return null
}

/**
 * Convierte un color hexadecimal a RGB
 */
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [70, 70, 70]
}

/**
 * Genera un PDF para una cotización con el mismo estilo profesional que facturas
 */
export const generateQuotationPDF = async (quotation, companySettings, download = true, branding = null) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  // Paleta de colores
  const BLACK = [0, 0, 0]
  const DARK_GRAY = [60, 60, 60]
  const MEDIUM_GRAY = [120, 120, 120]

  // Color de acento dinámico (configurado por el usuario)
  const ACCENT_COLOR = hexToRgb(companySettings?.pdfAccentColor || '#464646')

  // Márgenes y dimensiones - A4: 595pt x 842pt
  const MARGIN_LEFT = 20
  const MARGIN_RIGHT = 20
  const MARGIN_TOP = 20
  const MARGIN_BOTTOM = 15
  const PAGE_WIDTH = doc.internal.pageSize.getWidth()
  const PAGE_HEIGHT = doc.internal.pageSize.getHeight()
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

  let currentY = MARGIN_TOP

  // ========== 1. ENCABEZADO - 3 COLUMNAS ==========

  const headerHeight = 100
  const logoColumnWidth = 100
  const docColumnWidth = 145
  const infoColumnWidth = CONTENT_WIDTH - logoColumnWidth - docColumnWidth - 20

  const logoX = MARGIN_LEFT
  const infoCenterX = MARGIN_LEFT + logoColumnWidth + 10 + (infoColumnWidth / 2)
  const docBoxX = PAGE_WIDTH - MARGIN_RIGHT - docColumnWidth

  // ===== COLUMNA 1: LOGO =====
  if (companySettings?.logoUrl) {
    try {
      const imgData = await loadImageWithRetry(companySettings.logoUrl, 3, 30000)

      let format = 'PNG'
      if (companySettings.logoUrl.toLowerCase().includes('.jpg') ||
          companySettings.logoUrl.toLowerCase().includes('.jpeg')) {
        format = 'JPEG'
      }

      const img = new Image()
      img.src = imgData
      await new Promise((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = (err) => reject(err)
      })

      const aspectRatio = img.width / img.height

      // Altura máxima: proporcional al header
      const maxLogoHeight = headerHeight - 15

      let logoWidth, logoHeight

      if (aspectRatio >= 2.5) {
        // Logo MUY horizontal (2.5:1 o más): limitar estrictamente al ancho de columna
        // Para no invadir el espacio de datos de empresa
        const maxLogoWidth = logoColumnWidth
        logoWidth = maxLogoWidth
        logoHeight = logoWidth / aspectRatio
        // Si queda muy pequeño en altura, reducir un poco el ancho para dar más altura
        if (logoHeight < 25) {
          logoHeight = 25
          logoWidth = logoHeight * aspectRatio
          if (logoWidth > maxLogoWidth) {
            logoWidth = maxLogoWidth
            logoHeight = logoWidth / aspectRatio
          }
        }
      } else if (aspectRatio >= 2) {
        // Logo muy horizontal (2:1 a 2.5:1): permitir un poco más de ancho
        const maxHorizontalWidth = logoColumnWidth + 20 // Solo 20pt extra
        logoHeight = maxLogoHeight * 0.6
        logoWidth = logoHeight * aspectRatio
        if (logoWidth > maxHorizontalWidth) {
          logoWidth = maxHorizontalWidth
          logoHeight = logoWidth / aspectRatio
        }
      } else if (aspectRatio >= 1.3) {
        // Logo horizontal moderado (1.3:1 a 2:1): permitir un poco más ancho
        const maxLogoWidth = logoColumnWidth + 15 // Reducido de +30 a +15
        logoWidth = maxLogoWidth
        logoHeight = logoWidth / aspectRatio
        if (logoHeight > maxLogoHeight) {
          logoHeight = maxLogoHeight
          logoWidth = logoHeight * aspectRatio
        }
      } else if (aspectRatio >= 1) {
        // Logo cuadrado o casi cuadrado: limitar tamaño para no superponerse
        const maxLogoWidth = logoColumnWidth - 5
        logoHeight = maxLogoHeight * 0.75
        logoWidth = logoHeight * aspectRatio
        if (logoWidth > maxLogoWidth) {
          logoWidth = maxLogoWidth
          logoHeight = logoWidth / aspectRatio
        }
      } else {
        // Logo vertical: priorizar altura máxima
        const maxLogoWidth = logoColumnWidth - 5
        logoHeight = maxLogoHeight
        logoWidth = logoHeight * aspectRatio
        if (logoWidth > maxLogoWidth) {
          logoWidth = maxLogoWidth
          logoHeight = logoWidth / aspectRatio
        }
      }

      const logoYPos = currentY + (headerHeight - logoHeight) / 2 - 10
      doc.addImage(imgData, format, logoX, logoYPos, logoWidth, logoHeight, undefined, 'FAST')
    } catch (error) {
      console.warn('No se pudo cargar el logo:', error.message)
    }
  }

  // ===== ESLOGAN debajo del logo =====
  if (companySettings?.companySlogan) {
    const slogan = companySettings.companySlogan.toUpperCase()
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)

    // El eslogan ocupa el ancho del logo + área de información (centrado)
    const sloganMaxWidth = logoColumnWidth + infoColumnWidth - 10
    const sloganLines = doc.splitTextToSize(slogan, sloganMaxWidth)

    // Limitar a máximo 2 líneas
    const linesToShow = sloganLines.slice(0, 2)

    // Posición: en la parte inferior del header, más arriba que antes
    const sloganCenterX = logoX + (sloganMaxWidth / 2)
    const sloganY = currentY + headerHeight - 18
    linesToShow.forEach((line, index) => {
      doc.text(line, sloganCenterX, sloganY + (index * 10), { align: 'center' })
    })

    doc.setTextColor(...BLACK) // Restaurar color
  }

  // ===== COLUMNA 2: DATOS DE LA EMPRESA (centro) =====
  const companyName = (companySettings?.name || companySettings?.businessName || 'EMPRESA SAC').toUpperCase()
  const businessName = companySettings?.businessName ? companySettings.businessName.toUpperCase() : ''
  const showBusinessName = businessName && businessName !== companyName

  let fullAddress = ''
  if (companySettings?.address) {
    fullAddress = companySettings.address
  }
  if (companySettings?.district || companySettings?.province || companySettings?.department) {
    const locationParts = [
      companySettings?.district,
      companySettings?.province,
      companySettings?.department
    ].filter(Boolean)
    if (locationParts.length > 0) {
      fullAddress += (fullAddress ? ' - ' : '') + locationParts.join(', ')
    }
  }

  const phone = companySettings?.phone || ''
  const email = companySettings?.email || ''
  const website = companySettings?.website || ''

  let totalLines = 1
  if (showBusinessName) totalLines += 1
  if (fullAddress) totalLines += Math.ceil(fullAddress.length / 50)
  if (phone || email) totalLines += 1
  if (website) totalLines += 1

  const lineSpacing = 10
  const totalTextHeight = totalLines * lineSpacing + 15
  let infoY = currentY + (headerHeight - totalTextHeight) / 2 + 12

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  const nameLines = doc.splitTextToSize(companyName, infoColumnWidth - 10)
  nameLines.forEach((line) => {
    doc.text(line, infoCenterX, infoY, { align: 'center' })
    infoY += 12
  })

  if (showBusinessName) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    doc.text(businessName, infoCenterX, infoY, { align: 'center' })
    infoY += 10
  }

  if (fullAddress) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MEDIUM_GRAY)
    const addrLines = doc.splitTextToSize(fullAddress, infoColumnWidth - 10)
    addrLines.slice(0, 2).forEach(line => {
      doc.text(line, infoCenterX, infoY, { align: 'center' })
      infoY += 9
    })
  }

  if (phone || email) {
    doc.setFontSize(7)
    doc.setTextColor(...MEDIUM_GRAY)
    let contactLine = ''
    if (phone) contactLine += `Tel: ${phone}`
    if (phone && email) contactLine += '  |  '
    if (email) contactLine += `Email: ${email}`
    doc.text(contactLine, infoCenterX, infoY, { align: 'center' })
    infoY += 9
  }

  if (website) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK_GRAY)
    doc.text(website, infoCenterX, infoY, { align: 'center' })
  }

  // ===== COLUMNA 3: RECUADRO DEL DOCUMENTO =====
  const docBoxY = currentY

  // Altura de la sección del RUC (parte superior con fondo de color)
  const rucSectionHeight = 26

  // Fondo de color para la sección del RUC
  doc.setFillColor(...ACCENT_COLOR)
  doc.rect(docBoxX, docBoxY, docColumnWidth, rucSectionHeight, 'F')

  // Recuadro completo con borde
  doc.setDrawColor(...BLACK)
  doc.setLineWidth(1.5)
  doc.rect(docBoxX, docBoxY, docColumnWidth, headerHeight)

  // Línea separadora después del RUC
  const rucLineY = docBoxY + rucSectionHeight
  doc.setLineWidth(0.5)
  doc.line(docBoxX, rucLineY, docBoxX + docColumnWidth, rucLineY)

  // RUC (texto blanco sobre fondo de color)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(`R.U.C. ${companySettings?.ruc || ''}`, docBoxX + docColumnWidth / 2, docBoxY + 16, { align: 'center' })
  doc.setTextColor(...BLACK) // Restaurar color negro

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  const titleY = rucLineY + 18
  doc.text('COTIZACIÓN', docBoxX + docColumnWidth / 2, titleY, { align: 'center' })

  doc.setFontSize(12)
  const numberY = titleY + 20
  doc.text(quotation.number || 'N/A', docBoxX + docColumnWidth / 2, numberY, { align: 'center' })

  currentY += headerHeight + 15

  // ========== 2. DATOS DEL CLIENTE (DOS COLUMNAS) ==========

  doc.setFontSize(9)
  doc.setTextColor(...BLACK)

  const colLeftX = MARGIN_LEFT
  const colRightX = MARGIN_LEFT + CONTENT_WIDTH * 0.5 + 10
  const colWidth = CONTENT_WIDTH * 0.5 - 10
  const dataLineHeight = 12

  const leftLabels = ['RAZÓN SOCIAL:', 'RUC:', 'DIRECCIÓN:']
  const rightLabels = ['EMISIÓN:', 'VÁLIDO HASTA:', 'MONEDA:']

  doc.setFont('helvetica', 'bold')
  let maxLeftLabel = 0
  leftLabels.forEach(l => { maxLeftLabel = Math.max(maxLeftLabel, doc.getTextWidth(l)) })
  let maxRightLabel = 0
  rightLabels.forEach(l => { maxRightLabel = Math.max(maxRightLabel, doc.getTextWidth(l)) })

  const leftValueX = colLeftX + maxLeftLabel + 5
  const rightValueX = colRightX + maxRightLabel + 5

  // Formato dd/mm/yyyy para emisión
  let quotationDate = new Date().toLocaleDateString('es-PE')
  const dateSource = quotation.createdAt || quotation.issueDate
  if (dateSource) {
    if (typeof dateSource === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateSource)) {
      const [year, month, day] = dateSource.split('-')
      quotationDate = `${day}/${month}/${year}`
    } else if (dateSource.toDate) {
      const date = dateSource.toDate()
      quotationDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
    } else if (dateSource instanceof Date) {
      quotationDate = `${String(dateSource.getDate()).padStart(2, '0')}/${String(dateSource.getMonth() + 1).padStart(2, '0')}/${dateSource.getFullYear()}`
    }
  }

  // Fecha de validez
  let expiryDateStr = '-'
  if (quotation.expiryDate) {
    if (typeof quotation.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(quotation.expiryDate)) {
      const [year, month, day] = quotation.expiryDate.split('-')
      expiryDateStr = `${day}/${month}/${year}`
    } else if (quotation.expiryDate.toDate) {
      const date = quotation.expiryDate.toDate()
      expiryDateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
    } else if (quotation.expiryDate instanceof Date) {
      expiryDateStr = `${String(quotation.expiryDate.getDate()).padStart(2, '0')}/${String(quotation.expiryDate.getMonth() + 1).padStart(2, '0')}/${quotation.expiryDate.getFullYear()}`
    }
  } else if (quotation.validityDays) {
    expiryDateStr = `${quotation.validityDays} días desde emisión`
  }

  const docType = quotation.customer?.documentType === 'RUC' ? 'RUC' :
                  quotation.customer?.documentType === 'DNI' ? 'DNI' : 'DOC'
  const docNumber = quotation.customer?.documentNumber && quotation.customer.documentNumber !== '00000000'
                    ? quotation.customer.documentNumber : '-'
  const customerAddress = quotation.customer?.address || '-'

  const startY = currentY

  // ===== COLUMNA IZQUIERDA =====
  let leftY = startY

  doc.setFont('helvetica', 'bold')
  doc.text('RAZÓN SOCIAL:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  const customerName = quotation.customer?.name || 'CLIENTE GENERAL'
  const customerNameLines = doc.splitTextToSize(customerName, colWidth - maxLeftLabel - 10)
  doc.text(customerNameLines[0], leftValueX, leftY)
  leftY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text(`${docType}:`, colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  doc.text(docNumber, leftValueX, leftY)
  leftY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('DIRECCIÓN:', colLeftX, leftY)
  doc.setFont('helvetica', 'normal')
  const addrLines = doc.splitTextToSize(customerAddress, colWidth - maxLeftLabel - 10)
  doc.text(addrLines[0], leftValueX, leftY)
  if (addrLines[1]) {
    leftY += 10
    doc.text(addrLines[1], leftValueX, leftY)
  }
  leftY += dataLineHeight

  // ===== COLUMNA DERECHA =====
  let rightY = startY

  doc.setFont('helvetica', 'bold')
  doc.text('EMISIÓN:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(quotationDate, rightValueX, rightY)
  rightY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('VÁLIDO HASTA:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text(expiryDateStr, rightValueX, rightY)
  rightY += dataLineHeight

  doc.setFont('helvetica', 'bold')
  doc.text('MONEDA:', colRightX, rightY)
  doc.setFont('helvetica', 'normal')
  doc.text('SOLES', rightValueX, rightY)
  rightY += dataLineHeight

  currentY = Math.max(leftY, rightY) + 10

  // ========== PREPARAR DATOS ==========

  let bankAccountsArray = []
  if (companySettings?.bankAccountsList && Array.isArray(companySettings.bankAccountsList) && companySettings.bankAccountsList.length > 0) {
    bankAccountsArray = companySettings.bankAccountsList.map(acc => ({
      bank: acc.bank || '',
      accountType: acc.accountType || 'corriente',
      currency: acc.currency === 'USD' ? 'DÓLARES' : 'SOLES',
      accountNumber: acc.accountNumber || '',
      cci: acc.cci || ''
    }))
  } else if (companySettings?.bankAccounts) {
    if (typeof companySettings.bankAccounts === 'string' && companySettings.bankAccounts.trim()) {
      bankAccountsArray = companySettings.bankAccounts.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(':')
          if (parts.length >= 2) {
            return { bank: parts[0].trim(), currency: 'SOLES', accountNumber: parts.slice(1).join(':').trim(), cci: '' }
          }
          return { bank: line.trim(), currency: 'SOLES', accountNumber: '', cci: '' }
        })
    }
  }

  // ========== CALCULAR POSICIONES FIJAS ==========

  const FOOTER_TEXT_HEIGHT = 25
  const QR_BOX_HEIGHT = 0 // No hay QR en cotizaciones
  const BANK_ROWS = Math.max(bankAccountsArray.length, 2)
  const BANK_TABLE_HEIGHT = bankAccountsArray.length > 0 ? (14 + BANK_ROWS * 13) : 0
  const TOTALS_SECTION_HEIGHT = 55
  const SON_SECTION_HEIGHT = 22
  const TERMS_HEIGHT = quotation.terms ? 60 : 0
  const NOTES_HEIGHT = quotation.notes ? 40 : 0

  const FOOTER_AREA_START = PAGE_HEIGHT - MARGIN_BOTTOM - FOOTER_TEXT_HEIGHT - Math.max(QR_BOX_HEIGHT, BANK_TABLE_HEIGHT) - 10 - TOTALS_SECTION_HEIGHT - SON_SECTION_HEIGHT - TERMS_HEIGHT - NOTES_HEIGHT - 15

  // ========== 3. TABLA DE PRODUCTOS ==========

  const tableY = currentY
  const headerRowHeight = 18
  const productRowHeight = 15

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

  const availableHeight = FOOTER_AREA_START - tableY - headerRowHeight
  const items = quotation.items || []

  // Calcular altura dinámica para cada item basado en la descripción
  const calculateItemHeight = (item) => {
    const baseHeight = productRowHeight
    const itemName = item.name || ''
    // Solo mostrar código si es un código "real" (no vacío, no CUSTOM)
    const rawCode = item.code || item.productCode || ''
    const isValidCode = rawCode && rawCode.trim() !== '' && rawCode.toUpperCase() !== 'CUSTOM'
    const itemDesc = isValidCode ? `${rawCode} - ${itemName}` : itemName
    // La descripción adicional del producto
    const productDescription = item.description || ''

    // Calcular líneas necesarias para el nombre
    doc.setFontSize(7)
    const nameLines = doc.splitTextToSize(itemDesc, colWidths.desc - 10)

    // Calcular líneas necesarias para la descripción (si existe)
    let descLines = []
    if (productDescription && productDescription.trim()) {
      doc.setFontSize(6)
      descLines = doc.splitTextToSize(productDescription, colWidths.desc - 10)
    }

    const totalLines = nameLines.length + descLines.length
    const minHeight = baseHeight
    const calculatedHeight = Math.max(minHeight, 10 + (totalLines * 8))

    return { height: calculatedHeight, nameLines, descLines }
  }

  // Calcular alturas de todos los items
  const itemHeights = items.map(item => calculateItemHeight(item))
  const totalItemsHeight = itemHeights.reduce((sum, ih) => sum + ih.height, 0)

  // Sin filas vacías - solo mostrar productos reales
  const tableHeight = headerRowHeight + totalItemsHeight

  // Encabezado de tabla con color de acento
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
  doc.setFontSize(7)

  const unitLabels = {
    'UNIDAD': 'UND', 'CAJA': 'CAJA', 'KG': 'KG', 'LITRO': 'LT',
    'METRO': 'MT', 'HORA': 'HR', 'SERVICIO': 'SERV'
  }

  // Renderizar items con alturas dinámicas
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const { height: rowHeight, nameLines, descLines } = itemHeights[i]

    // Filas alternadas (gris primero, luego blanco)
    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 248)
      doc.rect(MARGIN_LEFT, dataRowY, CONTENT_WIDTH, rowHeight, 'F')
    }

    const precioConIGV = item.unitPrice || item.price || 0
    const importeConIGV = item.quantity * precioConIGV
    const textY = dataRowY + 10

    doc.setTextColor(...BLACK)
    doc.setFontSize(7)

    const quantityText = Number.isInteger(item.quantity) ? item.quantity.toString() : item.quantity.toFixed(2)
    doc.text(quantityText, cols.cant + colWidths.cant / 2, textY, { align: 'center' })

    const unitCode = item.unit || 'UNIDAD'
    const unitText = unitLabels[unitCode] || unitCode
    doc.text(unitText, cols.um + colWidths.um / 2, textY, { align: 'center' })

    // Nombre del producto (puede ser múltiples líneas)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    let currentDescY = textY
    nameLines.forEach((line, idx) => {
      doc.text(line, cols.desc + 4, currentDescY)
      currentDescY += 8
    })

    // Descripción del producto (debajo del nombre, en gris, mismo tamaño pero normal)
    if (descLines.length > 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...MEDIUM_GRAY)
      descLines.forEach((line) => {
        doc.text(line, cols.desc + 4, currentDescY)
        currentDescY += 8
      })
      doc.setTextColor(...BLACK)
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(precioConIGV.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.pu + colWidths.pu - 5, textY, { align: 'right' })
    doc.text(importeConIGV.toLocaleString('es-PE', { minimumFractionDigits: 2 }), cols.total + colWidths.total - 5, textY, { align: 'right' })

    dataRowY += rowHeight
  }

  // ========== 4. PIE DE PÁGINA ==========

  let footerY = tableY + tableHeight + 8

  // ========== SON: (MONTO EN LETRAS) ==========
  const montoEnLetras = numeroALetras(quotation.total || 0) + ' SOLES'

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN_LEFT, footerY, CONTENT_WIDTH, SON_SECTION_HEIGHT)

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BLACK)
  doc.text('SON:', MARGIN_LEFT + 5, footerY + 14)
  doc.setFont('helvetica', 'normal')
  const letrasLines = doc.splitTextToSize(montoEnLetras, CONTENT_WIDTH - 35)
  doc.text(letrasLines[0], MARGIN_LEFT + 28, footerY + 14)

  footerY += SON_SECTION_HEIGHT + 5

  // ========== FILA: BANCOS (izq) + TOTALES (der) ==========

  const totalsWidth = 160
  const totalsX = MARGIN_LEFT + CONTENT_WIDTH - totalsWidth
  const bankSectionWidth = totalsX - MARGIN_LEFT - 10

  const igvExempt = companySettings?.emissionConfig?.taxConfig?.igvExempt || companySettings?.taxConfig?.igvExempt || false
  const labelGravada = igvExempt ? 'OP. EXONERADA' : 'OP. GRAVADA'
  const hideIgv = quotation.hideIgv || false

  // --- TOTALES (derecha) ---
  const totalsRowHeight = 15
  const totalsStartY = footerY

  doc.setDrawColor(...BLACK)
  doc.setLineWidth(0.5)

  if (hideIgv) {
    // Solo mostrar TOTAL cuando hideIgv está activo
    doc.rect(totalsX, totalsStartY, totalsWidth, totalsRowHeight + 6)

    // Fila única: TOTAL
    doc.setFillColor(...ACCENT_COLOR)
    doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight + 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('TOTAL', totalsX + 5, footerY + 14)
    doc.setFontSize(11)
    doc.text('S/ ' + (quotation.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 14, { align: 'right' })
  } else {
    // Mostrar desglose completo: OP. GRAVADA, IGV, TOTAL
    const igvRate = companySettings?.emissionConfig?.taxConfig?.igvRate ?? companySettings?.taxConfig?.igvRate ?? 18
    doc.rect(totalsX, totalsStartY, totalsWidth, totalsRowHeight * 3 + 6)

    // Fila 1: OP. GRAVADA
    doc.setFillColor(250, 250, 250)
    doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.line(totalsX, footerY + totalsRowHeight, totalsX + totalsWidth, footerY + totalsRowHeight)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.text(labelGravada, totalsX + 5, footerY + 10)
    doc.text('S/ ' + (quotation.subtotal || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 10, { align: 'right' })
    footerY += totalsRowHeight

    // Fila 2: IGV
    doc.setFillColor(255, 255, 255)
    doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.line(totalsX, footerY + totalsRowHeight, totalsX + totalsWidth, footerY + totalsRowHeight)
    doc.text(`IGV (${igvRate}%)`, totalsX + 5, footerY + 10)
    doc.text('S/ ' + (quotation.igv || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 10, { align: 'right' })
    footerY += totalsRowHeight

    // Fila 3: TOTAL
    doc.setFillColor(...ACCENT_COLOR)
    doc.rect(totalsX, footerY, totalsWidth, totalsRowHeight + 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('TOTAL', totalsX + 5, footerY + 14)
    doc.setFontSize(11)
    doc.text('S/ ' + (quotation.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }), totalsX + totalsWidth - 5, footerY + 14, { align: 'right' })
  }

  // --- CUENTAS BANCARIAS (izquierda) ---
  doc.setTextColor(...BLACK)

  if (bankAccountsArray.length > 0) {
    const bankTableX = MARGIN_LEFT
    const bankTableWidth = bankSectionWidth

    // Función helper para truncar texto que exceda el ancho de columna
    const truncateText = (text, maxWidth, fontSize) => {
      doc.setFontSize(fontSize)
      let truncated = String(text || '')
      while (doc.getTextWidth(truncated) > maxWidth - 6 && truncated.length > 0) {
        truncated = truncated.slice(0, -1)
      }
      if (truncated.length < String(text || '').length && truncated.length > 0) {
        truncated = truncated.slice(0, -2) + '..'
      }
      return truncated
    }

    // Anchos de columna proporcionales al contenido
    const COL_BANCO = Math.floor(bankTableWidth * 0.28)  // ~28% para banco + tipo
    const COL_MONEDA = Math.floor(bankTableWidth * 0.15) // ~15% para moneda
    const COL_CUENTA = Math.floor(bankTableWidth * 0.30) // ~30% para número de cuenta
    const COL_CCI = bankTableWidth - COL_BANCO - COL_MONEDA - COL_CUENTA // resto para CCI

    const colStart = {
      banco: bankTableX,
      moneda: bankTableX + COL_BANCO,
      cuenta: bankTableX + COL_BANCO + COL_MONEDA,
      cci: bankTableX + COL_BANCO + COL_MONEDA + COL_CUENTA
    }

    const bankRowHeight = 12
    const bankHeaderHeight = 13
    let bankY = totalsStartY

    const bankTotalHeight = bankHeaderHeight + (bankAccountsArray.length * bankRowHeight)
    doc.setDrawColor(...BLACK)
    doc.setLineWidth(0.5)
    doc.rect(bankTableX, bankY, bankTableWidth, bankTotalHeight)

    doc.setFillColor(...ACCENT_COLOR)
    doc.rect(bankTableX, bankY, bankTableWidth, bankHeaderHeight, 'F')

    doc.setDrawColor(...BLACK)
    doc.line(colStart.moneda, bankY, colStart.moneda, bankY + bankTotalHeight)
    doc.line(colStart.cuenta, bankY, colStart.cuenta, bankY + bankTotalHeight)
    doc.line(colStart.cci, bankY, colStart.cci, bankY + bankTotalHeight)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('BANCO', colStart.banco + 2, bankY + 9)
    doc.text('MONEDA', colStart.moneda + 2, bankY + 9)
    doc.text('Nº CUENTA', colStart.cuenta + 2, bankY + 9)
    doc.text('CCI', colStart.cci + 2, bankY + 9)
    bankY += bankHeaderHeight

    doc.setTextColor(...BLACK)
    doc.setFont('helvetica', 'normal')

    bankAccountsArray.forEach((account, index) => {
      if (index > 0) {
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.3)
        doc.line(bankTableX, bankY, bankTableX + bankTableWidth, bankY)
      }

      // Mostrar banco con tipo de cuenta
      const accountTypeLabel = account.accountType === 'detracciones' ? ' (Detr.)'
        : account.accountType === 'ahorros' ? ' (Ah.)'
        : ''
      const bankLabel = `${account.bank || ''}${accountTypeLabel}`

      doc.setFontSize(7)
      doc.text(truncateText(bankLabel, COL_BANCO, 7), colStart.banco + 2, bankY + 8)
      doc.text(truncateText(account.currency || '', COL_MONEDA, 7), colStart.moneda + 2, bankY + 8)
      doc.text(truncateText(account.accountNumber || '', COL_CUENTA, 7), colStart.cuenta + 2, bankY + 8)
      doc.text(truncateText(account.cci || '-', COL_CCI, 7), colStart.cci + 2, bankY + 8)
      bankY += bankRowHeight
    })
  }

  // ========== TÉRMINOS Y NOTAS ==========

  footerY = totalsStartY + totalsRowHeight * 3 + 15

  if (quotation.terms) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('TÉRMINOS Y CONDICIONES:', MARGIN_LEFT, footerY)
    footerY += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...DARK_GRAY)
    const termsLines = doc.splitTextToSize(quotation.terms, CONTENT_WIDTH - 10)
    termsLines.slice(0, 4).forEach(line => {
      doc.text(line, MARGIN_LEFT + 5, footerY)
      footerY += 8
    })
    footerY += 5
  }

  if (quotation.notes) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BLACK)
    doc.text('OBSERVACIONES:', MARGIN_LEFT, footerY)
    footerY += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...DARK_GRAY)
    const notesLines = doc.splitTextToSize(quotation.notes, CONTENT_WIDTH - 10)
    notesLines.slice(0, 3).forEach(line => {
      doc.text(line, MARGIN_LEFT + 5, footerY)
      footerY += 8
    })
  }

  // ========== FOOTER FINAL ==========

  doc.setDrawColor(...MEDIUM_GRAY)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_LEFT, PAGE_HEIGHT - MARGIN_BOTTOM - 12, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - MARGIN_BOTTOM - 12)

  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MEDIUM_GRAY)
  const footerCompanyName = branding?.companyName || 'Cobrify'
  doc.text(`Documento generado en ${footerCompanyName} - Sistema de Facturación Electrónica`, MARGIN_LEFT + CONTENT_WIDTH / 2, PAGE_HEIGHT - MARGIN_BOTTOM - 3, { align: 'center' })

  // ========== GENERAR PDF ==========

  if (download) {
    const fileName = `Cotizacion_${quotation.number.replace(/\//g, '-')}.pdf`
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

        try {
          await Share.share({
            title: fileName,
            text: `Cotización: ${fileName}`,
            url: result.uri,
            dialogTitle: 'Compartir PDF'
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
 * Obtiene el PDF como blob para enviar por WhatsApp
 */
export const getQuotationPDFBlob = async (quotation, companySettings, branding = null) => {
  const doc = await generateQuotationPDF(quotation, companySettings, false, branding)
  return doc.output('blob')
}

/**
 * Obtiene el PDF como base64
 */
export const getQuotationPDFBase64 = async (quotation, companySettings, branding = null) => {
  const doc = await generateQuotationPDF(quotation, companySettings, false, branding)
  return doc.output('datauristring')
}

/**
 * Abre el PDF en una nueva pestaña para vista previa (o comparte en móvil)
 */
export const previewQuotationPDF = async (quotation, companySettings, branding = null) => {
  const doc = await generateQuotationPDF(quotation, companySettings, false, branding)
  const isNativePlatform = Capacitor.isNativePlatform()

  if (isNativePlatform) {
    try {
      // En móvil, guardar el PDF y abrirlo con Share para vista previa
      const pdfBase64 = doc.output('datauristring').split(',')[1]

      const fileName = `Cotizacion_${quotation.number?.replace(/\//g, '-') || 'cotizacion'}.pdf`

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
        title: `Cotización ${quotation.number || ''}`,
        url: result.uri,
        dialogTitle: 'Ver cotización'
      })

      return result.uri
    } catch (error) {
      console.error('Error al generar vista previa en móvil:', error)
      throw error
    }
  } else {
    // En web, abrir en nueva pestaña
    const blobUrl = doc.output('bloburl')
    window.open(blobUrl, '_blank')
    return blobUrl
  }
}
