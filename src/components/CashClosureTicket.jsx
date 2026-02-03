import { forwardRef } from 'react'
import React from 'react'

/**
 * Componente de Ticket de Cierre de Caja
 * Formato para impresoras térmicas (58mm y 80mm)
 */
const CashClosureTicket = forwardRef(({
  sessionData,
  movements = [],
  invoices = [],
  companySettings,
  paperWidth = 80,
  branchName = null
}, ref) => {
  // Estado para detectar si el logo es cuadrado
  const [isSquareLogo, setIsSquareLogo] = React.useState(false)

  // Determinar si es papel de 58mm o 80mm
  const is58mm = paperWidth === 58

  // Función para detectar si la imagen es cuadrada
  const handleLogoLoad = (e) => {
    const img = e.target
    const aspectRatio = img.naturalWidth / img.naturalHeight
    setIsSquareLogo(aspectRatio >= 0.8 && aspectRatio <= 1.2)
  }

  // Helper para convertir fechas
  const getDateFromTimestamp = (timestamp) => {
    if (!timestamp) return null
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate()
    }
    if (timestamp instanceof Date) {
      return timestamp
    }
    return new Date(timestamp)
  }

  // Formatear fecha para mostrar
  const formatDate = (dateValue) => {
    const date = getDateFromTimestamp(dateValue)
    if (!date) return '-'
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const formatTime = (dateValue) => {
    const date = getDateFromTimestamp(dateValue)
    if (!date) return '-'
    return date.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDateTime = (dateValue) => {
    const date = getDateFromTimestamp(dateValue)
    if (!date) return '-'
    return `${formatDate(dateValue)} ${formatTime(dateValue)}`
  }

  // Formatear moneda
  const formatCurrency = (value) => {
    return `S/ ${Number(value || 0).toFixed(2)}`
  }

  // Calcular totales de movimientos
  const totalIncome = movements
    .filter(m => m.type === 'income')
    .reduce((sum, m) => sum + (m.amount || 0), 0)

  const totalExpense = movements
    .filter(m => m.type === 'expense')
    .reduce((sum, m) => sum + (m.amount || 0), 0)

  // Datos de la sesión
  const openingAmount = sessionData?.openingAmount || 0
  const totalSales = sessionData?.totalSales || 0
  const salesCash = sessionData?.salesCash || 0
  const salesCard = sessionData?.salesCard || 0
  const salesTransfer = sessionData?.salesTransfer || 0
  const salesYape = sessionData?.salesYape || 0
  const salesPlin = sessionData?.salesPlin || 0
  const salesRappi = sessionData?.salesRappi || 0
  const salesPedidosYa = sessionData?.salesPedidosYa || 0
  const expectedAmount = sessionData?.expectedAmount || 0
  const closingCash = sessionData?.closingCash || 0
  const closingCard = sessionData?.closingCard || 0
  const closingTransfer = sessionData?.closingTransfer || 0
  const closingAmount = sessionData?.closingAmount || 0
  const difference = sessionData?.difference || (closingAmount - expectedAmount)

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
            padding: ${is58mm ? '1.5mm 8mm' : '2mm 8mm'} !important;
            box-sizing: border-box;
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${is58mm ? '7pt' : '8pt'};
            font-weight: 400;
            line-height: 1.2;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
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
          font-size: ${is58mm ? '8pt' : '9pt'};
          font-weight: 400;
          line-height: 1.2;
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

        .company-logo.square-logo {
          max-width: ${is58mm ? '70px' : '100px'};
          max-height: ${is58mm ? '70px' : '100px'};
        }

        .company-name {
          font-size: ${is58mm ? '9pt' : '11pt'};
          font-weight: 700;
          margin-bottom: 1px;
          color: #000;
          letter-spacing: 0.3px;
        }

        .company-info {
          font-size: ${is58mm ? '7pt' : '8pt'};
          font-weight: 400;
          margin: 0.5px 0;
          color: #000;
          line-height: 1.2;
        }

        .document-type {
          font-size: ${is58mm ? '9pt' : '10pt'};
          font-weight: 700;
          margin: 6px 0 4px 0;
          padding: 3px 6px;
          background: #000;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .ticket-section {
          margin: 4px 0;
          border-bottom: 1px dashed #ccc;
          padding-bottom: 4px;
        }

        .ticket-section:last-child {
          border-bottom: none;
        }

        .section-title {
          font-weight: 700;
          font-size: ${is58mm ? '7pt' : '8pt'};
          margin-bottom: 2px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #000;
          border-bottom: 1px solid #000;
          padding-bottom: 1px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: ${is58mm ? '2px' : '4px'};
          margin: 2px 0;
          font-size: ${is58mm ? '7pt' : '8pt'};
          font-weight: 400;
          overflow: hidden;
          line-height: 1.3;
        }

        .info-label {
          font-weight: 600;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .info-row span:last-child {
          text-align: right;
          overflow-wrap: break-word;
          word-wrap: break-word;
          word-break: break-word;
          white-space: normal;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: ${is58mm ? '2px' : '4px'};
          margin: 2px 0;
          font-size: ${is58mm ? '7pt' : '8pt'};
          font-weight: 600;
          overflow: hidden;
          line-height: 1.3;
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

        .total-row.highlight {
          font-size: ${is58mm ? '8pt' : '9pt'};
          font-weight: 700;
          margin-top: 4px;
          padding: 4px 2px;
          background: #000;
          color: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .total-row.difference-positive {
          background: #16a34a;
          color: #fff;
        }

        .total-row.difference-negative {
          background: #dc2626;
          color: #fff;
        }

        .total-row.difference-zero {
          background: #000;
          color: #fff;
        }

        .separator {
          border-top: 1px dashed #000;
          margin: 4px 0;
        }

        .separator-double {
          border-top: 2px solid #000;
          margin: 6px 0;
        }

        .ticket-footer {
          margin-top: 6px;
          padding-top: 4px;
          border-top: 1px solid #000;
          text-align: center;
          font-size: ${is58mm ? '6pt' : '7pt'};
          font-weight: 400;
        }

        .footer-text {
          margin: 2px 0;
          font-weight: 400;
          line-height: 1.2;
        }

        .sub-item {
          padding-left: 8px;
          font-size: ${is58mm ? '6.5pt' : '7.5pt'};
          color: #333;
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
        <div className="company-info">RUC: {companySettings?.ruc || '00000000000'}</div>
        <div className="company-info">{companySettings?.address || ''}</div>

        {branchName && (
          <div className="company-info" style={{ fontWeight: 600, marginTop: '2px' }}>
            Sucursal: {branchName}
          </div>
        )}

        <div className="document-type">CIERRE DE CAJA</div>
      </div>

      {/* Información de la Sesión */}
      <div className="ticket-section">
        <div className="info-row">
          <span className="info-label">Apertura:</span>
          <span>{formatDateTime(sessionData?.openedAt)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Cierre:</span>
          <span>{formatDateTime(sessionData?.closedAt)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Comprobantes:</span>
          <span>{sessionData?.invoiceCount ?? invoices.length}</span>
        </div>
      </div>

      {/* Monto Inicial */}
      <div className="ticket-section">
        <div className="section-title">Apertura</div>
        <div className="total-row">
          <span>Monto Inicial:</span>
          <span>{formatCurrency(openingAmount)}</span>
        </div>
      </div>

      {/* Ventas por Método de Pago */}
      <div className="ticket-section">
        <div className="section-title">Ventas del Día</div>

        {salesCash > 0 && (
          <div className="info-row">
            <span className="info-label">Efectivo:</span>
            <span>{formatCurrency(salesCash)}</span>
          </div>
        )}
        {salesCard > 0 && (
          <div className="info-row">
            <span className="info-label">Tarjeta:</span>
            <span>{formatCurrency(salesCard)}</span>
          </div>
        )}
        {salesTransfer > 0 && (
          <div className="info-row">
            <span className="info-label">Transferencia:</span>
            <span>{formatCurrency(salesTransfer)}</span>
          </div>
        )}
        {salesYape > 0 && (
          <div className="info-row">
            <span className="info-label">Yape:</span>
            <span>{formatCurrency(salesYape)}</span>
          </div>
        )}
        {salesPlin > 0 && (
          <div className="info-row">
            <span className="info-label">Plin:</span>
            <span>{formatCurrency(salesPlin)}</span>
          </div>
        )}
        {salesRappi > 0 && (
          <div className="info-row">
            <span className="info-label">Rappi:</span>
            <span>{formatCurrency(salesRappi)}</span>
          </div>
        )}
        {salesPedidosYa > 0 && (
          <div className="info-row">
            <span className="info-label">PedidosYa:</span>
            <span>{formatCurrency(salesPedidosYa)}</span>
          </div>
        )}

        <div className="separator" />
        <div className="total-row" style={{ fontWeight: 700 }}>
          <span>Total Ventas:</span>
          <span>{formatCurrency(totalSales)}</span>
        </div>
      </div>

      {/* Otros Movimientos (si existen) */}
      {(totalIncome > 0 || totalExpense > 0) && (
        <div className="ticket-section">
          <div className="section-title">Otros Movimientos</div>

          {totalIncome > 0 && (
            <div className="info-row">
              <span className="info-label">+ Ingresos:</span>
              <span>{formatCurrency(totalIncome)}</span>
            </div>
          )}
          {totalExpense > 0 && (
            <div className="info-row">
              <span className="info-label">- Egresos:</span>
              <span>{formatCurrency(totalExpense)}</span>
            </div>
          )}
        </div>
      )}

      {/* Efectivo Esperado */}
      <div className="ticket-section">
        <div className="section-title">Cálculo</div>
        <div className="info-row sub-item">
          <span>Apertura:</span>
          <span>{formatCurrency(openingAmount)}</span>
        </div>
        <div className="info-row sub-item">
          <span>+ Ventas Efectivo:</span>
          <span>{formatCurrency(salesCash)}</span>
        </div>
        {totalIncome > 0 && (
          <div className="info-row sub-item">
            <span>+ Ingresos:</span>
            <span>{formatCurrency(totalIncome)}</span>
          </div>
        )}
        {totalExpense > 0 && (
          <div className="info-row sub-item">
            <span>- Egresos:</span>
            <span>{formatCurrency(totalExpense)}</span>
          </div>
        )}
        <div className="separator" />
        <div className="total-row" style={{ fontWeight: 700 }}>
          <span>Efectivo Esperado:</span>
          <span>{formatCurrency(expectedAmount)}</span>
        </div>
      </div>

      {/* Conteo Real */}
      <div className="ticket-section">
        <div className="section-title">Conteo de Cierre</div>

        <div className="info-row">
          <span className="info-label">Efectivo:</span>
          <span>{formatCurrency(closingCash)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Tarjeta:</span>
          <span>{formatCurrency(closingCard)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Transferencia:</span>
          <span>{formatCurrency(closingTransfer)}</span>
        </div>

        <div className="separator" />
        <div className="total-row highlight">
          <span>Total Contado:</span>
          <span>{formatCurrency(closingAmount)}</span>
        </div>
      </div>

      {/* Diferencia */}
      <div className="ticket-section" style={{ borderBottom: 'none' }}>
        <div className={`total-row highlight ${
          difference > 0 ? 'difference-positive' :
          difference < 0 ? 'difference-negative' :
          'difference-zero'
        }`}>
          <span>
            Diferencia:
            {difference > 0 ? ' (Sobrante)' : difference < 0 ? ' (Faltante)' : ''}
          </span>
          <span>{formatCurrency(difference)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="ticket-footer">
        <div className="footer-text">
          Documento interno - Sin valor tributario
        </div>
        <div className="footer-text" style={{ marginTop: '4px' }}>
          {formatDateTime(new Date())}
        </div>
      </div>
    </div>
  )
})

CashClosureTicket.displayName = 'CashClosureTicket'

export default CashClosureTicket
