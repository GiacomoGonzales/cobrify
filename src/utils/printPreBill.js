/**
 * Utility para imprimir precuenta de restaurante
 *
 * @param {Object} table - Mesa
 * @param {Object} order - Orden completa
 * @param {Object} businessInfo - Información del negocio
 * @param {Object} taxConfig - Configuración de impuestos
 * @param {number} paperWidth - Ancho del papel (58 o 80mm)
 * @param {boolean} webPrintLegible - Si usar fuente más grande
 * @param {Array} itemFilter - Items a mostrar (opcional, si es null muestra todos)
 * @param {string} personLabel - Etiqueta de persona (ej: "Persona 1 de 3")
 */
export const printPreBill = (table, order, businessInfo = {}, taxConfig = { igvRate: 18, igvExempt: false }, paperWidth = 80, webPrintLegible = false, itemFilter = null, personLabel = null) => {
  console.log('🖨️ printPreBill - Parámetros recibidos:', { paperWidth, webPrintLegible, itemFilter, personLabel })
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

  // Determinar qué items mostrar
  const itemsToShow = itemFilter || (order.items || [])

  // Recalcular totales según taxConfig actual y items filtrados
  // Esto asegura que si la empresa cambió su estado de exoneración,
  // la precuenta muestre los valores correctos
  console.log('🔍 printPreBill - taxConfig recibido:', taxConfig)
  console.log('🔍 printPreBill - igvExempt:', taxConfig.igvExempt)
  console.log('🔍 printPreBill - igvRate:', taxConfig.igvRate)

  let subtotal, tax, total

  // Si hay filtro de items, calcular el total solo de esos items
  if (itemFilter) {
    total = itemFilter.reduce((sum, item) => sum + (item.total || 0), 0)
  } else {
    total = order.total || 0
  }

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
          font-size: ${webPrintLegible ? (is58mm ? '11pt' : '12pt') : (is58mm ? '8pt' : '9pt')};
          font-weight: ${webPrintLegible ? '600' : 'normal'};
          line-height: ${webPrintLegible ? '1.4' : '1.2'};
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
          font-size: ${webPrintLegible ? (is58mm ? '14pt' : '16pt') : (is58mm ? '11pt' : '12pt')};
          font-weight: ${webPrintLegible ? '700' : 'bold'};
          margin: ${is58mm ? '1mm' : '1.5mm'} 0;
          letter-spacing: 0.5px;
        }

        .header .business-name {
          font-size: ${webPrintLegible ? (is58mm ? '13pt' : '14pt') : (is58mm ? '10pt' : '11pt')};
          font-weight: ${webPrintLegible ? '700' : 'bold'};
          margin-bottom: ${is58mm ? '0.5mm' : '1mm'};
        }

        .header .info {
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          font-weight: ${webPrintLegible ? '600' : 'normal'};
          color: #000;
          margin: ${is58mm ? '0.3mm' : '0.5mm'} 0;
        }

        .header .person-label {
          font-size: ${webPrintLegible ? (is58mm ? '12pt' : '14pt') : (is58mm ? '9pt' : '10pt')};
          font-weight: ${webPrintLegible ? '700' : 'bold'};
          color: #000;
          background-color: #f3f4f6;
          padding: ${is58mm ? '1.5mm 3mm' : '2mm 4mm'};
          border-radius: 2px;
          margin-top: ${is58mm ? '1.5mm' : '2mm'};
          display: inline-block;
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
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          font-weight: ${webPrintLegible ? '600' : 'normal'};
        }

        .info-row strong {
          font-weight: ${webPrintLegible ? '700' : 'bold'};
        }

        .items-header {
          border-top: 1px dashed #000;
          border-bottom: 1px solid #000;
          padding: ${is58mm ? '1mm' : '1.5mm'} 0;
          font-weight: ${webPrintLegible ? '700' : 'bold'};
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
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
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          font-weight: ${webPrintLegible ? '600' : 'normal'};
          padding-bottom: ${is58mm ? '0.5mm' : '1mm'};
          border-bottom: 1px dotted #ccc;
        }

        .item-row .qty {
          width: ${is58mm ? '25px' : '35px'};
          text-align: center;
          font-weight: ${webPrintLegible ? '700' : 'bold'};
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
          font-weight: ${webPrintLegible ? '700' : 'bold'};
        }

        .item-notes {
          font-size: ${webPrintLegible ? (is58mm ? '9pt' : '10pt') : (is58mm ? '6pt' : '7pt')};
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
          font-size: ${webPrintLegible ? (is58mm ? '11pt' : '12pt') : (is58mm ? '8pt' : '9pt')};
          font-weight: ${webPrintLegible ? '600' : 'normal'};
        }

        .totals .total {
          font-size: ${webPrintLegible ? (is58mm ? '13pt' : '14pt') : (is58mm ? '10pt' : '11pt')};
          font-weight: ${webPrintLegible ? '700' : 'bold'};
          border-top: 1px solid #000;
          padding-top: ${is58mm ? '1.5mm' : '2mm'};
          margin-top: ${is58mm ? '1mm' : '1.5mm'};
        }

        .footer {
          text-align: center;
          margin-top: ${is58mm ? '3mm' : '4mm'};
          padding-top: ${is58mm ? '2mm' : '3mm'};
          border-top: 1px dashed #000;
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          font-weight: ${webPrintLegible ? '600' : 'normal'};
        }

        .footer .precuenta {
          font-size: ${webPrintLegible ? (is58mm ? '14pt' : '16pt') : (is58mm ? '11pt' : '12pt')};
          font-weight: ${webPrintLegible ? '700' : 'bold'};
          margin-bottom: ${is58mm ? '2mm' : '3mm'};
          letter-spacing: 0.5px;
        }

        .exempt-notice {
          background-color: #fef3c7;
          color: #92400e;
          padding: ${is58mm ? '1.5mm' : '2mm'};
          border-radius: 2px;
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          font-weight: ${webPrintLegible ? '600' : 'normal'};
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
        ${personLabel ? `<div class="person-label">${personLabel.toUpperCase()}</div>` : ''}
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

      ${itemsToShow.map(item => `
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
