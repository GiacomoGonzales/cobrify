/**
 * GUÍA DE USO: Configuración
 *
 * Auditada contra src/pages/Settings.jsx (12.850 líneas) el 16/08/2026:
 * 11 pestañas, 65 interruptores y 37 anclas de enlace profundo. Los títulos
 * de las opciones están copiados TAL CUAL de la pantalla — si alguien renombra
 * una opción, hay que renombrarla acá.
 *
 * Los enlaces usan /app/configuracion?tab=<pestaña>&opcion=<flag>, que abre la
 * pestaña, hace scroll hasta la opción y la resalta. Solo se enlazan opciones
 * con ancla verificada: un enlace a un ancla inexistente deja al usuario
 * mirando el inicio de la pestaña sin entender por qué.
 *
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'configuracion',
  actualizado: '22/08/2026',
  intro:
    'Configuración es donde el sistema se adapta a tu negocio: qué comprobantes emites, qué puede tocar tu cajero, qué aparece en el menú y cómo salen tus impresiones. Esta guía recorre las once pestañas y explica qué hace cada opción y qué cambia cuando la prendes.',

  sections: [
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'como-funciona',
      title: 'Antes de tocar nada',
      blocks: [
        {
          type: 'texto',
          text: 'Tres cosas que conviene tener claras y evitan la mayoría de los sustos:',
        },
        {
          type: 'pasos',
          items: [
            'La configuración es **del negocio, no tuya**. Lo que cambies lo ven todos los que usan el sistema. Las únicas excepciones son las cosas que dependen del equipo: la impresora térmica y el tamaño de etiqueta se guardan en cada dispositivo.',
            'Cada pestaña tiene **su propio botón de guardar**. Si cambias algo en Ventas y te vas a Documentos sin guardar, se pierde.',
            'Casi todas las opciones **explican en su descripción qué pasa si la activas y qué pasa si no**, con un ✓ y una ✗. Léela antes de cambiarla: es la documentación más corta y más exacta que hay.',
          ],
        },
        {
          type: 'consejo',
          text: 'Si llegaste acá desde el botón de ayuda de otra página, el enlace te deja parado sobre la opción exacta que buscabas y te la resalta unos segundos.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'mapa',
      title: 'Qué hay en cada pestaña',
      blocks: [
        {
          type: 'tabla',
          encabezados: ['Pestaña', 'Qué vive ahí'],
          filas: [
            ['Mi Empresa', 'RUC, razón social, nombre comercial, dirección, logo y establecimientos SUNAT'],
            ['Preferencias', 'Qué módulos aparecen en el menú, y ajustes de productos e IGV'],
            ['Ventas', 'La pestaña más grande: casi todo lo que cambia el Punto de Venta'],
            ['Documentos', 'Cómo salen los PDF y los tickets, envío a SUNAT y privacidad de datos'],
            ['Series', 'La serie y numeración de cada tipo de comprobante, por almacén'],
            ['Impresora', 'La ticketera térmica y qué impresora imprime qué'],
            ['Seguridad', 'Correo y contraseña de la cuenta'],
            ['Notificaciones', 'Qué avisos quieres recibir'],
            ['Tienda Online', 'Solo si tienes la integración activada'],
            ['Rappi', 'Solo si tienes la integración activada'],
            ['Limpieza', 'Borrado masivo de datos. Solo para cuentas habilitadas'],
          ],
        },
        {
          type: 'ojo',
          text: 'Las tres últimas no le aparecen a todo el mundo: **Tienda Online** y **Rappi** solo si la integración está habilitada en tu cuenta, y **Limpieza** solo si tienes el permiso de borrado masivo. Si no las ves, es normal.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'empresa',
      title: 'Mi Empresa: los datos que SUNAT lee',
      blocks: [
        {
          type: 'texto',
          text: 'Acá cargas **RUC**, **Razón Social**, **Nombre Comercial**, **Dirección**, **Urbanización**, **Distrito**, **Provincia**, **Departamento**, **Teléfono**, **Correo Electrónico**, **Sitio Web**, **Redes Sociales** y un **Eslogan**. También subes el **logo** que sale en los PDF y en los tickets.',
        },
        {
          type: 'ojo',
          text: 'El **ubigeo** (la combinación distrito + provincia + departamento) es lo que SUNAT valida de verdad, no el texto de la calle. Un ubigeo que no existe hace que SUNAT rechace el comprobante con el código 3368. Elige el distrito de la lista; no lo escribas a mano.',
        },
        {
          type: 'texto',
          text: 'La diferencia entre los dos nombres importa: la **Razón Social** es tu nombre legal ante SUNAT y va en los comprobantes; el **Nombre Comercial** es como te conocen tus clientes, y es el que el sistema usa primero para mostrarte en pantallas, tickets y en la tarjeta de fidelización. Si dejas el comercial vacío, en todos lados aparece la razón social.',
        },
        {
          type: 'texto',
          text: 'Si tienes locales anexos declarados ante SUNAT, cárgalos en **Establecimientos (SUNAT)**. Y si eres transportista, acá va el **N° Registro MTC**, que viaja en las guías de remisión.',
        },
        {
          type: 'consejo',
          text: 'Estos datos viajan dentro del XML de cada comprobante. Revísalos con calma una vez al empezar y no los toques salvo que cambien de verdad: corregirlos después obliga a anular y reemitir lo ya emitido.',
        },
        { type: 'enlace', to: '/app/configuracion?tab=informacion', label: 'Ir a Mi Empresa' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'modulos',
      title: 'Preferencias: apagar lo que no usas',
      blocks: [
        {
          type: 'texto',
          text: 'La mitad de Preferencias es una lista de **módulos** que puedes prender y apagar. Lo que apagues desaparece del menú lateral para todos. Son unos treinta, agrupados por tema:',
        },
        {
          type: 'tabla',
          encabezados: ['Grupo', 'Módulos'],
          filas: [
            ['Ventas', 'Mi Catálogo Online, Pedidos Online, Control de Caja, Cotizaciones, Vendedores, Promociones'],
            ['Inventario', 'Inventario, Almacenes, Movimientos'],
            ['Compras', 'Proveedores, Compras, Historial de Compras, Órdenes de Compra, Requerimientos'],
            ['Producción', 'Insumos, Composición, Producción'],
            ['Despacho', 'GRE Remitente, GRE Transportista, Envíos'],
            ['Finanzas', 'Reportes, Gastos, Flujo de Caja, Contabilidad, Préstamos'],
            ['Otros', 'Control de Alumnos, Certificados, Personal, Libro de Reclamos'],
          ],
        },
        {
          type: 'consejo',
          text: 'Apagar lo que no usas es la forma más rápida de que tu equipo deje de perderse. Un menú de seis opciones se aprende en un día; uno de veinticinco no se aprende nunca. Siempre puedes volver a prenderlo.',
        },
        {
          type: 'ojo',
          text: 'Apagar un módulo **oculta la pantalla, no borra los datos**. Si apagas Almacenes, tus almacenes y su stock siguen ahí intactos; simplemente dejas de ver la pantalla. Al volver a prenderlo está todo como lo dejaste.',
        },
        { type: 'enlace', to: '/app/configuracion?tab=preferencias', label: 'Ir a Preferencias' },
      ],
    },

    {
      id: 'preferencias-opciones',
      title: 'Preferencias: productos e IGV',
      blocks: [
        {
          type: 'texto',
          text: 'La otra mitad de Preferencias son cinco ajustes que afectan a cómo trabajas los productos:',
        },
        {
          type: 'tabla',
          encabezados: ['Opción', 'Para qué sirve'],
          filas: [
            ['Habilitar ubicación de productos', 'Le asignas a cada producto un lugar físico (P1-3A-4R = Pasillo 1, Estante 3A, Fila 4). Sale en Productos, Inventario y en el POS. Útil en almacenes grandes'],
            ['Permitir editar stock manualmente', 'Deja ajustar el stock por almacén desde el modal del producto. Cada ajuste queda como movimiento auditable'],
            ['Control de Lotes y Vencimientos', 'Activa lotes, fechas de vencimiento, alertas y selección de lote al vender y al comprar'],
            ['Afectación IGV por defecto', 'Con qué afectación nacen los productos nuevos: gravado, exonerado, inafecto'],
            ['Elegir el IGV en cada venta', 'Deja cambiar la afectación venta por venta. Es el caso de la Ley de Amazonía'],
            ['Pantalla de cliente (segunda pantalla)', 'Muestra el detalle de la compra en un segundo monitor mirando al cliente'],
          ],
        },
        {
          type: 'ojo',
          text: 'Sobre **Permitir editar stock manualmente**: si lo dejas apagado, el stock solo se mueve por ventas, compras, transferencias y movimientos, que es lo que mantiene el historial limpio y cuadrado. Préndelo si de verdad necesitas corregir a mano. Los productos con lotes se siguen tocando desde Control de Lotes, para no romper la trazabilidad.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=preferencias&opcion=enableManualStockEdit',
          label: 'Ir a "Permitir editar stock manualmente"',
        },
        {
          type: 'texto',
          text: 'La **Afectación IGV por defecto** decide con qué nacen los productos que creas, los que importas por Excel y los que entran por compras. Si vendes casi todo exonerado, cámbiala una vez acá y te ahorras corregir producto por producto.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=preferencias&opcion=defaultTaxAffectation',
          label: 'Ir a "Afectación IGV por defecto"',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'ventas-cajero',
      title: 'Ventas: qué puede hacer tu cajero',
      blocks: [
        {
          type: 'texto',
          text: 'Este es el grupo que más conviene pensar, porque define cuánta libertad tiene quien está en la caja. Cada uno es una decisión entre agilidad y control:',
        },
        {
          type: 'tabla',
          encabezados: ['Opción', 'Si la prendes'],
          filas: [
            ['Permitir modificar precio de productos en el POS', 'El cajero puede cambiar el precio al vender. Ágil para negociar, pero se pierde el control del precio de lista'],
            ['Permitir modificar nombre de productos en el POS', 'El cajero puede reescribir el nombre en la venta'],
            ['Permitir agregar productos personalizados en el POS', 'Aparece el botón para vender algo que no está en el catálogo'],
            ['Permitir vender productos sin stock', 'Deja cerrar la venta aunque el stock esté en cero, dejándolo negativo'],
            ['Permitir editar notas de venta', 'Se pueden corregir notas de venta ya emitidas'],
            ['Mostrar todos los productos en el POS', 'Se listan todos de entrada, sin buscar'],
            ['Ocultar productos sin stock', 'Los agotados no aparecen en la grilla'],
          ],
        },
        {
          type: 'ojo',
          text: '**Permitir vender productos sin stock** es el que más caro sale si lo prendes sin pensarlo: el stock queda negativo y todos los reportes de inventario y de costo dejan de cuadrar. Tiene sentido si vendes por encargo; no lo tiene si controlas mercadería.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=allowNegativeStock',
          label: 'Ir a "Permitir vender productos sin stock"',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=allowPriceEdit',
          label: 'Ir a "Permitir modificar precio"',
        },
      ],
    },

    {
      id: 'ventas-ritmo',
      title: 'Ventas: el ritmo de la caja',
      blocks: [
        {
          type: 'texto',
          text: 'Cuatro ajustes chicos que, en un mostrador con cola, se notan mucho:',
        },
        {
          type: 'tabla',
          encabezados: ['Opción', 'Qué hace'],
          filas: [
            ['Imprimir ticket automáticamente al completar venta', 'Cierras la venta y el ticket sale solo, sin un clic extra'],
            ['Reiniciar POS automáticamente después de imprimir', 'La pantalla queda limpia y lista para el siguiente cliente'],
            ['Reiniciar búsqueda al agregar un producto al carrito', 'El cuadro de búsqueda se vacía solo; escribes el siguiente código de una'],
            ['Recordatorio de vuelto en efectivo', 'Antes de imprimir te recuerda cuánto vuelto tienes que dar'],
          ],
        },
        {
          type: 'consejo',
          text: 'Los tres primeros juntos convierten el POS en un flujo de escanear-cobrar-escanear sin tocar nada más. Si tienes cola, prende los tres.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=autoPrintTicket',
          label: 'Ir a "Imprimir ticket automáticamente"',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=showChangeReminder',
          label: 'Ir a "Recordatorio de vuelto"',
        },
      ],
    },

    {
      id: 'ventas-precios',
      title: 'Ventas: precios, sucursales y monedas',
      blocks: [
        {
          type: 'texto',
          text: 'Cuatro funciones grandes que se activan desde acá y cambian cómo cobras:',
        },
        {
          type: 'pasos',
          items: [
            '**Usar varios precios por producto**: cada producto puede tener hasta cuatro precios (por ejemplo público, mayorista, distribuidor) y el cajero elige cuál aplica.',
            '**Precios de venta por sucursal**: el mismo producto cuesta distinto según el local. Útil cuando el alquiler o el flete cambian el costo.',
            '**Catálogo de productos por sucursal**: cada local muestra solo lo que vende. Ojo: esto filtra lo que se ve, nunca descuenta stock distinto.',
            '**Activar soporte multi-divisa**: puedes emitir en dólares. El tipo de cambio queda congelado en cada comprobante, así el reporte de ayer no cambia porque hoy subió el dólar.',
          ],
        },
        {
          type: 'texto',
          text: 'Con multi-divisa activo aparece además **Moneda de reportes y dashboard**, que decide en qué moneda se te muestran los totales.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=multiplePricesEnabled',
          label: 'Ir a "Usar varios precios por producto"',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=branchPricingEnabled',
          label: 'Ir a "Precios por sucursal"',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=multiCurrencyEnabled',
          label: 'Ir a "Multi-divisa"',
        },
      ],
    },

    {
      id: 'ventas-comprobantes',
      title: 'Ventas: qué comprobante emites',
      blocks: [
        {
          type: 'texto',
          text: '**Comprobantes disponibles en el POS** decide qué puede emitir tu cajero: factura, boleta, nota de venta. Si tu negocio no emite facturas, quítala de la lista y le simplificas la vida a quien cobra.',
        },
        {
          type: 'texto',
          text: '**Método de pago por defecto en POS** es con cuál arranca cada venta. Ponlo en el que más uses y el cajero deja de elegirlo cincuenta veces al día.',
        },
        {
          type: 'texto',
          text: 'Para las **notas de venta** hay tres ajustes propios: **Ocultar RUC e IGV**, **Ocultar solo IGV** y **Ocultar datos de la empresa en Notas de Venta (PDF)**. Sirven cuando entregas un comprobante interno y no quieres que parezca un documento tributario.',
        },
        {
          type: 'texto',
          text: 'Y **Vencimiento y cuotas en notas de venta al crédito** activa la fecha de vencimiento y el cronograma de cuotas cuando vendes al crédito.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=enabledDocumentTypes',
          label: 'Ir a "Comprobantes disponibles"',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=hideCompanyDataInNotaVenta',
          label: 'Ir a "Ocultar datos de la empresa"',
        },
      ],
    },

    {
      id: 'ventas-restaurante',
      title: 'Ventas: opciones de restaurante',
      soloModos: ['restaurant'],
      blocks: [
        {
          type: 'texto',
          text: 'Si tu negocio es un restaurante, en Ventas aparecen además las opciones de cocina:',
        },
        {
          type: 'tabla',
          encabezados: ['Opción', 'Qué hace'],
          filas: [
            ['La venta del POS genera la orden en Cocina', 'Cobrar en el POS crea la comanda automáticamente. Es lo que necesita un puesto de patio de comidas'],
            ['Imprimir la comanda automáticamente', 'La comanda sale impresa sin pedirlo'],
            ['Modo Multi-Estación de Cocina', 'Separa las comandas por estación: cocina caliente, barra, parrilla'],
            ['Requerir pago antes de enviar a cocina', 'No se manda a preparar hasta que esté pagado'],
            ['Seguimiento de estado por item individual', 'Cada plato de la mesa avanza por su cuenta, no todo el pedido junto'],
            ['Recargo al Consumo', 'Agrega el recargo al consumo a la cuenta'],
          ],
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=posCreatesKitchenOrder',
          label: 'Ir a "La venta del POS genera la orden en Cocina"',
        },
      ],
    },

    {
      id: 'ventas-caja',
      title: 'Ventas: obligar a abrir caja',
      blocks: [
        {
          type: 'texto',
          text: '**Requerir caja diaria abierta para vender** impide cobrar si nadie abrió la caja del día. Es la forma de garantizar que el cierre cuadre: sin apertura no hay ventas sueltas fuera del arqueo.',
        },
        {
          type: 'consejo',
          text: 'Si te pasa seguido que el cierre no cuadra porque alguien vendió antes de abrir, este interruptor lo resuelve de raíz.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=requireOpenCashRegister',
          label: 'Ir a "Requerir caja diaria abierta"',
        },
        { type: 'enlace', to: '/app/caja', label: 'Ir a Caja' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'documentos-aspecto',
      title: 'Documentos: cómo salen tus PDF y tickets',
      blocks: [
        {
          type: 'texto',
          text: 'Casi todo lo de esta pestaña es apariencia. Puedes decidir por separado qué muestran las **cotizaciones** y qué muestran los **comprobantes**:',
        },
        {
          type: 'tabla',
          encabezados: ['Opción', 'Efecto'],
          filas: [
            ['Espaciado amplio en PDF', 'Más aire entre líneas; se lee mejor, ocupa más'],
            ['PDF en formato A5', 'Media hoja en vez de A4'],
            ['Mostrar códigos de producto', 'El código junto a cada ítem (por separado en cotizaciones y comprobantes)'],
            ['Mostrar descripción del producto', 'La descripción larga bajo el nombre'],
            ['Habilitar imágenes', 'La foto del producto en el documento'],
            ['Mostrar la marca en comprobantes', 'Agrega una columna MARCA al PDF. Útil cuando la marca identifica al producto (municiones, repuestos, herramientas). El espacio sale de DESCRIPCIÓN'],
            ['Ocultar lote y vencimiento en comprobantes', 'Quita esa columna de la impresión'],
            ['Imprimir también en el ticket térmico', 'Los términos y condiciones salen también en el ticket, no solo en el PDF'],
            ['Imprimir código QR al pie del ticket', 'Agrega el QR al final del ticket'],
          ],
        },
        {
          type: 'texto',
          text: 'Acá también escribes las **Observaciones por defecto en Órdenes de Compra**: el texto que ya aparece escrito al crear una orden nueva, con tus condiciones y horarios de atención al proveedor.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=purchaseOrderDefaultNotes',
          label: 'Ir a "Observaciones por defecto en OC"',
        },
      ],
    },

    {
      id: 'documentos-sunat',
      title: 'Documentos: SUNAT y tipos de documento',
      blocks: [
        {
          type: 'texto',
          text: 'Cuatro decisiones de fondo:',
        },
        {
          type: 'pasos',
          items: [
            '**Envío automático a SUNAT desde el POS**: cada comprobante se manda apenas se emite. Si lo apagas, se acumulan y los envías tú desde Ventas.',
            '**Permitir eliminar comprobantes**: habilita borrar comprobantes. Piénsalo dos veces; lo correcto ante SUNAT casi siempre es una nota de crédito o una comunicación de baja, no borrar.',
            '**Habilitar Guías de Remisión Electrónicas**: activa el módulo de GRE para trasladar mercadería.',
            '**Habilitar Nota de Salida (Almacén)**: un documento interno de salida de almacén, sin valor tributario.',
          ],
        },
        {
          type: 'ojo',
          text: 'Deja **Envío automático a SUNAT** prendido salvo que tengas una razón concreta. Con el envío manual es fácil que pasen días con comprobantes emitidos y no declarados, y ahí ya hay multa de por medio.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=autoSendToSunat',
          label: 'Ir a "Envío automático a SUNAT"',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=dispatchGuidesEnabled',
          label: 'Ir a "Guías de Remisión"',
        },
      ],
    },

    {
      id: 'documentos-privacidad',
      title: 'Documentos: qué ven tus sub-usuarios',
      blocks: [
        {
          type: 'texto',
          text: 'Tres interruptores para cuando no quieres que tu personal vea los números del negocio:',
        },
        {
          type: 'pasos',
          items: [
            '**Ocultar totales y datos sensibles a usuarios secundarios**: los sub-usuarios dejan de ver las cifras del Dashboard y los totales del negocio.',
            '**Cada usuario secundario ve solo las ventas que él registró**: en Ventas, Reportes y Dashboard cada uno ve únicamente sus propios comprobantes. Apagado, cada sub-usuario ve las ventas de todas las sucursales que le asignaste.',
            '**Ocultar "Efectivo Esperado" del cierre de caja a sub-usuarios**: el cajero cuenta lo que hay y lo ingresa, sin ver cuánto *debería* haber ni la diferencia. Tú como dueño sí lo ves.',
          ],
        },
        {
          type: 'ojo',
          text: 'El segundo se apoya en quién emitió cada comprobante, un dato que se guarda al momento de la venta. Los comprobantes viejos que no lo tengan quedan ocultos para los sub-usuarios: ante la duda de quién los hizo, el sistema prefiere no atribuirlos. Tú y los administradores los siguen viendo.',
        },
        {
          type: 'consejo',
          text: 'El segundo es el llamado "cierre a ciegas", y es la práctica estándar en retail: si el cajero ve el monto esperado antes de contar, el arqueo deja de servir para detectar faltantes.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=hideCashExpectedFromCashier',
          label: 'Ir a "Cierre de caja a ciegas"',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=hideDashboardDataFromSecondary',
          label: 'Ir a "Ocultar totales a secundarios"',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=showOnlyOwnSalesToSecondary',
          label: 'Ir a "Cada usuario ve solo sus ventas"',
        },
        { type: 'enlace', to: '/app/usuarios', label: 'Ir a Usuarios' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'series',
      title: 'Series y numeración',
      blocks: [
        {
          type: 'texto',
          text: 'Acá defines la serie de cada tipo de comprobante (B001 para boletas, F001 para facturas, y así) y desde qué número sigue la numeración. Las series se manejan **por almacén**, así que si tienes varios locales cada uno puede llevar la suya.',
        },
        {
          type: 'ojo',
          text: 'No retrocedas el número de una serie que ya emitió. La numeración es correlativa y SUNAT la controla: si vuelves atrás, generas correlativos duplicados y SUNAT los rechaza. Si dos locales emiten con el mismo RUC, dales series distintas — es exactamente para eso que existen.',
        },
        {
          type: 'consejo',
          text: 'Configura las series una vez al inicio, antes de emitir el primer comprobante. Es de las pocas cosas del sistema que es incómodo cambiar después.',
        },
        { type: 'enlace', to: '/app/configuracion?tab=series', label: 'Ir a Series' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'impresora',
      title: 'Impresora térmica',
      blocks: [
        {
          type: 'texto',
          text: 'Acá emparejas la ticketera y eliges el **ancho de papel** (58 u 80 mm). Hay cinco ajustes de ahorro y legibilidad:',
        },
        {
          type: 'tabla',
          encabezados: ['Opción', 'Cuándo usarla'],
          filas: [
            ['Impresión Compacta (Ahorro de papel)', 'Aprieta el ticket. Ahorra rollo'],
            ['Comandas Ultracompactas', 'Máximo ahorro, para cocinas que imprimen todo el día'],
            ['Imprimir en hoja A4', 'Si imprimes en tinta o láser en vez de térmica'],
            ['Mostrar unidad de medida en el ticket', 'Agrega la unidad junto a la cantidad'],
            ['Impresión simple (sin fondos negros)', 'Quita los fondos oscuros. Úsala si tu impresora los saca borrosos o gasta mucho'],
            ['Ajustar la hoja al largo del ticket', 'Viene activada. El sistema le pide al navegador una hoja del largo exacto del comprobante'],
          ],
        },
        {
          type: 'ojo',
          text: '**Cuándo apagar "Ajustar la hoja al largo del ticket":** si tu impresora ya tiene su propio tamaño de papel elegido en la ventana de imprimir —por ejemplo un rollo continuo tipo *72 × 3276 mm*— y el ticket te sale **chiquito y centrado** en el papel. Eso pasa cuando los dos tamaños no coinciden: el navegador achica el comprobante para que entre. Apagándola manda el papel que elegiste tú.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=impresora&opcion=ajustarHojaAlTicket',
          label: 'Ajustar la hoja al largo del ticket',
        },
        {
          type: 'ojo',
          text: 'La impresora se guarda **por dispositivo**, no en la cuenta. Cada equipo (la PC de caja, la tablet del mozo, el celular) elige la suya. Configurarla en uno no la configura en los demás.',
        },
        {
          type: 'texto',
          text: 'El bloque **¿Qué impresora imprime qué?** te muestra el reparto: cuál es la principal de esta pantalla y cuál la de caja, para que sepas dónde va a salir cada cosa antes de imprimir.',
        },
        { type: 'enlace', to: '/app/configuracion?tab=impresora', label: 'Ir a Impresora' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'seguridad-notificaciones',
      title: 'Seguridad, notificaciones y limpieza',
      blocks: [
        {
          type: 'texto',
          text: 'En **Seguridad** cambias el correo y la contraseña de la cuenta. En **Notificaciones** eliges qué avisos quieres recibir; hoy son seis: **Nueva Venta**, **Pago Yape**, **Stock Bajo**, **Producto Sin Stock**, **Nuevo Pedido** e **Items Agregados a Pedido**.',
        },
        {
          type: 'consejo',
          text: '**Stock Bajo** y **Producto Sin Stock** son los que más rinden si manejas mercadería: te enteras de que algo se está acabando mientras todavía puedes reponerlo.',
        },
        {
          type: 'ojo',
          text: 'La pestaña **Limpieza** borra datos de forma masiva y **no hay deshacer**. Solo aparece en cuentas con ese permiso. No la abras por curiosidad: úsala nada más cuando estés seguro de que quieres vaciar algo, y confirma antes qué se lleva por delante.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'no-esta-aqui',
      title: 'Cosas que se configuran en OTRA pantalla',
      blocks: [
        {
          type: 'texto',
          text: 'No todo lo configurable vive acá, y buscarlo en Configuración es la causa número uno de "no lo encuentro":',
        },
        {
          type: 'tabla',
          encabezados: ['Qué buscas', 'Dónde está de verdad'],
          filas: [
            ['Programa de fidelización y diseño de la tarjeta', 'Clientes → Fidelización'],
            ['Combos, cupones y descuentos programados', 'Promociones'],
            ['Permisos de cada sub-usuario y acceso por sucursal', 'Usuarios'],
            ['Métodos de pago que se aceptan', 'Configuración → Ventas, en la sección de métodos de pago'],
            ['Comisiones de vendedores', 'Vendedores'],
            ['Tu suscripción y datos de pago', 'Mi Suscripción'],
          ],
        },
        { type: 'enlace', to: '/app/clientes', label: 'Ir a Clientes (Fidelización)' },
        { type: 'enlace', to: '/app/promociones', label: 'Ir a Promociones' },
        { type: 'enlace', to: '/app/usuarios', label: 'Ir a Usuarios' },
      ],
    },
  ],

  preguntas: [
    {
      q: 'El ticket me sale chiquito y centrado en el papel.',
      a: 'Tu impresora tiene un tamaño de papel propio elegido en la ventana de imprimir y no coincide con el que pide el sistema, así que el navegador achica el comprobante para que entre. Apaga **Ajustar la hoja al largo del ticket** en Configuración → Impresora y volverá a mandar el papel que elegiste tú.',
    },
    {
      q: 'Cambié una opción y no veo el efecto.',
      a: 'Primero, revisa que guardaste: cada pestaña tiene su propio botón de guardar. Después recarga la página. Y si la opción afecta al POS y lo tienes abierto en otra pestaña, en otra PC o en la app, ese también tiene que recargar — cada dispositivo lee la configuración al cargar.',
    },
    {
      q: '¿Los cambios afectan a todos los usuarios del negocio?',
      a: 'Sí. La configuración es del negocio, no de cada persona. Las únicas excepciones son las cosas que dependen del equipo: la impresora térmica y el tamaño de etiqueta se guardan en cada dispositivo.',
    },
    {
      q: 'No encuentro una opción que me mencionaron.',
      a: 'Empieza por **Ventas** si tiene que ver con cobrar, **Documentos** si tiene que ver con comprobantes, PDF o privacidad, y **Preferencias** si tiene que ver con qué se ve en el menú. Si aun así no aparece, mira la sección "Cosas que se configuran en otra pantalla" de esta guía: fidelización, promociones y permisos ya no viven acá.',
    },
    {
      q: 'Apagué un módulo por error. ¿Perdí los datos?',
      a: 'No. Apagar un módulo solo lo oculta del menú; los datos quedan intactos. Vuelve a prenderlo en Preferencias y está todo como lo dejaste.',
    },
    {
      q: '¿Puedo dejar que un sub-usuario entre a Configuración?',
      a: 'Se maneja con permisos desde Usuarios. Piénsalo dos veces: desde acá se cambian series, comprobantes, precios y privacidad de datos. Si solo necesita una cosa puntual, suele ser mejor que te la pida.',
    },
    {
      q: 'Me faltan pestañas que veo en las capturas.',
      a: 'Tienda Online y Rappi solo aparecen si esas integraciones están habilitadas en tu cuenta, y Limpieza solo si tienes el permiso de borrado masivo. Que no las veas es lo normal.',
    },
  ],
}
