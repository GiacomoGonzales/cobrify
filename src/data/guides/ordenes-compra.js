/**
 * GUÍA DE USO: Órdenes de Compra
 *
 * Nombres verificados contra src/pages/PurchaseOrders.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'ordenes-compra',
  actualizado: '12/08/2026',
  intro:
    'Una orden de compra es el pedido formal a tu proveedor: qué le pediste, cuánto y a qué precio, antes de que llegue la mercadería. Sirve para dejar constancia de lo acordado y para saber qué está en camino.',

  sections: [
    {
      id: 'ciclo',
      title: 'El ciclo de una orden',
      blocks: [
        {
          type: 'texto',
          text: 'Una orden pasa por cuatro estados y cada uno tiene su acción:',
        },
        {
          type: 'pasos',
          items: [
            '**Borrador**: la estás armando, todavía puedes editarla libremente.',
            '**Enviada**: ya se la mandaste al proveedor. Se marca con **Marcar como enviada**.',
            '**Recibida**: llegó la mercadería. Se marca con **Marcar como recibida**.',
            '**Cancelada**: el pedido no va.',
          ],
        },
        {
          type: 'texto',
          text: 'Los filtros de arriba (**Borradores**, **Enviadas**, **Recibidas**, **Canceladas**) te dejan ver de un vistazo qué está pendiente de llegar.',
        },
      ],
    },

    {
      id: 'convertir',
      title: 'Convertirla en compra',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando la mercadería llega y el proveedor te entrega su factura, usa **Convertir en Compra**: se abre la pantalla de compra con los productos y precios ya cargados, y al guardarla el stock entra al inventario.',
        },
        {
          type: 'ojo',
          text: 'La orden por sí sola **no suma stock**. Es un pedido, no una entrada de mercadería. El inventario se mueve recién cuando la conviertes en compra.',
        },
      ],
    },

    {
      id: 'lugar-entrega',
      title: 'Lugar de entrega',
      blocks: [
        {
          type: 'texto',
          text: 'Si tienes más de un local, el selector **Lugar de entrega** te deja elegir a cuál debe llegar la mercadería. Lista tus **almacenes** con la dirección que tengan cargada, y esa dirección sale impresa como un campo propio del PDF.',
        },
        {
          type: 'consejo',
          text: 'Si el selector no aparece o te falta un local, es porque a ese almacén no le has puesto la **Dirección del Local**. Se carga en la página Almacenes y desde ahí queda disponible para todas tus órdenes.',
        },
      ],
    },

    {
      id: 'enviar',
      title: 'Enviarla al proveedor',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Descargar PDF** (o **Vista previa PDF**) obtienes el documento con tus datos, los del proveedor y el detalle de lo pedido, listo para mandarlo por correo o WhatsApp.',
        },
        {
          type: 'consejo',
          text: 'Las **Observaciones** son el lugar para dejar por escrito lo que se suele acordar de palabra: plazo de entrega, forma de pago, condiciones. Después evita discusiones.',
        },
        {
          type: 'texto',
          text: 'Si siempre pides lo mismo (requisitos al proveedor, horarios de atención, documentación que deben adjuntar), escríbelo **una sola vez** en Configuración y aparecerá ya cargado en cada orden nueva, listo para editar o borrar si esa orden es distinta.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=purchaseOrderDefaultNotes',
          label: 'Escribir mis observaciones por defecto',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Cuál es la diferencia con una compra?',
      a: 'La orden es lo que **pediste**; la compra es lo que **recibiste**. La orden no toca el inventario ni tus cuentas por pagar; la compra sí.',
    },
    {
      q: 'Llegó solo parte del pedido.',
      a: 'Conviértela en compra registrando únicamente lo que llegó de verdad. Así el stock refleja la realidad y te queda claro qué falta.',
    },
    {
      q: '¿Puedo usarlas si soy un negocio chico?',
      a: 'Son opcionales. Si le compras siempre a los mismos y la mercadería llega con la factura, puedes ir directo a Compras. Las órdenes ganan sentido cuando los pedidos tardan o cuando necesitas dejar constancia de lo acordado.',
    },
  ],
}
