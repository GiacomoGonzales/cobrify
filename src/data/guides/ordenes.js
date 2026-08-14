/**
 * GUÍA DE USO: Órdenes (modo restaurante)
 *
 * Nombres verificados contra src/pages/Orders.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'ordenes',
  actualizado: '14/08/2026',
  intro:
    'Órdenes es la lista de todo lo que está en curso: lo que se está preparando en salón, lo que sale para llevar y los deliveries. Es la vista del encargado, no la del mozo.',

  sections: [
    {
      id: 'activas',
      title: 'Las órdenes activas',
      blocks: [
        {
          type: 'texto',
          text: 'En **Órdenes Activas** ves todo lo que está abierto, con su estado (**Pendientes**, **En Preparación**) y el total de cada cuenta. Arriba tienes las **Ventas Hoy** del día.',
        },
        {
          type: 'texto',
          text: 'El **Tipo de orden** distingue cómo se atiende: en mesa, **Para Llevar**, **Delivery** o **En Local** (come ahí pero sin mesa: patio de comidas, mostrador). En los deliveries puedes asignar el **Repartidor**.',
        },
      ],
    },

    {
      id: 'cobrar',
      title: 'Cerrar y cobrar una orden',
      blocks: [
        {
          type: 'texto',
          text: 'Antes de cobrar, **Imprimir Precuenta** le lleva al cliente el detalle de lo consumido (sin valor tributario). Después, **Crear Comprobante** abre el POS para emitir la boleta o factura con todo cargado.',
        },
        {
          type: 'texto',
          text: 'Si el grupo paga por separado, usa **Dividir Cuenta** o el **Cobro Individual** para emitir un comprobante por persona.',
        },
        {
          type: 'texto',
          text: 'Existe también **Cerrar sin comprobante** y **Cerrar Cuenta** para los casos que no llevan documento.',
        },
        {
          type: 'ojo',
          text: 'La precuenta no es un comprobante válido ante SUNAT. Es un papel de cortesía para que el cliente revise; lo que vale es la boleta o factura que emites después.',
        },
      ],
    },

    {
      id: 'delivery',
      title: 'Pedidos sin mesa: llevar, delivery y en local',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Nueva Orden** tomas un pedido sin mesa eligiendo su tipo: **Para Llevar**, **Delivery** o **En Local**. La diferencia importa para el cobro: al que come en el local no le cargas táper ni envío.',
        },
        {
          type: 'texto',
          text: 'Los pedidos que llegan del menú digital aparecen acá automáticamente y suenan como alerta en la parte superior del sistema. Desde la alerta puedes imprimir la comanda de una vez.',
        },
        {
          type: 'texto',
          text: 'Si activaste **"La venta del POS genera la orden en Cocina"**, acá también aparecen las ventas directas del POS: llegan ya **pagadas y facturadas** (con su etiqueta), así que no ofrecen cobrar de nuevo — solo siguen su camino en Cocina.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=posCreatesKitchenOrder',
          label: 'La venta del POS genera la orden en Cocina',
        },
        {
          type: 'consejo',
          text: 'Asigna el repartidor apenas sale el pedido: después, cuando el cliente llame preguntando, sabes quién lo lleva sin tener que averiguar.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Cuál es la diferencia entre Mesas y Órdenes?',
      a: '**Mesas** es el tablero del salón, pensado para el mozo. **Órdenes** es la lista de todo lo abierto, incluidos delivery y para llevar, pensada para quien controla la operación.',
    },
    {
      q: 'Un pedido del menú digital no aparece.',
      a: 'Revisa que la orden no esté ya cerrada y que estés en la sucursal correcta. Los pedidos nuevos además disparan una alerta con sonido en la barra superior.',
    },
    {
      q: 'Imprimí la precuenta y el cliente agregó algo más.',
      a: 'Agrega el item a la orden y vuelve a imprimir la precuenta. El total se recalcula solo.',
    },
  ],
}
