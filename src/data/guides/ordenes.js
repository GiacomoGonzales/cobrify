/**
 * GUÍA DE USO: Órdenes (modo restaurante)
 *
 * Auditada contra src/pages/Orders.jsx (2.282 líneas) el 16/08/2026.
 *
 * Estados verificados: pending, preparing, ready, dispatched. Tipos: mesa,
 * para llevar, delivery y en local (mostrador). Acciones reales: Marcar
 * Lista, Marcar Entregada, Despachar, Cerrar Cuenta, Cerrar sin comprobante.
 *
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'ordenes',
  actualizado: '25/08/2026',
  intro:
    'Órdenes es la bandeja de todo lo que está en curso, venga de donde venga: las mesas del salón, los pedidos para llevar, los delivery y los de mostrador. Si Mesas es el mapa del salón, Órdenes es la lista de trabajo pendiente.',

  sections: [
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'estados',
      title: 'El recorrido de una orden',
      blocks: [
        {
          type: 'texto',
          text: 'Toda orden avanza por los mismos estados, y cada uno tiene su botón para pasar al siguiente:',
        },
        {
          type: 'tabla',
          encabezados: ['Estado', 'Qué significa', 'Botón para avanzar'],
          filas: [
            ['Pendiente', 'Entró y todavía nadie la empezó', '—'],
            ['Preparando', 'Cocina está en eso', 'Marcar Lista'],
            ['Lista', 'Terminada, esperando salir', 'Despachar / Marcar Entregada'],
            ['Despachada', 'Salió del local o se entregó', '—'],
          ],
        },
        {
          type: 'consejo',
          text: 'La cocina normalmente mueve los estados desde su propia pantalla. Acá los tienes por si hay que corregir algo o si tu local no usa una pantalla en cocina.',
        },
        { type: 'enlace', to: '/app/cocina', label: 'Ver Cocina' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tipos',
      title: 'Los cuatro tipos de pedido',
      blocks: [
        {
          type: 'tabla',
          encabezados: ['Tipo', 'Cuándo se usa'],
          filas: [
            ['En Mesa', 'Se sienta y consume en el salón. Nace desde Mesas'],
            ['Para Llevar', 'Pide, espera y se lo lleva'],
            ['Delivery', 'Se le envía a su dirección con un repartidor'],
            ['En Local', 'Consume en el local pero sin mesa asignada: patios de comidas, barras, mostrador'],
          ],
        },
        {
          type: 'texto',
          text: '**En Local** es el que suele confundir: sirve cuando el cliente come ahí pero no hay mesas que administrar — un puesto en un patio de comidas, una barra, una fuente de soda. Se cobra como para llevar pero cuenta como consumo en el local.',
        },
        {
          type: 'texto',
          text: 'Con **Nueva Orden** creas cualquiera de ellos directamente, sin pasar por el salón.',
        },
        { type: 'ui', kind: 'boton', label: 'Nueva Orden' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'fuentes',
      title: 'De dónde llegó el pedido',
      blocks: [
        {
          type: 'texto',
          text: 'Al crear una orden eliges su **fuente**: por dónde te llegó. Mostrador, teléfono, WhatsApp, las apps de delivery. No es un dato decorativo — es lo que después separa tus ventas por canal en los reportes y te deja ver cuánto te deja cada uno.',
        },
        {
          type: 'texto',
          text: 'La lista la decides tú desde **Configuración > Ventas**: desmarca las que no uses para que no te estorben al crear una orden, y agrega las tuyas si recibes pedidos por un canal que no está —Instagram, TikTok, un convenio con una empresa—. Mostrador no se puede quitar.',
        },
        {
          type: 'ojo',
          text: 'Ocultar o borrar una fuente **no toca los pedidos ya registrados**: cada orden guarda el nombre de su fuente en el momento de crearse. Tus reportes históricos quedan igual.',
        },
        { type: 'enlace', to: '/app/configuracion?tab=ventas', label: 'Ir a Configuración' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'delivery',
      title: 'Delivery: asignar repartidor',
      blocks: [
        {
          type: 'texto',
          text: 'A un pedido de delivery se le asigna un **repartidor** de los registrados en la sede. Al despacharlo queda anotado quién lo llevó y a qué hora salió.',
        },
        {
          type: 'consejo',
          text: 'Asignar el repartidor toma dos segundos y es lo único que después te permite responder "¿quién llevó ese pedido?" cuando un cliente reclama. Sin eso, la orden solo dice que salió.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'cerrar',
      title: 'Cobrar y cerrar',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Cerrar Cuenta** se cobra la orden y se emite el comprobante con todo su consumo ya cargado. Si la orden venía de una mesa, al cerrarla la mesa se libera.',
        },
        {
          type: 'texto',
          text: 'También puedes **editar** una orden abierta —agregar o quitar items— y ver su detalle completo antes de cobrar.',
        },
        {
          type: 'ojo',
          text: '**Cerrar sin comprobante** existe para cortesías y consumo interno. Esa venta no queda documentada ante SUNAT, así que úsalo solo cuando de verdad no hubo cobro al cliente.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'historial',
      title: 'Ver las órdenes ya cobradas',
      blocks: [
        {
          type: 'texto',
          text: 'Al cobrar, la orden sale de la lista de activas — esa vista es para lo que está en marcha. Para volver a mirarla está la pestaña **Historial**, con las órdenes ya cerradas del rango de fechas que elijas.',
        },
        {
          type: 'texto',
          text: 'Cada línea muestra la **mesa**, el **mozo**, la hora en que se cobró, el total y el **número del comprobante** con el que se cerró. Al tocarla se abre el detalle con todo lo que se consumió, incluidas las notas de cocina. Arriba tienes el total del período y cuántas órdenes se anularon.',
        },
        {
          type: 'consejo',
          text: 'Sirve para responder rápido "¿qué se vendió en la mesa 5 anoche?" y para cruzar una orden con su boleta cuando un cliente reclama. Si una orden dice **Sin comprobante**, es de las que se cerraron como cortesía.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'menu-digital',
      title: 'Pedidos que llegan solos',
      blocks: [
        {
          type: 'texto',
          text: 'Si tienes el menú digital activo, los pedidos que hacen tus clientes desde su celular entran acá directamente, sin que nadie los tipee.',
        },
        { type: 'enlace', to: '/app/pedidos-online', label: 'Ver Pedidos Online' },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Cuál es la diferencia entre Mesas y Órdenes?',
      a: '**Mesas** es el mapa del salón: dónde está sentado cada grupo. **Órdenes** es la lista de todo lo que está en curso, incluyendo lo que no ocupa mesa (para llevar, delivery, mostrador). Una mesa ocupada aparece en las dos; un delivery solo en Órdenes.',
    },
    {
      q: 'Un pedido del menú digital no aparece.',
      a: 'Revisa **Pedidos Online**: puede estar esperando que lo aceptes. También verifica el filtro de sucursal del encabezado, porque los pedidos entran a la sede que eligió el cliente.',
    },
    {
      q: 'Cerré una orden por error.',
      a: 'Una orden cerrada ya generó su comprobante. Lo que corresponde es anular ese comprobante desde **Ventas** — no volver a abrir la orden — para que la venta y el stock queden coherentes.',
    },
    {
      q: 'La orden salió pero no marqué el repartidor.',
      a: 'Puedes asignarlo mientras la orden siga abierta. Si ya se cerró, queda sin repartidor asignado y no hay forma de atribuírselo después, así que conviene hacerlo al despachar.',
    },
    {
      q: '¿Para qué sirve "En Local" si ya existe "Para Llevar"?',
      a: 'Para negocios sin mesas donde el cliente igual consume ahí: patios de comidas, barras, fuentes de soda. Se opera como para llevar, pero queda registrado como consumo en el local, que es lo correcto para tus reportes.',
    },
  ],
}
