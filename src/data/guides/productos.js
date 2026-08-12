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
      id: 'precios',
      title: 'Precios y niveles de precio',
      blocks: [
        {
          type: 'texto',
          text: 'Cada producto tiene su precio de venta. Si tu negocio maneja **niveles de precio** (público, mayorista, VIP), puedes cargarle un precio distinto para cada nivel y elegirlo al vender.',
        },
        {
          type: 'texto',
          text: 'También defines la **afectación IGV** del producto: Gravado, Exonerado, Inafecto o Gratuito. Eso determina cómo se calcula el impuesto en el comprobante, así que conviene revisarlo con tu contador si tienes dudas.',
        },
        {
          type: 'texto',
          text: 'Para cambiar precios de muchos productos a la vez está **Actualizar precios**, en el menú **Opciones** de la cabecera: puedes subir o bajar por porcentaje, o editar en lote.',
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
      id: 'etiquetas',
      title: 'Imprimir etiquetas de código de barras',
      blocks: [
        {
          type: 'texto',
          text: 'Selecciona los productos y usa **Etiquetas**. Eliges el tamaño de etiqueta y cuántas por producto; el sistema arma la hoja lista para imprimir. Con productos que tienen variantes, se imprime una etiqueta por variante.',
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
          type: 'ojo',
          text: 'Cuando pegues nombres desde Excel, ojo con los espacios y saltos de línea invisibles que se copian junto al texto: desordenan la lista alfabética. El sistema los limpia al guardar, pero si ves productos ordenados raro, casi siempre es eso.',
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
        {
          type: 'texto',
          text: 'Las **Categorías** y **Marcas** también se administran desde el menú **Opciones**.',
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
