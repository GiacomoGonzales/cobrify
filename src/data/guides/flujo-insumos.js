/**
 * RECORRIDO: manejar el stock de tus insumos, de punta a punta.
 *
 * Distinto a las demás guías: estas describen UNA pantalla; esta describe un
 * TRABAJO que cruza varias (Insumos, Compras, Composición, Producción,
 * Inventario, Movimientos). Nace de una observación de Giacomo: alguien que
 * pregunta "cómo manejo el stock de mis insumos" no tiene una pantalla que le
 * responda — tiene que ir juntando pedazos de cinco guías y adivinar el orden.
 *
 * VOCABULARIO (13-ago-2026): estas pantallas cambian de nombre según el rubro.
 * En restaurante son "Ingredientes" y "Recetas"; en el resto, "Insumos" y
 * "Composición" (verificado en Ingredients.jsx:110 y Recipes.jsx:31). La guía
 * se escribe en el vocabulario general y nombra el par completo cada vez que
 * menciona la pantalla: si dijera solo "Insumos", un restaurante buscaría en su
 * menú una opción que no existe con ese nombre.
 *
 * Los ejemplos cubren más de un rubro a propósito: el grupo Producción existe
 * en General, Restaurante, Transporte y Veterinaria (Sidebar.jsx, '/ingredientes').
 *
 * Nombres verificados contra Ingredients.jsx, CreatePurchase.jsx, Recipes.jsx e
 * ingredientService.js. Ver reglas de redacción en pos.js.
 */
export default {
  id: 'flujo-insumos',
  actualizado: '13/08/2026',
  intro:
    'Un recorrido completo: desde que cargas un insumo por primera vez hasta que sabes cuánto te queda y cuánto te costó cada producto que armas con él. Son cinco pantallas distintas, y el orden importa: hacerlo al revés es el motivo más común de que los números no cuadren.',

  sections: [
    {
      id: 'el-mapa',
      title: 'El mapa completo, en cinco pasos',
      blocks: [
        {
          type: 'texto',
          text: 'Antes de entrar en detalle, así se ve el circuito entero. Cada paso vive en una pantalla distinta:',
        },
        {
          type: 'tabla',
          encabezados: ['Paso', 'Dónde', 'Para qué'],
          filas: [
            ['1. Crear el insumo', 'Insumos', 'Que exista, con su unidad y su stock mínimo'],
            ['2. Comprarlo', 'Compras', 'Que entre stock y el sistema aprenda su costo'],
            ['3. Definir la composición', 'Composición', 'Decir cuánto insumo lleva cada producto'],
            ['4. Vender o producir', 'POS o Inventario', 'El descuento pasa solo'],
            ['5. Revisar', 'Insumos e Inventario', 'Ver qué falta y qué se consumió'],
          ],
        },
        {
          type: 'ojo',
          text: 'Si tu negocio es un **restaurante**, esas dos pantallas se llaman **Ingredientes** y **Recetas**. Es lo mismo con otro nombre: el sistema usa el vocabulario de tu rubro.',
        },
        {
          type: 'ojo',
          text: 'El orden no es un capricho: **el costo del insumo sale de las compras**, y **la composición necesita que el insumo exista**. Si armas la composición antes de comprar, los costos van a salir en cero hasta que registres la primera compra.',
        },
      ],
    },

    {
      id: 'crear-insumo',
      title: '1. Crear el insumo',
      blocks: [
        {
          type: 'texto',
          text: 'En la pantalla de **Insumos** (**Ingredientes** en restaurante) creas cada materia prima. No son productos: no se venden sueltos, se consumen para armar otra cosa.',
        },
        {
          type: 'tabla',
          encabezados: ['Si tienes…', 'Tus insumos son…', 'Y con ellos armas…'],
          filas: [
            ['Un restaurante', 'Harina, aceite, pollo, envases', 'Los platos de tu carta'],
            ['Una panadería o taller', 'Harina, azúcar, bolsas, etiquetas', 'El producto terminado que vendes'],
            ['Una veterinaria', 'Shampoo, vacunas, guantes, bolsas', 'Servicios y packs (baño + corte, plan de vacunación)'],
          ],
        },
        {
          type: 'pasos',
          items: [
            'Ponle **nombre** y **categoría** (granos, carnes, envases, medicamentos… te sirve para filtrar después).',
            'Elige la **Unidad de Compra**: la unidad en la que te lo vende tu proveedor — kilos, litros, unidades.',
            'Define el **Stock Mínimo**: a partir de qué cantidad querés que te avise.',
            'Opcionalmente asocia el **Proveedor** al que se lo compras.',
          ],
        },
        {
          type: 'consejo',
          text: 'La **unidad** es la decisión que más cuesta cambiar después, porque toda la composición queda expresada en ella. Elige la unidad en la que **compras**: si el aceite te llega por litro, el insumo va en litros aunque uses mililitros al prepararlo.',
        },
        {
          type: 'texto',
          text: 'Hay un interruptor **Solo para costos**. Sirve para insumos que querés que sumen al costo pero de los que no vas a llevar inventario — el gas, la sal, cosas que no tiene sentido contar.',
        },
        {
          type: 'ojo',
          text: 'Un insumo marcado **Solo para costos no descuenta stock**. Si después te preguntas por qué no baja, es esto. Actívalo solo cuando de verdad no quieras contarlo.',
        },
      ],
    },

    {
      id: 'comprar',
      title: '2. Registrar la compra que lo ingresa',
      blocks: [
        {
          type: 'texto',
          text: 'El stock de un insumo **entra por una compra**, igual que el de un producto. En **Compras > Nueva compra**, el buscador encuentra tanto productos como insumos: elegís el insumo, la cantidad y el precio que pagaste.',
        },
        {
          type: 'texto',
          text: 'Al guardar pasan dos cosas: sube el stock del insumo, y el sistema **aprende cuánto te cuesta**. Ese costo es el que después usa la composición para decirte cuánto te sale cada producto.',
        },
        {
          type: 'consejo',
          text: 'El sistema guarda el **costo promedio** de cada insumo, no solo el último precio. Si compraste harina a S/3.50 y después a S/4.00, tus costos usan el promedio ponderado — que es más justo que cualquiera de los dos sueltos.',
        },
        {
          type: 'ojo',
          text: 'Si nunca registras las compras, tus insumos van a tener stock cargado a mano y **costo cero**. Ahí los reportes de utilidad salen sin sentido: el precio de venta completo aparece como ganancia.',
        },
      ],
    },

    {
      id: 'receta',
      title: '3. Definir la composición',
      blocks: [
        {
          type: 'texto',
          text: 'La composición es lo que une el producto con sus insumos: dice **cuánto** de cada uno lleva. Se arma en la pantalla de **Composición** (**Recetas** en restaurante), eligiendo el producto y agregando sus insumos con la cantidad que consume cada unidad vendida.',
        },
        {
          type: 'texto',
          text: 'Con eso el sistema calcula solo el **costo real de ese producto**, sumando lo que cuesta cada insumo por la cantidad que lleva. Un lomo saltado, un pan de molde envasado o un baño completo de perro: el cálculo es el mismo.',
        },
        {
          type: 'consejo',
          text: 'Cárgala para **una unidad**, no para una tanda. Si una olla rinde 20 porciones, la composición es lo que lleva **una**. El sistema multiplica solo según lo que vendas.',
        },
        {
          type: 'ojo',
          text: 'La composición manda sobre el costo del producto: un producto que la tiene **toma su costo de ella**, y deja de usar el que tenga escrito en su ficha. Es a propósito — el costo real de algo que armas es el de sus insumos.',
        },
      ],
    },

    {
      id: 'consumo',
      title: '4. Vender o producir: el descuento pasa solo',
      blocks: [
        {
          type: 'texto',
          text: 'Con la composición armada ya no hay que hacer nada más. Al **vender** el producto en el punto de venta, el sistema descuenta los insumos que consume, en la cantidad que corresponde.',
        },
        {
          type: 'texto',
          text: 'Hay un segundo camino, para cuando **fabricas antes de vender**: en Inventario, en el menú de tres puntos del producto, está **Producir**. Ahí pones cuántas unidades vas a hacer, el sistema descuenta los insumos y suma el producto terminado.',
        },
        {
          type: 'tabla',
          encabezados: ['Si lo armas…', 'Usás', 'Qué pasa'],
          filas: [
            ['En el momento, al vender (un plato, un servicio)', 'El POS', 'Se descuentan los insumos al cobrar'],
            ['Antes, y después lo vendes hecho (panadería, taller, packs)', 'Producir, en Inventario', 'Se descuentan los insumos y sube el producto terminado'],
          ],
        },
        {
          type: 'ojo',
          text: 'No uses los dos para lo mismo. Si **produjiste** 20 panes y después los **vendés**, los insumos ya se descontaron al producir: la venta descuenta el pan, no la harina. Descontar dos veces es el error clásico de este circuito.',
        },
      ],
    },

    {
      id: 'revisar',
      title: '5. Revisar: qué falta y qué se consumió',
      blocks: [
        {
          type: 'texto',
          text: 'La pantalla de **Insumos** te muestra el estado de un vistazo: **Stock Actual**, **Costo Promedio**, **Valor Total** de lo que tienes guardado, y cuáles están en **Stock Bajo** o **Sin stock** según el mínimo que definiste.',
        },
        {
          type: 'texto',
          text: 'Para saber **por qué** un insumo llegó a esa cantidad, el historial de movimientos lo muestra: cada compra que lo subió y cada venta o producción que lo bajó, con su fecha.',
        },
        {
          type: 'consejo',
          text: 'Los insumos también aparecen en **Inventario**, junto a los productos. Ahí les podés hacer lo mismo: transferirlos entre almacenes, registrar una merma cuando se echa a perder o se rompe, y contarlos en un recuento físico.',
        },
        {
          type: 'ojo',
          text: 'Registrar las **mermas** de insumos es lo que hace que el recuento cuadre. Lo que se vence, se derrama o se rompe no lo descuenta ninguna venta: si no lo anotas, el sistema va a creer que tienes más de lo que hay.',
        },
      ],
    },

    {
      id: 'cuadrar',
      title: 'Si los números no cuadran',
      blocks: [
        {
          type: 'texto',
          text: 'Las tres causas más comunes, en orden de frecuencia:',
        },
        {
          type: 'pasos',
          items: [
            '**El insumo está en "Solo para costos"** — suma al costo pero no lleva inventario, así que nunca baja.',
            '**Faltan mermas registradas** — lo que se echó a perder sigue contado.',
            '**Se produjo y además se vendió el mismo lote** — los insumos se descontaron al producir, y volver a descontarlos deja el stock por debajo de lo real.',
          ],
        },
        {
          type: 'consejo',
          text: 'Cuando ninguna de las tres explica la diferencia, hacé un **recuento físico** de insumos: contás lo que hay y el sistema ajusta dejando constancia. Es más rápido que perseguir el movimiento perdido.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Cuál es la diferencia entre un producto y un insumo?',
      a: 'El **producto** se vende; el **insumo** se consume para armarlo. La harina es insumo, el pan es producto. El shampoo es insumo, el baño es el servicio que vendes. Un insumo nunca aparece en el punto de venta.',
    },
    {
      q: '¿Por qué en mi sistema dice "Ingredientes" y no "Insumos"?',
      a: 'Porque estás en modo **Restaurante**: ahí las pantallas se llaman **Ingredientes** y **Recetas**. En los demás rubros son **Insumos** y **Composición**. Funcionan exactamente igual.',
    },
    {
      q: 'Compro por kilo pero uso gramos, ¿cómo lo pongo?',
      a: 'El insumo va en la unidad en la que **compras** (kilos). En la composición pones la cantidad que corresponde a esa unidad. Mantener una sola unidad por insumo es lo que evita errores de mil veces más o mil veces menos.',
    },
    {
      q: '¿Por qué el costo de mi producto sale en cero?',
      a: 'Porque los insumos no tienen costo. El costo se aprende de las **compras**: si cargaste el stock a mano sin registrar la compra, el sistema no sabe cuánto pagaste.',
    },
    {
      q: 'Cambié el precio de un insumo, ¿se actualizan mis costos?',
      a: 'Sí, el costo de cada composición se calcula con el costo actual de sus insumos. Lo que **no** cambia es lo ya vendido: cada venta guardó su costo del momento.',
    },
    {
      q: '¿Puedo llevar insumos sin definir composiciones?',
      a: 'Sí. Podés cargarlos, comprarlos y controlar su stock igual. Lo que perdés sin composición es el descuento automático al vender y el costo por producto: tendrías que descontarlos a mano.',
    },
  ],
}
