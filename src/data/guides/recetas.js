/**
 * GUÍA DE USO: Recetas / Composición
 *
 * OJO: la página cambia de nombre según el rubro (Recipes.jsx usa
 * isRestaurantMode): en restaurante es "Recetas" / "Nueva Receta" /
 * "Agregar Ingrediente"; en los demás modos es "Composición" /
 * "Nueva Composición" / "Agregar Insumo". El texto nombra ambos.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'recetas',
  actualizado: '12/08/2026',
  intro:
    'Una receta conecta lo que vendes con lo que consumes: dice cuánto insumo lleva cada producto. Es lo que permite que vender un plato descuente automáticamente sus ingredientes y que sepas cuánto te cuesta de verdad. En restaurante se llama **Recetas**; en los demás rubros, **Composición**.',

  sections: [
    {
      id: 'crear',
      title: 'Definir una receta',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Nueva Receta** (o **Nueva Composición**).',
            'Elige el **Producto** al que corresponde.',
            'Con **Agregar Ingrediente** vas sumando cada insumo y la cantidad exacta que lleva una unidad.',
            'Guarda: el **Costo Total** se calcula solo a partir del costo de cada insumo.',
          ],
        },
        {
          type: 'consejo',
          text: 'Carga la cantidad para **una** unidad del producto, no para la olla entera. Si preparas 20 porciones con 2 kg de arroz, la receta lleva 100 g.',
        },
      ],
    },

    {
      id: 'descuento',
      title: 'Descontar insumos al vender',
      blocks: [
        {
          type: 'texto',
          text: 'La opción **Descontar insumos al vender** es la que hace la magia: con ella activa, cada venta de ese producto baja automáticamente sus insumos del inventario.',
        },
        {
          type: 'ojo',
          text: 'Si la dejas apagada, la receta solo sirve para calcular el costo pero el inventario de insumos no se mueve. Es una decisión válida (hay negocios que prefieren controlar los insumos a mano), pero conviene que sea a propósito y no por olvido.',
        },
      ],
    },

    {
      id: 'costo',
      title: 'Saber cuánto te cuesta cada plato',
      blocks: [
        {
          type: 'texto',
          text: 'El **Costo Total** de la receta es el costo real del producto, y es el que usan los reportes de rentabilidad. Cuando sube el precio de un insumo, el costo de todos los platos que lo llevan se actualiza solo.',
        },
        {
          type: 'consejo',
          text: 'Es la herramienta más honesta para revisar precios: te dice qué platos te dejan poco margen. Muchas veces el más vendido resulta ser el que menos deja.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Vendo el plato pero los insumos no bajan.',
      a: 'Revisa que la receta tenga la opción **Descontar insumos al vender** activada, y que los insumos tengan control de stock (los marcados como "solo para costos" no se descuentan a propósito).',
    },
    {
      q: '¿Tengo que hacer receta de todo?',
      a: 'No. Hazla de lo que más vendes y de lo que más te cuesta: ahí está el 80% del valor. Un producto que compras y revendes tal cual no necesita receta.',
    },
    {
      q: 'Cambié la receta, ¿afecta a lo ya vendido?',
      a: 'No. Las ventas anteriores conservan el costo que tenían. La receta nueva aplica de ahí en adelante.',
    },
    {
      q: 'Un plato tiene variantes con distinta cantidad de ingredientes.',
      a: 'Lo habitual es crear la receta sobre la versión estándar. Si las diferencias son grandes (una pizza familiar contra una personal), conviene tratarlas como productos separados con su propia receta.',
    },
  ],
}
