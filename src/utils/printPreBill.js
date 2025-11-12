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
          font-family: 'Courier New', monospace;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.5;
          padding: 8px;
          width: 80mm;
          background: white;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .header {
          text-align: center;
          margin-bottom: 12px;
          border-bottom: 3px double #000;
          padding-bottom: 10px;
        }

        .header .logo {
          width: 60px;
          height: 60px;
          margin: 0 auto 8px;
          object-fit: contain;
        }

        .header h1 {
          font-size: 22px;
          font-weight: 900;
          margin-bottom: 8px;
          letter-spacing: 2px;
        }

        .header .business-name {
          font-size: 16px;
          font-weight: 900;
          margin-bottom: 5px;
        }

        .header .info {
          font-size: 13px;
          font-weight: 700;
          color: #000;
          margin: 2px 0;
        }

        .section {
          margin-bottom: 12px;
        }

        .section-title {
          font-weight: 900;
          font-size: 14px;
          margin-bottom: 6px;
          text-transform: uppercase;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          font-size: 14px;
          font-weight: 700;
        }

        .info-row strong {
          font-weight: 900;
          font-size: 16px;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
        }

        .items-table th {
          text-align: left;
          border-bottom: 2px solid #000;
          padding: 6px 0;
          font-weight: 900;
          font-size: 14px;
        }

        .items-table td {
          padding: 6px 0;
          border-bottom: 1px dashed #666;
          font-size: 14px;
          font-weight: 700;
        }

        .items-table .qty {
          width: 35px;
          text-align: center;
          font-weight: 900;
          font-size: 15px;
        }

        .items-table .item {
          width: auto;
          font-weight: 700;
        }

        .items-table .price {
          width: 70px;
          text-align: right;
          font-weight: 900;
          font-size: 14px;
        }

        .totals {
          margin-top: 15px;
          border-top: 3px double #000;
          padding-top: 12px;
        }

        .totals .row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 15px;
          font-weight: 800;
        }

        .totals .total {
          font-size: 18px;
          font-weight: 900;
          border-top: 2px solid #000;
          padding-top: 8px;
          margin-top: 8px;
        }

        .footer {
          text-align: center;
          margin-top: 20px;
          padding-top: 12px;
          border-top: 3px double #000;
          font-size: 13px;
          font-weight: 700;
        }

        .footer .precuenta {
          font-size: 20px;
          font-weight: 900;
          margin-bottom: 12px;
          letter-spacing: 1px;
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
        <div class="business-name">${businessInfo.tradeName || businessInfo.name || 'RESTAURANTE'}</div>
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
