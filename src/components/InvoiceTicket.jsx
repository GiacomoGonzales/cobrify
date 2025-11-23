import { forwardRef } from 'react'
import React from 'react'
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
const InvoiceTicket = forwardRef(({ invoice, companySettings, paperWidth = 80, webPrintLegible = false }, ref) => {
  // Estado para detectar si el logo es cuadrado
  const [isSquareLogo, setIsSquareLogo] = React.useState(false)

  // Determinar si es papel de 58mm o 80mm
  const is58mm = paperWidth === 58

  // Función para detectar si la imagen es cuadrada
  const handleLogoLoad = (e) => {
    const img = e.target
    const aspectRatio = img.naturalWidth / img.naturalHeight
    // Consideramos cuadrado si el ratio está entre 0.8 y 1.2
    setIsSquareLogo(aspectRatio >= 0.8 && aspectRatio <= 1.2)
  }

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

  // Helper para obtener datos del cliente (soporta ambas estructuras)
  const getCustomerData = () => {
    // Si existe invoice.customer (estructura del POS), usar esos datos
    if (invoice.customer) {
      return {
        documentNumber: invoice.customer.documentNumber || invoice.customerDocumentNumber || '-',
        name: invoice.customer.name || invoice.customerName || 'VARIOS',
        businessName: invoice.customer.businessName || invoice.customerBusinessName || '-',
        address: invoice.customer.address || invoice.customerAddress || ''
      }
    }
    // Si no, usar la estructura plana
    return {
      documentNumber: invoice.customerDocumentNumber || '-',
      name: invoice.customerName || 'VARIOS',
      businessName: invoice.customerBusinessName || '-',
      address: invoice.customerAddress || ''
    }
  }

  const customerData = getCustomerData()

  // Formatear el número de documento con serie
  const getFormattedDocumentNumber = () => {
    // Si ya tiene el formato completo (contiene guión), retornarlo tal cual
    if (invoice.number && invoice.number.toString().includes('-')) {
      return invoice.number
    }

    // Para notas de venta sin formato, usar serie N001
    if (invoice.documentType === 'nota_venta') {
      const series = invoice.series || 'N001'
      const number = invoice.number || '1'
      // Pad number to 8 digits
      const paddedNumber = number.toString().padStart(8, '0')
      return `${series}-${paddedNumber}`
    }

    // Para boletas y facturas sin formato, usar la serie existente
    const series = invoice.series || 'B001'
    const number = invoice.number || '1'
    // Pad number to 8 digits
    const paddedNumber = number.toString().padStart(8, '0')
    return `${series}-${paddedNumber}`
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
      const docNumber = customerData.documentNumber || ''
      if (docNumber.length === 11) return '6' // RUC
      if (docNumber.length === 8) return '1' // DNI
      return '-' // Sin documento
    }
    const tipoDocCliente = getClientDocType()
    const numDocCliente = customerData.documentNumber || '-'

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
            size: ${paperWidth}mm auto;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            width: ${paperWidth}mm;
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
            width: ${paperWidth}mm !important;
            max-width: ${paperWidth}mm !important;
            margin: 0 auto !important;
            padding: ${is58mm ? '1.5mm 6mm' : '2mm 6mm'} !important;
            box-sizing: border-box;
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
            font-weight: ${webPrintLegible ? '600' : '400'};
            line-height: ${webPrintLegible ? '1.4' : '1.2'};
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
          }

          .info-row {
            gap: 4px;
          }

          .info-row span:last-child {
            text-align: right;
            flex-shrink: 0;
            max-width: 65%;
            overflow-wrap: break-word;
            word-wrap: break-word;
            word-break: break-word;
            white-space: normal;
          }

          .item-details {
            gap: 4px;
          }

          .item-details span {
            overflow-wrap: break-word;
            word-wrap: break-word;
            word-break: break-word;
            white-space: normal;
          }

          .item-details span:last-child {
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
          max-width: ${paperWidth}mm;
          margin: 0 auto;
          padding: ${is58mm ? '1.5mm' : '2mm'};
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${webPrintLegible ? (is58mm ? '11pt' : '12pt') : (is58mm ? '8pt' : '9pt')};
          font-weight: ${webPrintLegible ? '600' : '400'};
          line-height: ${webPrintLegible ? '1.4' : '1.2'};
          background: white;
          color: #000;
          box-sizing: border-box;
          text-transform: uppercase;
        }

        .ticket-header {
          text-align: center;
          margin-bottom: 3px;
          border-bottom: 1px solid #000;
          padding-bottom: 3px;
        }

        .company-logo {
          max-width: ${is58mm ? '150px' : '200px'};
          max-height: ${is58mm ? '80px' : '100px'};
          width: auto;
          height: auto;
          object-fit: contain;
          margin: 0 auto 2px auto;
          display: block;
        }

        /* Logos cuadrados más pequeños */
        .company-logo.square-logo {
          max-width: ${is58mm ? '70px' : '100px'};
          max-height: ${is58mm ? '70px' : '100px'};
        }

        .company-name {
          font-size: ${webPrintLegible ? (is58mm ? '12pt' : '14pt') : (is58mm ? '9pt' : '11pt')};
          font-weight: 700;
          margin-bottom: 1px;
          color: #000;
          letter-spacing: 0.3px;
        }

        .company-info {
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          font-weight: ${webPrintLegible ? '600' : '400'};
          margin: 0.5px 0;
          color: #000;
          line-height: 1.2;
        }

        .document-type {
          font-size: ${webPrintLegible ? (is58mm ? '11pt' : '12pt') : (is58mm ? '8pt' : '9pt')};
          font-weight: 700;
          margin: 3px 0 2px 0;
          padding: 2px 4px;
          background: #000;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .document-number {
          font-size: ${webPrintLegible ? (is58mm ? '12pt' : '13pt') : (is58mm ? '9pt' : '10pt')};
          font-weight: 700;
          margin: 2px 0;
          color: #000;
          letter-spacing: 0.5px;
        }

        .ticket-section {
          margin: 2px 0;
          border-bottom: 1px dashed #ccc;
          padding-bottom: 2px;
        }

        .ticket-section:last-child {
          border-bottom: none;
        }

        .section-title {
          font-weight: 700;
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          margin-bottom: 1px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #000;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: ${is58mm ? '2px' : '4px'};
          margin: 1px 0;
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          font-weight: ${webPrintLegible ? '600' : '400'};
          overflow: hidden;
          line-height: 1.2;
        }

        .info-label {
          font-weight: ${webPrintLegible ? '700' : '700'};
          flex-shrink: 0;
          white-space: nowrap;
        }

        .info-row span:last-child {
          text-align: right;
          overflow-wrap: break-word;
          word-wrap: break-word;
          word-break: break-word;
          hyphens: auto;
          white-space: normal;
        }

        .items-table {
          width: 100%;
          margin: 2px 0;
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
        }

        .items-header {
          border-bottom: 1px solid #000;
          padding-bottom: 1px;
          margin-bottom: 1px;
          font-weight: 700;
        }

        .item-row {
          margin: 1px 0;
          padding: 1px 0;
          border-bottom: 1px dotted #ddd;
        }

        .item-desc {
          font-weight: ${webPrintLegible ? '700' : '600'};
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          margin-bottom: 1px;
          color: #000;
          overflow-wrap: break-word;
          word-wrap: break-word;
          word-break: break-word;
          white-space: normal;
        }

        .item-details {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: ${is58mm ? '2px' : '4px'};
          font-size: ${webPrintLegible ? (is58mm ? '9.5pt' : '10.5pt') : (is58mm ? '6.5pt' : '7.5pt')};
          font-weight: ${webPrintLegible ? '600' : '400'};
          line-height: 1.2;
        }

        .item-details span:first-child {
          flex: 1;
          min-width: 0;
          overflow-wrap: break-word;
          word-wrap: break-word;
          word-break: break-word;
          white-space: normal;
        }

        .item-details span:last-child {
          flex-shrink: 0;
          text-align: right;
          white-space: nowrap;
        }

        .item-code {
          font-size: ${webPrintLegible ? (is58mm ? '9pt' : '10pt') : (is58mm ? '6pt' : '7pt')};
          color: #666;
          font-weight: ${webPrintLegible ? '600' : '400'};
          margin-top: 1px;
        }

        .totals-section {
          margin-top: 3px;
          padding: 2px 0;
          background: transparent;
          border-top: 1px solid #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: ${is58mm ? '2px' : '4px'};
          margin: 1px 0;
          font-size: ${webPrintLegible ? (is58mm ? '10pt' : '11pt') : (is58mm ? '7pt' : '8pt')};
          font-weight: ${webPrintLegible ? '700' : '600'};
          overflow: hidden;
          line-height: 1.2;
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
          font-size: ${webPrintLegible ? (is58mm ? '12pt' : '13pt') : (is58mm ? '9pt' : '10pt')};
          font-weight: 700;
          margin-top: 2px;
          padding: 4px 2px;
          background: #000;
          color: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .ticket-footer {
          margin-top: 4px;
          padding-top: 3px;
          border-top: 1px solid #000;
          text-align: center;
          font-size: ${webPrintLegible ? (is58mm ? '9pt' : '10pt') : (is58mm ? '6pt' : '7pt')};
          font-weight: ${webPrintLegible ? '600' : '400'};
        }

        .footer-text {
          margin: 1px 0;
          font-weight: ${webPrintLegible ? '600' : '400'};
          line-height: 1.2;
        }

        .representation-text {
          font-size: ${webPrintLegible ? (is58mm ? '9pt' : '10pt') : (is58mm ? '6pt' : '7pt')};
          margin-top: 3px;
          font-weight: 700;
          line-height: 1.2;
        }

        .qr-container {
          margin: 3px auto;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          max-width: 100%;
        }

        .qr-code {
          margin: 2px 0;
          max-width: ${is58mm ? '60px' : '80px'};
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
            className={`company-logo ${isSquareLogo ? 'square-logo' : ''}`}
            onLoad={handleLogoLoad}
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}

        <div className="company-name">{companySettings?.tradeName || companySettings?.name || 'MI EMPRESA'}</div>
        {!(invoice.documentType === 'nota_venta' && companySettings?.hideRucIgvInNotaVenta) && (
          <div className="company-info">RUC: {companySettings?.ruc || '00000000000'}</div>
        )}
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
        {companySettings?.socialMedia && (
          <div className="company-info">{companySettings.socialMedia}</div>
        )}

        <div className="document-type">{getDocumentTypeName()}</div>
        <div className="document-number">
          {getFormattedDocumentNumber()}
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
                <span>{customerData.documentNumber}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Nombre:</span>
                <span>{customerData.name}</span>
              </div>
            </>
          )}

          {invoice.documentType === 'factura' && (
            <>
              <div className="info-row">
                <span className="info-label">RUC:</span>
                <span>{customerData.documentNumber}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Razón Social:</span>
                <span>{customerData.businessName}</span>
              </div>
              {customerData.name && customerData.name !== 'VARIOS' && (
                <div className="info-row">
                  <span className="info-label">Nombre Comercial:</span>
                  <span>{customerData.name}</span>
                </div>
              )}
              {customerData.address && (
                <div className="info-row">
                  <span className="info-label">Dirección:</span>
                  <span>{customerData.address}</span>
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
                <span style={{ whiteSpace: 'normal' }}>{item.quantity} x {formatCurrency(item.price || item.unitPrice)}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{formatCurrency(item.quantity * (item.price || item.unitPrice))}</span>
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

        {/* Si hay descuento, mostrar subtotal antes del descuento */}
        {invoice.discount > 0 && (
          <div className="total-row">
            <span>Subtotal:</span>
            <span>{formatCurrency(invoice.subtotalBeforeDiscount || invoice.subtotal || 0)}</span>
          </div>
        )}

        {/* Descuento (si existe) */}
        {invoice.discount > 0 && (
          <div className="total-row">
            <span>Descuento:</span>
            <span>- {formatCurrency(invoice.discount)}</span>
          </div>
        )}

        {!(invoice.documentType === 'nota_venta' && companySettings?.hideRucIgvInNotaVenta) && (
          <>
            <div className="total-row">
              <span>{invoice.discount && invoice.discount > 0 ? 'OP. Gravada:' : 'Subtotal:'}</span>
              <span>{formatCurrency(invoice.subtotal || 0)}</span>
            </div>
            <div className="total-row">
              <span>IGV (18%):</span>
              <span>{formatCurrency(invoice.igv || invoice.tax || 0)}</span>
            </div>
          </>
        )}
        <div className="total-row final">
          <span>TOTAL A PAGAR:</span>
          <span>{formatCurrency(invoice.total || 0)}</span>
        </div>
      </div>

      {/* Estado de Pago (para notas de venta con pagos parciales o completados) */}
      {invoice.documentType === 'nota_venta' && invoice.paymentStatus && invoice.paymentHistory && invoice.paymentHistory.length > 0 && (
        <div className="ticket-section" style={{ borderTop: '2px dashed #000', paddingTop: '8px', marginTop: '8px' }}>
          <div className="section-title">
            {invoice.paymentStatus === 'partial' ? 'ESTADO DE PAGO' : 'DETALLE DE PAGOS'}
          </div>
          {invoice.paymentStatus === 'partial' && (
            <>
              <div className="info-row" style={{ marginBottom: '4px' }}>
                <span className="info-label">Monto Pagado:</span>
                <span style={{ fontWeight: 'bold' }}>{formatCurrency(invoice.amountPaid || 0)}</span>
              </div>
              <div className="info-row" style={{ marginBottom: '4px' }}>
                <span className="info-label">Saldo Pendiente:</span>
                <span style={{ fontWeight: 'bold', color: '#ff6600' }}>{formatCurrency(invoice.balance || 0)}</span>
              </div>
            </>
          )}
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '4px' }}>HISTORIAL DE PAGOS:</div>
            {invoice.paymentHistory.map((payment, index) => (
              <div key={index} style={{ fontSize: '8px', marginBottom: '2px', paddingLeft: '4px' }}>
                • {new Date(payment.date?.toDate ? payment.date.toDate() : payment.date).toLocaleDateString('es-PE')} - {formatCurrency(payment.amount)} ({payment.method})
              </div>
            ))}
          </div>
        </div>
      )}

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
            {/* Hash SUNAT */}
            {invoice.sunatHash && (
              <div style={{
                fontSize: '7px',
                marginTop: '8px',
                textAlign: 'left',
                wordBreak: 'break-all',
                padding: '0 4px'
              }}>
                <span style={{ fontWeight: '700' }}>Hash: </span>
                <span style={{ fontWeight: '500' }}>{invoice.sunatHash}</span>
              </div>
            )}

            <div className="qr-container">
              <QRCodeSVG
                value={generateQRData()}
                size={70}
                level="M"
                className="qr-code"
                includeMargin={true}
              />
              <div style={{ fontSize: '8px', color: '#000', marginTop: '5px', fontWeight: '500' }}>
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
