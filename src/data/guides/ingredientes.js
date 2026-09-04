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
  actualizado: '04/09/2026',
  intro:
    'Acá va la materia prima: lo que consumes para producir lo que vendes, pero que no vendes tal cual. En modo restaurante se llama **Ingredientes**; en los demás rubros, **Insumos**.',

  sections: [
    {
      id: 'que-va-aca',
      title: 'Qué va acá y qué no',
      blocks: [
        {
          type: 'texto',
          text: 'Van los insumos: la harina, el aceite, los envases, el shampoo, las etiquetas. No van los productos terminados que vendes en el POS: esos viven en **Productos**.',
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
          text: 'Con **Nuevo Ingrediente** (o **Nuevo Insumo** según tu rubro) lo das de alta con su unidad de medida, su categoría y su stock. La **Unidad de Compra** tiene el catálogo completo de SUNAT —kilos, litros, sacos, galones, bolsas, rollos, docenas—, el mismo que usan Productos y Compras. El sistema lleva el **Costo Promedio** y te muestra el **Valor Total** de lo que tienes guardado.',
        },
        {
          type: 'texto',
          text: 'Puedes marcar un insumo como **Solo para costos**: sirve para que sume al costo de lo que produces sin llevarle inventario (útil con la sal, el gas, cosas que no vale la pena contar).',
        },
      ],
    },

    {
      id: 'stock',
      title: 'Controlar el stock',
      blocks: [
        {
          type: 'texto',
          text: 'Los estados **Stock OK**, **Stock Bajo** y **Sin stock** te dicen de un vistazo qué hay que reponer. El stock baja solo cuando vendes un producto que tiene su composición definida.',
        },
        {
          type: 'texto',
          text: 'La pestaña **Compras** registra lo que compras de insumos, y desde ahí sube el stock y se recalcula el costo promedio.',
        },
        {
          type: 'ojo',
          text: 'Para que el descuento automático funcione, el producto que vendes tiene que tener definida su **Composición** (**Receta** en restaurante). Sin eso, venderlo no toca los insumos.',
        },
      ],
    },

    {
      id: 'modificadores',
      title: 'Modificadores',
      soloModos: ['restaurant'],
      blocks: [
        {
          type: 'texto',
          text: 'La pestaña **Modificadores** es para los extras que el cliente pide sobre un producto (extra queso, sin cebolla, doble carne). Ahí los ves todos en una sola lista, juntas los que tienes repetidos y los dejas guardados para no volver a escribirlos.',
        },
        {
          type: 'texto',
          text: 'Un agregado también puede **descontar su insumo**: si cobras una pieza extra de pollo y llevas las piezas acá, cada una que vendas baja del inventario.',
        },
        {
          type: 'enlace',
          to: '/app/manual/modificadores',
          label: 'Ver la guía de Modificadores',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Vendí todo el día y los insumos no bajaron.',
      a: 'Los productos vendidos no tienen su composición definida. Revisa en **Composición** (**Recetas** en restaurante) que el producto tenga sus insumos cargados y que esté activo el descuento al vender.',
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
