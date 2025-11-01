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
    const igv = (invoice.tax || 0).toFixed(2)
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          html, body {
            width: 80mm;
            height: auto;
            margin: 0;
            padding: 0;
            overflow: visible;
          }

          body * {
            visibility: hidden;
          }

          .ticket-container,
          .ticket-container * {
            visibility: visible;
          }

          .ticket-container {
            position: relative;
            left: 0;
            top: 0;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 5mm !important;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            font-size: 9pt;
            line-height: 1.3;
            background: transparent;
            page-break-after: auto;
          }

          /* Evitar saltos de página innecesarios */
          .ticket-header,
          .ticket-section,
          .ticket-items table,
          .totals-section,
          .ticket-footer {
            page-break-inside: avoid;
          }

          /* Eliminar márgenes adicionales */
          .ticket-header,
          .ticket-section,
          .totals-section,
          .ticket-footer {
            margin-top: 0 !important;
            margin-bottom: 8px !important;
          }
        }

        .ticket-container {
          max-width: 80mm;
          width: 80mm;
          margin: 0 auto;
          padding: 10px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
          font-size: 11px;
          line-height: 1.5;
          background: white;
          color: #1a1a1a;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          box-sizing: border-box;
        }

        .ticket-header {
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px dashed #000;
          padding-bottom: 10px;
        }

        .company-logo {
          max-width: 200px;
          max-height: 80px;
          width: auto;
          height: auto;
          object-fit: contain;
          margin: 0 auto 5px auto;
          display: block;
        }

        .company-name {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 4px;
          letter-spacing: 0.3px;
          color: #000;
        }

        .company-name-no-logo {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 4px;
          letter-spacing: 0.3px;
        }

        .company-info {
          font-size: 10px;
          margin: 2px 0;
          font-weight: 400;
          color: #333;
        }

        .document-type {
          font-size: 14px;
          font-weight: 700;
          margin: 10px 0 5px 0;
          letter-spacing: 0.5px;
          color: #000;
        }

        .document-number {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 5px;
          letter-spacing: 0.3px;
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
          font-weight: 600;
          font-size: 11px;
          margin-bottom: 5px;
          letter-spacing: 0.3px;
          color: #000;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 3px 0;
          font-size: 10px;
        }

        .info-label {
          font-weight: 600;
          color: #000;
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
          font-weight: 600;
        }

        .item-row {
          margin: 8px 0;
          padding: 5px 0;
          border-bottom: 1px dotted #ddd;
        }

        .item-desc {
          font-weight: 600;
          margin-bottom: 3px;
          color: #000;
        }

        .item-details {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: #555;
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
          font-weight: 500;
        }

        .total-row.final {
          font-size: 14px;
          font-weight: 700;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 2px solid #000;
          color: #000;
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
          font-weight: 400;
          color: #555;
        }

        .representation-text {
          font-size: 8px;
          margin-top: 10px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }

        .qr-container {
          margin: 10px auto;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .qr-code {
          margin: 5px 0;
        }
      `}</style>

      {/* HEADER - Datos del Emisor */}
      <div className="ticket-header">
        {/* Logo de la empresa (si existe) */}
        {companySettings?.logoUrl && (
          <img
            src={companySettings.logoUrl}
            alt="Logo Empresa"
            className="company-logo"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}

        {/* Nombre de la empresa (siempre se muestra) */}
        <div className="company-name">{companySettings?.businessName || companySettings?.razonSocial || ''}</div>
        {companySettings?.nombreComercial && companySettings?.nombreComercial !== companySettings?.businessName && (
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
            <div className="qr-container">
              <QRCodeSVG
                value={generateQRData()}
                size={80}
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
