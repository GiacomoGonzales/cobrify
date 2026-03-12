import { forwardRef } from 'react'

const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo', efectivo: 'Efectivo',
  card: 'Tarjeta', tarjeta: 'Tarjeta',
  transfer: 'Transferencia', transferencia: 'Transferencia',
  yape: 'Yape', plin: 'Plin',
}

const DeliveryTicket = forwardRef(({ delivery, companySettings, paperWidth = 80, printMargins = 8 }, ref) => {
  const is58mm = paperWidth === 58
  const isPending = delivery.paymentStatus === 'pending'

  const formatDate = (dateValue) => {
    if (!dateValue) return '-'
    const d = dateValue.toDate ? dateValue.toDate() : new Date(dateValue)
    return d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div ref={ref} className="delivery-ticket-container">
      <style>{`
        @media print {
          @page {
            size: ${paperWidth}mm auto;
            margin: 0;
          }
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; width: ${paperWidth}mm; }
          body * { visibility: hidden; }
          .delivery-ticket-container,
          .delivery-ticket-container * { visibility: visible; }
          .delivery-ticket-container {
            position: absolute;
            left: 0;
            top: 0;
            width: ${paperWidth}mm !important;
            max-width: ${paperWidth}mm !important;
            margin: 0 auto !important;
            padding: ${is58mm ? '1.5mm' : '2mm'} ${printMargins}mm !important;
            box-sizing: border-box;
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${is58mm ? '7pt' : '8pt'};
            line-height: 1.2;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
          }
        }
        @media screen {
          .delivery-ticket-container { display: none; }
        }
        * { box-sizing: border-box; }
        .delivery-ticket-container {
          max-width: ${paperWidth}mm;
          margin: 0 auto;
          padding: ${is58mm ? '1.5mm' : '2mm'};
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${is58mm ? '8pt' : '9pt'};
          line-height: 1.2;
          background: white;
          color: #000;
          text-transform: uppercase;
        }
        .dt-header { text-align: center; margin-bottom: 4px; border-bottom: 1px solid #000; padding-bottom: 4px; }
        .dt-company { font-size: ${is58mm ? '9pt' : '11pt'}; font-weight: 700; margin-bottom: 2px; }
        .dt-doc-type { font-size: ${is58mm ? '8pt' : '9pt'}; font-weight: 700; margin: 3px 0 2px 0; padding: 2px 4px; background: #000; color: #fff; letter-spacing: 0.5px; }
        .dt-doc-number { font-size: ${is58mm ? '9pt' : '10pt'}; font-weight: 700; margin: 2px 0; }
        .dt-separator { border-top: 1px dashed #000; margin: 4px 0; }
        .dt-row { display: flex; justify-content: space-between; align-items: flex-start; gap: ${is58mm ? '2px' : '4px'}; margin: 2px 0; font-size: ${is58mm ? '7pt' : '8pt'}; line-height: 1.3; }
        .dt-label { font-weight: 700; flex-shrink: 0; white-space: nowrap; }
        .dt-row span:last-child { text-align: right; word-break: break-word; }
        .dt-amount { text-align: center; font-size: ${is58mm ? '12pt' : '14pt'}; font-weight: 700; margin: 6px 0; padding: 4px; border: 2px solid #000; }
        .dt-payment-status { text-align: center; font-size: ${is58mm ? '10pt' : '12pt'}; font-weight: 700; margin: 4px 0; padding: 4px; border: 2px solid #000; letter-spacing: 1px; }
        .dt-signature { margin-top: 20px; text-align: center; }
        .dt-sig-line { border-top: 1px solid #000; width: 70%; margin: 0 auto; padding-top: 3px; font-size: ${is58mm ? '6pt' : '7pt'}; }
        .dt-footer { margin-top: 6px; text-align: center; font-size: ${is58mm ? '6pt' : '7pt'}; }
      `}</style>

      {/* Header */}
      <div className="dt-header">
        <div className="dt-company">{companySettings?.tradeName || companySettings?.name || 'MI EMPRESA'}</div>
        <div className="dt-doc-type">NOTA DE ENVÍO</div>
        <div className="dt-doc-number">{delivery.orderNumber || '-'}</div>
      </div>

      {/* Fecha */}
      <div className="dt-row">
        <span className="dt-label">Fecha:</span>
        <span>{formatDate(delivery.createdAt)}</span>
      </div>

      <div className="dt-separator"></div>

      {/* Cliente */}
      <div className="dt-row">
        <span className="dt-label">Cliente:</span>
        <span>{delivery.customerName || '-'}</span>
      </div>
      {delivery.customerAddress && (
        <div className="dt-row">
          <span className="dt-label">Dir:</span>
          <span>{delivery.customerAddress}</span>
        </div>
      )}

      <div className="dt-separator"></div>

      {/* Motorista */}
      <div className="dt-row">
        <span className="dt-label">Motorista:</span>
        <span>{delivery.motoristaName || '-'}</span>
      </div>

      <div className="dt-separator"></div>

      {/* Monto */}
      <div className="dt-amount">S/ {(delivery.amount || 0).toFixed(2)}</div>

      {/* Estado de pago - prominente */}
      <div className="dt-payment-status">
        {isPending ? '★ POR COBRAR ★' : '✓ PAGADO'}
      </div>

      {/* Método de pago */}
      <div className="dt-row">
        <span className="dt-label">Método:</span>
        <span>{PAYMENT_METHOD_LABELS[delivery.paymentMethod] || delivery.paymentMethod || '-'}</span>
      </div>
      {delivery.deliveryFee > 0 && (
        <div className="dt-row">
          <span className="dt-label">Envío:</span>
          <span>S/ {(delivery.deliveryFee || 0).toFixed(2)}</span>
        </div>
      )}

      {/* Firma */}
      <div className="dt-signature">
        <div className="dt-separator"></div>
        <div style={{ height: '30px' }}></div>
        <div className="dt-sig-line">Firma de recepción</div>
      </div>

      {/* Footer */}
      <div className="dt-footer">
        <p>Documento interno - sin valor tributario</p>
        <p>Impreso: {new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>
    </div>
  )
})

DeliveryTicket.displayName = 'DeliveryTicket'

export default DeliveryTicket
