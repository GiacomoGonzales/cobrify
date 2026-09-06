import { forwardRef } from 'react'
import React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  seccionesDeGuiaParaTicket,
  encabezadoDeGuia,
  datosQrDeLaGuia,
  PIE_DE_TICKET,
} from '@/utils/guiaTicketDatos'

/**
 * Componente de Ticket Imprimible para Guía de Remisión
 * Formato idéntico a InvoiceTicket para impresoras térmicas 80mm/58mm
 */
const DispatchGuideTicket = forwardRef(({ guide, companySettings, paperWidth = 80, printMargins = 8, simplePrint = false }, ref) => {
  // Determinar si es papel de 58mm o 80mm
  const is58mm = paperWidth === 58

  // El motivo sale del catálogo compartido: este ticket y el PDF A4 tienen
  // que decir lo MISMO de la misma guía.

  // TODO el contenido —las secciones, sus etiquetas y sus valores— sale de
  // `guiaTicketDatos`, que comparte con el ticket en PDF. Antes estaba escrito
  // acá y el PDF A4 tenía su propia versión: la misma guía llegó a imprimir dos
  // motivos de traslado distintos.
  const enc = encabezadoDeGuia(guide, companySettings)
  const secciones = seccionesDeGuiaParaTicket(guide)

  return (
    <div ref={ref} className="guide-ticket-container">
      {/* Estilos de impresión - idénticos a InvoiceTicket */}
      <style>{`
        @media print {
          @page {
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
          ${simplePrint ? `
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          color: #000;
          ` : `
          background: #000;
          color: #fff;
          `}
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
        <div className="company-name">{enc.nombre}</div>
        <div className="company-info">RUC: {enc.ruc}</div>
        {enc.direccion && <div className="company-info">{enc.direccion}</div>}
        {enc.telefono && <div className="company-info">Tel: {enc.telefono}</div>}
        {enc.sucursal && <div className="company-info">Sucursal: {enc.sucursal}</div>}

        <div className="document-type">{enc.tipo}</div>
        <div className="document-number">{enc.numero}</div>
      </div>

      {secciones.map((seccion, i) => (
        <div className="ticket-section" key={i}>
          {seccion.titulo && <div className="section-title">{seccion.titulo}</div>}

          {(seccion.filas || []).map((fila, k) => (
            <div className="info-row" key={k}>
              <span className="info-label">{fila.etiqueta}:</span>
              <span>{fila.valor}</span>
            </div>
          ))}

          {seccion.destacado && <div className="weight-box">{seccion.destacado}</div>}
          {seccion.texto && <div className="address-text">{seccion.texto}</div>}
          {seccion.nota && (
            <div className="address-text" style={{ textAlign: 'center', fontStyle: 'italic' }}>
              {seccion.nota}
            </div>
          )}

          {seccion.items && (
            <div className="items-table">
              <div className="items-header">
                <span>Cant</span>
                <span>Und</span>
                <span>Descripción</span>
              </div>
              {seccion.items.map((item, k) => (
                <div key={k}>
                  <div className="item-row">
                    <span>{item.cantidad}</span>
                    <span>{item.unidad}</span>
                    <span>{item.descripcion}</span>
                  </div>
                  {item.serie && (
                    <div className="item-code" style={{ paddingLeft: '10px', fontSize: '9px' }}>
                      S/N: {item.serie}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* QR Code */}
      <div className="qr-container">
        <QRCodeSVG
          value={datosQrDeLaGuia(guide, companySettings?.ruc)}
          size={is58mm ? 50 : 70}
          level="M"
        />
      </div>

      {/* Footer */}
      <div className="ticket-footer">
        {PIE_DE_TICKET.map((linea, i) => (
          <p
            className="footer-text"
            key={i}
            style={i === PIE_DE_TICKET.length - 1
              ? { fontSize: is58mm ? '5pt' : '6pt', marginTop: '2px' }
              : undefined}
          >
            {linea}
          </p>
        ))}
      </div>
    </div>
  )
})

DispatchGuideTicket.displayName = 'DispatchGuideTicket'

export default DispatchGuideTicket
