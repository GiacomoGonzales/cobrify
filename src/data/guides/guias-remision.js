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
            'Elige el **Motivo de traslado**. Si eliges **Otros**, aparece un campo obligatorio, **Descripción del motivo**: ahí escribes en tus palabras de qué se trata (por ejemplo, "Disposición final"). Ese texto es el que recibe SUNAT y el que sale impreso en la guía; sin él, SUNAT la rechaza.',
            'Completa **Origen y Destino**: el punto de partida y el punto de llegada con sus direcciones.',
            'Llena los **Datos de Transporte**: la **Modalidad**, la **Placa** del vehículo, el **Conductor** con su **DNI** y su **Licencia**.',
            'Revisa los **Bienes a Transportar** y el **Peso total**. Cada ítem tiene su **Peso unit. (kg)**: si el producto ya lo tiene cargado en su ficha, viene puesto solo; si no, lo escribes ahí. El sistema multiplica por la cantidad, suma todas las líneas y llena el peso bruto total — y si prefieres poner el total a mano, el tuyo manda. La unidad del peso puede ser **KGM o TNE** (toneladas): al cambiarla, el número se convierte solo y SUNAT recibe el valor en esa unidad.',
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
      id: 'punto-llegada',
      title: 'Adónde llega la mercadería',
      blocks: [
        {
          type: 'texto',
          text: 'El punto de llegada tiene dos partes: la **dirección** escrita y el **departamento, provincia y distrito**. La segunda es la que SUNAT lee de verdad; la dirección es texto libre. Por eso no basta con que la calle esté bien.',
        },
        {
          type: 'texto',
          text: 'Tienes tres formas de completarlo, de la más rápida a la más manual:',
        },
        {
          type: 'pasos',
          items: [
            '**Dirección de entrega**: si el cliente tiene direcciones guardadas en su ficha, este desplegable las ofrece y completa dirección y distrito de una vez.',
            '**Ver establecimientos**: consulta a SUNAT los locales anexos del RUC en el momento. Trae también el distrito.',
            'A mano: escribes la dirección y eliges los tres niveles.',
          ],
        },
        {
          type: 'consejo',
          text: 'Si le despachas seguido al mismo cliente, guarda sus direcciones una vez en su ficha. La consulta a SUNAT se paga cada vez que la usas y necesita internet; lo guardado, no.',
        },
        {
          type: 'enlace',
          to: '/app/clientes',
          label: 'Ir a Clientes para guardar sus direcciones',
        },
        {
          type: 'ojo',
          text: 'En la guía de **transportista** ahora se pide departamento, provincia y distrito en los cuatro bloques: remitente, destinatario, punto de partida y punto de llegada. Antes se podían dejar vacíos y el sistema declaraba **Lima** por defecto, así que un despacho a provincia salía con ubicaciones equivocadas sin que nadie se enterara.',
        },
        {
          type: 'consejo',
          text: 'No hace falta llenarlos a mano: al buscar el RUC del remitente o del destinatario, su distrito se completa solo. El campo **Ciudad** que está al lado es solo texto de referencia y no ubica nada ante SUNAT.',
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
