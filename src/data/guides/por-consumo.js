/**
 * GUÍA DE USO: Emitir POR CONSUMO
 *
 * Nombres verificados contra src/pages/Settings.jsx (Restaurante), src/pages/POS.jsx
 * y src/utils/comprobantePorConsumo.js.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'por-consumo',
  actualizado: '03/09/2026',
  intro:
    'La boleta o la factura sale con **una sola línea que dice POR CONSUMO**, en vez de listar los doce platos de la mesa. Adentro del sistema no cambia nada: el stock, los insumos y los reportes siguen viendo cada plato. Se activa en **Configuración → Restaurante**.',

  sections: [
    {
      id: 'para-que',
      title: 'Para qué sirve',
      blocks: [
        {
          type: 'texto',
          text: 'Una mesa de seis personas puede dejar quince líneas en la boleta. Casi ningún restaurante quiere eso: ocupa medio rollo de papel, tarda en imprimirse y al cliente no le aporta nada — ya vio el detalle en la precuenta. Lo normal es que el comprobante diga **POR CONSUMO** y punto.',
        },
        {
          type: 'texto',
          text: 'Esto **solo cambia el comprobante**. La comanda de la cocina, la precuenta que le llevas a la mesa y todo lo que pasa dentro de Cobrify siguen con el detalle de siempre.',
        },
      ],
    },
    {
      id: 'activar',
      title: 'Activarlo',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Entra a **Configuración** y abre la pestaña **Restaurante**.',
            'Activa **Emitir POR CONSUMO**.',
            'Si quieres, cambia el texto de la línea. Algunos negocios prefieren *CONSUMO DE ALIMENTOS Y BEBIDAS*.',
            'Guarda.',
          ],
        },
        {
          type: 'texto',
          text: 'Desde ahí, cada vez que cobres te va a aparecer la casilla **Emitir como "POR CONSUMO"** ya marcada, debajo del tipo de comprobante. Si un cliente te pide el detalle en su factura, la desmarcas en esa venta y sale con todos los platos.',
        },
      ],
    },
    {
      id: 'que-cambia',
      title: 'Qué cambia y qué no',
      blocks: [
        {
          type: 'tabla',
          encabezados: ['', 'Con POR CONSUMO'],
          filas: [
            ['Boleta / factura impresa', 'Una línea: POR CONSUMO'],
            ['Lo que se le manda a SUNAT', 'Una línea: POR CONSUMO'],
            ['Precuenta de la mesa', 'El detalle de siempre'],
            ['Comanda de cocina', 'El detalle de siempre'],
            ['Descuento de stock e insumos', 'Plato por plato, igual que siempre'],
            ['Reportes y más vendidos', 'Plato por plato, igual que siempre'],
          ],
        },
        {
          type: 'ojo',
          text: 'El **total no cambia nunca**. Es exactamente el mismo número con detalle o sin él.',
        },
      ],
    },
    {
      id: 'excepciones',
      title: 'Cuándo salen dos líneas',
      blocks: [
        {
          type: 'texto',
          text: 'A veces el comprobante sale con dos líneas POR CONSUMO en vez de una. No es un error: hay cosas que SUNAT no deja juntar.',
        },
        {
          type: 'pasos',
          items: [
            'Si la mesa mezcla productos **gravados y exonerados**, cada grupo va en su propia línea. SUNAT necesita la base separada.',
            'Si **regalaste algo** (una cortesía marcada como bonificación), el regalo se queda como línea aparte con su nombre. SUNAT lo obliga a declararse como entrega gratuita.',
          ],
        },
      ],
    },
    {
      id: 'anular',
      title: 'Si tienes que anular',
      blocks: [
        {
          type: 'texto',
          text: 'La nota de crédito sale con **las mismas líneas que la factura**. Si la factura decía POR CONSUMO, la nota también. Así las dos cuadran en el portal de SUNAT.',
        },
      ],
    },
    {
      id: 'contador',
      title: 'Una advertencia',
      blocks: [
        {
          type: 'ojo',
          text: 'El detalle de cada venta queda guardado en Cobrify, así que ante cualquier revisión lo puedes mostrar. Aun así, **si puedes emitir POR CONSUMO te lo confirma tu contador**: es práctica corriente en restaurantes, pero la decisión es de él, no del sistema.',
        },
      ],
    },
  ],
}
