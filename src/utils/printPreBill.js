/**
 * Utility para imprimir precuenta de restaurante
 */

export const printPreBill = (table, order, businessInfo = {}, taxConfig = { igvRate: 18, igvExempt: false }, paperWidth = 80) => {
  // Crear una ventana temporal para imprimir
  const printWindow = window.open('', '_blank', 'width=300,height=600')

  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes para imprimir')
    return
  }

  const currentDate = new Date()
  const dateStr = currentDate.toLocaleDateString('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const timeStr = currentDate.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })

  // Determinar si es papel de 58mm o 80mm
  const is58mm = paperWidth === 58

  // Recalcular totales según taxConfig actual
  // Esto asegura que si la empresa cambió su estado de exoneración,
  // la precuenta muestre los valores correctos
  console.log('🔍 printPreBill - taxConfig recibido:', taxConfig)
  console.log('🔍 printPreBill - igvExempt:', taxConfig.igvExempt)
  console.log('🔍 printPreBill - igvRate:', taxConfig.igvRate)

  let subtotal, tax, total
  total = order.total || 0

  if (taxConfig.igvExempt) {
    // Si está exonerado, el total es igual al subtotal y no hay IGV
    subtotal = total
    tax = 0
  } else {
    // Si no está exonerado, calcular IGV dinámicamente
    const igvRate = taxConfig.igvRate || 18
    const igvMultiplier = 1 + (igvRate / 100) // Ej: 1.18 para 18%
    subtotal = total / igvMultiplier // Precio sin IGV
    tax = total - subtotal // IGV = Total - Subtotal
  }

  // Generar HTML para imprimir
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Precuenta - Mesa ${table.number}</title>
      <style>
        @page {
          size: ${paperWidth}mm auto;
          margin: 0;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: Arial, sans-serif;
          font-size: ${is58mm ? '8pt' : '9pt'};
          font-weight: normal;
          line-height: 1.2;
          padding: ${is58mm ? '1.5mm 5mm' : '2mm 6mm'};
          width: ${paperWidth}mm;
          background: white;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          text-transform: uppercase;
          margin: 0 auto;
        }

        @media print {
          body {
            width: ${paperWidth}mm !important;
            max-width: ${paperWidth}mm !important;
            margin: 0 auto !important;
            padding: ${is58mm ? '1.5mm 5mm' : '2mm 6mm'} !important;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
          }
        }

        .header {
          text-align: center;
          margin-bottom: ${is58mm ? '2mm' : '3mm'};
          padding-bottom: ${is58mm ? '1.5mm' : '2mm'};
        }

        .header .logo {
          max-width: ${is58mm ? '140px' : '200px'};
          max-height: ${is58mm ? '140px' : '200px'};
          width: auto;
          height: auto;
          margin: 0 auto ${is58mm ? '1mm' : '1.5mm'};
          object-fit: contain;
          display: block;
        }

        .header .logo.square-logo {
          max-width: ${is58mm ? '70px' : '100px'};
          max-height: ${is58mm ? '70px' : '100px'};
        }

        .header h1 {
          font-size: ${is58mm ? '11pt' : '12pt'};
          font-weight: bold;
          margin: ${is58mm ? '1mm' : '1.5mm'} 0;
          letter-spacing: 0.5px;
        }

        .header .business-name {
          font-size: ${is58mm ? '10pt' : '11pt'};
          font-weight: bold;
          margin-bottom: ${is58mm ? '0.5mm' : '1mm'};
        }

        .header .info {
          font-size: ${is58mm ? '7pt' : '8pt'};
          font-weight: normal;
          color: #000;
          margin: ${is58mm ? '0.3mm' : '0.5mm'} 0;
        }

        .separator {
          border-top: 1px dashed #000;
          margin: ${is58mm ? '2mm' : '3mm'} 0;
        }

        .section {
          margin-bottom: ${is58mm ? '2mm' : '3mm'};
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: ${is58mm ? '0.5mm' : '1mm'};
          font-size: ${is58mm ? '7pt' : '8pt'};
          font-weight: normal;
        }

        .info-row strong {
          font-weight: bold;
        }

        .items-header {
          border-top: 1px dashed #000;
          border-bottom: 1px solid #000;
          padding: ${is58mm ? '1mm' : '1.5mm'} 0;
          font-weight: bold;
          font-size: ${is58mm ? '7pt' : '8pt'};
          margin: ${is58mm ? '2mm' : '3mm'} 0 ${is58mm ? '1mm' : '1.5mm'} 0;
          display: flex;
          justify-content: space-between;
        }

        .items-header .qty {
          width: ${is58mm ? '25px' : '35px'};
          text-align: center;
        }

        .items-header .desc {
          flex: 1;
          text-align: left;
        }

        .items-header .price {
          width: ${is58mm ? '50px' : '60px'};
          text-align: right;
        }

        .item-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: ${is58mm ? '1mm' : '1.5mm'};
          font-size: ${is58mm ? '7pt' : '8pt'};
          font-weight: normal;
          padding-bottom: ${is58mm ? '0.5mm' : '1mm'};
          border-bottom: 1px dotted #ccc;
        }

        .item-row .qty {
          width: ${is58mm ? '25px' : '35px'};
          text-align: center;
          font-weight: bold;
        }

        .item-row .desc {
          flex: 1;
          text-align: left;
          padding: 0 ${is58mm ? '1mm' : '2mm'};
          word-wrap: break-word;
          white-space: normal;
        }

        .item-row .price {
          width: ${is58mm ? '50px' : '60px'};
          text-align: right;
          font-weight: bold;
        }

        .item-notes {
          font-size: ${is58mm ? '6pt' : '7pt'};
          font-style: italic;
          margin-left: ${is58mm ? '25px' : '35px'};
          margin-top: ${is58mm ? '0.5mm' : '1mm'};
          margin-bottom: ${is58mm ? '1mm' : '1.5mm'};
          color: #666;
        }

        .totals {
          margin-top: ${is58mm ? '2mm' : '3mm'};
          border-top: 1px dashed #000;
          padding-top: ${is58mm ? '2mm' : '3mm'};
        }

        .totals .row {
          display: flex;
          justify-content: space-between;
          margin-bottom: ${is58mm ? '0.5mm' : '1mm'};
          font-size: ${is58mm ? '8pt' : '9pt'};
          font-weight: normal;
        }

        .totals .total {
          font-size: ${is58mm ? '10pt' : '11pt'};
          font-weight: bold;
          border-top: 1px solid #000;
          padding-top: ${is58mm ? '1.5mm' : '2mm'};
          margin-top: ${is58mm ? '1mm' : '1.5mm'};
        }

        .footer {
          text-align: center;
          margin-top: ${is58mm ? '3mm' : '4mm'};
          padding-top: ${is58mm ? '2mm' : '3mm'};
          border-top: 1px dashed #000;
          font-size: ${is58mm ? '7pt' : '8pt'};
          font-weight: normal;
        }

        .footer .precuenta {
          font-size: ${is58mm ? '11pt' : '12pt'};
          font-weight: bold;
          margin-bottom: ${is58mm ? '2mm' : '3mm'};
          letter-spacing: 0.5px;
        }

        .exempt-notice {
          background-color: #fef3c7;
          color: #92400e;
          padding: ${is58mm ? '1.5mm' : '2mm'};
          border-radius: 2px;
          font-size: ${is58mm ? '7pt' : '8pt'};
          margin-bottom: ${is58mm ? '1mm' : '1.5mm'};
          text-transform: none;
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${businessInfo.logoUrl ? `<img src="${businessInfo.logoUrl}" alt="Logo" class="logo" onload="
          const img = this;
          const aspectRatio = img.naturalWidth / img.naturalHeight;
          if (aspectRatio >= 0.8 && aspectRatio <= 1.2) {
            img.classList.add('square-logo');
          }
        " />` : ''}
        <div class="business-name">${(businessInfo.tradeName || 'RESTAURANTE').toUpperCase()}</div>
        ${businessInfo.address ? `<div class="info">${businessInfo.address.toUpperCase()}</div>` : ''}
        ${businessInfo.phone ? `<div class="info">${businessInfo.phone}</div>` : ''}
        <h1>PRECUENTA</h1>
      </div>

      <div class="separator"></div>

      <div class="section">
        <div class="info-row">
          <span>FECHA:</span>
          <span>${dateStr}</span>
        </div>
        <div class="info-row">
          <span>HORA:</span>
          <span>${timeStr}</span>
        </div>
        <div class="info-row">
          <span>MESA:</span>
          <span><strong>${table.number}</strong></span>
        </div>
        <div class="info-row">
          <span>MOZO:</span>
          <span>${(table.waiter || 'N/A').toUpperCase()}</span>
        </div>
        <div class="info-row">
          <span>ORDEN:</span>
          <span>${order.orderNumber || '#' + order.id.slice(-6)}</span>
        </div>
      </div>

      <div class="items-header">
        <div class="qty">CANT</div>
        <div class="desc">DESCRIPCION</div>
        <div class="price">IMPORTE</div>
      </div>

      ${(order.items || []).map(item => `
        <div class="item-row">
          <div class="qty">${item.quantity}</div>
          <div class="desc">${(item.name || '').toUpperCase()}</div>
          <div class="price">S/ ${item.total.toFixed(2)}</div>
        </div>
        ${item.notes ? `<div class="item-notes">⚠ ${item.notes}</div>` : ''}
      `).join('')}

      <div class="totals">
        ${!taxConfig.igvExempt ? `
        <div class="row">
          <span>SUBTOTAL:</span>
          <span>S/ ${subtotal.toFixed(2)}</span>
        </div>
        <div class="row">
          <span>IGV (${taxConfig.igvRate}%):</span>
          <span>S/ ${tax.toFixed(2)}</span>
        </div>
        ` : `
        <div class="exempt-notice">
          <span>⚠ EMPRESA EXONERADA DE IGV</span>
        </div>
        `}
        <div class="row total">
          <span>TOTAL:</span>
          <span>S/ ${total.toFixed(2)}</span>
        </div>
      </div>

      <div class="footer">
        <div class="precuenta">*** PRECUENTA ***</div>
        <p>ESTE DOCUMENTO NO TIENE VALOR TRIBUTARIO</p>
        <p>SOLICITE SU COMPROBANTE DE PAGO</p>
        <p style="margin-top: ${is58mm ? '1.5mm' : '2mm'};">¡GRACIAS POR SU PREFERENCIA!</p>
      </div>

      <script>
        // Auto-imprimir cuando se cargue la página
        window.onload = function() {
          window.print();
          // Cerrar la ventana después de imprimir (con un pequeño delay)
          setTimeout(function() {
            window.close();
          }, 100);
        };
      </script>
    </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}
