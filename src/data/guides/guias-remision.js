/**
 * GUÍA DE USO: Guías de Remisión (GRE Remitente)
 *
 * Nombres verificados contra src/pages/DispatchGuides.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'guias-remision',
  actualizado: '12/08/2026',
  intro:
    'La guía de remisión es el documento que ampara el traslado de mercadería: dice qué se mueve, desde dónde, hacia dónde y en qué vehículo. Va a SUNAT igual que una factura, y es la que te piden si te fiscalizan en el camino.',

  sections: [
    {
      id: 'cuando',
      title: 'Cuándo necesitas una',
      blocks: [
        {
          type: 'texto',
          text: 'Siempre que la mercadería se traslade físicamente: cuando la despachas a un cliente, cuando la mueves entre tus locales o cuando la mandas en consignación. El **Motivo** del traslado se elige al emitirla: Venta, Compra, Traslado entre establecimientos o Consignación.',
        },
        {
          type: 'ojo',
          text: 'La factura no reemplaza a la guía. Son documentos distintos: la factura sustenta la venta, la guía sustenta el traslado.',
        },
      ],
    },

    {
      id: 'emitir',
      title: 'Emitir una guía',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Crea la guía (o genérala desde el comprobante de venta, que arrastra cliente y productos).',
            'Completa **Origen y Destino**: el punto de partida y el punto de llegada con sus direcciones.',
            'Llena los **Datos de Transporte**: la **Modalidad**, la **Placa** del vehículo, el **Conductor** con su **DNI** y su **Licencia**.',
            'Revisa los **Bienes a Transportar** y el **Peso total**.',
            'Emite: la guía se envía a SUNAT y queda con su **XML SUNAT** y su **CDR SUNAT**.',
          ],
        },
        {
          type: 'consejo',
          text: 'Si haces despachos parecidos seguido, **Clonar guía** te copia una anterior y solo cambias lo que corresponde.',
        },
      ],
    },

    {
      id: 'stock',
      title: 'Guía y stock',
      blocks: [
        {
          type: 'texto',
          text: 'La guía puede **Descontar stock** al emitirse, para los traslados que efectivamente sacan mercadería. Si te equivocaste, existe **Revertir descuento**.',
        },
        {
          type: 'ojo',
          text: 'Ojo con descontar dos veces: si ya emitiste la factura y esa venta descontó el stock, la guía del mismo despacho no debería volver a descontarlo.',
        },
      ],
    },

    {
      id: 'anular',
      title: 'Anular una guía',
      blocks: [
        {
          type: 'texto',
          text: 'Si el traslado no se hizo o la guía salió mal, usa **Anular Guía de Remisión**. La anulación se comunica a SUNAT y la guía queda como **Traslado cancelado**.',
        },
        {
          type: 'texto',
          text: 'Los estados que verás en el listado son **En Tránsito** y **Entregadas**, además de las anuladas.',
        },
      ],
    },

    {
      id: 'errores',
      title: 'Si SUNAT la rechaza',
      blocks: [
        {
          type: 'texto',
          text: 'Los rechazos más comunes tienen nombre claro en el listado: **Error en datos del destinatario**, **Error en datos del transporte**, **Error en datos de la guía** o **Duplicidad de documento**. El mensaje te dice qué corregir.',
        },
        {
          type: 'consejo',
          text: 'La mayoría de rechazos son por el transporte: placa mal escrita, DNI del conductor incompleto o licencia vencida. Ten esos datos a mano y guardados antes de despachar.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Cuál es la diferencia entre GRE Remitente y GRE Transportista?',
      a: 'La **Remitente** la emite quien manda la mercadería (tú). La **Transportista** la emite la empresa de transporte que la lleva. Si contratas un transportista, cada uno emite la suya.',
    },
    {
      q: '¿Puedo emitir la guía desde la venta?',
      a: 'Sí. Desde el comprobante en la página Ventas tienes **Generar Guía de Remisión** y llega con el cliente y los productos ya cargados.',
    },
    {
      q: 'Me detuvieron y pidieron la guía, ¿la puedo mostrar en el celular?',
      a: 'Puedes descargar el PDF o imprimirla. Lo que respalda el traslado es la guía aceptada por SUNAT, con su CDR.',
    },
  ],
}
