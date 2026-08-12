/**
 * GUÍA DE USO: Cotizaciones
 *
 * Nombres verificados contra src/pages/Quotations.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'cotizaciones',
  actualizado: '12/08/2026',
  intro:
    'Una cotización es la propuesta de precio que le pasas a un cliente antes de vender. No va a SUNAT ni descuenta stock: es un documento comercial. Si el cliente acepta, se convierte en comprobante con un clic.',

  sections: [
    {
      id: 'crear',
      title: 'Crear una cotización',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Nueva Cotización**.',
            'Elige el cliente (o escribe sus datos si es nuevo).',
            'Agrega los productos con sus cantidades y precios.',
            'Define hasta cuándo es válida: aparece como **Válida Hasta** en el documento.',
            'Guarda y compártela.',
          ],
        },
        { type: 'ui', kind: 'boton', label: 'Nueva Cotización' },
        {
          type: 'consejo',
          text: 'Pon siempre una fecha de validez. Es tu protección cuando el cliente vuelve tres meses después pidiendo el precio de entonces.',
        },
      ],
    },

    {
      id: 'compartir',
      title: 'Compartirla con el cliente',
      blocks: [
        {
          type: 'texto',
          text: 'Tienes **Descargar PDF** para mandarla por correo o WhatsApp, e **Imprimir ticket** si prefieres entregarla en papel desde la ticketera.',
        },
        {
          type: 'texto',
          text: 'El botón **Duplicar** crea una copia: sirve para el cliente que pide lo mismo con una variante, o para rearmar una cotización vencida con precios nuevos.',
        },
      ],
    },

    {
      id: 'estados',
      title: 'Seguimiento: en qué quedó cada una',
      blocks: [
        {
          type: 'texto',
          text: 'Cada cotización tiene su estado: **Borrador**, **Enviada**, **Aceptada**, **Rechazada** o **Convertida**. Los filtros de arriba te dejan ver cuántas están en cada uno.',
        },
        {
          type: 'consejo',
          text: 'Mantener los estados al día convierte esta pantalla en tu embudo de ventas: cuántas propuestas mandaste, cuántas cerraste y cuántas se enfriaron sin respuesta.',
        },
      ],
    },

    {
      id: 'convertir',
      title: 'Convertirla en venta',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando el cliente acepta, usa **Convertir a Factura**: se emite el comprobante con los productos y precios de la cotización, sin volver a cargarlos. Ahí recién se descuenta el stock y el documento va a SUNAT.',
        },
        {
          type: 'texto',
          text: 'Si la operación implica trasladar mercadería, también puedes **Crear Guía Remitente** desde la cotización.',
        },
        {
          type: 'ojo',
          text: 'Una cotización **no reserva stock**. Si cotizaste diez unidades y mientras tanto vendiste ocho, al convertirla te vas a encontrar con que faltan.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿La cotización descuenta inventario?',
      a: 'No. Solo el comprobante de venta mueve stock. La cotización es una propuesta; hasta que no se convierte, no pasa nada con tu inventario.',
    },
    {
      q: 'El cliente aceptó pero quiere cambiar una cantidad.',
      a: 'Edítala antes de convertirla, o **Duplícala** y ajusta la copia si quieres conservar la propuesta original como referencia.',
    },
    {
      q: '¿Puedo cotizar a alguien que no está registrado?',
      a: 'Sí, escribes sus datos directamente. Si después se convierte en cliente habitual, queda guardado al emitirle el comprobante.',
    },
    {
      q: '¿Las cotizaciones aparecen en mis reportes de ventas?',
      a: 'No, porque no son ventas. Solo cuentan cuando se convierten en boleta o factura.',
    },
  ],
}
