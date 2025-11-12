import { forwardRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'

/**
 * Componente de Ticket Imprimible según formato SUNAT
 *
 * Cumple con los requisitos de SUNAT para comprobantes electrónicos:
 * - Datos del emisor (RUC, razón social, dirección)
 * - Tipo y número de comprobante
 * - Datos del cliente
 * - Detalle de productos/servicios
 * - Subtotal, IGV (18%), Total
 * - Código QR para validación
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

  // Generar código QR según formato SUNAT
  // Formato: RUC_EMISOR|TIPO_DOC|SERIE|NUMERO|IGV|TOTAL|FECHA_EMISION|TIPO_DOC_CLIENTE|NUM_DOC_CLIENTE|
  const generateQRData = () => {
    const ruc = companySettings?.ruc || '00000000000'
    const tipoDoc = getDocumentTypeCode()
    const serie = invoice.series || 'B001'
    const numero = invoice.number || '1'
    const igv = (invoice.igv || invoice.tax || 0).toFixed(2)
    const total = (invoice.total || 0).toFixed(2)

    // Formatear fecha en formato ISO (YYYY-MM-DD)
    const formatDateISO = (timestamp) => {
      if (!timestamp) return new Date().toISOString().split('T')[0]
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toISOString().split('T')[0]
    }
    const fecha = formatDateISO(invoice.createdAt)

    // Tipo de documento del cliente (6=RUC, 1=DNI, 4=Carnet Extranjería, 7=Pasaporte, -=Sin documento)
    const getClientDocType = () => {
      const docNumber = invoice.customerDocumentNumber || ''
      if (docNumber.length === 11) return '6' // RUC
      if (docNumber.length === 8) return '1' // DNI
      return '-' // Sin documento
    }
    const tipoDocCliente = getClientDocType()
    const numDocCliente = invoice.customerDocumentNumber || '-'

    // Construir el string del QR
    return `${ruc}|${tipoDoc}|${serie}|${numero}|${igv}|${total}|${fecha}|${tipoDocCliente}|${numDocCliente}|`
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

          .ticket-container,
          .ticket-container * {
            visibility: visible;
          }

          .ticket-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 72mm !important;
            max-width: 72mm !important;
            margin: 0 4mm !important;
            padding: 3mm 2mm !important;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            font-size: 8.5pt;
            font-weight: 500;
            line-height: 1.3;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
          }

          .info-row {
            gap: 4px;
            overflow: hidden;
          }

          .info-row span:last-child {
            text-align: right;
            flex-shrink: 0;
            max-width: 50%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .item-details {
            gap: 4px;
            overflow: hidden;
          }

          .item-details span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .total-row {
            gap: 4px;
            overflow: hidden;
          }

          .total-row span:last-child {
            text-align: right;
            flex-shrink: 0;
            white-space: nowrap;
          }
        }

        * {
          box-sizing: border-box;
        }

        .ticket-container {
          max-width: 80mm;
          margin: 0 auto;
          padding: 8px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.4;
          background: white;
          color: #000;
          box-sizing: border-box;
        }

        .ticket-header {
          text-align: center;
          margin-bottom: 10px;
          border-bottom: 2px solid #000;
          padding-bottom: 8px;
        }

        .company-logo {
          width: 50px;
          height: 50px;
          object-fit: contain;
          margin: 0 auto 6px auto;
          display: block;
        }

        .company-name {
          font-size: 13pt;
          font-weight: 700;
          margin-bottom: 4px;
          color: #000;
        }

        .company-info {
          font-size: 9pt;
          font-weight: 500;
          margin: 2px 0;
          color: #000;
        }

        .document-type {
          font-size: 11pt;
          font-weight: 700;
          margin: 8px 0 6px 0;
          padding: 6px;
          background: #000;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .document-number {
          font-size: 12pt;
          font-weight: 700;
          margin-bottom: 6px;
          color: #000;
        }

        .ticket-section {
          margin: 8px 0;
          border-bottom: 1px dashed #000;
          padding-bottom: 8px;
        }

        .ticket-section:last-child {
          border-bottom: none;
        }

        .section-title {
          font-weight: 700;
          font-size: 10pt;
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          color: #000;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          margin: 3px 0;
          font-size: 9pt;
          font-weight: 500;
          overflow: hidden;
        }

        .info-label {
          font-weight: 700;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .info-row span:last-child {
          text-align: right;
          overflow-wrap: break-word;
          word-wrap: break-word;
          hyphens: auto;
        }

        .items-table {
          width: 100%;
          margin: 8px 0;
          font-size: 9pt;
        }

        .items-header {
          border-bottom: 1px solid #000;
          padding-bottom: 5px;
          margin-bottom: 5px;
          font-weight: 700;
        }

        .item-row {
          margin: 6px 0;
          padding: 5px 0;
          border-bottom: 1px dotted #ccc;
        }

        .item-desc {
          font-weight: 600;
          font-size: 10pt;
          margin-bottom: 3px;
          color: #000;
        }

        .item-details {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          font-size: 9pt;
          font-weight: 500;
          overflow: hidden;
        }

        .item-details span:first-child {
          flex: 1;
          min-width: 0;
          overflow-wrap: break-word;
        }

        .item-details span:last-child {
          flex-shrink: 0;
          text-align: right;
          white-space: nowrap;
        }

        .item-code {
          font-size: 8.5pt;
          color: #000;
          font-weight: 500;
          margin-top: 2px;
        }

        .totals-section {
          margin-top: 8px;
          padding: 8px 6px;
          background: #f5f5f5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin: 4px 0;
          font-size: 10pt;
          font-weight: 600;
          overflow: hidden;
        }

        .total-row span:first-child {
          flex: 1;
          min-width: 0;
        }

        .total-row span:last-child {
          flex-shrink: 0;
          text-align: right;
          white-space: nowrap;
        }

        .total-row.final {
          font-size: 12pt;
          font-weight: 700;
          margin-top: 6px;
          padding: 8px 6px;
          background: #000;
          color: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .ticket-footer {
          margin-top: 10px;
          padding-top: 8px;
          border-top: 2px solid #000;
          text-align: center;
          font-size: 8pt;
          font-weight: 500;
        }

        .footer-text {
          margin: 3px 0;
          font-weight: 500;
        }

        .representation-text {
          font-size: 8pt;
          margin-top: 8px;
          font-weight: 700;
        }

        .qr-container {
          margin: 8px auto;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          max-width: 100%;
        }

        .qr-code {
          margin: 5px 0;
          max-width: 70px;
          height: auto;
        }
      `}</style>

      {/* HEADER - Datos del Emisor */}
      <div className="ticket-header">
        {/* Logo de la empresa (si existe) */}
        {companySettings?.logoUrl && (
          <img
            src={companySettings.logoUrl}
            alt="Logo"
            className="company-logo"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}

        <div className="company-name">{companySettings?.tradeName || companySettings?.name || 'MI EMPRESA'}</div>
        <div className="company-info">RUC: {companySettings?.ruc || '00000000000'}</div>
        {companySettings?.businessName && (
          <div className="company-info">{companySettings.businessName}</div>
        )}
        <div className="company-info">{companySettings?.address || 'Dirección no configurada'}</div>
        {companySettings?.phone && (
          <div className="company-info">Tel: {companySettings.phone}</div>
        )}
        {companySettings?.email && (
          <div className="company-info">Email: {companySettings.email}</div>
        )}

        <div className="document-type">{getDocumentTypeName()}</div>
        <div className="document-number">
          {invoice.number}
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
              <div className="item-desc">{item.description || item.name}</div>
              <div className="item-details">
                <span>{item.quantity} x {formatCurrency(item.price || item.unitPrice)}</span>
                <span>{formatCurrency(item.quantity * (item.price || item.unitPrice))}</span>
              </div>
              {item.code && (
                <div className="item-code">Código: {item.code}</div>
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
          <span>{formatCurrency(invoice.igv || invoice.tax || 0)}</span>
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
            <div className="qr-container">
              <QRCodeSVG
                value={generateQRData()}
                size={70}
                level="M"
                className="qr-code"
                includeMargin={true}
              />
              <div style={{ fontSize: '8px', color: '#666', marginTop: '5px' }}>
                Escanea para validar
              </div>
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

        {companySettings?.website && (
          <div className="footer-text">
            {companySettings.website}
          </div>
        )}
      </div>
    </div>
  )
})

InvoiceTicket.displayName = 'InvoiceTicket'

export default InvoiceTicket
