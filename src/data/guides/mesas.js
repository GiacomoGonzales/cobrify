/**
 * GUÍA DE USO: Mesas (modo restaurante)
 *
 * Nombres verificados contra src/pages/Tables.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'mesas',
  actualizado: '12/08/2026',
  intro:
    'Mesas es el tablero de tu salón: qué mesa está ocupada, cuánto lleva consumido cada una y cuál está libre. Desde acá se toma el pedido y se cobra.',

  sections: [
    {
      id: 'tablero',
      title: 'Leer el tablero',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba tienes el conteo: **Total Mesas**, **Disponibles**, **Ocupadas** y **Reservadas**. Cada mesa muestra su número y, si está ocupada, el **Consumo** acumulado y la hora de **Inicio**.',
        },
        {
          type: 'texto',
          text: 'Una marca de **Precuenta impresa** te avisa que a esa mesa ya le llevaste la cuenta: sirve para saber cuáles están por irse.',
        },
        {
          type: 'consejo',
          text: 'El tablero se actualiza solo. Si dos mozos están tomando pedidos a la vez, ambos ven lo mismo sin recargar.',
        },
      ],
    },

    {
      id: 'crear-mesas',
      title: 'Crear y organizar las mesas',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Nueva Mesa** registras cada mesa con su número y su zona (salón, terraza, segundo piso). Las zonas ordenan el tablero para que el mozo encuentre rápido.',
        },
        { type: 'ui', kind: 'boton', label: 'Nueva Mesa' },
        {
          type: 'texto',
          text: 'También existe la **Nueva cuenta de barra**, para consumos que no ocupan mesa.',
        },
        {
          type: 'ojo',
          text: 'Ponle a las mesas los mismos números que usa tu personal en el día a día. Si en el salón le dicen "la 5", que en el sistema sea la 5: renombrarlas "bonito" solo genera confusión al cantar los pedidos.',
        },
      ],
    },

    {
      id: 'tomar-pedido',
      title: 'Tomar el pedido',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Toca la mesa en el tablero.',
            'Agrega los platos y bebidas al pedido.',
            'Confirma: la comanda sale hacia **Cocina** y la mesa pasa a **Ocupada**.',
          ],
        },
        {
          type: 'texto',
          text: 'Puedes seguir agregando items a lo largo de la comida: cada agregado se suma a la cuenta de la mesa y va a cocina como pedido nuevo.',
        },
      ],
    },

    {
      id: 'cobrar',
      title: 'Cobrar la mesa',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando el cliente pide la cuenta, primero le llevas la **Precuenta** (el detalle sin valor tributario) y después cobras. Al cobrar se abre el POS con todo el consumo cargado para emitir la boleta o factura.',
        },
        {
          type: 'texto',
          text: 'Si la mesa quiere pagar por separado, tienes el **Cobro Individual**: eliges qué items paga cada persona y se emite un comprobante por cada uno. El resto del consumo queda en la mesa hasta cobrarse.',
        },
        {
          type: 'consejo',
          text: 'Al cobrar, la venta se registra con el mozo que atendió y con la sucursal de esa mesa, así los reportes por vendedor y por sede salen correctos sin que nadie tenga que elegirlo.',
        },
      ],
    },

    {
      id: 'agrupar',
      title: 'Juntar mesas',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando un grupo grande junta dos o tres mesas, puedes agruparlas: el consumo se acumula en una sola cuenta (la principal) y se cobra todo junto. Las mesas unidas se muestran atenuadas y su cuenta apunta a la del grupo.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Cobré la mesa pero sigue apareciendo ocupada.',
      a: 'Suele ser un cobro parcial: quedaron items sin pagar. Ábrela y revisa qué falta cobrar; cuando la cuenta llega a cero, la mesa se libera.',
    },
    {
      q: 'Dos mozos tomaron pedido en la misma mesa al mismo tiempo.',
      a: 'No hay problema: los items se suman a la misma cuenta. El sistema reserva la mesa al cobrar para que no se emitan dos comprobantes por lo mismo.',
    },
    {
      q: '¿Puedo cobrar sin emitir comprobante?',
      a: 'Sí, existe **Cerrar sin comprobante** para casos puntuales (cortesías, consumo interno). Ojo: esa venta no queda documentada ante SUNAT.',
    },
    {
      q: '¿Dónde veo lo que ya cobré hoy?',
      a: 'En la página **Ventas**, o en **Órdenes** que muestra el total de **Ventas Hoy** del salón.',
    },
  ],
}
