import { forwardRef } from 'react'
import React from 'react'
import { QRCodeSVG } from 'qrcode.react'

/**
 * Componente de Ticket Imprimible para Guía de Remisión
 *
 * Formato optimizado para impresoras térmicas de 80mm
 * Incluye todos los datos requeridos por SUNAT
 */
const DispatchGuideTicket = forwardRef(({ guide, companySettings, paperWidth = 80 }, ref) => {
  // Determinar si es papel de 58mm o 80mm
  const is58mm = paperWidth === 58

  // Motivos de traslado
  const TRANSFER_REASONS = {
    '01': 'Venta',
    '02': 'Compra',
    '04': 'Traslado entre establecimientos',
    '08': 'Importación',
    '09': 'Exportación',
    '13': 'Otros',
    '14': 'Venta sujeta a confirmación',
    '17': 'Traslado para transformación',
    '18': 'Traslado emisor itinerante',
    '19': 'Traslado a zona primaria',
  }

  // Modos de transporte
  const TRANSPORT_MODES = {
    '01': 'Transporte Público',
    '02': 'Transporte Privado',
  }

  // Unidades de medida
  const UNITS = {
    'NIU': 'UND',
    'KGM': 'KG',
    'LTR': 'LT',
    'MTR': 'MT',
    'GLL': 'GAL',
    'BOX': 'CJ',
    'PK': 'PQ',
    'DZN': 'DOC',
    'TNE': 'TN',
  }

  // Formatear fecha
  const formatDate = (dateValue) => {
    if (!dateValue) return '-'

    // Si es formato YYYY-MM-DD, formatear directamente
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [year, month, day] = dateValue.split('-')
      return `${day}/${month}/${year}`
    }

    // Si es Timestamp de Firestore o Date
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue)
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  // Generar código QR según formato SUNAT para guías
  const generateQRData = () => {
    const ruc = companySettings?.ruc || '00000000000'
    const tipoDoc = guide.documentType === '31' ? '31' : '09'
    const serie = guide.series || guide.number?.split('-')[0] || 'T001'
    const numero = guide.number?.split('-')[1] || '1'
    const fecha = formatDate(guide.issueDate || guide.transferDate)

    return `${ruc}|${tipoDoc}|${serie}|${numero}|${fecha}`
  }

  // Obtener datos del destinatario
  const getRecipientData = () => {
    if (guide.recipient) {
      return {
        documentNumber: guide.recipient.documentNumber || guide.recipient.ruc || '-',
        name: guide.recipient.name || guide.recipient.businessName || '-',
        address: guide.recipient.address || '-',
      }
    }
    return {
      documentNumber: '-',
      name: '-',
      address: '-',
    }
  }

  const recipientData = getRecipientData()

  // Obtener datos del transportista/conductor
  const getTransportData = () => {
    if (guide.transportMode === '02') {
      // Transporte privado
      return {
        type: 'Privado',
        vehicle: guide.transport?.vehicle?.plate || guide.vehicle?.plate || '-',
        driver: guide.transport?.driver
          ? `${guide.transport.driver.name || ''} ${guide.transport.driver.lastName || ''}`.trim() || '-'
          : guide.driver?.name || '-',
        license: guide.transport?.driver?.license || guide.driver?.license || '-',
      }
    } else {
      // Transporte público
      return {
        type: 'Público',
        carrier: guide.transport?.carrier?.businessName || guide.carrier?.businessName || '-',
        carrierRuc: guide.transport?.carrier?.ruc || guide.carrier?.ruc || '-',
      }
    }
  }

  const transportData = getTransportData()

  return (
    <div ref={ref} className="dispatch-ticket-container">
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

          .dispatch-ticket-container,
          .dispatch-ticket-container * {
            visibility: visible;
          }

          .dispatch-ticket-container {
            position: absolute;
            left: 0;
            top: 0;
            width: ${paperWidth}mm !important;
            max-width: ${paperWidth}mm !important;
            margin: 0 auto !important;
            padding: ${is58mm ? '1.5mm 6mm' : '2mm 8mm'} !important;
            box-sizing: border-box;
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${is58mm ? '7pt' : '8pt'};
            line-height: 1.2;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: hidden;
          }
        }

        * {
          box-sizing: border-box;
        }

        .dispatch-ticket-container {
          max-width: ${paperWidth}mm;
          margin: 0 auto;
          padding: ${is58mm ? '1.5mm' : '2mm'};
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${is58mm ? '8pt' : '9pt'};
          line-height: 1.2;
          background: white;
          color: #000;
          box-sizing: border-box;
          text-transform: uppercase;
        }

        .ticket-header {
          text-align: center;
          margin-bottom: 3px;
          border-bottom: 2px solid #000;
          padding-bottom: 3px;
        }

        .company-name {
          font-size: ${is58mm ? '9pt' : '10pt'};
          font-weight: 700;
          margin-bottom: 1px;
          color: #000;
        }

        .company-info {
          font-size: ${is58mm ? '7pt' : '8pt'};
          margin: 0.5px 0;
          color: #000;
        }

        .document-type {
          font-size: ${is58mm ? '8pt' : '9pt'};
          font-weight: 700;
          margin: 3px 0 2px 0;
          padding: 2px 4px;
          background: #000;
          color: #fff;
          text-transform: uppercase;
        }

        .document-number {
          font-size: ${is58mm ? '10pt' : '11pt'};
          font-weight: 700;
          margin: 2px 0;
          color: #000;
        }

        .ticket-section {
          margin: 3px 0;
          border-bottom: 1px dashed #999;
          padding-bottom: 3px;
        }

        .ticket-section:last-child {
          border-bottom: none;
        }

        .section-title {
          font-size: ${is58mm ? '7pt' : '8pt'};
          font-weight: 700;
          margin-bottom: 2px;
          text-transform: uppercase;
          background: #eee;
          padding: 1px 3px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          font-size: ${is58mm ? '6.5pt' : '7.5pt'};
          margin: 1px 0;
          gap: 4px;
        }

        .info-label {
          font-weight: 600;
          min-width: 35%;
          flex-shrink: 0;
        }

        .info-value {
          text-align: right;
          flex: 1;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        .items-section {
          margin: 3px 0;
        }

        .items-header {
          display: flex;
          font-size: ${is58mm ? '6pt' : '7pt'};
          font-weight: 700;
          border-bottom: 1px solid #000;
          padding-bottom: 1px;
          margin-bottom: 2px;
        }

        .items-header span:nth-child(1) { width: 15%; text-align: center; }
        .items-header span:nth-child(2) { width: 15%; text-align: center; }
        .items-header span:nth-child(3) { width: 70%; }

        .item-row {
          display: flex;
          font-size: ${is58mm ? '6pt' : '7pt'};
          margin: 1px 0;
          border-bottom: 1px dotted #ddd;
          padding-bottom: 1px;
        }

        .item-row span:nth-child(1) { width: 15%; text-align: center; }
        .item-row span:nth-child(2) { width: 15%; text-align: center; }
        .item-row span:nth-child(3) { width: 70%; word-wrap: break-word; }

        .qr-section {
          text-align: center;
          margin: 4px 0;
          padding: 3px 0;
        }

        .ticket-footer {
          text-align: center;
          font-size: ${is58mm ? '6pt' : '7pt'};
          margin-top: 3px;
          padding-top: 3px;
          border-top: 1px solid #000;
        }

        .footer-text {
          margin: 1px 0;
        }

        .weight-info {
          font-size: ${is58mm ? '7pt' : '8pt'};
          font-weight: 600;
          text-align: center;
          margin: 2px 0;
          padding: 2px;
          background: #f0f0f0;
        }
      `}</style>

      {/* Header - Datos del Emisor */}
      <div className="ticket-header">
        <div className="company-name">
          {companySettings?.tradeName || companySettings?.name || 'EMPRESA'}
        </div>
        <div className="company-info">RUC: {companySettings?.ruc || '-'}</div>
        <div className="company-info">{companySettings?.address || ''}</div>

        <div className="document-type">
          {guide.documentType === '31' ? 'GUÍA REMISIÓN TRANSPORTISTA' : 'GUÍA DE REMISIÓN REMITENTE'}
        </div>
        <div className="document-number">{guide.number || '-'}</div>
      </div>

      {/* Fechas */}
      <div className="ticket-section">
        <div className="info-row">
          <span className="info-label">F. EMISIÓN:</span>
          <span className="info-value">{formatDate(guide.issueDate || guide.createdAt)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">F. TRASLADO:</span>
          <span className="info-value">{formatDate(guide.transferDate)}</span>
        </div>
      </div>

      {/* Destinatario */}
      <div className="ticket-section">
        <div className="section-title">DESTINATARIO</div>
        <div className="info-row">
          <span className="info-label">DOC:</span>
          <span className="info-value">{recipientData.documentNumber}</span>
        </div>
        <div className="info-row">
          <span className="info-label">NOMBRE:</span>
          <span className="info-value">{recipientData.name}</span>
        </div>
      </div>

      {/* Motivo y Peso */}
      <div className="ticket-section">
        <div className="section-title">DATOS DEL TRASLADO</div>
        <div className="info-row">
          <span className="info-label">MOTIVO:</span>
          <span className="info-value">{TRANSFER_REASONS[guide.transferReason] || guide.transferReason || '-'}</span>
        </div>
        <div className="weight-info">
          PESO: {guide.totalWeight || guide.weight || '0'} {guide.weightUnit || 'KGM'}
        </div>
      </div>

      {/* Origen */}
      <div className="ticket-section">
        <div className="section-title">PUNTO DE PARTIDA</div>
        <div className="info-row">
          <span className="info-value" style={{ textAlign: 'left', width: '100%' }}>
            {guide.origin?.address || guide.originAddress || '-'}
          </span>
        </div>
        {guide.origin?.ubigeo && (
          <div className="info-row">
            <span className="info-label">UBIGEO:</span>
            <span className="info-value">{guide.origin.ubigeo}</span>
          </div>
        )}
      </div>

      {/* Destino */}
      <div className="ticket-section">
        <div className="section-title">PUNTO DE LLEGADA</div>
        <div className="info-row">
          <span className="info-value" style={{ textAlign: 'left', width: '100%' }}>
            {guide.destination?.address || guide.destinationAddress || '-'}
          </span>
        </div>
        {guide.destination?.ubigeo && (
          <div className="info-row">
            <span className="info-label">UBIGEO:</span>
            <span className="info-value">{guide.destination.ubigeo}</span>
          </div>
        )}
      </div>

      {/* Transporte */}
      <div className="ticket-section">
        <div className="section-title">TRANSPORTE ({transportData.type})</div>
        {guide.transportMode === '02' ? (
          <>
            <div className="info-row">
              <span className="info-label">PLACA:</span>
              <span className="info-value">{transportData.vehicle}</span>
            </div>
            <div className="info-row">
              <span className="info-label">CONDUCTOR:</span>
              <span className="info-value">{transportData.driver}</span>
            </div>
            <div className="info-row">
              <span className="info-label">LICENCIA:</span>
              <span className="info-value">{transportData.license}</span>
            </div>
          </>
        ) : (
          <>
            <div className="info-row">
              <span className="info-label">TRANSPORTISTA:</span>
              <span className="info-value">{transportData.carrier}</span>
            </div>
            <div className="info-row">
              <span className="info-label">RUC:</span>
              <span className="info-value">{transportData.carrierRuc}</span>
            </div>
          </>
        )}
      </div>

      {/* Items */}
      <div className="ticket-section items-section">
        <div className="section-title">BIENES A TRANSPORTAR ({guide.items?.length || 0})</div>
        <div className="items-header">
          <span>CANT</span>
          <span>UND</span>
          <span>DESCRIPCIÓN</span>
        </div>
        {(guide.items || []).map((item, index) => (
          <div key={index} className="item-row">
            <span>{item.quantity || 0}</span>
            <span>{UNITS[item.unit] || item.unit || 'UND'}</span>
            <span>{item.description || item.name || '-'}</span>
          </div>
        ))}
      </div>

      {/* QR Code */}
      <div className="qr-section">
        <QRCodeSVG
          value={generateQRData()}
          size={is58mm ? 60 : 80}
          level="M"
        />
      </div>

      {/* Footer */}
      <div className="ticket-footer">
        <p className="footer-text">REPRESENTACIÓN IMPRESA DE LA</p>
        <p className="footer-text">GUÍA DE REMISIÓN ELECTRÓNICA</p>
        <p className="footer-text" style={{ fontSize: is58mm ? '5pt' : '6pt', marginTop: '2px' }}>
          Consulte en: www.sunat.gob.pe
        </p>
      </div>
    </div>
  )
})

DispatchGuideTicket.displayName = 'DispatchGuideTicket'

export default DispatchGuideTicket
