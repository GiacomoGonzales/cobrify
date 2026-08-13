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
      id: 'merma',
      title: 'Registrar una merma o pérdida',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando se rompe, se vence o se pierde mercadería, hay que descontarla para que el sistema siga diciendo la verdad. En las acciones del producto eliges la salida y su **Motivo**: Producto dañado, Producto expirado, Robo, Pérdida/Extravío u Otro.',
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
          text: 'Para mover mercadería de un almacén o sucursal a otro, usa la transferencia: eliges **almacén origen**, **almacén destino** y la **Cantidad a Transferir**. El sistema descuenta de uno y suma al otro en una sola operación.',
        },
        {
          type: 'texto',
          text: 'Si necesitas mover muchos productos de una vez, en el menú **Opciones** está el **Traslado masivo**.',
        },
        {
          type: 'ojo',
          text: 'Transferir no cambia tu stock total, solo dónde está. Si el total bajó después de una transferencia, lo que ocurrió fue otra cosa (una venta o una merma).',
        },
      ],
    },

    {
      id: 'recuento',
      title: 'Recuento físico (cuadrar el inventario)',
      blocks: [
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
      id: 'movimientos',
      title: 'Historial: quién movió qué',
      blocks: [
        {
          type: 'texto',
          text: 'Cada cambio de stock deja rastro: **Entradas**, **Salidas**, **Transferencia Entrada**, **Transferencia Salida** y **Merma/Dañado**, con su fecha, motivo y el saldo que quedó. Es el lugar donde se resuelve la pregunta "¿por qué este producto tiene esta cantidad?".',
        },
        {
          type: 'consejo',
          text: 'Cuando un stock no cuadra, empieza siempre por el historial de ese producto: casi siempre aparece la venta, el traslado o la merma que explica la diferencia.',
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
      a: 'Depende de la opción "permitir stock negativo" de tu negocio en Configuración. Si está activada, el sistema deja vender de más y el producto queda en negativo hasta que lo cuadres.',
    },
  ],
}
