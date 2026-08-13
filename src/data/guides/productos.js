/**
 * GUÍA DE USO: Productos
 *
 * Nombres verificados contra src/pages/Products.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'productos',
  actualizado: '12/08/2026',
  intro:
    'Tu catálogo: lo que vendes, a cuánto y cuánto te cuesta. Todo lo que registres acá es lo que aparece en el Punto de Venta, así que vale la pena cargarlo bien una vez.',

  sections: [
    {
      id: 'leer-pantalla',
      title: 'Leer la pantalla',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba tienes tres números que resumen tu catálogo: **Total Productos**, **Valor Inventario** (cuánto vale la mercadería que tienes) y **Stock Bajo** (cuántos llegaron a su mínimo y conviene reponer).',
        },
        {
          type: 'texto',
          text: 'Debajo, los filtros aíslan lo que necesitas mirar: los que están **sin stock**, los de **stock bajo**, los **próximos a vencer**, y los que quedaron **sin categoría** o **sin marca** — útiles para detectar fichas a medio cargar.',
        },
        {
          type: 'consejo',
          text: 'Con **Columnas visibles** eliges qué datos ver en la tabla. Si trabajas con pocos datos por producto, quitar columnas hace la lista mucho más legible.',
        },
        {
          type: 'ojo',
          text: 'El **Stock Bajo** no cuenta los productos desactivados. Desactivar es decir "esto ya no se vende", así que seguir alertándolos taparía los que sí hay que reponer.',
        },
      ],
    },

    {
      id: 'crear-producto',
      title: 'Crear un producto',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Nuevo Producto**.',
            'Completa el nombre, el **precio** de venta y el **costo** (lo que te cuesta a ti).',
            'Elige la categoría y la marca si las usas.',
            'Si lo vas a controlar por inventario, deja activado el control de stock y pon la cantidad inicial.',
            'Guarda: ya puedes venderlo desde el POS.',
          ],
        },
        { type: 'ui', kind: 'boton', label: 'Nuevo Producto' },
        {
          type: 'ojo',
          text: 'Carga el **costo** aunque te dé pereza. Sin costo, el sistema no puede calcular tu ganancia y los reportes de utilidad y margen salen en cero.',
        },
        {
          type: 'consejo',
          text: 'Si vendes servicios (mano de obra, consultas, fletes), marca **Este producto es un servicio**: no se le lleva stock.',
        },
        {
          type: 'texto',
          text: 'Hay dos campos que no vienen activados y que conviene conocer. La **ubicación física en el almacén** (pasillo, estante, góndola) le ahorra vueltas a quien va a buscar la mercadería, y sale en los reportes de inventario.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=preferencias&opcion=enableProductLocation',
          label: 'Habilitar la ubicación de productos',
        },
        {
          type: 'texto',
          text: 'Y la **edición manual del stock**, que permite corregir la cantidad escribiéndola directamente en la ficha del producto.',
        },
        {
          type: 'ojo',
          text: 'Esa segunda viene apagada por algo: al escribir el stock a mano **no queda registrado de dónde salió la diferencia**. Para ajustes reales es mejor usar Inventario, que deja el movimiento con su motivo. Actívala solo si sabes que la vas a necesitar.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=preferencias&opcion=enableManualStockEdit',
          label: 'Permitir editar el stock manualmente',
        },
      ],
    },

    {
      id: 'codigos',
      title: 'Códigos y códigos de barras',
      blocks: [
        {
          type: 'texto',
          text: 'Cada producto tiene su **código interno (SKU)** y puede tener su **código de barras** (EAN/UPC). Si no los escribes, el sistema genera el código interno solo.',
        },
        {
          type: 'texto',
          text: 'Un mismo producto admite **varios códigos de barras**. Sirve cuando el proveedor te cambia el empaque o cuando el mismo artículo te llega con dos códigos distintos: ambos lo encuentran en el POS.',
        },
        {
          type: 'consejo',
          text: 'Al vender, el buscador del POS reconoce el código de barras, el código interno y el nombre. No necesitas memorizar códigos.',
        },
      ],
    },

    {
      id: 'codigo-sunat',
      title: 'Código de Producto SUNAT',
      blocks: [
        {
          type: 'texto',
          text: 'Aparte de tu código interno, cada producto puede llevar su **Código de Producto SUNAT** (catálogo 25). Es una clasificación oficial: escribes lo que vendes —"helado", "gaseosa", "cemento"— y eliges de la lista que trae el buscador.',
        },
        {
          type: 'ojo',
          text: 'SUNAT lo va a exigir a partir del **1 de enero de 2027**. La fecha se postergó una vez, así que no hay apuro, pero cargarlo de a poco ahora es mucho más llevadero que hacerlo con todo el catálogo encima a fin de año.',
        },
        {
          type: 'consejo',
          text: 'La primera vez que abres el buscador tarda un momento: está descargando el catálogo oficial completo. Después responde al instante.',
        },
      ],
    },

    {
      id: 'imagenes',
      title: 'Imágenes del producto',
      blocks: [
        {
          type: 'texto',
          text: 'Cada producto admite hasta **5 imágenes**. La primera es la principal: es la que se ve en el punto de venta y en tu catálogo online.',
        },
        {
          type: 'consejo',
          text: 'Las fotos rinden sobre todo en dos lados: en el POS con vista de cuadrícula, donde el cajero reconoce el producto sin leer, y en el catálogo online, donde son lo que decide la compra.',
        },
      ],
    },

    {
      id: 'unificar-codigos',
      title: 'Unificar códigos (poner todo en un solo sistema)',
      blocks: [
        {
          type: 'texto',
          text: 'Si tu catálogo quedó con dos sistemas de código conviviendo —unos productos con códigos viejos y otros con el correlativo nuevo— en el menú **Opciones** tienes **Unificar códigos**.',
        },
        {
          type: 'texto',
          text: 'Le da un **número correlativo de 7 dígitos** a los productos que aún no lo tienen, ordenados **alfabéticamente**, y ese mismo número queda como código interno y como código de barras: listo para imprimir etiquetas y leerlas con el escáner.',
        },
        {
          type: 'pasos',
          items: [
            'Abre **Opciones > Unificar códigos**.',
            'Revisa el resumen: cuántos productos van a recibir código y cuántos ya tienen el suyo.',
            'Confirma. Después imprime las etiquetas de los productos nuevos.',
          ],
        },
        {
          type: 'ojo',
          text: 'Es opcional y no se ejecuta solo: si tú escribes tus códigos a mano y tienes tu propio orden, **no lo uses**, porque los reemplaza. Los productos que ya tienen el código correlativo no se tocan, el código anterior se guarda por si necesitas rastrearlo, y tus ventas ya emitidas no cambian.',
        },
      ],
    },

    {
      id: 'variantes-presentaciones',
      title: 'Variantes y presentaciones',
      blocks: [
        {
          type: 'texto',
          text: 'Son dos cosas distintas y conviene no mezclarlas:',
        },
        {
          type: 'pasos',
          items: [
            '**Variantes**: el mismo producto en versiones que se cuentan por separado (talla, color). Cada variante lleva su propio stock y puede tener su propio precio.',
            '**Presentaciones**: distintas formas de vender la misma mercadería (unidad, caja x24, docena). Comparten el stock, y el sistema descuenta las unidades que corresponden según el factor.',
          ],
        },
        {
          type: 'consejo',
          text: 'Regla práctica: si al vender uno se agota el otro, es **presentación**. Si son artículos que se cuentan aparte, son **variantes**.',
        },
      ],
    },

    {
      id: 'lotes-series',
      title: 'Lotes, vencimientos y series',
      blocks: [
        {
          type: 'texto',
          text: 'Son dos controles distintos y cada uno resuelve un problema:',
        },
        {
          type: 'pasos',
          items: [
            '**Control de lotes**: la mercadería entra por tandas, cada una con su número de lote y su fecha de vencimiento. Sirve para todo lo que caduca — medicamentos, alimentos, insumos.',
            '**Control de series**: cada unidad tiene su número único (IMEI, número de serie). Sirve para equipos, celulares, electrodomésticos.',
          ],
        },
        {
          type: 'ojo',
          text: 'Con lotes activados, el sistema vende primero el que **vence antes**. No elige el que entró primero ni el más barato: prioriza sacar lo que está por caducar, que es lo que evita pérdidas.',
        },
        {
          type: 'consejo',
          text: 'El filtro **Próximos a vencer** de esta pantalla te muestra en qué hay que apurarse. Vale la pena mirarlo una vez por semana en vez de descubrirlo cuando ya venció.',
        },
      ],
    },

    {
      id: 'precios',
      title: 'Precios y niveles de precio',
      blocks: [
        {
          type: 'texto',
          text: 'Cada producto tiene su precio de venta. Si tu negocio maneja **niveles de precio** (público, mayorista, VIP), puedes cargarle un precio distinto para cada nivel y elegirlo al vender.',
        },
        {
          type: 'texto',
          text: 'Con el soporte multi-divisa activo, el precio de cada producto puede cargarse en **soles o en dólares** con el selector que aparece al lado. Un producto en dólares se convierte al cobrar, con el tipo de cambio del día.',
        },
        {
          type: 'texto',
          text: 'La **Unidad (SUNAT)** de cada producto —unidad, kilogramo, litro, caja— es la que viaja en el comprobante electrónico. Conviene elegirla bien: es un dato que SUNAT lee.',
        },
        {
          type: 'texto',
          text: 'También defines la **afectación IGV** del producto: Gravado, Exonerado, Inafecto o Gratuito. Eso determina cómo se calcula el impuesto en el comprobante, así que conviene revisarlo con tu contador si tienes dudas.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=multiplePricesEnabled',
          label: 'Configurar mis niveles de precio',
        },
        {
          type: 'texto',
          text: 'La afectación con la que **nacen** los productos nuevos también se configura: si vendes mayormente exonerado, ponla por defecto y te ahorras corregirla uno por uno.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=preferencias&opcion=defaultTaxAffectation',
          label: 'Afectación IGV por defecto',
        },
        {
          type: 'texto',
          text: 'Para cambiar precios de muchos productos a la vez está **Actualizar precios**, en el menú **Opciones** de la cabecera: se abre una tabla donde ves costo, precio y **margen** de cada producto y los editas de corrido.',
        },
      ],
    },

    {
      id: 'calculo-precios',
      title: 'Cómo se calculan tus precios',
      blocks: [
        {
          type: 'texto',
          text: 'Dentro de **Actualizar precios** decides cómo quieres trabajar tus precios, y esa elección se guarda para todo el catálogo. Es la parte que más confusión genera, así que vale entenderla una vez:',
        },
        {
          type: 'pasos',
          items: [
            '**Desde el costo**: escribes el costo y un porcentaje, y el precio se calcula solo. Útil si compras y revendes.',
            '**Desde el precio público**: escribes el precio final y los demás niveles salen como un descuento sobre él.',
          ],
        },
        {
          type: 'ojo',
          text: 'Si trabajas desde el costo, elige bien la **fórmula del margen**, porque el mismo porcentaje da precios distintos: **Recargo sobre el costo** calcula Precio = Costo × (1 + %), mientras que **Margen sobre la venta** apunta a que ese % sea tu ganancia sobre el precio final. Un 30% no significa lo mismo en las dos.',
        },
        {
          type: 'consejo',
          text: 'Los productos **sin costo cargado no calculan nada**. Es el mismo motivo por el que los reportes de utilidad salen en cero: sin costo no hay margen que sacar.',
        },
        {
          type: 'texto',
          text: 'También puedes definir **precio automático por cantidad**: que a partir de cierta cantidad el producto se cobre más barato, sin que el cajero tenga que acordarse.',
        },
      ],
    },

    {
      id: 'acciones-masivas',
      title: 'Trabajar con varios productos a la vez',
      blocks: [
        {
          type: 'texto',
          text: 'Marca las casillas de los productos que te interesan y aparece la barra de acciones. Desde ahí puedes, sobre todos los seleccionados de una sola vez:',
        },
        {
          type: 'pasos',
          items: [
            '**Cambiar categoría** o la **Afectación IGV**.',
            '**Activar / Desactivar** productos (los desactivados dejan de aparecer en el POS sin que pierdas su historial).',
            '**Manejar stock** o **Permitir decimales** (para lo que se vende por peso o metro).',
            '**Mostrar en catálogo** y **Asignar sucursales**.',
            'Imprimir **Etiquetas** de código de barras.',
            '**Eliminar** los seleccionados.',
          ],
        },
        {
          type: 'consejo',
          text: 'Desactivar es casi siempre mejor que eliminar: el producto desaparece del POS pero sus ventas pasadas siguen siendo consultables en los reportes.',
        },
      ],
    },

    {
      id: 'catalogo-online',
      title: 'Qué se ve en tu tienda online',
      blocks: [
        {
          type: 'texto',
          text: 'Si usas el catálogo online, cada producto decide si aparece ahí con **Mostrar en catálogo**, y puedes marcarlo como **Producto destacado** para que salga primero.',
        },
        {
          type: 'consejo',
          text: 'Destacar sirve mientras sea la excepción. Si destacas la mitad del catálogo, dejas de destacar nada.',
        },
      ],
    },

    {
      id: 'modificadores',
      title: 'Modificadores (extras y opciones)',
      soloModos: ['restaurant'],
      blocks: [
        {
          type: 'texto',
          text: 'Los **Modificadores** son las opciones que el cliente elige sobre un plato: el término de la carne, sin cebolla, extra queso, el tamaño del vaso. Se configuran en la ficha del producto y aparecen al agregarlo a una orden.',
        },
        {
          type: 'consejo',
          text: 'Los que suman al precio (extra queso, doble carne) van con su monto: así el mozo no tiene que acordarse de cobrarlos aparte y el ticket sale correcto solo.',
        },
      ],
    },

    {
      id: 'etiquetas',
      title: 'Imprimir etiquetas de código de barras',
      blocks: [
        {
          type: 'texto',
          text: 'Selecciona los productos y usa **Etiquetas**. Eliges el tamaño de etiqueta y cuántas por producto; el sistema arma la hoja lista para imprimir. Con productos que tienen variantes, se imprime una etiqueta por variante.',
        },
        {
          type: 'texto',
          text: 'Si tienes una **ticketera térmica** conectada al punto de venta, las etiquetas también pueden salir directo por ahí en vez de armar una hoja. En ese caso se configura el **tamaño del papel** y el que tiene puesto el driver de la impresora.',
        },
        {
          type: 'ojo',
          text: 'Si tienes una impresora Zebra y salen pocas etiquetas de las que pediste, casi siempre es el driver: el driver EPL manda los gráficos sin comprimir y satura la impresora. Con el driver **ZPL** salen todas.',
        },
      ],
    },

    {
      id: 'importar-exportar',
      title: 'Importar y exportar el catálogo',
      blocks: [
        {
          type: 'texto',
          text: 'En el menú **Opciones** de la cabecera tienes **Importar productos** y **Exportar a Excel**. La importación es la forma rápida de cargar un catálogo entero desde una hoja de cálculo, y admite variantes, series y presentaciones.',
        },
        {
          type: 'texto',
          soloModos: ['pharmacy', 'veterinary'],
          text: 'Tu plantilla es la de **Medicamentos**: además de las columnas normales trae **nombre_generico**, **concentracion**, **presentacion**, **laboratorio**, **principio_activo**, **accion_terapeutica**, **condicion_venta** y **registro_sanitario**, más el lote y su vencimiento.',
        },
        {
          type: 'consejo',
          soloModos: ['veterinary'],
          text: 'Esos campos de medicamento hoy se cargan **solo por importación**: la ficha del producto todavía no los muestra en modo veterinaria. Si los necesitas para todo tu catálogo, la vía es el Excel.',
        },
        {
          type: 'consejo',
          text: 'Exportar y volver a importar es la forma más cómoda de hacer cambios masivos: bajas tu catálogo, lo editas en Excel y lo subes. El archivo exportado usa las mismas columnas que espera la importación, así que el ida y vuelta no pierde datos.',
        },
        {
          type: 'ojo',
          text: 'Cuando pegues nombres desde Excel, ojo con los espacios y saltos de línea invisibles que se copian junto al texto: desordenan la lista alfabética. El sistema los limpia al guardar, pero si ves productos ordenados raro, casi siempre es eso.',
        },
        {
          type: 'texto',
          text: 'Si trabajas con **precios fijos en dólares**, la plantilla trae la columna **precio_usd** (aparece solo si tienes el soporte multi-divisa activado). Ahí pones el precio en dólares de cada producto.',
        },
        {
          type: 'consejo',
          text: 'La columna **precio** (soles) puede quedar **vacía** en esos productos: al vender, el sistema calcula los soles con el tipo de cambio del momento. Si prefieres, llénala igual como respaldo — se usa solo si en ese momento no hay tipo de cambio disponible.',
        },
        {
          type: 'ojo',
          text: 'Anclar al dólar significa que **el dólar manda**: el producto vale siempre esos dólares, y lo que se mueve es el monto en soles cuando cambia el tipo de cambio. Si lo que quieres es un precio fijo en soles, no uses esa columna.',
        },
        {
          type: 'consejo',
          text: 'Si tu Excel viene de otro sistema, el importador también reconoce la columna como **precio_dolares** o **price_usd**, en mayúsculas o minúsculas. No hace falta renombrarla a mano.',
        },
      ],
    },

    {
      id: 'sucursales',
      title: 'Un catálogo, varias sucursales',
      blocks: [
        {
          type: 'texto',
          text: 'El catálogo es uno solo, pero puede comportarse distinto en cada local.',
        },
        {
          type: 'texto',
          text: '**Precios por sucursal**: el mismo producto puede costar distinto en cada sede. Los que no tengan precio propio en esa sucursal usan el precio general, así que no hace falta cargar todo dos veces — solo lo que cambia.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=branchPricingEnabled',
          label: 'Activar precios por sucursal',
        },
        {
          type: 'texto',
          text: '**Catálogo por sucursal**: puedes ocultar productos en los locales donde no se venden, con la acción masiva **Asignar sucursales**.',
        },
        {
          type: 'ojo',
          text: 'Ocultar un producto **no mueve ni borra su stock**: solo deja de mostrarse en esa sede. Si ahí tenía mercadería, sigue estando en el inventario y en los reportes. Esconder no es descontar.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=branchCatalogEnabled',
          label: 'Activar catálogo por sucursal',
        },
      ],
    },

    {
      id: 'farmacia',
      title: 'Datos de farmacia',
      soloModos: ['pharmacy'],
      blocks: [
        {
          type: 'texto',
          text: 'En modo farmacia la ficha del producto suma los campos del rubro: la **Denominación Común Internacional** (el principio activo), la **concentración**, la **presentación**, el **registro sanitario** y el **laboratorio**.',
        },
        {
          type: 'consejo',
          text: 'El **laboratorio** es el que más rinde en el día a día: es lo que distingue dos productos con el mismo nombre y la misma concentración. Aparece junto al producto en el buscador del punto de venta, y también al registrar compras y cotizaciones.',
        },
        {
          type: 'texto',
          text: 'Los laboratorios se cargan una vez en la página **Laboratorios** y después se eligen de una lista, así no se escriben distinto cada vez.',
        },
        {
          type: 'enlace',
          to: '/app/laboratorios',
          label: 'Administrar mis laboratorios',
        },
        {
          type: 'ojo',
          text: 'Para el control de vencimientos, lo que manda es el **lote** con su fecha, no el producto. Un mismo medicamento tiene lotes que vencen en fechas distintas y el sistema vende primero el que vence antes.',
        },
      ],
    },

    {
      id: 'buscar-organizar',
      title: 'Buscar y organizar',
      blocks: [
        {
          type: 'texto',
          text: 'El buscador acepta **código, nombre o categoría**. Puedes ordenar la lista por nombre, precio, stock, SKU o categoría, y con **Columnas visibles** decides qué datos ver en la tabla, para no marearte con columnas que no usas.',
        },
      ],
    },

    {
      id: 'categorias-marcas',
      title: 'Categorías y marcas',
      blocks: [
        {
          type: 'texto',
          text: 'Se administran desde el menú **Opciones**, con **Gestionar Categorías** y **Gestionar Marcas**. Son las dos formas de ordenar el catálogo, y conviene definirlas temprano: reacomodar 500 productos después cuesta bastante más que pensarlo al principio.',
        },
        {
          type: 'texto',
          text: 'Las categorías admiten **subcategorías**: puedes tener "Bebidas" y dentro "Gaseosas", "Aguas", "Cervezas". Al tocar una categoría raíz en los filtros, la lista se filtra y se despliega su rama.',
        },
        {
          type: 'consejo',
          text: 'No hagas categorías demasiado finas. Si terminas con 40 categorías de 3 productos cada una, buscar se vuelve más lento que sin categorías. Una regla que funciona: que cada una agrupe algo que alguna vez quieras mirar junto en un reporte.',
        },
        {
          type: 'texto',
          text: 'Al **eliminar** hay reglas que evitan dejar productos huérfanos, y son las que más sorprenden:',
        },
        {
          type: 'pasos',
          items: [
            'Una **categoría raíz con productos** no se puede eliminar: primero hay que moverlos a otra.',
            'Una categoría **con subcategorías** tampoco: primero se eliminan las subcategorías.',
            'Al eliminar una **subcategoría con productos**, esos productos **suben solos a la categoría padre**. No se quedan sin categoría.',
            'Una **marca con productos vinculados** no se puede eliminar: hay que reasignarlos antes.',
          ],
        },
        {
          type: 'consejo',
          text: 'Para reasignar en lote no hace falta entrar producto por producto: selecciona los que quieras en la lista y usa **Cambiar categoría** de las acciones masivas.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Creé un producto y no aparece en el POS, ¿por qué?',
      a: 'Tres causas habituales: está desactivado, está oculto para la sucursal en la que estás parado, o tu negocio tiene activada la opción de ocultar productos sin stock y ese está en cero.',
    },
    {
      q: '¿Cuál es la diferencia entre desactivar y eliminar?',
      a: 'Desactivar lo saca del POS pero conserva el producto y su historial de ventas. Eliminar lo borra del catálogo. Si el producto ya se vendió alguna vez, desactívalo.',
    },
    {
      q: 'Cambié el precio, ¿afecta a las ventas ya emitidas?',
      a: 'No. Cada comprobante guarda el precio con el que se vendió. El precio nuevo aplica solo a las ventas siguientes.',
    },
    {
      q: 'Vendo por peso, ¿cómo cobro 1.5 kg?',
      a: 'Activa **Permitir decimales** en ese producto (individualmente o en lote desde las acciones masivas) y podrás poner cantidades con decimales en el carrito.',
    },
    {
      q: '¿Por qué mi reporte de utilidad sale en cero?',
      a: 'Porque los productos no tienen **costo** cargado. La utilidad es precio menos costo: sin costo, el sistema no puede calcularla.',
    },
  ],
}
