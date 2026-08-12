/**
 * GUÍA DE USO: Pedidos Online
 *
 * Nombres verificados contra src/pages/OnlineOrders.jsx y la pestaña de
 * catálogo de src/pages/Settings.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'pedidos-online',
  actualizado: '12/08/2026',
  intro:
    'La bandeja de los pedidos que llegan desde tu catálogo digital. Acá los revisas, los atiendes y los conviertes en venta.',

  sections: [
    {
      id: 'como-llegan',
      title: 'Cómo te enteras de un pedido',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando un cliente hace un pedido en tu catálogo, aparece una **alerta con sonido** en la parte superior del sistema, estés en la pantalla que estés. No hace falta tener esta página abierta.',
        },
        {
          type: 'texto',
          text: 'La alerta se queda hasta que la marcas como recibida, para que no se te pase ninguno en hora punta.',
        },
        {
          type: 'ojo',
          text: 'El sonido necesita que hayas interactuado con la página al menos una vez (es una regla de los navegadores). Si abres el sistema y lo dejas intacto toda la mañana, puede que el primer aviso no suene.',
        },
      ],
    },

    {
      id: 'atender',
      title: 'Atender un pedido',
      blocks: [
        {
          type: 'texto',
          text: 'Cada pedido trae los productos, el **Subtotal**, el **IGV**, el **Total** y los datos del cliente, incluidas sus **Notas del cliente** (las indicaciones que dejó al pedir). Puedes filtrar la bandeja por fechas con **Desde** y **Hasta**, y revisar el **Historial**.',
        },
        {
          type: 'consejo',
          text: 'Lee siempre las notas del cliente antes de preparar: ahí van las direcciones difíciles, las referencias y los "sin cebolla".',
        },
      ],
    },

    {
      id: 'convertir',
      title: 'Convertirlo en venta',
      blocks: [
        {
          type: 'texto',
          text: 'El pedido por sí solo no es una venta: hay que emitir el comprobante. Al convertirlo, el POS se abre con los productos cargados para que cobres y emitas la boleta o factura, y ahí recién se descuenta el stock.',
        },
      ],
    },

    {
      id: 'configuracion',
      title: 'Ajustes de recepción',
      blocks: [
        {
          type: 'texto',
          text: 'Qué pedidos aceptas (delivery, para llevar) y si se **auto-aceptan** se configura en la pestaña del catálogo de Configuración.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=catalogo',
          label: 'Ajustes del catálogo y pedidos',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Llegó un pedido y no sonó nada.',
      a: 'Revisa el volumen del equipo y que hayas hecho al menos un clic en la página desde que la abriste. El pedido igual queda en la bandeja aunque no suene.',
    },
    {
      q: '¿El pedido reserva el stock?',
      a: 'No. El stock se mueve recién cuando lo conviertes en venta. Si el producto se agota mientras tanto, tendrás que avisarle al cliente.',
    },
    {
      q: 'Un cliente pidió y ya no contesta.',
      a: 'El pedido queda en la bandeja y en el historial. No genera comprobante ni afecta tus reportes mientras no lo conviertas en venta.',
    },
    {
      q: 'Soy restaurante, ¿uso esta página?',
      a: 'En modo restaurante los pedidos del menú digital se atienden desde **Órdenes**, junto con las mesas y los deliveries.',
    },
  ],
}
