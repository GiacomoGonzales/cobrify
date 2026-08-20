/**
 * GUÍA DE USO: Inventario
 *
 * Nombres verificados contra src/pages/Inventory.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'inventario',
  actualizado: '12/08/2026',
  intro:
    'Inventario es donde controlas cuánto tienes, dónde lo tienes y cuánto vale. Las ventas y compras mueven el stock solas; esta pantalla es para lo que pasa fuera de esos dos caminos: mermas, traslados y recuentos.',

  sections: [
    {
      id: 'leer-pantalla',
      title: 'Leer la pantalla',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba tienes el **Resumen del Inventario**: **Total Items**, **Unidades Totales**, **Valor Costo Inventario** (lo que te costó la mercadería que tienes) y **Valor Venta Inventario** (lo que vale si la vendes toda).',
        },
        {
          type: 'texto',
          text: 'Los filtros rápidos te dejan aislar lo que importa: **Stock Bajo** (llegó al mínimo que definiste), **Agotados** y **Sin control de stock**. Si tienes varios almacenes, el selector de **Almacén** cambia todo lo que ves.',
        },
        {
          type: 'consejo',
          text: 'La diferencia entre Valor Costo y Valor Venta es tu ganancia potencial si vendieras todo el inventario. Si el Valor Costo sale en cero, es que a los productos les falta cargar el costo.',
        },
        {
          type: 'ojo',
          text: 'Los productos **desactivados no cuentan** en Stock Bajo ni en Agotados. Desactivar un producto es decir "esto ya no se vende", así que seguir alertándolo solo taparía los que sí necesitas reponer. Siguen apareciendo en la lista; simplemente dejan de pedir atención.',
        },
        {
          type: 'texto',
          text: 'Si un producto dejó de venderse pero no quieres perder su historial, desactivarlo es mejor que borrarlo: sale de las alertas y del punto de venta, y sus ventas pasadas quedan intactas.',
        },
      ],
    },

    {
      id: 'donde-vive-el-stock',
      title: 'Dónde vive el stock',
      blocks: [
        {
          type: 'texto',
          text: 'Antes de mover nada conviene tener claro esto, porque explica casi todas las dudas de esta pantalla: **el stock no vive en la sucursal, vive en el almacén**.',
        },
        {
          type: 'texto',
          text: 'La **sucursal** es el local: decide con qué serie sale el comprobante y a qué caja entra la plata. El **almacén** es dónde está guardada la mercadería: decide de dónde se descuenta. Una sucursal puede tener varios almacenes —mostrador, depósito, trastienda— y el total de un producto es la **suma** de todos.',
        },
        {
          type: 'ojo',
          text: 'Por eso el mismo producto puede figurar **con stock en un almacén y sin stock en otro**, y no es un error. Si en el punto de venta dice agotado y vos lo estás viendo en el depósito, el sistema tiene razón: está mirando el almacén desde el que vendés. Se resuelve con una **transferencia**.',
        },
        {
          type: 'consejo',
          text: 'El selector de **Almacén** de esta pantalla cambia todo lo que ves. Si un número no cuadra, revisá primero en qué almacén estás parado — antes de buscar el problema en otro lado.',
        },
        {
          type: 'enlace',
          to: '/app/manual/almacenes',
          label: 'Ver la diferencia con un ejemplo completo',
        },
      ],
    },

    {
      id: 'merma',
      title: 'Registrar una merma o pérdida',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando se rompe, se vence o se pierde mercadería, hay que descontarla para que el sistema siga diciendo la verdad.',
        },
        {
          type: 'pasos',
          items: [
            'Ubica el producto en la lista.',
            'Al final de su fila, toca el botón de **tres puntos** para abrir sus acciones.',
            'Elige **Registrar merma**.',
            'Pon la cantidad y el **Motivo**: Producto dañado, Producto expirado, Robo, Pérdida/Extravío u Otro.',
          ],
        },
        {
          type: 'ui',
          kind: 'menu',
          label: 'Acciones del producto',
          nota: 'Al final de cada fila del inventario. Desde ahí salen Transferir, Registrar merma, Registrar salida, Producir y Ver historial.',
        },
        {
          type: 'texto',
          text: 'Queda registrado en el historial con el motivo y la fecha, así que después puedes ver cuánto perdiste y por qué.',
        },
        {
          type: 'consejo',
          text: 'Registrar las mermas es lo que hace que un recuento físico cuadre. Si nunca las anotas, el inventario del sistema siempre va a estar por encima del real.',
        },
      ],
    },

    {
      id: 'transferir',
      title: 'Transferir entre almacenes',
      blocks: [
        {
          type: 'texto',
          text: 'Para mover mercadería de un almacén o sucursal a otro se usa la transferencia: el sistema descuenta de uno y suma al otro en una sola operación.',
        },
        {
          type: 'pasos',
          items: [
            'En la fila del producto, abre el menú de **tres puntos**.',
            'Elige **Transferir**.',
            'Selecciona el **almacén origen**, el **almacén destino** y la **Cantidad a Transferir**.',
          ],
        },
        {
          type: 'texto',
          text: 'Si necesitas mover muchos productos de una vez, en el menú **Opciones** está el **Traslado masivo**.',
        },
        {
          type: 'ojo',
          text: 'Transferir no cambia tu stock total, solo dónde está. Si el total bajó después de una transferencia, lo que ocurrió fue otra cosa (una venta o una merma).',
        },
        {
          type: 'texto',
          text: 'Los almacenes se crean y se administran en su propia página. Si un almacén no te aparece como destino, revisa que esté **activo** ahí.',
        },
        {
          type: 'enlace',
          to: '/app/almacenes',
          label: 'Administrar mis almacenes',
        },
      ],
    },

    {
      id: 'recuento',
      title: 'Recuento físico (cuadrar el inventario)',
      blocks: [
        {
          type: 'ui',
          kind: 'botonSecundario',
          label: 'Opciones',
          nota: 'Arriba a la derecha de la pantalla, junto al buscador.',
        },
        {
          type: 'texto',
          text: 'Es la herramienta para poner el sistema de acuerdo con la realidad. En el menú **Opciones** entras a **Recuento físico**: cuentas la mercadería, anotas lo que hay de verdad y el sistema te muestra la **Diferencia** contra lo que él creía.',
        },
        {
          type: 'pasos',
          items: [
            'Abre **Recuento físico** desde **Opciones**.',
            'Filtra por almacén o categoría si vas a contar por partes.',
            'Anota la cantidad real de cada producto en la columna de **Conteo**.',
            'Revisa la columna **Diferencia**: te dice qué está **Faltante** y qué **Sobrante**.',
            'Confirma para que el sistema ajuste el stock a lo contado.',
          ],
        },
        {
          type: 'texto',
          text: 'Los recuentos anteriores quedan guardados en **Historial de recuentos** (mismo menú **Opciones**), así puedes comparar contra la vez pasada.',
        },
        {
          type: 'consejo',
          text: 'No hace falta contar todo de golpe. Filtra por categoría o por almacén y ve cuadrando por partes; el sistema guarda el avance.',
        },
      ],
    },

    {
      id: 'herramientas-riesgo',
      title: 'Las herramientas que reescriben stock',
      blocks: [
        {
          type: 'texto',
          text: 'Hay dos acciones en esta pantalla que no ajustan un producto: **reescriben stock en masa**. Resuelven problemas reales, pero conviene entender qué hacen antes de tocarlas, porque su efecto alcanza a todo el catálogo.',
        },
        {
          type: 'ui',
          kind: 'botonSecundario',
          label: 'Opciones',
          nota: 'Arriba a la derecha. Ahí viven Traslado masivo, Recuento físico, Historial de recuentos, Verificar stock, Revertir verificación y Exportar Excel.',
        },
        {
          type: 'texto',
          text: '**Stock sin asignar a almacén.** Este no está en ningún menú: aparece **solo**, como un aviso amarillo arriba de la lista, y únicamente cuando hay stock en esa situación. Si aparece, tienes mercadería que el sistema cuenta en el total pero que no está en ningún almacén activo — y por eso **no se puede vender**: en el punto de venta figura como agotada. Suele venir de productos cargados antes de crear los almacenes, o de un almacén que se eliminó.',
        },
        {
          type: 'ojo',
          text: 'El botón vuelca todo ese stock a **un solo almacén**: el principal. Si tienes **varias sucursales**, el sistema no puede saber de cuál era cada unidad, así que las apila todas en una. Con más de una sede, es preferible repartirlo a mano con transferencias antes que usar el botón.',
        },
        {
          type: 'consejo',
          text: 'Solo el **dueño** puede ejecutarlo, pide confirmación y **guarda un respaldo** antes de escribir. Si el resultado no es el que esperabas, se puede revertir.',
        },
        {
          type: 'texto',
          text: '**Verificar stock** (en el menú **Opciones**). Recalcula el stock de todos los productos **desde el historial de movimientos**, tomando ese historial como la verdad. Sirve cuando el stock quedó descuadrado por una falla y el historial sí está completo.',
        },
        {
          type: 'ojo',
          text: 'Es exactamente al revés de un recuento: el recuento cree en **lo que contaste**, esto cree en **el historial**. Si tu historial tiene movimientos viejos incompletos, puede dejar productos en negativo o mezclar stock entre sucursales. Termina con **Revertir verificación de stock** disponible por si hace falta deshacerla.',
        },
        {
          type: 'consejo',
          text: 'Ante la duda entre las dos, elige el **recuento físico**: contar y ajustar es siempre más seguro que reescribir el inventario desde un historial que no controlas.',
        },
      ],
    },

    {
      id: 'produccion',
      title: 'Producción rápida',
      soloModos: ['restaurant'],
      blocks: [
        {
          type: 'texto',
          text: 'Si un producto tiene **receta**, lo fabricas desde el inventario: en el menú de **tres puntos** de su fila, elige **Producir**. Pones la **cantidad a producir**, el sistema descuenta los **insumos** que consume y suma las unidades terminadas.',
        },
        {
          type: 'texto',
          text: 'Antes de ejecutar te avisa si **alcanzan los insumos**, así no arrancas una producción que se va a quedar a medias. También te muestra el costo de esa producción, calculado desde la receta.',
        },
        {
          type: 'texto',
          text: 'Si el producto tiene **variantes** (tallas, colores, sabores), el modal te pide **cuál estás produciendo** y te muestra el stock actual de cada una. Es obligatorio elegirla: el stock vive en cada variante, no en el producto general, así que las unidades terminadas se suman a la variante que fabricaste.',
        },
        {
          type: 'consejo',
          text: 'Es la forma de que el inventario refleje lo que realmente pasa en cocina: sin registrar la producción, los insumos figuran completos y el producto terminado en cero.',
        },
      ],
    },

    {
      id: 'costos',
      title: 'Recalcular el costo desde las compras',
      blocks: [
        {
          type: 'texto',
          text: 'El costo de un producto es lo que determina tu margen y tu utilidad. Si lo cargaste mal o nunca lo cargaste, esta acción lo **recalcula desde tu historial de compras**: toma lo que realmente pagaste por ese producto.',
        },
        {
          type: 'consejo',
          text: 'Es el atajo para cuando los reportes de utilidad salen en cero. En vez de escribir el costo producto por producto, si ya registraste las compras el dato ya lo tienes.',
        },
        {
          type: 'ojo',
          text: 'Solo puede calcular el costo de lo que **compraste dentro del sistema**. Los productos cargados a mano y nunca comprados quedan igual, porque no hay de dónde sacar el dato.',
        },
      ],
    },

    {
      id: 'movimientos',
      title: 'Historial: quién movió qué',
      blocks: [
        {
          type: 'texto',
          text: 'Cada cambio de stock deja rastro: **Entradas**, **Salidas**, **Transferencia Entrada**, **Transferencia Salida** y **Merma/Dañado**, con su fecha, motivo y el saldo que quedó. Es el lugar donde se resuelve la pregunta "¿por qué este producto tiene esta cantidad?".',
        },
        {
          type: 'texto',
          text: 'Para ver el historial de **un producto** concreto, abre el menú de **tres puntos** de su fila y elige **Ver historial**. El historial completo del negocio está en la página Movimientos.',
        },
        {
          type: 'consejo',
          text: 'Cuando un stock no cuadra, empieza siempre por el historial de ese producto: casi siempre aparece la venta, el traslado o la merma que explica la diferencia.',
        },
      ],
    },

    {
      id: 'insumos',
      title: 'Insumos, no solo productos',
      soloModos: ['restaurant'],
      blocks: [
        {
          type: 'texto',
          text: 'Esta pantalla no controla solo lo que vendes: también tus **insumos** —harina, aceite, envases—. Aparecen junto a los productos y se les hace lo mismo: transferir entre almacenes, registrar mermas y contarlos en un recuento.',
        },
        {
          type: 'consejo',
          text: 'Los insumos se descuentan solos cuando vendes un plato con receta. Llevarles inventario es lo que te permite saber cuánto te queda de verdad, en vez de descubrirlo cuando falta en pleno servicio.',
        },
      ],
    },

    {
      id: 'exportar',
      title: 'Exportar el inventario',
      blocks: [
        {
          type: 'texto',
          text: 'Desde **Opciones** puedes exportar el inventario a Excel para revisarlo fuera del sistema, pasárselo a tu contador o usarlo como planilla de conteo en papel.',
        },
        {
          type: 'consejo',
          text: 'Antes de un recuento grande, exportar la lista y salir a contar con ella impresa suele ser más rápido que ir con el celular estante por estante.',
        },
        {
          type: 'texto',
          text: '**Inventario a una fecha pasada.** En las opciones de exportación puedes pedir el stock **al cierre de un día anterior** — el clásico "necesito el inventario al 31 de julio" que pide el contador. El sistema no guarda fotos del inventario: reconstruye ese día caminando el historial de movimientos hacia atrás desde el stock de hoy. El Excel sale titulado con esa fecha para que no se confunda con el actual.',
        },
        {
          type: 'ojo',
          text: 'La reconstrucción es tan buena como el historial. Si a un producto le cambiaron el stock sin dejar movimiento (cargas masivas antiguas, por ejemplo), su cantidad de esa fecha puede salir corrida y el sistema te avisa cuántos items están en ese caso. Los productos creados después de la fecha no aparecen, y los que tienen variantes salen con su total: las ventas no registran cuál variante se vendió.',
        },
      ],
    },

    {
      id: 'lotes-series',
      title: 'Lotes y números de serie',
      blocks: [
        {
          type: 'texto',
          text: 'Si un producto lleva **control de lotes**, cada ingreso guarda su **Fecha de Vencimiento** y las ventas salen por el lote que vence primero, para que no se te quede mercadería vencida atrás.',
        },
        {
          type: 'texto',
          text: 'Si lleva **Control de N° de serie**, cada unidad se identifica por separado: sabes exactamente qué serie vendiste y a quién.',
        },
        {
          type: 'consejo',
          text: 'Los lotes se activan por producto en su ficha. Es lo habitual en farmacias y en alimentos; para el resto de rubros suele ser innecesario.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'El sistema dice que tengo 10 pero físicamente hay 8, ¿qué hago?',
      a: 'Si sabes qué pasó (se rompieron, se vencieron), regístralo como **merma** con su motivo. Si no sabes, haz un **Recuento físico**: anotas lo real y el sistema ajusta y deja constancia de la diferencia.',
    },
    {
      q: 'Un producto aparece con stock en un almacén y sin stock en otro.',
      a: 'Es correcto: el stock vive por almacén. Revisa el selector de **Almacén** arriba, y si la mercadería está en el sitio equivocado, muévela con una transferencia.',
    },
    {
      q: '¿Por qué un producto no aparece en Inventario?',
      a: 'Porque no tiene control de stock activado. Los servicios y los productos marcados como **Sin control de stock** no se inventarían. Puedes verlos con ese filtro.',
    },
    {
      q: 'Vendí sin internet, ¿se descontó el stock?',
      a: 'El descuento se aplica cuando la venta se sincroniza. Si el indicador de ventas pendientes te avisó de algún problema al descontar, revisa esos productos en el historial de movimientos.',
    },
    {
      q: '¿Puedo dejar el stock en negativo?',
      a: 'Depende de la opción **Permitir vender productos sin stock**, en Configuración > Ventas. Si está activada, el sistema deja vender de más y el producto queda en negativo hasta que lo cuadres.',
    },
  ],
}
