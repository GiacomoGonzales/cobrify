import { forwardRef } from 'react'
import React from 'react'
import { QRCodeSVG } from 'qrcode.react'

/**
 * Componente de Ticket Imprimible para Guía de Remisión
 * Formato idéntico a InvoiceTicket para impresoras térmicas 80mm/58mm
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
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [year, month, day] = dateValue.split('-')
      return `${day}/${month}/${year}`
    }
    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue)
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  // Generar código QR
  const generateQRData = () => {
    const ruc = companySettings?.ruc || '00000000000'
    const tipoDoc = guide.documentType === '31' ? '31' : '09'
    const serie = guide.series || guide.number?.split('-')[0] || 'T001'
    const numero = guide.number?.split('-')[1] || '1'
    return `${ruc}|${tipoDoc}|${serie}|${numero}`
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
    return { documentNumber: '-', name: '-', address: '-' }
  }

  const recipientData = getRecipientData()

  // Obtener datos del transporte
  const getTransportData = () => {
    if (guide.transportMode === '02') {
      return {
        type: 'PRIVADO',
        vehicle: guide.transport?.vehicle?.plate || guide.vehicle?.plate || '-',
        driver: guide.transport?.driver
          ? `${guide.transport.driver.name || ''} ${guide.transport.driver.lastName || ''}`.trim() || '-'
          : guide.driver?.name || '-',
        license: guide.transport?.driver?.license || guide.driver?.license || '-',
      }
    } else {
      return {
        type: 'PUBLICO',
        carrier: guide.transport?.carrier?.businessName || guide.carrier?.businessName || '-',
        carrierRuc: guide.transport?.carrier?.ruc || guide.carrier?.ruc || '-',
      }
    }
  }

  const transportData = getTransportData()

  return (
    <div ref={ref} className="guide-ticket-container">
      {/* Estilos de impresión - idénticos a InvoiceTicket */}
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

          .guide-ticket-container,
          .guide-ticket-container * {
            visibility: visible;
          }

          .guide-ticket-container {
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

        /* Ocultar en pantalla, mostrar solo al imprimir */
        @media screen {
          .guide-ticket-container {
            display: none;
          }
        }

        * {
          box-sizing: border-box;
        }

        .guide-ticket-container {
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
          border-bottom: 1px solid #000;
          padding-bottom: 3px;
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
          margin: 0.5px 0;
          color: #000;
          line-height: 1.2;
        }

        .document-type {
          font-size: ${is58mm ? '8pt' : '9pt'};
          font-weight: 700;
          margin: 3px 0 2px 0;
          padding: 2px 4px;
          background: #000;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .document-number {
          font-size: ${is58mm ? '9pt' : '10pt'};
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
          font-size: ${is58mm ? '7pt' : '8pt'};
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
          font-size: ${is58mm ? '7pt' : '8pt'};
          overflow: hidden;
          line-height: 1.2;
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
          word-break: break-word;
          hyphens: auto;
          white-space: normal;
        }

        .weight-box {
          text-align: center;
          font-size: ${is58mm ? '8pt' : '9pt'};
          font-weight: 700;
          padding: 2px 4px;
          margin: 2px 0;
          background: #eee;
          border: 1px solid #000;
        }

        .items-table {
          width: 100%;
          margin: 2px 0;
          font-size: ${is58mm ? '7pt' : '8pt'};
        }

        .items-header {
          border-bottom: 1px solid #000;
          padding-bottom: 1px;
          margin-bottom: 1px;
          font-weight: 700;
          display: flex;
        }

        .items-header span:nth-child(1) { width: 15%; text-align: center; }
        .items-header span:nth-child(2) { width: 15%; text-align: center; }
        .items-header span:nth-child(3) { width: 70%; }

        .item-row {
          display: flex;
          margin: 1px 0;
          padding: 1px 0;
          border-bottom: 1px dotted #ddd;
          font-size: ${is58mm ? '6.5pt' : '7.5pt'};
        }

        .item-row span:nth-child(1) { width: 15%; text-align: center; }
        .item-row span:nth-child(2) { width: 15%; text-align: center; }
        .item-row span:nth-child(3) { width: 70%; word-wrap: break-word; }

        .qr-container {
          margin: 3px auto;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .ticket-footer {
          margin-top: 4px;
          padding-top: 3px;
          border-top: 1px solid #000;
          text-align: center;
          font-size: ${is58mm ? '6pt' : '7pt'};
        }

        .footer-text {
          margin: 1px 0;
          line-height: 1.2;
        }

        .address-text {
          font-size: ${is58mm ? '6pt' : '7pt'};
          line-height: 1.1;
          text-align: left;
          margin: 1px 0;
        }
      `}</style>

      {/* HEADER - Datos del Emisor */}
      <div className="ticket-header">
        <div className="company-name">{companySettings?.tradeName || companySettings?.name || 'MI EMPRESA'}</div>
        <div className="company-info">RUC: {companySettings?.ruc || '00000000000'}</div>
        <div className="company-info">{companySettings?.address || ''}</div>
        {companySettings?.phone && (
          <div className="company-info">Tel: {companySettings.phone}</div>
        )}

        <div className="document-type">
          {guide.documentType === '31' ? 'GUÍA REMISIÓN TRANSPORTISTA' : 'GUÍA DE REMISIÓN'}
        </div>
        <div className="document-number">{guide.number || '-'}</div>
      </div>

      {/* Fechas */}
      <div className="ticket-section">
        <div className="info-row">
          <span className="info-label">F. Emisión:</span>
          <span>{formatDate(guide.issueDate || guide.createdAt)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">F. Traslado:</span>
          <span>{formatDate(guide.transferDate)}</span>
        </div>
      </div>

      {/* Destinatario */}
      <div className="ticket-section">
        <div className="section-title">Destinatario</div>
        <div className="info-row">
          <span className="info-label">Doc:</span>
          <span>{recipientData.documentNumber}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Nombre:</span>
          <span>{recipientData.name}</span>
        </div>
      </div>

      {/* Motivo y Peso */}
      <div className="ticket-section">
        <div className="section-title">Datos del Traslado</div>
        <div className="info-row">
          <span className="info-label">Motivo:</span>
          <span>{TRANSFER_REASONS[guide.transferReason] || guide.transferReason || '-'}</span>
        </div>
        <div className="weight-box">
          PESO: {guide.totalWeight || guide.weight || '0'} {guide.weightUnit || 'KGM'}
        </div>
      </div>

      {/* Origen */}
      <div className="ticket-section">
        <div className="section-title">Punto de Partida</div>
        <div className="address-text">
          {guide.origin?.address || guide.originAddress || '-'}
        </div>
        {guide.origin?.ubigeo && (
          <div className="info-row">
            <span className="info-label">Ubigeo:</span>
            <span>{guide.origin.ubigeo}</span>
          </div>
        )}
      </div>

      {/* Destino */}
      <div className="ticket-section">
        <div className="section-title">Punto de Llegada</div>
        <div className="address-text">
          {guide.destination?.address || guide.destinationAddress || '-'}
        </div>
        {guide.destination?.ubigeo && (
          <div className="info-row">
            <span className="info-label">Ubigeo:</span>
            <span>{guide.destination.ubigeo}</span>
          </div>
        )}
      </div>

      {/* Transporte */}
      <div className="ticket-section">
        <div className="section-title">Transporte {transportData.type}</div>
        {guide.transportMode === '02' ? (
          <>
            <div className="info-row">
              <span className="info-label">Placa:</span>
              <span>{transportData.vehicle}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Conductor:</span>
              <span>{transportData.driver}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Licencia:</span>
              <span>{transportData.license}</span>
            </div>
          </>
        ) : (
          <>
            <div className="info-row">
              <span className="info-label">Transportista:</span>
              <span>{transportData.carrier}</span>
            </div>
            <div className="info-row">
              <span className="info-label">RUC:</span>
              <span>{transportData.carrierRuc}</span>
            </div>
          </>
        )}
      </div>

      {/* Items */}
      <div className="ticket-section">
        <div className="section-title">Bienes ({guide.items?.length || 0})</div>
        <div className="items-table">
          <div className="items-header">
            <span>Cant</span>
            <span>Und</span>
            <span>Descripción</span>
          </div>
          {(guide.items || []).map((item, index) => (
            <div key={index} className="item-row">
              <span>{item.quantity || 0}</span>
              <span>{UNITS[item.unit] || item.unit || 'UND'}</span>
              <span>{item.description || item.name || '-'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* QR Code */}
      <div className="qr-container">
        <QRCodeSVG
          value={generateQRData()}
          size={is58mm ? 50 : 70}
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
