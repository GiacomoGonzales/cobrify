/**
 * GUÍA DE USO: Movimientos de Inventario
 *
 * Nombres verificados contra src/pages/StockMovements.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'movimientos',
  actualizado: '12/08/2026',
  intro:
    'El libro de todo lo que le pasó a tu stock: cada entrada, cada salida y qué saldo quedó. Es la pantalla a la que se viene cuando una cantidad no cuadra y hay que averiguar por qué.',

  sections: [
    {
      id: 'que-registra',
      title: 'Qué queda registrado',
      blocks: [
        {
          type: 'texto',
          text: 'Cada movimiento guarda el **Producto**, la **Cantidad**, el **Almacén**, el **Motivo**, la fecha y el **Saldo** que quedó después. Nada mueve stock sin dejar rastro acá.',
        },
        {
          type: 'texto',
          text: 'Puedes filtrar por tipo: **Entradas**, **Salidas**, **Salidas (sin ventas)**, **Transferencias**, **Ajustes** y **Producción**. Y acotar por almacén y por fecha.',
        },
        {
          type: 'consejo',
          text: 'El filtro **Salidas (sin ventas)** es el más útil para auditar: te muestra todo lo que salió del inventario sin haberse vendido — mermas, traslados, ajustes.',
        },
      ],
    },

    {
      id: 'investigar',
      title: 'Investigar un descuadre',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Filtra por el producto que no cuadra.',
            'Pon el almacén donde ves la diferencia.',
            'Recorre los movimientos desde la última vez que sabías que estaba bien.',
            'Mira la columna **Saldo**: te dice cómo quedó el stock después de cada movimiento, así ubicas exactamente dónde se torció.',
          ],
        },
        {
          type: 'consejo',
          text: 'Casi siempre la respuesta es una de tres: una venta que no recordabas, un traslado a otro almacén, o una merma registrada por otra persona.',
        },
      ],
    },

    {
      id: 'transferencias',
      title: 'Transferencias entre almacenes y sucursales',
      blocks: [
        {
          type: 'texto',
          text: 'La pestaña de **Transferencias** muestra los traslados como una sola operación (de dónde salió y a dónde entró), en vez de dos movimientos sueltos. Cuando el traslado es **Entre sucursales**, aparece marcado como tal.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Puedo editar o borrar un movimiento?',
      a: 'No, y es a propósito: es un registro histórico. Si algo quedó mal, se corrige con un movimiento nuevo (un ajuste o un recuento), y ambos quedan a la vista.',
    },
    {
      q: 'Veo una salida que nadie reconoce.',
      a: 'Revisa el **Motivo** y la fecha del movimiento. Las salidas por venta llevan el comprobante asociado; las de merma llevan el motivo que eligió quien la registró.',
    },
    {
      q: '¿Por qué un producto tiene movimientos si nunca lo vendí?',
      a: 'Las compras, los traslados, los ajustes de recuento y la producción también generan movimientos. Todo lo que cambia una cantidad queda registrado.',
    },
  ],
}
