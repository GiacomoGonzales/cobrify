import { forwardRef } from 'react'

/**
 * Componente de Comanda (Ticket de Cocina) Imprimible
 *
 * Diseñado para impresoras térmicas de 80mm
 * Muestra la información esencial para la cocina/bar
 */
const KitchenTicket = forwardRef(({ order, companySettings, webPrintLegible = false, compactPrint = false }, ref) => {
  // Formatear fecha
  const formatDate = (timestamp) => {
    if (!timestamp) return new Date().toLocaleDateString('es-PE')
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return new Date().toLocaleTimeString('es-PE')
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getOrderTypeLabel = (orderType) => {
    if (orderType === 'delivery') return 'DELIVERY'
    if (orderType === 'takeaway') return 'PARA LLEVAR'
    return 'EN MESA'
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'PENDIENTE'
      case 'preparing': return 'EN PREPARACIÓN'
      case 'ready': return 'LISTA'
      case 'delivered': return 'ENTREGADA'
      default: return status?.toUpperCase()
    }
  }

  return (
    <div ref={ref} className="kitchen-ticket-container" data-web-print-legible={webPrintLegible}>
      {/* Estilos de impresión */}
      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            width: 80mm;
          }

          body * {
            visibility: hidden;
          }

          .kitchen-ticket-container,
          .kitchen-ticket-container * {
            visibility: visible;
          }

          .kitchen-ticket-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 70mm !important;
            max-width: 70mm !important;
            margin: 0 auto !important;
            padding: 2mm 1.5mm !important;
            box-sizing: border-box;
            font-family: 'Courier New', Courier, monospace;
            font-size: ${webPrintLegible ? '11pt' : '8.5pt'};
            font-weight: ${webPrintLegible ? '700' : '600'};
            line-height: ${webPrintLegible ? '1.4' : '1.25'};
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
          }

          /* Estilos adicionales para modo legible */
          [data-web-print-legible="true"] .kitchen-title {
            font-size: 20pt !important;
          }
          [data-web-print-legible="true"] .kitchen-subtitle {
            font-size: 13pt !important;
          }
          [data-web-print-legible="true"] .order-number-big {
            font-size: 28pt !important;
          }
          [data-web-print-legible="true"] .info-row {
            font-size: 11pt !important;
          }
          [data-web-print-legible="true"] .section-title {
            font-size: 13pt !important;
          }
          [data-web-print-legible="true"] .item-header {
            font-size: 14pt !important;
          }
          [data-web-print-legible="true"] .item-qty {
            font-size: 16pt !important;
          }
          [data-web-print-legible="true"] .item-modifiers {
            font-size: 11pt !important;
          }
          [data-web-print-legible="true"] .item-notes {
            font-size: 11pt !important;
          }
          [data-web-print-legible="true"] .footer-time {
            font-size: 11pt !important;
          }
        }

        * {
          box-sizing: border-box;
        }

        .kitchen-ticket-container {
          max-width: 80mm;
          margin: 0 auto;
          padding: 8px;
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.4;
          background: white;
          color: #000;
          box-sizing: border-box;
        }

        .kitchen-header {
          text-align: center;
          margin-bottom: 12px;
          border-bottom: 3px double #000;
          padding-bottom: 8px;
        }

        .kitchen-title {
          font-size: 18pt;
          font-weight: 900;
          margin-bottom: 6px;
          color: #000;
          letter-spacing: 1px;
        }

        .kitchen-subtitle {
          font-size: 11pt;
          font-weight: 700;
          margin: 3px 0;
          color: #000;
        }

        .order-number-big {
          font-size: 24pt;
          font-weight: 900;
          margin: 10px 0;
          padding: 10px;
          text-align: center;
          background: #000;
          color: #fff;
          border: 3px solid #000;
          letter-spacing: 2px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .order-info {
          margin: 10px 0;
          padding: 8px;
          background: #f0f0f0;
          border: 2px solid #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 4px 0;
          font-size: 10pt;
          font-weight: 700;
        }

        .info-label {
          font-weight: 900;
        }

        .items-section {
          margin: 12px 0;
          border-top: 2px dashed #000;
          border-bottom: 2px dashed #000;
          padding: 10px 0;
        }

        .section-title {
          font-weight: 900;
          font-size: 11pt;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #000;
          text-align: center;
        }

        .item {
          margin: 10px 0;
          padding: 8px;
          background: #fff;
          border: 1px solid #000;
        }

        .item-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 12pt;
          font-weight: 900;
        }

        .item-qty {
          font-size: 14pt;
          color: #000;
        }

        .item-name {
          flex: 1;
          padding: 0 8px;
          color: #000;
        }

        .item-modifiers {
          margin-top: 6px;
          padding: 6px;
          background: #000;
          color: #fff;
          border: 3px solid #000;
          font-size: 10pt;
          font-weight: 900;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .modifier-label {
          font-weight: 900;
          color: #fff;
          margin-bottom: 3px;
          text-decoration: underline;
          text-transform: uppercase;
        }

        .modifier-group {
          margin: 4px 0;
          padding: 3px 0;
        }

        .modifier-name {
          font-weight: 900;
          color: #fff;
          text-transform: uppercase;
        }

        .modifier-options {
          margin-left: 8px;
          margin-top: 2px;
          color: #fff;
        }

        .item-notes {
          margin-top: 6px;
          padding: 6px;
          background: #fff;
          border: 3px double #000;
          font-size: 10pt;
          font-weight: 900;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .notes-label {
          font-weight: 900;
          color: #000;
          margin-bottom: 3px;
          text-decoration: underline;
        }

        .kitchen-footer {
          margin-top: 12px;
          padding-top: 8px;
          border-top: 3px double #000;
          text-align: center;
          font-size: 9pt;
          font-weight: 700;
        }

        .footer-time {
          font-size: 10pt;
          margin: 4px 0;
          font-weight: 900;
        }

        ${compactPrint ? `
        /* === MODO COMPACTO === */
        @media print {
          .kitchen-ticket-container {
            font-size: 7pt !important;
            line-height: 1.1 !important;
            padding: 1mm 1mm !important;
          }
        }
        .kitchen-ticket-container {
          font-size: 10px !important;
          line-height: 1.2 !important;
          padding: 4px !important;
        }
        .kitchen-header {
          margin-bottom: 4px !important;
          padding-bottom: 4px !important;
        }
        .kitchen-title {
          font-size: 14pt !important;
        }
        .kitchen-subtitle {
          font-size: 8pt !important;
        }
        .order-number-big {
          font-size: 18pt !important;
        }
        .info-row {
          font-size: 8pt !important;
          margin: 0 !important;
        }
        .section-title {
          font-size: 9pt !important;
          margin: 2px 0 !important;
          padding: 1px 0 !important;
        }
        .item-header {
          font-size: 10pt !important;
        }
        .item-qty {
          font-size: 12pt !important;
          min-width: 24px !important;
          padding: 1px 4px !important;
        }
        .kitchen-item {
          margin-bottom: 2px !important;
          padding-bottom: 2px !important;
        }
        .item-modifiers, .item-notes {
          font-size: 8pt !important;
          margin-top: 0 !important;
          padding: 1px 2px !important;
        }
        .footer-time {
          font-size: 8pt !important;
          margin: 2px 0 !important;
        }
        ` : ''}
      `}</style>

      {/* HEADER */}
      <div className="kitchen-header">
        <div className="kitchen-title">COMANDA</div>
        <div className="kitchen-subtitle">
          {companySettings?.tradeName || companySettings?.name || 'RESTAURANTE'}
        </div>
      </div>

      {/* NÚMERO DE ORDEN DESTACADO */}
      <div className="order-number-big">
        {order.orderNumber || '#' + order.id?.slice(-6)}
      </div>

      {/* INFO DE LA ORDEN */}
      <div className="order-info">

        {order.tableNumber ? (
          <div className="info-row">
            <span className="info-label">MESA:</span>
            <span>{order.tableNumber}</span>
          </div>
        ) : (
          <div className="info-row">
            <span className="info-label">TIPO:</span>
            <span>{getOrderTypeLabel(order.orderType)}</span>
          </div>
        )}

        {order.waiterName && (
          <div className="info-row">
            <span className="info-label">MOZO:</span>
            <span>{order.waiterName}</span>
          </div>
        )}

        {order.source && !order.tableNumber && (
          <div className="info-row">
            <span className="info-label">FUENTE:</span>
            <span>{order.source}</span>
          </div>
        )}

        {order.customerName && (
          <div className="info-row">
            <span className="info-label">CLIENTE:</span>
            <span>{order.customerName}</span>
          </div>
        )}

        {order.customerPhone && (
          <div className="info-row">
            <span className="info-label">TELÉFONO:</span>
            <span>{order.customerPhone}</span>
          </div>
        )}

        <div className="info-row">
          <span className="info-label">ESTADO:</span>
          <span>{getStatusLabel(order.status)}</span>
        </div>
      </div>

      {/* ITEMS */}
      <div className="items-section">
        <div className="section-title">═══ PEDIDO ═══</div>

        {(order.items || []).map((item, index) => (
          <div key={index} className="item">
            <div className="item-header">
              <span className="item-qty">{item.quantity}x</span>
              <span className="item-name">{item.name}</span>
            </div>

            {/* Mostrar modificadores con fondo negro (DESTACADO) */}
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="item-modifiers">
                <div className="modifier-label">★ MODIFICADORES ★</div>
                {item.modifiers.map((modifier, modIdx) => (
                  <div key={modIdx} className="modifier-group">
                    <div className="modifier-name">• {modifier.modifierName}:</div>
                    <div className="modifier-options">
                      {modifier.options.map((opt, optIdx) => (
                        <div key={optIdx}>
                          → {opt.optionName}
                          {opt.priceAdjustment > 0 && ` (+S/ ${opt.priceAdjustment.toFixed(2)})`}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {item.notes && (
              <div className="item-notes">
                <div className="notes-label">⚠ ESPECIFICACIONES:</div>
                <div>{item.notes}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div className="kitchen-footer">
        <div className="footer-time">
          {formatDate(order.createdAt)} - {formatTime(order.createdAt)}
        </div>
        <div style={{ marginTop: '6px', fontSize: '9pt' }}>
          ═══════════════════════
        </div>
      </div>
    </div>
  )
})

KitchenTicket.displayName = 'KitchenTicket'

export default KitchenTicket
