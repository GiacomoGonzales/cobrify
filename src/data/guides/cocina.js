/**
 * GUÍA DE USO: Cocina (modo restaurante)
 *
 * Nombres verificados contra src/pages/Kitchen.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'cocina',
  actualizado: '12/08/2026',
  intro:
    'Cocina es la pantalla para el personal de producción: qué hay que preparar, en qué orden y qué ya está listo para salir. Pensada para dejarla abierta en una tablet o monitor.',

  sections: [
    {
      id: 'columnas',
      title: 'Las tres columnas',
      blocks: [
        {
          type: 'texto',
          text: 'Los pedidos avanzan de izquierda a derecha en tres estados: **Pendientes** (acaba de llegar), **En Preparación** (alguien ya lo está haciendo) y **Listas** (se puede servir).',
        },
        {
          type: 'texto',
          text: 'Vienen **ordenadas por tiempo de llegada**, así que lo más antiguo queda siempre arriba: el que lleva más esperando se atiende primero.',
        },
      ],
    },

    {
      id: 'mover-pedidos',
      title: 'Mover un pedido',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Cuando empiezas a prepararlo, presiona **Iniciar Preparación**: el pedido pasa a la columna del medio y el salón ve que ya está en marcha.',
            'Cuando está terminado, presiona **Marcar como Lista**: pasa a **Listas** para que lo recojan.',
            'Al llevarlo a la mesa, se marca como **Entregado** y sale del tablero.',
          ],
        },
        {
          type: 'consejo',
          text: 'Mover los estados no es burocracia: es lo que le permite al mozo saber si puede ir a recoger sin tener que entrar a preguntar a la cocina.',
        },
      ],
    },

    {
      id: 'filtros',
      title: 'Filtrar lo que ves',
      blocks: [
        {
          type: 'texto',
          text: 'Si tienes varias estaciones (cocina fría, parrilla, barra), puedes filtrar para ver solo lo tuyo. Cuando hay un filtro puesto aparece el aviso de **Filtro activo** para que nadie crea que no hay pedidos cuando en realidad están ocultos.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'No aparecen pedidos y sí los hay.',
      a: 'Revisa si tienes un **Filtro activo**: puede estar mostrando solo una estación. Y confirma que estás en la sucursal correcta.',
    },
    {
      q: '¿Necesito esta pantalla si ya imprimo comandas?',
      a: 'No es obligatoria. La comanda impresa funciona igual; esta pantalla sirve cuando quieres ver el estado de todo el servicio y que el salón sepa qué está listo sin ir a preguntar.',
    },
    {
      q: 'Marqué un pedido como listo por error.',
      a: 'Puedes devolverlo al estado anterior desde la misma tarjeta.',
    },
  ],
}
