import { forwardRef } from 'react'

/**
 * Componente de Comanda (Ticket de Cocina) Imprimible
 *
 * Diseñado para impresoras térmicas de 80mm
 * Muestra la información esencial para la cocina/bar
 */
const KitchenTicket = forwardRef(({ order, companySettings }, ref) => {
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
    <div ref={ref} className="kitchen-ticket-container">
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
            width: 72mm !important;
            max-width: 72mm !important;
            margin: 0 4mm !important;
            padding: 3mm 2mm !important;
            box-sizing: border-box;
            font-family: 'Courier New', Courier, monospace;
            font-size: 9pt;
            font-weight: 600;
            line-height: 1.3;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
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

        .kitchen-logo {
          max-width: 100px;
          max-height: 100px;
          width: auto;
          height: auto;
          margin: 0 auto 4px;
          object-fit: contain;
          display: block;
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
      `}</style>

      {/* HEADER */}
      <div className="kitchen-header">
        {companySettings?.logoUrl && (
          <img
            src={companySettings.logoUrl}
            alt="Logo"
            className="kitchen-logo"
          />
        )}
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
