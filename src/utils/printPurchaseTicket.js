import { Capacitor } from '@capacitor/core'
import { getCurrencySymbol, normalizeCurrency } from '@/utils/currency'

// ============================================================
// IMPRESIÓN DE TICKET TÉRMICO PARA COMPRAS REGISTRADAS
// ------------------------------------------------------------
// Genera un ticket angosto (58mm / 80mm) con el detalle de una
// compra y lo manda a imprimir. Funciona en web (ventana
// emergente que se auto-imprime) y en la app (iframe oculto).
// Es un documento INTERNO de registro, no un comprobante SUNAT.
// ============================================================

/**
 * Imprime HTML usando iframe oculto (app nativa) o ventana emergente (web)
 */
const printHTML = (html) => {
  if (Capacitor.isNativePlatform()) {
    const existing = document.getElementById('print-iframe-purchase')
    if (existing) existing.remove()

    const iframe = document.createElement('iframe')
    iframe.id = 'print-iframe-purchase'
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()

    iframe.contentWindow.onload = () => {
      iframe.contentWindow.print()
      setTimeout(() => iframe.remove(), 1000)
    }
    setTimeout(() => {
      try { iframe.contentWindow.print() } catch (e) { /* ya se imprimió */ }
      setTimeout(() => iframe.remove(), 1000)
    }, 500)
  } else {
    const printWindow = window.open('', '_blank', 'width=320,height=600')
    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes para imprimir el ticket')
      return
    }
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

/**
 * Lee el ancho de papel guardado por el dispositivo (58 o 80mm)
 */
const getSavedPaperWidth = () => {
  try {
    const saved = localStorage.getItem('factuya_printerConfig')
    if (saved) {
      const cfg = JSON.parse(saved)
      if (cfg.paperWidth === 58 || cfg.paperWidth === 80) return cfg.paperWidth
    }
  } catch { /* ignore */ }
  return 80
}

// Etiqueta del tipo de documento de la compra
const getDocTypeLabel = (type) => {
  switch (type) {
    case 'factura': return 'Factura'
    case 'boleta': return 'Boleta'
    case 'guia_interna': return 'Guia interna'
    case 'dam': return 'DAM'
    case 'dua': return 'DUA'
    case 'nota_credito': return 'Nota de Credito'
    case 'ticket': return 'Ticket'
    case 'otros': return 'Otros'
    default: return 'Factura'
  }
}

// Convierte string YYYY-MM-DD, Timestamp Firestore o Date a DD/MM/YYYY
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

const escapeHtml = (str) => String(str ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

/**
 * Imprime el ticket térmico de una compra registrada
 * @param {Object} purchase - La compra (supplier, items, total, etc.)
 * @param {Object} businessInfo - Datos del negocio (logo, ruc, nombre, dirección...)
 * @param {number|null} paperWidth - Ancho del papel (58 o 80). Si es null, usa el guardado.
 */
export const printPurchaseTicket = (purchase, businessInfo = {}, paperWidth = null) => {
  const width = paperWidth || getSavedPaperWidth()
  const is58mm = width === 58

  // Moneda
  const cur = getCurrencySymbol(normalizeCurrency(purchase?.currency))
  const money = (n) => `${cur} ${Number(n || 0).toFixed(2)}`

  // Datos del negocio (comprador) para el encabezado
  const bizName = (businessInfo.tradeName || businessInfo.name || businessInfo.businessName || 'MI EMPRESA').toUpperCase()
  const bizRuc = businessInfo.ruc || ''
  const bizAddress = businessInfo.address || ''
  const bizPhone = businessInfo.phone || ''
  const logoUrl = businessInfo.logoUrl || ''

  // Datos de la compra
  const supplierName = (purchase.supplier?.businessName || purchase.supplier?.name || 'Proveedor').toUpperCase()
  const supplierDocType = (purchase.supplier?.documentType || 'RUC').toUpperCase()
  const supplierDoc = purchase.supplier?.documentNumber || purchase.supplier?.ruc || '-'
  const invoiceNumber = purchase.invoiceNumber || 'S/N'
  const docTypeLabel = getDocTypeLabel(purchase.invoiceDocType)
  const dateStr = formatDateValue(purchase.invoiceDate || purchase.createdAt)
  const paymentText = purchase.paymentType === 'credito'
    ? (purchase.paymentStatus === 'paid' ? 'CREDITO (PAGADO)' : 'CREDITO (PENDIENTE)')
    : 'CONTADO'

  const hasBreakdown = (purchase.subtotal != null && purchase.subtotal !== 0) || (purchase.igv != null && purchase.igv !== 0)
  const items = purchase.items || []

  const itemsHtml = items.map(item => {
    const name = escapeHtml((item.productName || item.name || '').toUpperCase())
    const qty = item.quantity || 0
    const qtyFormatted = Number.isInteger(qty) ? qty.toString() : qty.toFixed(2)
    const unitPrice = item.unitPrice || item.price || 0
    const importe = qty * unitPrice
    const unit = item.unit ? ` ${escapeHtml(String(item.unit).toLowerCase())}` : ''
    return `
      <div class="item-row">
        <div class="qty">${qtyFormatted}</div>
        <div class="desc">${name}</div>
        <div class="price">${money(importe)}</div>
      </div>
      <div class="item-sub">${qtyFormatted}${unit} x ${money(unitPrice)}</div>
    `
  }).join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Compra ${escapeHtml(invoiceNumber)}</title>
      <style>
        @page { size: ${width}mm auto; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Arial, sans-serif;
          font-size: ${is58mm ? '8pt' : '9pt'};
          line-height: 1.3;
          padding: ${is58mm ? '1.5mm 4mm' : '2mm 6mm'};
          width: ${width}mm;
          background: #fff;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          margin: 0 auto;
        }
        @media print {
          body { width: ${width}mm !important; max-width: ${width}mm !important; margin: 0 auto !important; overflow: hidden; }
        }
        .header { text-align: center; margin-bottom: ${is58mm ? '2mm' : '3mm'}; }
        .header .logo {
          max-width: ${is58mm ? '120px' : '160px'};
          max-height: ${is58mm ? '120px' : '160px'};
          width: auto; height: auto;
          margin: 0 auto ${is58mm ? '1mm' : '1.5mm'};
          object-fit: contain; display: block;
        }
        /* Logos cuadrados: 40% mas pequenos para que no ocupen tanto */
        .header .logo.logo-square {
          max-width: ${is58mm ? '72px' : '96px'};
          max-height: ${is58mm ? '72px' : '96px'};
        }
        .biz-name { font-size: ${is58mm ? '11pt' : '12pt'}; font-weight: bold; margin-bottom: 0.5mm; }
        .biz-info { font-size: ${is58mm ? '7pt' : '8pt'}; margin: 0.3mm 0; }
        .doc-title {
          font-size: ${is58mm ? '12pt' : '13pt'};
          font-weight: bold;
          margin: ${is58mm ? '1.5mm' : '2mm'} 0 0.5mm;
          letter-spacing: 1px;
        }
        .doc-number { font-size: ${is58mm ? '10pt' : '11pt'}; font-weight: bold; }
        .separator { border-top: 1px dashed #000; margin: ${is58mm ? '2mm' : '2.5mm'} 0; }
        .info-row {
          display: flex; justify-content: space-between;
          font-size: ${is58mm ? '7.5pt' : '8.5pt'};
          margin-bottom: 0.5mm; gap: 4mm;
        }
        .info-row .lbl { font-weight: bold; white-space: nowrap; }
        .info-row .val { text-align: right; word-break: break-word; }
        .items-header {
          display: flex; justify-content: space-between;
          border-top: 1px dashed #000; border-bottom: 1px solid #000;
          padding: ${is58mm ? '1mm' : '1.5mm'} 0;
          font-weight: bold; font-size: ${is58mm ? '7.5pt' : '8.5pt'};
          margin: ${is58mm ? '2mm' : '2.5mm'} 0 1mm;
        }
        .items-header .qty, .item-row .qty { width: ${is58mm ? '24px' : '32px'}; text-align: center; }
        .items-header .desc, .item-row .desc { flex: 1; text-align: left; padding: 0 1mm; word-wrap: break-word; }
        .items-header .price, .item-row .price { width: ${is58mm ? '52px' : '64px'}; text-align: right; }
        .item-row { display: flex; justify-content: space-between; font-size: ${is58mm ? '7.5pt' : '8.5pt'}; margin-top: 1mm; }
        .item-row .qty { font-weight: bold; }
        .item-row .desc { font-weight: bold; }
        .item-sub {
          font-size: ${is58mm ? '6.5pt' : '7.5pt'};
          color: #444; margin-left: ${is58mm ? '24px' : '32px'};
          padding-bottom: 1mm; border-bottom: 1px dotted #ccc;
        }
        .totals { margin-top: ${is58mm ? '2mm' : '3mm'}; border-top: 1px dashed #000; padding-top: ${is58mm ? '2mm' : '2.5mm'}; }
        .totals .row { display: flex; justify-content: space-between; font-size: ${is58mm ? '8pt' : '9pt'}; margin-bottom: 0.5mm; }
        .totals .total {
          font-size: ${is58mm ? '11pt' : '12pt'}; font-weight: bold;
          border-top: 1px solid #000; padding-top: ${is58mm ? '1.5mm' : '2mm'}; margin-top: 1mm;
        }
        .notes { margin-top: ${is58mm ? '2mm' : '3mm'}; font-size: ${is58mm ? '7pt' : '8pt'}; }
        .notes .lbl { font-weight: bold; }
        .footer {
          text-align: center; margin-top: ${is58mm ? '3mm' : '4mm'};
          padding-top: ${is58mm ? '2mm' : '3mm'}; border-top: 1px dashed #000;
          font-size: ${is58mm ? '7pt' : '8pt'};
        }
        .footer .tag { font-size: ${is58mm ? '10pt' : '11pt'}; font-weight: bold; margin-bottom: 1.5mm; letter-spacing: 1px; }
      </style>
    </head>
    <body>
      <div class="header">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" class="logo" onload="if(this.naturalWidth&&Math.abs(this.naturalWidth-this.naturalHeight)/Math.max(this.naturalWidth,this.naturalHeight)<0.2){this.classList.add('logo-square')}" />` : ''}
        <div class="biz-name">${escapeHtml(bizName)}</div>
        ${bizRuc ? `<div class="biz-info">RUC: ${escapeHtml(bizRuc)}</div>` : ''}
        ${bizAddress ? `<div class="biz-info">${escapeHtml(bizAddress.toUpperCase())}</div>` : ''}
        ${bizPhone ? `<div class="biz-info">Tel: ${escapeHtml(bizPhone)}</div>` : ''}
        <div class="doc-title">COMPRA</div>
        <div class="doc-number">${escapeHtml(invoiceNumber)}</div>
      </div>

      <div class="separator"></div>

      <div class="section">
        <div class="info-row"><span class="lbl">PROVEEDOR:</span><span class="val">${escapeHtml(supplierName)}</span></div>
        <div class="info-row"><span class="lbl">${escapeHtml(supplierDocType)}:</span><span class="val">${escapeHtml(supplierDoc)}</span></div>
        <div class="info-row"><span class="lbl">TIPO DOC:</span><span class="val">${escapeHtml(docTypeLabel)}</span></div>
        <div class="info-row"><span class="lbl">FECHA:</span><span class="val">${dateStr}</span></div>
        <div class="info-row"><span class="lbl">PAGO:</span><span class="val">${paymentText}</span></div>
      </div>

      <div class="items-header">
        <div class="qty">CANT</div>
        <div class="desc">DESCRIPCION</div>
        <div class="price">IMPORTE</div>
      </div>

      ${itemsHtml}

      <div class="totals">
        ${hasBreakdown ? `
        <div class="row"><span>SUBTOTAL:</span><span>${money(purchase.subtotal)}</span></div>
        <div class="row"><span>IGV (18%):</span><span>${money(purchase.igv)}</span></div>
        ` : ''}
        <div class="row total"><span>TOTAL:</span><span>${money(purchase.total)}</span></div>
        ${normalizeCurrency(purchase?.currency) === 'USD' && purchase.exchangeRate ? `
        <div class="row" style="font-size:${is58mm ? '6.5pt' : '7.5pt'};color:#444;"><span>T.C. ${purchase.exchangeRate}</span><span>~ S/ ${(Number(purchase.total || 0) * Number(purchase.exchangeRate || 1)).toFixed(2)}</span></div>
        ` : ''}
      </div>

      ${purchase.notes ? `
      <div class="notes">
        <span class="lbl">OBSERVACIONES:</span> ${escapeHtml(purchase.notes)}
      </div>
      ` : ''}

      <div class="footer">
        <div class="tag">*** COMPRA ***</div>
        <p>Documento interno de registro</p>
        <p>No valido como comprobante de pago</p>
      </div>

      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 100);
        };
      </script>
    </body>
    </html>
  `

  printHTML(html)
}
