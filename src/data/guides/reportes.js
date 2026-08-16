/**
 * GUÍA DE USO: Reportes
 *
 * Auditada contra src/pages/Reports.jsx (6.866 líneas) el 16/08/2026:
 * 10 reportes (`selectedReport`), sus bloques verificados uno por uno, los
 * seis rangos de fecha y los ocho botones de descarga.
 *
 * La versión anterior ubicaba mal dos bloques —"Distribución de Comprobantes"
 * vive en Resumen General, no en Ventas; "Top 5 Productos" y "Top 5 Categorías"
 * viven en Productos, no en Resumen General— y no mencionaba Zonas, Hotel,
 * "Estados de Pago" ni "Tipos de Pedido". Si vuelves a tocar esta guía,
 * verifica los títulos contra los bloques `{selectedReport === 'x' && (`.
 *
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'reportes',
  actualizado: '16/08/2026',
  intro:
    'Reportes responde las preguntas que no se ven en el día a día: qué se vende de verdad, quién compra, cuánto ganas y en qué se te va el dinero. Son diez reportes distintos, todos calculados sobre tus ventas y gastos ya registrados.',

  sections: [
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'periodo',
      title: 'Lo primero: el período y el alcance',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba eliges el rango con seis botones: **Hoy**, **Semana**, **Este mes**, **Trimestre**, **Este año** y **Todo**. Al lado hay un selector para ir directo a **un mes concreto** sin tener que acordarte de en qué día termina, y si necesitas un rango exacto, las dos casillas de fecha te lo dejan armar.',
        },
        {
          type: 'ojo',
          text: 'Todo lo que veas abajo corresponde a ese período. Si un número te sorprende, revisa el rango antes que nada: la mayoría de los "esto está mal" son en realidad un filtro puesto.',
        },
        {
          type: 'texto',
          text: 'El **selector de sucursal del encabezado** también filtra los reportes. Y si eres un sub-usuario con alcance limitado, verás solo las ventas que te corresponden, no las de todo el negocio.',
        },
        {
          type: 'consejo',
          text: 'Un total que "no cuadra" con lo que esperabas casi siempre es una de tres: el período, la sucursal filtrada, o que estás comparando contra un número que incluye anulados.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'mapa',
      title: 'Los diez reportes',
      blocks: [
        {
          type: 'tabla',
          encabezados: ['Reporte', 'Qué responde'],
          filas: [
            ['Resumen General', '¿Cómo viene el negocio? Tendencia, tipos de comprobante y cobranza'],
            ['Ventas', '¿Cuándo y cómo me compran? Horas, días, métodos de pago'],
            ['Productos', '¿Qué se vende? Top productos, categorías, evolución'],
            ['Marcas', '¿Qué marca se mueve? Con detalle por variante al entrar en una'],
            ['Clientes', '¿Quién me compra? Top 10 por ingresos'],
            ['Zonas', '¿De dónde vienen? Por distrito y mapa por departamento'],
            ['Vendedores', '¿Quién vende más? Ingresos y detalle por vendedor'],
            ['Gastos', '¿En qué se me va? Por categoría y tendencia'],
            ['Rentabilidad', '¿Cuánto gano de verdad? Costo, utilidad y margen'],
            ['Hotel', 'Reservas, habitaciones e ingresos (solo en modo Hotelería)'],
          ],
        },
        {
          type: 'consejo',
          text: 'Si vas con una pregunta concreta, entra directo al reporte que la responde. El Resumen General es para mirar cómo viene el mes, no para investigar.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'resumen-general',
      title: 'Resumen General',
      blocks: [
        {
          type: 'texto',
          text: 'La foto del período en cuatro bloques: la **Tendencia de Ventas**, la **Distribución de Comprobantes** (cuánto emites de cada tipo), los **Estados de Pago** y los **Tipos de Pedido**.',
        },
        {
          type: 'texto',
          text: '**Estados de Pago** es el que más se pasa por alto y el que más rápido te avisa de un problema: te dice cuánto de lo que vendiste está cobrado y cuánto sigue pendiente. Vender mucho a crédito y no cobrarlo se ve acá antes que en la cuenta bancaria.',
        },
        { type: 'enlace', to: '/app/clientes', label: 'Ver quién te debe (Clientes)' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'ventas',
      title: 'Ventas: cuándo y cómo te compran',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba, cinco cifras del período: **Total Ventas**, **Costo Total**, **Utilidad Total**, y cuánto está **Pagadas** y cuánto **Pendientes**.',
        },
        {
          type: 'texto',
          text: 'Debajo, el comportamiento en el tiempo: **Cuándo se vende**, **Ventas por Hora del Día** y **Qué días del mes se vende más**. Es la información con la que se arman los turnos del personal y se eligen los días de promoción.',
        },
        {
          type: 'texto',
          text: 'Y el dinero: **Resumen por Método de Pago** y su **Distribución**, que te dicen cuánto de tu venta es efectivo y cuánto digital. Cierra con **Últimas Ventas**, el detalle de las más recientes.',
        },
        {
          type: 'consejo',
          text: 'Si el efectivo es una porción grande, el arqueo de caja deja de ser un trámite y pasa a ser tu control principal. Ahí conviene el cierre a ciegas.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=hideCashExpectedFromCashier',
          label: 'Activar cierre de caja a ciegas',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'productos-marcas',
      title: 'Productos y Marcas',
      blocks: [
        {
          type: 'texto',
          text: '**Productos** te da el **Top 5 Productos**, el **Top 5 Categorías**, la **Evolución de ventas**, el desglose de **Ventas por Categoría** y **por Marca**, y la lista completa de **Todos los Productos Vendidos** en el período.',
        },
        {
          type: 'texto',
          text: '**Marcas** arranca con el **Top 10 marcas por ingresos** y la **Distribución de ventas por marca**. Al hacer clic en una marca entras a su detalle: los **Top 5 productos de esa marca** y todos sus productos, con el desglose por **variante** — qué tallas o colores se están vendiendo de verdad.',
        },
        {
          type: 'consejo',
          text: 'Lo más vendido en unidades no siempre es lo que más te deja. Un producto que vendes cien veces con un sol de margen te deja menos que uno que vendes diez veces con quince. Cruza siempre esta pestaña con **Rentabilidad** antes de decidir qué reponer.',
        },
        { type: 'enlace', to: '/app/productos', label: 'Ir a Productos' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'clientes-zonas',
      title: 'Clientes y Zonas',
      blocks: [
        {
          type: 'texto',
          text: '**Clientes** te da el **Top 10 Clientes por Ingresos** y el detalle de cuánto ha comprado cada uno. Es la base para decidir a quién conviene cuidar con un descuento o con el programa de sellos.',
        },
        {
          type: 'texto',
          text: '**Zonas** agrupa tus ventas geográficamente: el **Top 10 Zonas por Ingresos**, el detalle por zona y un **Mapa de Ventas por Departamento**. Sirve para decidir dónde hacer delivery, dónde repartir volantes o dónde abrir el siguiente local.',
        },
        {
          type: 'ojo',
          text: 'Zonas se calcula con la dirección de tus clientes. Si no cargas el distrito al registrarlos, las ventas caen en "sin zona" y el reporte no te dice nada.',
        },
        { type: 'enlace', to: '/app/clientes', label: 'Ir a Clientes' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'vendedores',
      title: 'Vendedores',
      blocks: [
        {
          type: 'texto',
          text: 'Cuatro cifras arriba —**Total Vendedores**, **Top Vendedor**, **Ventas Top Vendedor** e **Ingresos Top Vendedor**— y debajo los **Ingresos por Vendedor** con el detalle de cada uno.',
        },
        {
          type: 'ojo',
          text: 'Para que este reporte sirva, hay que elegir el vendedor al cobrar en el POS. Si ves casi todo agrupado en "sin vendedor asignado", ese es el motivo, y no hay forma de repartirlo después.',
        },
        { type: 'enlace', to: '/app/vendedores', label: 'Ir a Vendedores' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'gastos',
      title: 'Gastos',
      blocks: [
        {
          type: 'texto',
          text: '**Total Gastos**, **Promedio por Gasto**, y cuánto se va en **Servicios** y en **Proveedores**. Debajo, la **Tendencia de Gastos**, la **Distribución por Categoría**, el **Resumen por Categoría** y los **Últimos Gastos Registrados**.',
        },
        {
          type: 'consejo',
          text: 'Este reporte solo vale lo que vale tu registro de gastos. Si anotas únicamente las facturas grandes, la utilidad neta que veas en Rentabilidad será optimista y tomarás decisiones con un número inflado.',
        },
        { type: 'enlace', to: '/app/gastos', label: 'Ir a Gastos' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'rentabilidad',
      title: 'Rentabilidad: lo que de verdad ganas',
      blocks: [
        {
          type: 'texto',
          text: 'Es el reporte más importante y el que casi nadie mira. Arriba tiene seis cifras encadenadas, y vale la pena entender el orden porque cada una responde algo distinto:',
        },
        {
          type: 'tabla',
          encabezados: ['Cifra', 'Qué es'],
          filas: [
            ['Total Ventas', 'Todo lo que facturaste en el período'],
            ['Costo de Ventas', 'Lo que te costó la mercadería que vendiste'],
            ['Utilidad Bruta', 'Ventas menos costo. Lo que deja el producto en sí'],
            ['Total Gastos', 'Alquiler, sueldos, servicios: todo lo que registraste'],
            ['Utilidad Operativa', 'Utilidad Bruta menos Gastos. Lo que de verdad queda'],
            ['Margen Operativo', 'Esa utilidad como porcentaje de la venta'],
          ],
        },
        {
          type: 'texto',
          text: 'Debajo están **Ingresos vs Gastos**, la **Evolución de la Utilidad Neta**, la **Distribución del Ingreso** (a dónde se va cada sol que entra) y el **Detalle por Período**.',
        },
        {
          type: 'ojo',
          text: 'Este reporte depende de dos cosas que dependen de ti: que tus productos tengan **costo** cargado y que **registres tus gastos**. Sin costo, la Utilidad Bruta sale inflada; sin gastos, la Operativa también. Un margen del 70% casi siempre significa que falta cargar costos, no que el negocio sea buenísimo.',
        },
        {
          type: 'texto',
          text: 'Las compras marcadas como **activo o equipamiento** (mobiliario, equipos, una congeladora) no entran al Costo de Ventas: se muestran aparte como línea informativa. Comprar un horno no tiene por qué hacer que el margen del mes se vea pésimo.',
        },
        {
          type: 'consejo',
          text: 'Vender más no siempre es ganar más. Si tus ventas suben y el margen operativo baja, hay algo pasando con los precios o con los costos, y este es el único lugar donde se ve a tiempo.',
        },
        { type: 'enlace', to: '/app/productos', label: 'Cargar costos en Productos' },
        { type: 'enlace', to: '/app/gastos', label: 'Registrar gastos' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'de-donde-sale-el-costo',
      title: 'De dónde sale el costo de cada venta',
      blocks: [
        {
          type: 'texto',
          text: 'Vale la pena saberlo porque explica por qué una venta vieja puede mostrar un margen distinto al que esperabas. El sistema busca el costo en este orden:',
        },
        {
          type: 'pasos',
          items: [
            'El **costo congelado en la venta**: lo que costaba el producto el día que se vendió. Es el más fiable y tiene prioridad sobre todo, porque no se altera si después editas el producto.',
            'Si esa venta es anterior a que existiera ese congelado, se usa el **costo de la receta** actual, para productos compuestos.',
            'Y si tampoco hay receta, el **costo actual del producto** en el catálogo.',
          ],
        },
        {
          type: 'consejo',
          text: 'Por eso conviene cargar bien el costo desde el principio: las ventas nuevas guardan su costo del día y quedan bien para siempre. Corregir el costo hoy no arregla el margen de lo que vendiste el año pasado, pero sí deja bien todo lo que viene.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'hotel',
      title: 'Reportes de Hotel',
      soloModos: ['hotel'],
      blocks: [
        {
          type: 'texto',
          text: 'En modo Hotelería aparece un reporte propio con cinco bloques: **Estado de Reservas**, **Reservas del Período**, **Ingresos por Tipo de Habitación**, **Ingresos por Habitación** y **Estado de Habitaciones**.',
        },
        {
          type: 'texto',
          text: '**Ingresos por Tipo de Habitación** es el que orienta las decisiones de precio: si las simples se llenan siempre y las suites no, el problema puede ser el precio y no la demanda.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'exportar',
      title: 'Descargar los reportes',
      blocks: [
        {
          type: 'texto',
          text: 'Ocho reportes tienen su botón de descarga en Excel: **General**, **Ventas**, **Productos**, **Marcas**, **Clientes**, **Vendedores**, **Gastos** y **Rentabilidad**.',
        },
        { type: 'ui', kind: 'boton', label: 'Descargar Reporte General (Excel)' },
        {
          type: 'ojo',
          text: 'El archivo respeta el **período y la sucursal** que tengas filtrados en pantalla. Si vas a mandárselo a tu contador, verifica los filtros antes de descargar: un Excel dice "ventas" en el título aunque sea de una sola sucursal y de tres días.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'moneda',
      title: 'Si manejas dólares',
      blocks: [
        {
          type: 'texto',
          text: 'Con multi-divisa activo puedes elegir en qué **moneda de reportes** quieres ver los totales. Cada comprobante guarda el tipo de cambio del día en que se emitió, así que un reporte de meses pasados no cambia porque el dólar se haya movido esta semana.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=reportsCurrency',
          label: 'Elegir la moneda de reportes',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Por qué mi utilidad sale en cero o rarísima?',
      a: 'Casi siempre porque los productos no tienen **costo** cargado en su ficha. La utilidad es venta menos costo: sin costo, el sistema asume cero y el margen sale al 100%. Revísalo en Productos, cargando el costo de los que más vendes primero.',
    },
    {
      q: 'Los totales de Reportes no coinciden con los de Ventas.',
      a: 'Compara los tres filtros: **período**, **sucursal** del encabezado y, si eres sub-usuario, tu alcance de ventas. También ten en cuenta que los reportes excluyen comprobantes anulados y las notas de venta ya convertidas a comprobante, para no contar la misma venta dos veces.',
    },
    {
      q: '¿Las ventas anuladas cuentan?',
      a: 'No, una venta anulada sale de los totales. Distinto es una **rechazada por SUNAT**: esa sigue contando como venta hasta que la anules, porque el rechazo es un problema de envío, no de si la venta ocurrió.',
    },
    {
      q: '¿Cuál es la diferencia entre Utilidad Bruta y Operativa?',
      a: 'La **bruta** es lo que queda después de pagar la mercadería que vendiste. La **operativa** es lo que queda después de restar además tus gastos (alquiler, sueldos, servicios). La operativa es la que te dice si el negocio gana dinero; la bruta solo te dice si el producto está bien preciado.',
    },
    {
      q: '¿Puedo ver un mes cerrado del año pasado?',
      a: 'Sí. Usa el selector de mes que está junto a los botones de período, o pon las fechas exactas a mano. El historial completo está disponible.',
    },
    {
      q: 'El reporte de Zonas me sale casi vacío.',
      a: 'Zonas se arma con el distrito de tus clientes. Si registras las ventas sin cliente o sin su dirección, no hay de dónde sacar la zona. Empieza por cargar el distrito de los clientes que más te compran.',
    },
    {
      q: 'No veo el reporte de Hotel.',
      a: 'Solo aparece si tu negocio está en modo Hotelería. Los reportes específicos de un rubro se muestran únicamente en ese rubro.',
    },
  ],
}
