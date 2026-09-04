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
          text: 'La pestaña **Modificadores** es para los extras que el cliente pide sobre un producto (extra queso, sin cebolla, doble carne). Puedes llevarles control de consumo para saber cuánto se gasta realmente en ellos.',
        },
        {
          type: 'texto',
          text: 'En **Plantillas** vas a ver primero **Modificadores en uso**: todo lo que ya está escrito dentro de tus productos, agrupado por nombre. Si "Cremas" se tipeó en cuarenta platos, ahí sale una sola vez y te dice en cuántos productos está.',
        },
        {
          type: 'ojo',
          text: 'Si un nombre aparece con la etiqueta **versiones**, quiere decir que se llaman igual pero no dicen lo mismo: en un producto tiene cuatro opciones y en otro tres, o con otro precio. Ábrelo para ver cada versión y de qué productos es.',
        },
        {
          type: 'texto',
          text: 'Una **plantilla** es un grupo escrito una sola vez, que después insertas en cualquier producto desde el editor con el botón **Desde plantilla**. Sirve para dejar de tipear lo mismo cada vez.',
        },
        {
          type: 'pasos',
          items: [
            'Abre **Modificadores > Plantillas**.',
            'Busca en **Modificadores en uso** el que más repites y ábrelo.',
            'Si tiene varias versiones, elige la que quieres dejar como buena.',
            'Presiona **Crear plantilla con esta**: se agrega abajo, en la lista de plantillas.',
            'Presiona **Guardar plantillas**.',
          ],
        },
        {
          type: 'ojo',
          text: 'Crear la plantilla no toca tus productos: los que ya tienen ese modificador siguen exactamente igual, y se sigue vendiendo y cobrando lo mismo.',
        },
        {
          type: 'texto',
          text: 'Para que el cambio sí llegue a los productos está **Aplicar a los productos**, abajo de las plantillas. Con eso le cambias el precio al Ají en un solo lugar en vez de entrar a los sesenta platos que lo tienen.',
        },
        {
          type: 'pasos',
          items: [
            'Edita la plantilla como quieres que quede y presiona **Guardar plantillas**.',
            'En **Aplicar a los productos**, presiona **Aplicar** en la que acabas de cambiar.',
            'Deja marcado **Los que ya lo tienen**, y si quieres marca también categorías enteras para que lo reciban aunque hoy no lo tengan.',
            'Lee el resumen: cuántos lo reciben por primera vez, a cuántos les cambia lo que se cobra y cuántos ya estaban igual.',
            'Confirma.',
          ],
        },
        {
          type: 'ojo',
          text: 'Los que aparecen como que **les cambia lo que se cobra** son los que hoy tienen otras opciones o otro precio, y van a quedar con lo de la plantilla. Revisa esa lista antes de confirmar. Los que ya estaban iguales no se tocan, así que aplicar dos veces seguidas no hace nada la segunda.',
        },
        {
          type: 'consejo',
          text: 'Las ventas ya emitidas no cambian: cada comprobante guarda lo que se cobró ese día. Esto solo cambia lo que se va a ofrecer de ahora en adelante.',
        },
        {
          type: 'texto',
          text: 'Un modificador también puede **descontar un insumo** al venderse. Si cobras "Pieza extra de pollo" y llevas las piezas en Insumos, cada vez que alguien la pida se descuenta una del inventario, igual que si estuviera en la receta del plato.',
        },
        {
          type: 'pasos',
          items: [
            'Abre el producto y baja a **Modificadores**.',
            'Despliega el grupo y presiona **Descontar insumos al vender**.',
            'En la opción que consume algo, elige el insumo y pon cuánto gasta cada vez que se pide.',
            'Guarda el producto.',
          ],
        },
        {
          type: 'ojo',
          text: 'El insumo se elige por opción, no por grupo: "Pieza extra" descuenta y "Sin cebolla" no. Lo que no enlaces no toca el inventario. Si el modificador permite pedir varias veces la misma opción, se descuenta por cada una.',
        },
        {
          type: 'consejo',
          text: 'Al anular la venta el insumo vuelve solo, con la misma cantidad que se descontó. Las ventas hechas antes de enlazar el insumo no descuentan ni devuelven nada.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Tengo el mismo modificador escrito en decenas de productos. ¿Los junto?',
      a: 'En **Modificadores > Plantillas** ya los ves juntos: **Modificadores en uso** agrupa por nombre y te dice en cuántos productos está cada uno. Conviértelo en plantilla para no volver a escribirlo. Los productos que ya lo tienen no cambian: cada uno conserva su copia y se sigue cobrando igual.',
    },
    {
      q: 'Cambié una plantilla y los productos siguen con lo de antes.',
      a: 'Al insertar una plantilla en un producto se copia, para que puedas ajustarla en ese plato sin afectar a los demás. Para bajar el cambio a los productos usa **Aplicar a los productos**, abajo de las plantillas: ahí eliges a cuáles y te dice cuántos cambian antes de confirmar.',
    },
    {
      q: 'Quiero que todos los productos de una categoría lleven el mismo modificador.',
      a: 'En **Aplicar a los productos** marca esa categoría. Los productos que no lo tengan lo reciben, y los que ya lo tenían quedan con la versión de la plantilla.',
    },
    {
      q: 'Cobro una pieza extra de pollo. ¿Se descuenta del inventario?',
      a: 'Sí, si la enlazas. Abre el producto, en **Modificadores** presiona **Descontar insumos al vender** y en esa opción elige el insumo y cuánto gasta. Desde ahí cada pieza extra que vendas baja del stock, y si anulas la venta vuelve.',
    },
    {
      q: 'Enlacé el insumo y el stock no bajó.',
      a: 'Revisa que la venta sea posterior al enlace: lo que se descuenta queda grabado en cada comprobante al momento de venderlo, así que las ventas anteriores no lo tienen. Si vendes desde la app instalada, además necesitas la versión nueva de la app.',
    },
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
