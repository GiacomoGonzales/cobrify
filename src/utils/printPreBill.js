/**
 * Utility para imprimir precuenta de restaurante
 */

export const printPreBill = (table, order, businessInfo = {}) => {
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
    minute: '2-digit'
  })

  // Generar HTML para imprimir
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Precuenta - Mesa ${table.number}</title>
      <style>
        @page {
          size: 80mm auto;
          margin: 0;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.4;
          padding: 8px;
          width: 80mm;
          background: white;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          body {
            width: 70mm !important;
            max-width: 70mm !important;
            margin: 0 auto !important;
            padding: 2mm 1.5mm !important;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
          }
        }

        .header {
          text-align: center;
          margin-bottom: 12px;
          border-bottom: 3px double #000;
          padding-bottom: 10px;
        }

        .header .logo {
          max-width: 120px;
          max-height: 120px;
          width: auto;
          height: auto;
          margin: 0 auto 4px;
          object-fit: contain;
          display: block;
        }

        .header h1 {
          font-size: 18pt;
          font-weight: 700;
          margin-bottom: 6px;
          letter-spacing: 1px;
        }

        .header .business-name {
          font-size: 13pt;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .header .info {
          font-size: 9pt;
          font-weight: 500;
          color: #000;
          margin: 2px 0;
        }

        .section {
          margin-bottom: 12px;
        }

        .section-title {
          font-weight: 700;
          font-size: 10pt;
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 3px;
          font-size: 9pt;
          font-weight: 500;
        }

        .info-row strong {
          font-weight: 700;
          font-size: 10pt;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
        }

        .items-table th {
          text-align: left;
          border-bottom: 1px solid #000;
          padding: 5px 0;
          font-weight: 700;
          font-size: 9pt;
        }

        .items-table td {
          padding: 5px 0;
          border-bottom: 1px dotted #ccc;
          font-size: 9pt;
          font-weight: 500;
        }

        .items-table .qty {
          width: 35px;
          text-align: center;
          font-weight: 600;
          font-size: 9pt;
        }

        .items-table .item {
          width: auto;
          font-weight: 600;
        }

        .items-table .price {
          width: 70px;
          text-align: right;
          font-weight: 600;
          font-size: 9pt;
        }

        .totals {
          margin-top: 15px;
          border-top: 3px double #000;
          padding-top: 12px;
        }

        .totals .row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          font-size: 10pt;
          font-weight: 600;
        }

        .totals .total {
          font-size: 12pt;
          font-weight: 700;
          border-top: 2px solid #000;
          padding-top: 8px;
          margin-top: 6px;
        }

        .footer {
          text-align: center;
          margin-top: 20px;
          padding-top: 12px;
          border-top: 3px double #000;
          font-size: 9pt;
          font-weight: 500;
        }

        .footer .precuenta {
          font-size: 14pt;
          font-weight: 700;
          margin-bottom: 12px;
          letter-spacing: 0.5px;
        }

        @media print {
          body {
            width: 80mm;
            font-weight: 700;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .no-print {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${businessInfo.logoUrl ? `<img src="${businessInfo.logoUrl}" alt="Logo" class="logo" />` : ''}
        <div class="business-name">${businessInfo.tradeName || 'RESTAURANTE'}</div>
        <div class="info">${businessInfo.address || ''}</div>
        <div class="info">${businessInfo.phone || ''}</div>
        <h1>PRECUENTA</h1>
      </div>

      <div class="section">
        <div class="info-row">
          <span>Fecha:</span>
          <span>${dateStr} ${timeStr}</span>
        </div>
        <div class="info-row">
          <span>Mesa:</span>
          <span><strong>${table.number}</strong></span>
        </div>
        <div class="info-row">
          <span>Mozo:</span>
          <span>${table.waiter || 'N/A'}</span>
        </div>
        <div class="info-row">
          <span>Orden:</span>
          <span>${order.orderNumber || '#' + order.id.slice(-6)}</span>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th class="qty">Cant</th>
            <th class="item">Descripción</th>
            <th class="price">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${(order.items || []).map(item => `
            <tr>
              <td class="qty">${item.quantity}</td>
              <td class="item">${item.name}</td>
              <td class="price">S/ ${item.total.toFixed(2)}</td>
            </tr>
            ${item.notes ? `
              <tr>
                <td></td>
                <td colspan="2" style="font-size: 12px; font-weight: 700; font-style: italic; padding: 2px 0 6px 0; color: #000;">
                  ⚠ ${item.notes}
                </td>
              </tr>
            ` : ''}
          `).join('')}
        </tbody>
      </table>

      <div class="totals">
        <div class="row">
          <span>Subtotal:</span>
          <span>S/ ${(order.subtotal || 0).toFixed(2)}</span>
        </div>
        <div class="row">
          <span>IGV (18%):</span>
          <span>S/ ${(order.tax || 0).toFixed(2)}</span>
        </div>
        <div class="row total">
          <span>TOTAL:</span>
          <span>S/ ${(order.total || 0).toFixed(2)}</span>
        </div>
      </div>

      <div class="footer">
        <div class="precuenta">*** PRECUENTA ***</div>
        <p>Este documento no tiene valor tributario</p>
        <p>Solicite su comprobante de pago</p>
        <p style="margin-top: 10px;">¡Gracias por su preferencia!</p>
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
