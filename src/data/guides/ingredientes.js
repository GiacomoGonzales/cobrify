/**
 * GUÍA DE USO: Insumos / Ingredientes
 *
 * OJO: esta página cambia de nombre según el rubro (Ingredients.jsx usa
 * isRestaurantMode): en restaurante es "Ingredientes" y el botón "Nuevo
 * Ingrediente"; en los demás modos es "Insumos" y "Nuevo Insumo". El texto
 * nombra ambos para que sirva en los dos casos.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'ingredientes',
  actualizado: '12/08/2026',
  intro:
    'Acá va la materia prima: lo que consumes para producir lo que vendes, pero que no vendes tal cual. En modo restaurante se llama **Ingredientes**; en los demás rubros, **Insumos**.',

  sections: [
    {
      id: 'que-va-aca',
      title: 'Qué va acá y qué no',
      blocks: [
        {
          type: 'texto',
          text: 'Van los insumos: la harina, el aceite, el pollo, los envases. No van los productos terminados que vendes en el POS: esos viven en **Productos**.',
        },
        {
          type: 'consejo',
          text: 'La regla simple: si el cliente lo puede pedir por su nombre, es un producto. Si solo se usa para hacer otra cosa, es un insumo.',
        },
      ],
    },

    {
      id: 'registrar',
      title: 'Registrar un insumo',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Nuevo Ingrediente** (o **Nuevo Insumo** según tu rubro) lo das de alta con su unidad de medida, su categoría y su stock. El sistema lleva el **Costo Promedio** y te muestra el **Valor Total** de lo que tienes guardado.',
        },
        {
          type: 'texto',
          text: 'Puedes marcar un insumo como **Solo para costos**: sirve para calcular cuánto te cuesta un plato sin llevarle inventario (útil con la sal, las especias, cosas que no vale la pena contar).',
        },
      ],
    },

    {
      id: 'stock',
      title: 'Controlar el stock',
      blocks: [
        {
          type: 'texto',
          text: 'Los estados **Stock OK**, **Stock Bajo** y **Sin stock** te dicen de un vistazo qué hay que reponer. El stock baja solo cuando vendes un producto que tiene receta.',
        },
        {
          type: 'texto',
          text: 'La pestaña **Compras** registra lo que compras de insumos, y desde ahí sube el stock y se recalcula el costo promedio.',
        },
        {
          type: 'ojo',
          text: 'Para que el descuento automático funcione, el producto que vendes tiene que tener su **receta** definida. Sin receta, vender el plato no toca los insumos.',
        },
      ],
    },

    {
      id: 'modificadores',
      title: 'Modificadores',
      blocks: [
        {
          type: 'texto',
          text: 'La pestaña **Modificadores** es para los extras que el cliente pide sobre un producto (extra queso, sin cebolla, doble carne). Puedes llevarles control de consumo para saber cuánto se gasta realmente en ellos.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Vendí platos todo el día y los insumos no bajaron.',
      a: 'Los productos vendidos no tienen receta definida. Revisa en **Recetas** (o **Composición**) que el plato tenga sus insumos cargados y que esté activo el descuento al vender.',
    },
    {
      q: '¿Registro las compras de insumos en Compras o acá?',
      a: 'Los insumos tienen su propio registro de compras dentro de esta sección. La página **Compras** general es para la mercadería que revendes.',
    },
    {
      q: '¿Puedo vender un insumo directamente?',
      a: 'No desde el POS: ahí solo aparecen los productos. Si algo se vende tal cual, créalo también como producto.',
    },
  ],
}
