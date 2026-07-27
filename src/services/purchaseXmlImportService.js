/**
 * Importación de compras desde el XML UBL 2.1 de una factura/boleta electrónica
 * que un PROVEEDOR le emitió al negocio (el XML que el proveedor entrega por
 * correo o link de descarga, o el ZIP que lo contiene).
 *
 * Este servicio solo PARSEA y MATCHEA (funciones puras, sin escrituras a
 * Firestore). La creación de proveedor/productos y el llenado del formulario
 * ocurren en CreatePurchase con los servicios existentes.
 */

// ==================== Helpers de navegación XML ====================
// Los XML de SUNAT usan namespaces (cac/cbc). Navegamos por localName para ser
// inmunes a los prefijos que cada PSE use.

const childrenByName = (el, name) => {
  if (!el) return []
  // .children no existe en todos los parsers DOM; fallback a childNodes con nodeType 1
  const kids = el.children
    ? Array.from(el.children)
    : Array.from(el.childNodes || []).filter(n => n.nodeType === 1)
  return kids.filter(c => c.localName === name)
}

const childByName = (el, name) => childrenByName(el, name)[0] || null

const textAt = (el, ...path) => {
  let cur = el
  for (const name of path) {
    cur = cur ? childByName(cur, name) : null
  }
  return cur ? (cur.textContent || '').trim() : ''
}

const numAt = (el, ...path) => {
  const t = textAt(el, ...path)
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

// ==================== Afectación IGV (catálogo 07) ====================

// Códigos de operaciones GRATUITAS (bonificaciones): el costo real es 0.
const GRATUITAS = new Set(['11', '12', '13', '14', '15', '16', '17', '21', '31', '32', '33', '34', '35', '36', '37'])

// Reduce cualquier código del catálogo 07 a la afectación base que maneja el
// formulario de compras: 10 (gravado), 20 (exonerado), 30 (inafecto).
const baseAffectation = (code) => {
  if (!code) return '10'
  if (code === '10' || code === '20' || code === '30') return code
  if (code.startsWith('1')) return '10'
  if (code === '21' || code.startsWith('2')) return '20'
  if (code.startsWith('3') || code === '40') return '30'
  return '10'
}

// ==================== Lectura del archivo ====================

/**
 * Lee un File (.xml o .zip) y devuelve el texto del XML de la factura.
 * En ZIP: busca la primera entrada .xml que contenga un <Invoice> (ignora CDR
 * R-*.xml que son ApplicationResponse).
 */
export const readXmlFile = async (file) => {
  const isZip = /\.zip$/i.test(file.name)
  if (!isZip) {
    return await file.text()
  }
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)
  const xmlEntries = Object.values(zip.files).filter(f => !f.dir && /\.xml$/i.test(f.name))
  if (xmlEntries.length === 0) {
    throw new Error('El ZIP no contiene ningún archivo XML')
  }
  // Preferir la entrada que sea un Invoice (el CDR es ApplicationResponse)
  for (const entry of xmlEntries) {
    const content = await entry.async('string')
    if (content.includes('<Invoice') || content.includes(':Invoice')) {
      return content
    }
  }
  throw new Error('El ZIP no contiene el XML de una factura (solo se encontró el CDR u otros archivos)')
}

// ==================== Parser principal ====================

/**
 * Parsea el XML UBL 2.1 de una factura/boleta.
 * @returns {{ success, data?, error? }}
 */
export const parseInvoiceXml = (xmlText) => {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
    const parseError = doc.getElementsByTagName('parsererror')[0]
    if (parseError) {
      return { success: false, error: 'El archivo no es un XML válido' }
    }

    const root = doc.documentElement
    if (root.localName === 'ApplicationResponse') {
      return { success: false, error: 'Este XML es el CDR (constancia de SUNAT), no la factura. Pide al proveedor el XML del comprobante.' }
    }
    if (root.localName === 'CreditNote' || root.localName === 'DebitNote') {
      return { success: false, error: 'Este XML es una nota de crédito/débito. Solo se pueden importar facturas y boletas.' }
    }
    if (root.localName !== 'Invoice') {
      return { success: false, error: `Tipo de documento no soportado (${root.localName})` }
    }

    // --- Cabecera ---
    const fullNumber = textAt(root, 'ID') // F002-00000224
    const issueDate = textAt(root, 'IssueDate') // YYYY-MM-DD
    const typeCode = textAt(root, 'InvoiceTypeCode') // 01 factura | 03 boleta
    const currency = (textAt(root, 'DocumentCurrencyCode') || 'PEN').toUpperCase()
    const notes = childrenByName(root, 'Note').map(n => (n.textContent || '').trim()).filter(Boolean)

    if (typeCode && typeCode !== '01' && typeCode !== '03') {
      return { success: false, error: `Tipo de comprobante ${typeCode} no soportado (solo factura 01 y boleta 03)` }
    }

    // --- Emisor (el proveedor) ---
    const supplierParty = childByName(childByName(root, 'AccountingSupplierParty'), 'Party')
    const supplierRuc = textAt(supplierParty, 'PartyIdentification', 'ID')
    const supplierLegal = childByName(supplierParty, 'PartyLegalEntity')
    const supplierName = textAt(supplierLegal, 'RegistrationName')
    const regAddress = childByName(supplierLegal, 'RegistrationAddress')
    // Dirección: AddressLine si existe; sino armar con distrito/provincia/departamento
    let supplierAddress = textAt(regAddress, 'AddressLine', 'Line')
    if (!supplierAddress && regAddress) {
      supplierAddress = [
        textAt(regAddress, 'District'),
        textAt(regAddress, 'CountrySubentity'),
        textAt(regAddress, 'Department'),
      ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')
    }

    // --- Receptor (debería ser el negocio del usuario) ---
    const customerParty = childByName(childByName(root, 'AccountingCustomerParty'), 'Party')
    const customerRuc = textAt(customerParty, 'PartyIdentification', 'ID')
    const customerName = textAt(customerParty, 'PartyLegalEntity', 'RegistrationName')

    // --- Forma de pago ---
    // PaymentTerms con ID=FormaPago: Contado | Credito | CuotaNNN (monto y fecha).
    // PaymentTerms con ID=Detraccion es OTRA cosa (SPOT): código catálogo 54,
    // porcentaje y monto a depositar al Banco de la Nación. Se extrae aparte.
    let paymentType = 'contado'
    const installments = []
    let detraction = null
    for (const pt of childrenByName(root, 'PaymentTerms')) {
      const ptId = textAt(pt, 'ID')
      if (ptId === 'Detraccion') {
        detraction = {
          code: textAt(pt, 'PaymentMeansID'),        // catálogo 54 (ej. 027 transporte)
          percent: numAt(pt, 'PaymentPercent'),
          amount: numAt(pt, 'Amount'),
        }
        continue
      }
      if (ptId !== 'FormaPago') continue
      const means = textAt(pt, 'PaymentMeansID')
      if (/^credito$/i.test(means)) paymentType = 'credito'
      if (/^cuota/i.test(means)) {
        installments.push({
          label: means,
          amount: numAt(pt, 'Amount'),
          dueDate: textAt(pt, 'PaymentDueDate') || null,
        })
      }
    }
    // Cuenta del BN para el depósito de la detracción (PaymentMeans ID=Detraccion)
    if (detraction) {
      for (const pm of childrenByName(root, 'PaymentMeans')) {
        if (textAt(pm, 'ID') === 'Detraccion') {
          detraction.account = textAt(pm, 'PayeeFinancialAccount', 'ID')
          break
        }
      }
    }
    // Vencimiento = fecha de la ÚLTIMA cuota
    const dueDate = installments
      .map(c => c.dueDate)
      .filter(Boolean)
      .sort()
      .pop() || null

    // --- Totales ---
    const monetaryTotal = childByName(root, 'LegalMonetaryTotal')
    const payableAmount = numAt(monetaryTotal, 'PayableAmount')
    const taxInclusiveAmount = numAt(monetaryTotal, 'TaxInclusiveAmount')

    // --- Líneas ---
    const lines = childrenByName(root, 'InvoiceLine').map((lineEl, idx) => {
      const qtyEl = childByName(lineEl, 'InvoicedQuantity')
      const quantity = qtyEl ? parseFloat(qtyEl.textContent) || 0 : 0
      const unitCode = qtyEl?.getAttribute('unitCode') || 'NIU'

      const itemEl = childByName(lineEl, 'Item')
      // Description puede venir en varias líneas; usamos la primera no vacía
      const description = childrenByName(itemEl, 'Description')
        .map(d => (d.textContent || '').trim())
        .filter(Boolean)[0] || `Ítem ${idx + 1}`
      const sellerCode = textAt(itemEl, 'SellersItemIdentification', 'ID')
      const gtin = textAt(itemEl, 'StandardItemIdentification', 'ID')

      // Afectación IGV de la línea (catálogo 07)
      const rawAffectation = textAt(lineEl, 'TaxTotal', 'TaxSubtotal', 'TaxCategory', 'TaxExemptionReasonCode') || '10'
      const isFree = GRATUITAS.has(rawAffectation)
      const taxAffectation = baseAffectation(rawAffectation)

      // Precio unitario CON IGV: PricingReference tipo 01 (precio de venta).
      // El tipo 02 es valor referencial de gratuitas (no es costo real).
      let priceWithIGV = 0
      const pricingRef = childByName(lineEl, 'PricingReference')
      for (const alt of childrenByName(pricingRef, 'AlternativeConditionPrice')) {
        if (textAt(alt, 'PriceTypeCode') === '01') {
          priceWithIGV = numAt(alt, 'PriceAmount')
          break
        }
      }
      // Valor unitario SIN IGV (cac:Price)
      const unitValue = numAt(childByName(lineEl, 'Price'), 'PriceAmount')

      // Total de la línea CON IGV = valor de venta + IGV de la línea. Es la
      // fuente más exacta para el costo unitario: el PriceAmount tipo 01 del
      // PricingReference viene redondeado a 2 decimales y en cantidades
      // grandes descuadra (ej. 200,000 und x 0.15 vs 0.1534 real).
      const lineExtension = numAt(lineEl, 'LineExtensionAmount')
      const lineTax = numAt(lineEl, 'TaxTotal', 'TaxAmount')
      const lineTotalWithIGV = lineExtension + lineTax

      // Costo unitario (con IGV) que usará el formulario de compras.
      let cost
      if (isFree) {
        cost = 0
      } else if (lineTotalWithIGV > 0 && quantity > 0) {
        cost = lineTotalWithIGV / quantity
      } else if (priceWithIGV > 0) {
        cost = priceWithIGV
      } else {
        cost = taxAffectation === '10' ? unitValue * 1.18 : unitValue
      }
      const costWithoutIGV = isFree
        ? 0
        : (quantity > 0 && lineExtension > 0
            ? lineExtension / quantity
            : (unitValue > 0 ? unitValue : (taxAffectation === '10' ? cost / 1.18 : cost)))

      return {
        lineNumber: idx + 1,
        description,
        sellerCode: sellerCode || '',
        gtin: gtin || '',
        quantity,
        unitCode,
        cost: Math.round(cost * 10000) / 10000,
        costWithoutIGV: Math.round(costWithoutIGV * 10000) / 10000,
        taxAffectation,
        isFree,
      }
    })

    if (lines.length === 0) {
      return { success: false, error: 'El XML no tiene líneas de detalle' }
    }

    return {
      success: true,
      data: {
        docType: typeCode === '03' ? 'boleta' : 'factura',
        fullNumber,
        issueDate,
        currency,
        supplier: { ruc: supplierRuc, name: supplierName, address: supplierAddress || '' },
        customer: { ruc: customerRuc, name: customerName },
        paymentType,
        dueDate,
        installments,
        detraction,
        payableAmount: payableAmount || taxInclusiveAmount,
        notes,
        lines,
      },
    }
  } catch (error) {
    console.error('Error al parsear XML de compra:', error)
    return { success: false, error: error.message || 'No se pudo leer el XML' }
  }
}

// ==================== Matching de líneas contra productos ====================

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenize = (s) => normalize(s).split(' ').filter(t => t.length >= 2)

/**
 * Matchea una línea del XML contra los productos del negocio.
 * Orden (de más a menos confiable):
 *   1. Código de proveedor APRENDIDO (product.supplierCodes[ruc] === sellerCode)
 *   2. Código de barras GTIN vs code/sku
 *   3. Código del proveedor vs code/sku propios
 *   4. Nombre normalizado idéntico
 *   5. Similitud por tokens (sugerencia, requiere confirmación)
 *
 * @returns {{ productId: string|null, matchedBy: string|null, confidence: 'exact'|'suggested'|'none' }}
 */
export const matchLineToProduct = (line, products, supplierRuc) => {
  const sellerCode = (line.sellerCode || '').trim()
  const gtin = (line.gtin || '').trim()

  // 1. Código aprendido de compras anteriores a ESTE proveedor
  if (sellerCode && supplierRuc) {
    const learned = products.find(p => p.supplierCodes?.[supplierRuc] === sellerCode)
    if (learned) return { productId: learned.id, matchedBy: 'aprendido', confidence: 'exact' }
  }

  // 2. GTIN / código de barras
  if (gtin) {
    const byGtin = products.find(p => p.code === gtin || p.sku === gtin)
    if (byGtin) return { productId: byGtin.id, matchedBy: 'código de barras', confidence: 'exact' }
  }

  // 3. Código del proveedor coincide con un código propio
  if (sellerCode) {
    const byCode = products.find(p => p.code === sellerCode || p.sku === sellerCode)
    if (byCode) return { productId: byCode.id, matchedBy: 'código', confidence: 'exact' }
  }

  // 4. Nombre idéntico (normalizado)
  const descNorm = normalize(line.description)
  if (descNorm) {
    const byName = products.find(p => normalize(p.name) === descNorm)
    if (byName) return { productId: byName.id, matchedBy: 'nombre', confidence: 'exact' }
  }

  // 5. Similitud por tokens: % de tokens de la descripción presentes en el nombre
  const descTokens = tokenize(line.description)
  if (descTokens.length >= 2) {
    let best = null
    let bestScore = 0
    for (const p of products) {
      const nameTokens = new Set(tokenize(p.name))
      if (nameTokens.size === 0) continue
      const hits = descTokens.filter(t => nameTokens.has(t)).length
      // Score bidireccional: penaliza nombres que solo comparten palabras sueltas
      const score = (hits / descTokens.length) * 0.6 + (hits / nameTokens.size) * 0.4
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
    if (best && bestScore >= 0.6) {
      return { productId: best.id, matchedBy: 'nombre parecido', confidence: 'suggested' }
    }
  }

  return { productId: null, matchedBy: null, confidence: 'none' }
}
