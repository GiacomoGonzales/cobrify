/**
 * GUÍA DE USO: Modificadores
 *
 * La pantalla es la pestaña **Modificadores** de Insumos (solo restaurante), con
 * sus dos sub-pestañas: Reporte y Mis modificadores. No tiene ruta propia, va
 * registrada con `route: null` y se lee desde el manual, igual que la guía del
 * catálogo online.
 *
 * Los modificadores se CREAN dentro de cada producto (Productos > editar >
 * Modificadores) y se ADMINISTRAN acá. Esa separación es la que más confunde y
 * por eso la guía la dice de entrada.
 *
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx: cada botón que se
 * nombra existe con ese nombre exacto en la pantalla.
 */
export default {
  id: 'modificadores',
  actualizado: '04/09/2026',
  intro:
    'Los modificadores son las opciones que el cliente elige sobre un plato: el término de la carne, las cremas, una pieza extra. Se **crean** dentro de cada producto y se **administran** acá, en Insumos > Modificadores: qué se pide más, qué modificadores tienes repetidos y cómo dejar de escribir el mismo veinte veces.',

  sections: [
    {
      id: 'crear',
      title: 'Crear un modificador',
      blocks: [
        {
          type: 'texto',
          text: 'Un modificador vive dentro del producto, no en esta pantalla. Acá administras los que ya existen.',
        },
        {
          type: 'pasos',
          items: [
            'Ve a **Productos** y edita el plato.',
            'Baja hasta **Modificadores** y presiona **Agregar Modificador**.',
            'Ponle nombre al grupo (Cremas, Término de la carne, Agregados).',
            'Con **Agregar Opción** sumas cada opción y, si cobra, su recargo.',
            'Guarda el producto.',
          ],
        },
        {
          type: 'tabla',
          encabezados: ['Ajuste del grupo', 'Para qué sirve'],
          filas: [
            ['Obligatorio', 'El cajero no puede cerrar el plato sin elegir. Úsalo en el término de la carne, no en las cremas.'],
            ['Máximo de opciones', 'Cuántas puede elegir. Con 1 se comporta como una lista de una sola respuesta.'],
            ['Permitir repetir', 'Deja pedir la misma opción varias veces: tres piezas extra en un solo plato.'],
            ['Llevar control', 'Hace que ese grupo aparezca en el filtro **Solo con control** del reporte.'],
          ],
        },
        {
          type: 'consejo',
          text: 'El recargo se suma al precio del plato en el POS y viaja al comprobante. Una opción sin recargo se deja en blanco.',
        },
      ],
    },

    {
      id: 'reporte',
      title: 'Reporte: qué se pide más',
      blocks: [
        {
          type: 'texto',
          text: 'La sub-pestaña **Reporte** cuenta cuántas veces se pidió cada opción y cuánto dinero entró por los agregados de pago, en el período que elijas.',
        },
        {
          type: 'texto',
          text: 'Sale de los comprobantes ya emitidos, así que **funciona hacia atrás**: el día que actives el reporte ya tienes el histórico, no hace falta esperar a que se junten ventas nuevas.',
        },
        {
          type: 'pasos',
          items: [
            'Elige el período: hoy, 7 días, mes o un rango propio.',
            'Deja el ámbito en **Todos**, o pásalo a **Solo con control** para ver únicamente los grupos que marcaste.',
            'Abre un grupo para ver sus opciones, con las veces pedidas y el ingreso de cada una.',
            'Si lo necesitas fuera del sistema, presiona **Excel**.',
          ],
        },
        {
          type: 'consejo',
          text: 'Sirve para decidir con datos: si la crema de rocoto se pide diez veces más que la de aceituna, ya sabes cuál comprar y cuál sacar de la carta.',
        },
        {
          type: 'ojo',
          text: 'Las ventas anuladas no cuentan. Los grupos se juntan por nombre, así que "Cremas" y "cremas" salen en la misma fila.',
        },
      ],
    },

    {
      id: 'lista',
      title: 'Tu lista de modificadores',
      blocks: [
        {
          type: 'texto',
          text: 'La sub-pestaña **Mis modificadores** es una sola lista con todo lo que usas, agrupado por nombre. Están los que escribiste dentro de tus productos y los que dejaste guardados para reusar: si "Cremas" se tipeó en cuarenta platos, acá sale una vez y te dice en cuántos productos está.',
        },
        {
          type: 'tabla',
          encabezados: ['Lo que dice la fila', 'Qué significa'],
          filas: [
            ['**40 productos**', 'En cuántos platos está escrito ese modificador.'],
            ['**sin usar**', 'Lo tienes guardado pero ningún producto lo usa todavía.'],
            ['**Guardado**', 'Está guardado para reusar: aparece en **Desde plantilla** al editar un producto.'],
            ['**3 versiones**', 'Se llaman igual pero no dicen lo mismo. Ábrelo para ver cada una.'],
          ],
        },
        {
          type: 'texto',
          text: 'Abre una fila y adentro está todo lo que puedes hacer con ese modificador: unificar sus versiones, editarlo, repartirlo a más productos o quitarlo de los guardados.',
        },
      ],
    },

    {
      id: 'versiones',
      title: 'Cuando el mismo está escrito distinto',
      blocks: [
        {
          type: 'texto',
          text: 'La etiqueta **versiones** avisa que ese modificador no dice lo mismo en todos los platos: en uno tiene cuatro opciones y en otro tres, o con otro precio. Al abrirlo ves cada versión con los productos que la usan.',
        },
        {
          type: 'texto',
          text: 'A veces dos versiones muestran las mismas opciones al mismo precio. En ese caso la diferencia está en otra parte y te la dice el renglón **Se diferencia en**: una es obligatoria y la otra no, deja elegir más opciones, permite repetir, o descuenta un insumo distinto.',
        },
        {
          type: 'pasos',
          items: [
            'Abre el modificador en la lista.',
            'Mira cada versión y decide cuál quieres conservar.',
            'En esa versión presiona **Dejar todos con esta**.',
            'Lee cuántos cambian y confirma.',
          ],
        },
        {
          type: 'ojo',
          text: 'A los que cambian les cambia lo que se le cobra al cliente. Si un plato tiene otro precio a propósito, déjalo fuera: no es obligatorio unificar.',
        },
        {
          type: 'consejo',
          text: 'Unificar también arregla la escritura: los que estaban con otra mayúscula o sin tilde quedan con el nombre bueno.',
        },
      ],
    },

    {
      id: 'guardar',
      title: 'Guardarlo para no volver a escribirlo',
      blocks: [
        {
          type: 'texto',
          text: 'Un modificador **Guardado** queda disponible en el editor de cada producto con el botón **Desde plantilla**. Es lo que evita tipear las mismas cremas en cada plato nuevo.',
        },
        {
          type: 'pasos',
          items: [
            'Abre el modificador en la lista y presiona **Guardar para reusar**.',
            'Revisa el nombre y las opciones, y presiona **Guardar**.',
          ],
        },
        {
          type: 'texto',
          text: 'Con **Nuevo**, arriba de la lista, armas uno desde cero sin partir de ninguno existente. Y **Quitar de guardados** lo saca de la lista de reutilizables sin tocar los productos: los que lo tienen siguen vendiendo igual.',
        },
      ],
    },

    {
      id: 'aplicar',
      title: 'Bajar un cambio a los productos',
      blocks: [
        {
          type: 'texto',
          text: 'Al insertar un modificador guardado en un producto se **copia**, para que puedas ajustarlo en ese plato sin afectar a los demás. Por eso **guardar no cambia a los que ya lo usan**: guardar y aplicar son dos cosas.',
        },
        {
          type: 'texto',
          text: 'No hace falta que te acuerdes. Al guardar, si algún plato quedó con la versión anterior, aparece un aviso arriba de la lista con los nombres y un botón **Actualizar** que los pone al día de una sola vez.',
        },
        {
          type: 'texto',
          text: 'Cuando además quieras que el modificador llegue a platos que hoy **no lo tienen**, abre su fila y presiona **Aplicar a productos**:',
        },
        {
          type: 'pasos',
          items: [
            'Deja marcado **Los que ya lo tienen**.',
            'Marca las categorías cuyos platos deban recibirlo aunque hoy no lo tengan.',
            'Lee el resumen y confirma.',
          ],
        },
        {
          type: 'tabla',
          encabezados: ['El resumen dice', 'Qué significa'],
          filas: [
            ['Lo reciben por primera vez', 'Platos que hoy no lo tienen y van a quedar con él.'],
            ['Les cambia lo que se cobra', 'Platos que hoy tienen otras opciones u otro precio. **Revisa esta lista antes de confirmar.**'],
            ['Ya lo tienen igual', 'No se tocan. Por eso aplicar dos veces seguidas no hace nada la segunda.'],
          ],
        },
        {
          type: 'ojo',
          text: 'Las ventas ya emitidas no cambian: cada comprobante guarda lo que se cobró ese día. Esto solo afecta a lo que se va a vender de ahora en adelante.',
        },
      ],
    },

    {
      id: 'insumos',
      title: 'Que un agregado descuente su insumo',
      blocks: [
        {
          type: 'texto',
          text: 'Una opción puede descontar un insumo al venderse. Si cobras "Pieza extra de pollo" y llevas las piezas en **Insumos**, cada pieza extra que vendas baja del inventario, igual que si estuviera en la receta del plato.',
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
          text: 'El insumo se elige **por opción**, no por grupo: "Pieza extra" descuenta y "Sin cebolla" no. Lo que no enlaces no toca el inventario.',
        },
        {
          type: 'texto',
          text: 'Se descuenta por cada vez que se pide: dos piezas extra en tres platos son seis piezas. Si el plato se vende por presentación, también multiplica por ella. Al anular la venta el insumo vuelve solo, con la misma cantidad que se descontó.',
        },
        {
          type: 'consejo',
          text: 'No hace falta que el plato tenga receta. Un plato sin composición puede igual tener un agregado que descuenta.',
        },
        {
          type: 'enlace',
          to: '/app/ingredientes',
          label: 'Ir a Insumos',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Dónde creo un modificador? Acá no veo el botón.',
      a: 'Los modificadores se crean dentro de cada producto: **Productos**, editas el plato y bajas a **Modificadores**. Esta pantalla es para administrarlos: ver qué se pide, juntarlos y dejarlos guardados para reusar.',
    },
    {
      q: 'Tengo el mismo modificador escrito en decenas de productos. ¿Los junto?',
      a: 'En **Mis modificadores** ya los ves juntos: la lista agrupa por nombre y dice en cuántos productos está cada uno. Si además está escrito distinto en algunos, ábrelo y usa **Dejar todos con esta** en la versión que quieras conservar.',
    },
    {
      q: 'Tengo el mismo modificador en cuatro versiones. ¿Cómo hago para que todas sean una?',
      a: 'Ábrelo, mira cuál versión quieres conservar y presiona **Dejar todos con esta**. Todos los que se llamen igual quedan con esa, incluidos los que estaban escritos con otra mayúscula o con tilde. Antes de confirmar te dice cuántos cambian.',
    },
    {
      q: 'Dos versiones muestran exactamente lo mismo. ¿Por qué están separadas?',
      a: 'Porque se diferencian en algo que no son las opciones. Mira el renglón **Se diferencia en** de cada una: puede ser que una sea obligatoria, que deje elegir más opciones, que permita repetir, o que descuente un insumo distinto.',
    },
    {
      q: 'Edité un modificador guardado y los productos siguen con lo de antes.',
      a: 'Guardar y aplicar son dos cosas: cada producto tiene su propia copia, que es la que se usa al vender. Al guardar te sale un aviso arriba de la lista con los platos que quedaron atrás y un botón **Actualizar** que los pone al día todos juntos. Si no lo ves, es que ya están iguales.',
    },
    {
      q: 'Le cambié el nombre a un modificador guardado y ya no reconoce mis productos.',
      a: 'Los modificadores escritos a mano se reconocen por el nombre, así que renombrarlo corta ese vínculo. Usa **Aplicar a productos** una vez ANTES de renombrarlo: desde ahí quedan enlazados de verdad y el nombre ya no importa.',
    },
    {
      q: 'Quiero que todos los productos de una categoría lleven el mismo modificador.',
      a: 'Abre su fila, presiona **Aplicar a productos** y marca esa categoría. Los que no lo tengan lo reciben, y los que ya lo tenían quedan con la versión guardada.',
    },
    {
      q: 'Si presiono "Quitar de guardados", ¿se borra de mis platos?',
      a: 'No. Cada producto tiene su copia y sigue vendiendo igual. Solo deja de aparecer en **Desde plantilla** cuando edites un producto.',
    },
    {
      q: 'Cobro una pieza extra de pollo. ¿Se descuenta del inventario?',
      a: 'Sí, si la enlazas. En el producto, dentro de **Modificadores**, presiona **Descontar insumos al vender** y en esa opción elige el insumo y cuánto gasta.',
    },
    {
      q: 'Enlacé el insumo y el stock no bajó.',
      a: 'Revisa que la venta sea posterior al enlace: lo que se descuenta queda grabado en cada comprobante al venderlo, así que las ventas anteriores no lo traen. Si vendes desde la app instalada, además necesitas la versión nueva de la app.',
    },
    {
      q: 'El reporte me sale vacío.',
      a: 'Fíjate en el período y en el ámbito. Con **Solo con control** únicamente aparecen los grupos que tengan marcado **Llevar control** en la definición actual del producto; para ver todo, déjalo en **Todos**.',
    },
    {
      q: '¿El recargo del modificador va al comprobante?',
      a: 'Sí. Se suma al precio del plato y queda dentro de la línea de la venta, así que también entra en tus reportes de ingresos.',
    },
  ],
}
