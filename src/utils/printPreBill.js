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
          font-size: 12px;
          line-height: 1.4;
          padding: 10px;
          width: 80mm;
          background: white;
        }

        .header {
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px dashed #000;
          padding-bottom: 10px;
        }

        .header h1 {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .header .business-name {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 3px;
        }

        .header .info {
          font-size: 11px;
          color: #333;
        }

        .section {
          margin-bottom: 10px;
        }

        .section-title {
          font-weight: bold;
          margin-bottom: 5px;
          text-transform: uppercase;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 3px;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }

        .items-table th {
          text-align: left;
          border-bottom: 1px solid #000;
          padding: 5px 0;
          font-weight: bold;
        }

        .items-table td {
          padding: 5px 0;
          border-bottom: 1px dashed #ccc;
        }

        .items-table .qty {
          width: 30px;
          text-align: center;
        }

        .items-table .item {
          width: auto;
        }

        .items-table .price {
          width: 60px;
          text-align: right;
        }

        .totals {
          margin-top: 15px;
          border-top: 2px solid #000;
          padding-top: 10px;
        }

        .totals .row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
        }

        .totals .total {
          font-size: 14px;
          font-weight: bold;
          border-top: 1px solid #000;
          padding-top: 5px;
          margin-top: 5px;
        }

        .footer {
          text-align: center;
          margin-top: 20px;
          padding-top: 10px;
          border-top: 2px dashed #000;
          font-size: 11px;
        }

        .footer .precuenta {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 10px;
        }

        @media print {
          body {
            width: 80mm;
          }

          .no-print {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="business-name">${businessInfo.name || 'RESTAURANTE'}</div>
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
                <td colspan="2" style="font-size: 10px; font-style: italic; padding: 0 0 5px 0;">
                  Nota: ${item.notes}
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
