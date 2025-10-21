import { forwardRef } from 'react'

/**
 * Componente de Ticket Imprimible según formato SUNAT
 *
 * Cumple con los requisitos de SUNAT para comprobantes electrónicos:
 * - Datos del emisor (RUC, razón social, dirección)
 * - Tipo y número de comprobante
 * - Datos del cliente
 * - Detalle de productos/servicios
 * - Subtotal, IGV (18%), Total
 * - Representación impresa
 */
const InvoiceTicket = forwardRef(({ invoice, companySettings }, ref) => {
  // Determinar el tipo de comprobante
  const getDocumentTypeName = () => {
    if (invoice.documentType === 'factura') return 'FACTURA ELECTRÓNICA'
    if (invoice.documentType === 'boleta') return 'BOLETA DE VENTA ELECTRÓNICA'
    if (invoice.documentType === 'nota_venta') return 'NOTA DE VENTA'
    return 'COMPROBANTE'
  }

  const getDocumentTypeCode = () => {
    if (invoice.documentType === 'factura') return '01'
    if (invoice.documentType === 'boleta') return '03'
    return 'NV'
  }

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

  // Formatear moneda
  const formatCurrency = (value) => {
    return `S/ ${Number(value).toFixed(2)}`
  }

  return (
    <div ref={ref} className="ticket-container">
      {/* Estilos de impresión */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .ticket-container,
          .ticket-container * {
            visibility: visible;
          }
          .ticket-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            padding: 5mm;
            font-family: 'Courier New', monospace;
            font-size: 10pt;
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        }

        .ticket-container {
          max-width: 80mm;
          margin: 0 auto;
          padding: 10px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.4;
          background: white;
          color: black;
        }

        .ticket-header {
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px dashed #000;
          padding-bottom: 10px;
        }

        .company-name {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 3px;
        }

        .company-info {
          font-size: 10px;
          margin: 2px 0;
        }

        .document-type {
          font-size: 13px;
          font-weight: bold;
          margin: 10px 0 5px 0;
        }

        .document-number {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .ticket-section {
          margin: 10px 0;
          border-bottom: 1px dashed #000;
          padding-bottom: 10px;
        }

        .ticket-section:last-child {
          border-bottom: none;
        }

        .section-title {
          font-weight: bold;
          font-size: 11px;
          margin-bottom: 5px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 3px 0;
          font-size: 10px;
        }

        .info-label {
          font-weight: bold;
        }

        .items-table {
          width: 100%;
          margin: 10px 0;
          font-size: 10px;
        }

        .items-header {
          border-bottom: 1px solid #000;
          padding-bottom: 5px;
          margin-bottom: 5px;
          font-weight: bold;
        }

        .item-row {
          margin: 8px 0;
          padding: 5px 0;
          border-bottom: 1px dotted #ccc;
        }

        .item-desc {
          font-weight: bold;
          margin-bottom: 3px;
        }

        .item-details {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
        }

        .totals-section {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 2px solid #000;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          margin: 5px 0;
          font-size: 11px;
        }

        .total-row.final {
          font-size: 13px;
          font-weight: bold;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #000;
        }

        .ticket-footer {
          margin-top: 15px;
          padding-top: 10px;
          border-top: 2px dashed #000;
          text-align: center;
          font-size: 9px;
        }

        .footer-text {
          margin: 3px 0;
        }

        .representation-text {
          font-size: 8px;
          margin-top: 10px;
          font-weight: bold;
        }

        .qr-placeholder {
          margin: 10px auto;
          text-align: center;
          font-size: 8px;
          color: #666;
        }
      `}</style>

      {/* HEADER - Datos del Emisor */}
      <div className="ticket-header">
        <div className="company-name">{companySettings?.razonSocial || 'MI EMPRESA'}</div>
        {companySettings?.nombreComercial && (
          <div className="company-info">{companySettings.nombreComercial}</div>
        )}
        <div className="company-info">RUC: {companySettings?.ruc || '00000000000'}</div>
        <div className="company-info">{companySettings?.direccion || 'Dirección no configurada'}</div>
        {companySettings?.telefono && (
          <div className="company-info">Tel: {companySettings.telefono}</div>
        )}
        {companySettings?.email && (
          <div className="company-info">Email: {companySettings.email}</div>
        )}

        <div className="document-type">{getDocumentTypeName()}</div>
        <div className="document-number">
          {invoice.series}-{invoice.number}
        </div>
      </div>

      {/* Fecha y Hora */}
      <div className="ticket-section">
        <div className="info-row">
          <span className="info-label">Fecha:</span>
          <span>{formatDate(invoice.createdAt)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Hora:</span>
          <span>{formatTime(invoice.createdAt)}</span>
        </div>
      </div>

      {/* Datos del Cliente */}
      {(invoice.documentType === 'factura' || invoice.documentType === 'boleta') && (
        <div className="ticket-section">
          <div className="section-title">DATOS DEL CLIENTE</div>

          {invoice.documentType === 'boleta' && (
            <>
              <div className="info-row">
                <span className="info-label">DNI:</span>
                <span>{invoice.customerDocumentNumber || '-'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Nombre:</span>
                <span>{invoice.customerName || 'VARIOS'}</span>
              </div>
            </>
          )}

          {invoice.documentType === 'factura' && (
            <>
              <div className="info-row">
                <span className="info-label">RUC:</span>
                <span>{invoice.customerDocumentNumber || '-'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Razón Social:</span>
                <span>{invoice.customerBusinessName || '-'}</span>
              </div>
              {invoice.customerName && (
                <div className="info-row">
                  <span className="info-label">Nombre Comercial:</span>
                  <span>{invoice.customerName}</span>
                </div>
              )}
              {invoice.customerAddress && (
                <div className="info-row">
                  <span className="info-label">Dirección:</span>
                  <span>{invoice.customerAddress}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Detalle de Productos/Servicios */}
      <div className="ticket-section">
        <div className="section-title">DETALLE</div>
        <div className="items-table">
          {invoice.items?.map((item, index) => (
            <div key={index} className="item-row">
              <div className="item-desc">{item.description}</div>
              <div className="item-details">
                <span>{item.quantity} x {formatCurrency(item.price)}</span>
                <span>{formatCurrency(item.quantity * item.price)}</span>
              </div>
              {item.code && (
                <div style={{ fontSize: '8px', color: '#666' }}>Código: {item.code}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Totales */}
      <div className="totals-section">
        <div className="total-row">
          <span>Subtotal:</span>
          <span>{formatCurrency(invoice.subtotal || 0)}</span>
        </div>
        <div className="total-row">
          <span>IGV (18%):</span>
          <span>{formatCurrency(invoice.tax || 0)}</span>
        </div>
        <div className="total-row final">
          <span>TOTAL A PAGAR:</span>
          <span>{formatCurrency(invoice.total || 0)}</span>
        </div>
      </div>

      {/* Métodos de Pago */}
      <div className="ticket-section">
        <div className="section-title">FORMA DE PAGO</div>
        {invoice.payments && invoice.payments.length > 0 ? (
          <div className="space-y-1">
            {invoice.payments.map((payment, index) => (
              <div key={index} className="info-row">
                <span className="info-label">{payment.method}:</span>
                <span>{formatCurrency(payment.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="info-row">
            <span className="info-label">Método:</span>
            <span>{invoice.paymentMethod || 'Efectivo'}</span>
          </div>
        )}
      </div>

      {/* Observaciones */}
      {invoice.notes && (
        <div className="ticket-section">
          <div className="section-title">OBSERVACIONES</div>
          <div style={{ fontSize: '9px', whiteSpace: 'pre-wrap' }}>
            {invoice.notes}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="ticket-footer">
        <div className="representation-text">
          {invoice.documentType === 'nota_venta'
            ? 'DOCUMENTO NO VÁLIDO PARA FINES TRIBUTARIOS'
            : 'REPRESENTACIÓN IMPRESA DE LA ' + getDocumentTypeName()
          }
        </div>

        {invoice.documentType !== 'nota_venta' && (
          <>
            <div className="qr-placeholder">
              [Código QR aquí]
              <br />
              (Para validar en SUNAT)
            </div>
            <div className="footer-text">
              Consulte su comprobante en:
            </div>
            <div className="footer-text">
              www.sunat.gob.pe
            </div>
          </>
        )}

        <div className="footer-text" style={{ marginTop: '10px' }}>
          ¡Gracias por su preferencia!
        </div>

        {companySettings?.sitioWeb && (
          <div className="footer-text">
            {companySettings.sitioWeb}
          </div>
        )}
      </div>
    </div>
  )
})

InvoiceTicket.displayName = 'InvoiceTicket'

export default InvoiceTicket
