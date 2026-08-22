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
  actualizado: '22/08/2026',
  intro:
    'Una receta conecta lo que vendes con lo que consumes: dice cuánto insumo lleva cada producto. Es lo que permite que venderlo descuente automáticamente sus insumos y que sepas cuánto te cuesta de verdad. En restaurante se llama **Recetas**; en los demás rubros, **Composición**.',

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
          text: 'Carga la cantidad para **una** unidad del producto, no para la olla entera. Si preparas 20 porciones con 2 kg de arroz, la composición lleva 100 g.',
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
      title: 'Saber cuánto te cuesta cada producto',
      blocks: [
        {
          type: 'texto',
          text: 'El **Costo Total** de la receta es el costo real del producto, y es el que usan los reportes de rentabilidad. Cuando sube el precio de un insumo, el costo de todo lo que lo lleva se actualiza solo.',
        },
        {
          type: 'consejo',
          text: 'Es la herramienta más honesta para revisar precios: te dice qué productos te dejan poco margen. Muchas veces el más vendido resulta ser el que menos deja.',
        },
      ],
    },

    {
      id: 'avisos',
      title: 'Avisos de insumos al vender',
      blocks: [
        {
          type: 'texto',
          text: 'Un plato normalmente no lleva stock propio: lo que se acaba son sus insumos, y eso no se ve en la carta. Por eso, en el **Punto de Venta** y al **tomar una orden**, los productos con receta muestran un aviso según cómo estén sus insumos.',
        },
        {
          type: 'tabla',
          encabezados: ['Aviso', 'Qué significa'],
          filas: [
            ['**Stock bajo** (amarillo)', 'Todavía se puede preparar, pero algún insumo llegó a su mínimo. Es solo un aviso: el producto se vende normal. Pasa el cursor por encima y te dice qué insumo es y cuánto queda.'],
            ['**Sin insumos** (naranja)', 'No alcanza ni para una unidad. Ahí sí el producto queda deshabilitado hasta que repongas.'],
          ],
        },
        {
          type: 'ojo',
          text: 'El aviso amarillo depende del **Stock mínimo** que le pusiste al insumo en la página de Insumos. Si un insumo tiene el mínimo en cero, nunca va a avisar: el sistema no puede adivinar cuándo es poco para tu negocio.',
        },
        {
          type: 'consejo',
          text: 'Ponle mínimo a los insumos que no consigues el mismo día o que te dejan sin vender un plato entero. Es la diferencia entre enterarte en la mañana y enterarte cuando el mozo ya tomó el pedido.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Vendo el producto pero los insumos no bajan.',
      a: 'Revisa que la receta tenga la opción **Descontar insumos al vender** activada, y que los insumos tengan control de stock (los marcados como "solo para costos" no se descuentan a propósito).',
    },
    {
      q: 'Un plato dice "Stock bajo" pero el insumo me parece suficiente.',
      a: 'El aviso compara contra el **Stock mínimo** que tiene configurado ese insumo, no contra lo que lleva la receta. Si te avisa antes de tiempo, bájale el mínimo al insumo en la página de Insumos.',
    },
    {
      q: 'No me avisa nada aunque un insumo esté por acabarse.',
      a: 'Casi siempre es porque ese insumo tiene el **Stock mínimo** en cero. Entrá a Insumos, ponle el mínimo con el que querés que te avise, y el aviso aparece solo.',
    },
    {
      q: '¿Tengo que definirla para todo?',
      a: 'No. Hazlo con lo que más vendes y lo que más te cuesta: ahí está el 80% del valor. Un producto que compras y revendes tal cual no necesita composición.',
    },
    {
      q: 'Cambié la composición, ¿afecta a lo ya vendido?',
      a: 'No. Las ventas anteriores conservan el costo que tenían. La nueva aplica de ahí en adelante.',
    },
    {
      q: 'Un producto tiene variantes que llevan distinta cantidad.',
      a: 'Lo habitual es definirla sobre la versión estándar. Si las diferencias son grandes (una pizza familiar contra una personal, un baño de perro chico contra uno grande), conviene tratarlas como productos separados con su propia composición.',
    },
  ],
}
