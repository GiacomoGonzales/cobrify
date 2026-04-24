import { forwardRef } from 'react'

/**
 * Ticket imprimible para pedido online (tienda virtual retail).
 * Formato 80mm — incluye cliente, items, totales y notas.
 */
const OrderTicketPrint = forwardRef(({ order, companySettings }, ref) => {
  const formatDate = (ts) => {
    if (!ts) return new Date().toLocaleDateString('es-PE')
    const date = ts.toDate ? ts.toDate() : new Date(ts)
    return date.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const formatTime = (ts) => {
    if (!ts) return new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    const date = ts.toDate ? ts.toDate() : new Date(ts)
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  }

  const businessName = companySettings?.businessName || companySettings?.name || 'Tienda'
  const ruc = companySettings?.ruc || ''
  const address = companySettings?.address || ''
  const phone = companySettings?.phone || ''
  const logoUrl = companySettings?.logoUrl || ''

  const items = order.items || []
  const subtotal = order.subtotal ?? 0
  const tax = order.tax ?? 0
  const total = order.total ?? items.reduce((s, i) => s + (i.total || i.price * i.quantity || 0), 0)

  return (
    <div ref={ref} className="order-ticket-print">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          body { margin: 0; padding: 0; width: 80mm; }
          body * { visibility: hidden; }
          .order-ticket-print, .order-ticket-print * { visibility: visible; }
          .order-ticket-print {
            position: absolute; left: 0; top: 0;
            width: 72mm !important; max-width: 72mm !important;
            padding: 3mm 2mm !important;
            font-family: 'Courier New', Courier, monospace;
            font-size: 10pt; line-height: 1.35; color: #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

        .order-ticket-print {
          max-width: 80mm;
          margin: 0 auto;
          padding: 10px;
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          line-height: 1.4;
          color: #000;
          background: white;
        }
        .ot-center { text-align: center; }
        .ot-bold { font-weight: 700; }
        .ot-divider {
          border-top: 1px dashed #000;
          margin: 6px 0;
        }
        .ot-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 6px;
        }
        .ot-row-tight { margin: 1px 0; }
        .ot-logo { max-width: 40mm; max-height: 18mm; object-fit: contain; margin: 0 auto 4px; display: block; }
        .ot-order-num { font-size: 20pt; font-weight: 700; letter-spacing: 1px; }
        .ot-section-title { font-weight: 700; text-transform: uppercase; font-size: 11px; margin-top: 4px; }
        .ot-item { margin: 3px 0; }
        .ot-item-qty { font-weight: 700; }
        .ot-item-sub { font-size: 10px; color: #333; padding-left: 10px; }
        .ot-totals { font-size: 11px; }
        .ot-total-final { font-size: 14px; font-weight: 700; }
        .ot-notes {
          margin-top: 6px;
          padding: 4px;
          border: 1px dashed #000;
          font-size: 10px;
        }
      `}</style>

      {/* Header */}
      <div className="ot-center">
        {logoUrl && <img src={logoUrl} alt={businessName} className="ot-logo" crossOrigin="anonymous" />}
        <div className="ot-bold" style={{ fontSize: '13px' }}>{businessName}</div>
        {ruc && <div>RUC: {ruc}</div>}
        {address && <div style={{ fontSize: '10px' }}>{address}</div>}
        {phone && <div style={{ fontSize: '10px' }}>Tel: {phone}</div>}
      </div>

      <div className="ot-divider" />

      {/* Título + nro orden */}
      <div className="ot-center">
        <div className="ot-bold">NOTA DE PEDIDO</div>
        <div style={{ fontSize: '10px', marginTop: '2px' }}>PEDIDO ONLINE</div>
        <div className="ot-order-num" style={{ marginTop: '4px' }}>#{order.orderNumber || ''}</div>
      </div>

      <div className="ot-divider" />

      {/* Fecha */}
      <div className="ot-row ot-row-tight">
        <span>Fecha:</span>
        <span>{formatDate(order.createdAt)} {formatTime(order.createdAt)}</span>
      </div>

      <div className="ot-divider" />

      {/* Cliente */}
      <div className="ot-section-title">Cliente</div>
      {order.customerName && (
        <div className="ot-row ot-row-tight">
          <span>Nombre:</span>
          <span className="ot-bold" style={{ textAlign: 'right' }}>{order.customerName}</span>
        </div>
      )}
      {order.customerPhone && (
        <div className="ot-row ot-row-tight">
          <span>Tel:</span>
          <span style={{ textAlign: 'right' }}>{order.customerPhone}</span>
        </div>
      )}
      {order.customerEmail && (
        <div className="ot-row ot-row-tight">
          <span>Email:</span>
          <span style={{ textAlign: 'right', fontSize: '10px', wordBreak: 'break-all' }}>{order.customerEmail}</span>
        </div>
      )}
      {order.customerAddress && (
        <div style={{ marginTop: '2px' }}>
          <div>Dirección:</div>
          <div style={{ fontSize: '11px', paddingLeft: '4px' }}>{order.customerAddress}</div>
        </div>
      )}

      <div className="ot-divider" />

      {/* Items */}
      <div className="ot-section-title">Productos</div>
      {items.map((item, idx) => {
        const qty = item.quantity || 1
        const price = item.price || 0
        const itemTotal = item.total || (price * qty)
        return (
          <div key={idx} className="ot-item">
            <div className="ot-row">
              <span style={{ flex: 1 }}>
                <span className="ot-item-qty">{qty}x</span> {item.name}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>S/ {itemTotal.toFixed(2)}</span>
            </div>
            {item.isVariant && item.variantAttributes && (
              <div className="ot-item-sub">
                {Object.entries(item.variantAttributes).map(([k, v]) => `${k}: ${v}`).join(', ')}
              </div>
            )}
            {qty > 1 && (
              <div className="ot-item-sub">@ S/ {price.toFixed(2)} c/u</div>
            )}
            {item.notes && <div className="ot-item-sub">Nota: {item.notes}</div>}
          </div>
        )
      })}

      <div className="ot-divider" />

      {/* Totales */}
      <div className="ot-totals">
        {subtotal > 0 && subtotal !== total && (
          <div className="ot-row ot-row-tight">
            <span>Subtotal:</span>
            <span>S/ {subtotal.toFixed(2)}</span>
          </div>
        )}
        {tax > 0 && (
          <div className="ot-row ot-row-tight">
            <span>IGV:</span>
            <span>S/ {tax.toFixed(2)}</span>
          </div>
        )}
        <div className="ot-row ot-total-final" style={{ marginTop: '4px' }}>
          <span>TOTAL:</span>
          <span>S/ {Number(total).toFixed(2)}</span>
        </div>
      </div>

      {/* Notas del pedido */}
      {order.notes && (
        <div className="ot-notes">
          <div className="ot-bold">Notas:</div>
          <div>{order.notes}</div>
        </div>
      )}

      <div className="ot-divider" />

      <div className="ot-center" style={{ fontSize: '10px', marginTop: '4px' }}>
        ¡Gracias por tu pedido!
      </div>
    </div>
  )
})

OrderTicketPrint.displayName = 'OrderTicketPrint'

export default OrderTicketPrint
