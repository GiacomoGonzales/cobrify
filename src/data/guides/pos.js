/**
 * GUÍA DE USO: Punto de Venta (POS)
 *
 * El formato de bloques está documentado en GuideRenderer.jsx; la metadata
 * (título, categoría, búsqueda) vive en registry.js.
 *
 * Reglas de redacción (valen para todas las guías):
 *  - Español simple, hablarle a un cajero, no a un contador.
 *  - REGLA DE ORO: cada botón, campo o texto mencionado debe existir con ese
 *    nombre EXACTO en la pantalla. Antes de escribir, verificar en el código.
 *    (Los nombres de esta guía salen de POS.jsx y PostSaleModal.jsx.)
 *  - Si una función depende de una opción, la sección lleva `requiereOpcion`
 *    con la ruta a la página donde se activa.
 *  - Cada afirmación tiene que ser cierta HOY. Si una función cambia, su
 *    sección se actualiza en el mismo commit.
 *  - Sin emojis.
 */
export default {
  id: 'pos',
  actualizado: '12/08/2026',
  intro:
    'El Punto de Venta es la pantalla para cobrar en el día a día. A la izquierda están tus productos; a la derecha, el **Carrito de Compras** y los datos de la venta. Esta guía recorre el flujo completo y las dudas más comunes.',

  sections: [
    {
      id: 'cobrar-venta',
      title: 'Cobrar una venta, paso a paso',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Busca el producto en **Buscar producto por nombre o código...** y tócalo para agregarlo al carrito. También puedes escanear su código de barras.',
            'Ajusta las cantidades en el carrito con los botones + y -.',
            'En el panel de la derecha elige el **Tipo de Comprobante**: Factura, Boleta o Nota de Venta.',
            'Completa los **Datos del Cliente** si el comprobante lo necesita (el RUC es obligatorio para factura).',
            'Elige el método de pago y presiona **Procesar Venta**.',
          ],
        },
        {
          type: 'ui',
          kind: 'boton',
          label: 'Procesar Venta',
          nota: 'El botón grande al pie del panel derecho. Al terminar cambia a "Venta Completada".',
        },
        {
          type: 'consejo',
          text: 'Si tu negocio tiene varios almacenes, revisa el selector de **Almacén** antes de cobrar: el stock se descuenta del almacén elegido. También puedes asignar la venta a un **Vendedor** en el selector de al lado.',
        },
      ],
    },

    {
      id: 'buscar-productos',
      title: 'Buscar productos, escáner y vistas',
      blocks: [
        {
          type: 'texto',
          text: 'El buscador encuentra por nombre, código, marca o categoría, sin importar tildes ni mayúsculas. Puedes escribir pedazos de palabras: "pol roj" encuentra "POLO ROJO XL".',
        },
        {
          type: 'texto',
          text: 'Con **pistola lectora** (computadora): dispara al código con el cursor en el buscador y el producto se agrega solo. Desde la **aplicación** (celular o tablet) tienes además un botón para escanear con la cámara, al costado del buscador.',
        },
        {
          type: 'texto',
          text: 'El botón de cuadraditos junto al buscador alterna entre ver los productos en **cuadrícula** (con foto) o en **lista** (más productos por pantalla).',
        },
        {
          type: 'texto',
          text: 'Si el producto tiene **variantes** (tallas, colores), al tocarlo se abre una ventana para elegir cuál. Si tiene **presentaciones** (unidad, caja, docena), eliges la presentación y el precio se ajusta solo.',
        },
        {
          type: 'ojo',
          text: 'Si un producto dice "Sin stock" pero tienes mercadería, casi siempre es una de dos: estás parado en un almacén distinto al que tiene el stock, o la variante elegida es otra. Revisa el selector de **Almacén** y la variante antes de asumir que el inventario está mal.',
        },
      ],
    },

    {
      id: 'producto-personalizado',
      title: 'Producto Personalizado (venta libre)',
      requiereOpcion: {
        flag: 'allowCustomProducts',
        nombre: 'los productos personalizados',
        donde: 'Configuración > Ventas',
        // Enlace profundo: abre la pestaña y resalta la opción exacta
        ruta: '/app/configuracion?tab=ventas&opcion=allowCustomProducts',
        defaultOn: false,
      },
      blocks: [
        {
          type: 'texto',
          text: 'Sirve para cobrar algo que no está en tu catálogo: un servicio puntual, un arreglo, un artículo de paso. No descuenta stock ni queda registrado como producto.',
        },
        {
          type: 'pasos',
          items: [
            'Presiona el botón **Producto Personalizado**, arriba del buscador.',
            'En la ventana **Agregar Producto Personalizado**, escribe la descripción, el precio y la cantidad.',
            'Se agrega al carrito como un producto más y sale igual en el comprobante.',
          ],
        },
        {
          type: 'ui',
          kind: 'boton',
          label: 'Producto Personalizado',
          nota: 'Arriba del buscador de productos. En celular se abrevia a "Personalizado".',
        },
      ],
    },

    {
      id: 'carrito',
      title: 'El carrito: precios, descuentos, limpiar y aparcar',
      blocks: [
        {
          type: 'texto',
          text: 'En el **Carrito de Compras** cada producto permite más que cambiar la cantidad: con el ícono de lápiz editas el **precio** solo para esta venta, puedes aplicar **descuento**, y marcar un producto como **bonificación** (regalo: sale en el comprobante pero no suma al total, como pide SUNAT). El total va siempre visible arriba del carrito.',
        },
        {
          type: 'texto',
          text: 'El botón **Limpiar** (arriba a la derecha del área de productos) vacía el carrito para empezar de cero. Después de completar una venta, ese mismo botón se pone verde y dice **Nueva Venta**.',
        },
        {
          type: 'texto',
          text: '¿Llegó otro cliente y el primero sigue eligiendo? Presiona **Aparcar** (arriba del carrito): la venta queda en pausa y el carrito libre para atender al siguiente. Las ventas aparcadas se recuperan desde el botón **En espera**, que muestra cuántas tienes.',
        },
        {
          type: 'consejo',
          text: 'Si usas niveles de precio (público, mayorista), al agregar el producto se abre una ventana para elegir el nivel. Dos atajos: si el cliente seleccionado tiene un nivel asignado en su ficha, se aplica solo; y si el producto tiene precio automático por cantidad, el sistema baja el precio solo al llegar a la cantidad mínima.',
        },
      ],
    },

    {
      id: 'tipos-comprobante',
      title: 'Boleta, factura o nota de venta: cuál emitir',
      blocks: [
        {
          type: 'texto',
          text: '**Factura**: para clientes con RUC que necesitan sustentar el gasto. Va a SUNAT. **Boleta**: para consumidores finales. También va a SUNAT. **Nota de Venta**: documento interno, no viaja a SUNAT; sirve para ventas simples y luego puede convertirse en boleta o factura desde la página de Ventas.',
        },
        {
          type: 'texto',
          text: 'Para las boletas, SUNAT exige identificar al cliente con su DNI cuando la venta llega a S/ 700 o más.',
        },
        {
          type: 'ojo',
          text: 'Si en tu POS no aparece alguno de los tipos, revisa en Configuración qué comprobantes tiene habilitados tu negocio. Por ejemplo, un negocio del Nuevo RUS no emite facturas. Y si tu cuenta aún no tiene conexión con SUNAT, el sistema solo permite Nota de Venta.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=enabledDocumentTypes',
          label: 'Ver mis comprobantes habilitados',
        },
      ],
    },

    {
      id: 'igv-por-venta',
      title: 'Cobrar o no cobrar IGV en una venta',
      blocks: [
        {
          type: 'texto',
          text: 'Normalmente el IGV lo define cada producto y no hay que pensarlo. Pero hay negocios donde el **mismo producto** va exonerado unas veces y gravado otras: los acogidos a la **Ley 27037 (Amazonía)**, que están exonerados por lo que se consume en la región, pero cuando venden fuera la operación sí lleva IGV.',
        },
        {
          type: 'texto',
          text: 'Si activas la opción, en el POS aparece el selector **IGV de esta venta** debajo del tipo de comprobante, con tres opciones: **Según lo configurado** (lo normal), **Gravado** y **Exonerado**.',
        },
        {
          type: 'ojo',
          text: 'Lo que elijas **manda sobre lo que diga cada producto**. Si eliges Gravado, el comprobante entero sale gravado aunque tengas productos marcados como exonerados; y al revés. No es una mezcla: es el mismo criterio para toda la venta.',
        },
        {
          type: 'ojo',
          text: 'El total **no cambia**. Si el producto está a S/ 100, el cliente paga S/ 100 en los dos casos: gravado se declaran S/ 84.75 de base más S/ 15.25 de IGV, y exonerado se declaran S/ 100 sin IGV. Lo que cambia es cómo se declara a SUNAT, no lo que cobras.',
        },
        {
          type: 'consejo',
          text: 'La elección vale **solo para esa venta**: al terminar vuelve sola a "Según lo configurado". Así nadie deja el POS gravando por olvido.',
        },
        {
          type: 'texto',
          text: 'Cuando eliges Gravado, el comprobante tampoco lleva la leyenda de Amazonía — sería contradictorio en una factura que cobra IGV justamente por venderse fuera de la región.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=preferencias&opcion=allowManualTaxAffectation',
          label: 'Activar el selector de IGV por venta',
        },
      ],
    },

    {
      id: 'moneda',
      title: 'Vender en dólares',
      blocks: [
        {
          type: 'texto',
          text: 'Si activas el soporte multi-divisa, aparece **Moneda de cobro** debajo del tipo de comprobante, con dos botones: **S/ Soles** y **$ Dólares**. Se elige por venta, así que puedes cobrar en soles a uno y en dólares al siguiente sin cambiar nada.',
        },
        {
          type: 'texto',
          text: 'Al pasar a dólares se muestra el campo **TC (S/ por $)**. El sistema trae el tipo de cambio de la **SBS** y lo marca con una etiqueta; si no logra obtenerlo, te avisa para que lo escribas a mano y queda marcado como **Manual**.',
        },
        {
          type: 'ojo',
          text: 'Tu contabilidad y SUNAT siguen en **soles**. Cada documento en dólares guarda el tipo de cambio con el que se emitió y se convierte solo. Ese tipo de cambio queda **congelado en ese comprobante**: aunque el dólar cambie mañana, esa venta conserva el valor con el que se hizo.',
        },
        {
          type: 'consejo',
          text: 'Las **boletas también admiten dólares** — SUNAT lo permite en boletas y facturas. No hace falta emitir factura solo para cobrar en dólares.',
        },
        {
          type: 'ojo',
          text: 'Si activaste la opción y aun así no ves el selector, revisa el **rubro de tu negocio**: en el punto de venta el cobro en dólares está disponible para los rubros de **venta al público (retail)** y **transporte**.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=multiCurrencyEnabled',
          label: 'Activar el cobro en dólares',
        },
        {
          type: 'texto',
          text: 'En esa misma pantalla eliges la **moneda por defecto** al abrir el formulario y la **moneda de tus reportes**, y cada producto puede tener su precio en soles o en dólares.',
        },
      ],
    },

    {
      id: 'cliente',
      title: 'Datos del cliente',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Si el cliente ya compró antes, escríbelo en **Buscar cliente registrado...** y selecciónalo: sus datos se completan solos.',
            'Si es nuevo, escribe su **RUC** o **DNI** y toca la lupa: el sistema consulta el padrón y trae el nombre o razón social automáticamente.',
            'Para boletas simples puedes cobrar sin datos del cliente.',
          ],
        },
        {
          type: 'consejo',
          text: 'En facturas, junto a la dirección hay un botón para ver los **establecimientos anexos** que el cliente tiene registrados en SUNAT y elegir la dirección correcta.',
        },
        {
          type: 'texto',
          text: 'Los clientes que registras quedan guardados en la página **Clientes**, con su historial de compras.',
        },
      ],
    },

    {
      id: 'detraccion',
      title: 'Detracción',
      blocks: [
        {
          type: 'ojo',
          text: 'La detracción, la retención y los anticipos **solo aparecen cuando el comprobante es Factura**. En boleta y nota de venta no se muestran, porque son regímenes que aplican entre empresas.',
        },
        {
          type: 'texto',
          text: 'La detracción es el porcentaje que tu cliente **no te paga a ti**, sino que deposita en tu cuenta de detracciones del Banco de la Nación. El total de la factura no cambia: cambia en cuántas partes se cobra.',
        },
        {
          type: 'pasos',
          items: [
            'Marca **Sujeto a Detracción**.',
            'Elige el **Tipo de Bien/Servicio**. La lista está separada en Bienes y Servicios, y cada tipo ya trae su porcentaje oficial — no lo escribes tú.',
            'Revisa la **cuenta del Banco de la Nación**. Si la tienes cargada en Configuración como cuenta de tipo Detracciones, se completa sola.',
            'El resumen te muestra **Total Factura**, **(-) Detracción** y **Neto a Pagar**.',
          ],
        },
        {
          type: 'consejo',
          text: 'Cuando el total llega a S/ 700 aparece un aviso al lado de la casilla. Es el monto desde el que SUNAT exige detracción en la mayoría de los casos; sirve de recordatorio, pero el sistema no la marca solo: la decisión es tuya, porque depende del bien o servicio.',
        },
        {
          type: 'texto',
          text: 'Para transporte de carga y de pasajeros se piden además los datos del viaje, porque esos regímenes los exigen.',
        },
      ],
    },

    {
      id: 'retencion',
      title: 'Retención',
      blocks: [
        {
          type: 'texto',
          text: 'Si tu cliente es **agente de retención** designado por SUNAT, al pagarte retiene el **3%** y lo entrega él a SUNAT por tu cuenta. Marca **Operación sujeta a retención** y el sistema muestra cuánto se retiene y el **importe neto a pagar**.',
        },
        {
          type: 'ojo',
          text: 'El total de la factura **no cambia**: sigue siendo el mismo importe y así viaja a SUNAT. Lo único que cambia es cuánto dinero te entra ahora. Cobrar el neto y anotar el total es lo correcto.',
        },
        {
          type: 'consejo',
          text: 'No lo marques por costumbre. Solo aplica si ese cliente está designado agente de retención; si no lo es y lo marcas, le estarías descontando un 3% que nadie va a declarar.',
        },
      ],
    },

    {
      id: 'anticipos',
      title: 'Facturas de anticipo',
      blocks: [
        {
          type: 'texto',
          text: 'Un anticipo es plata que ya cobraste **antes** de entregar el bien o el servicio. Se factura en dos momentos: primero la factura del anticipo, y después la factura final, donde se descuenta lo ya cobrado para no cobrarlo dos veces.',
        },
        {
          type: 'pasos',
          items: [
            'Al cobrar el adelanto, marca **Factura de anticipo**. La forma de pago pasa sola a Contado: el anticipo es dinero ya recibido, no puede quedar al crédito.',
            'Cuando entregues y factures el total, marca **Deducir anticipos facturados**.',
            'El sistema busca las facturas de anticipo **aceptadas** de ese cliente y las lista para que elijas cuáles descontar. También puedes agregarla a mano.',
          ],
        },
        {
          type: 'ojo',
          text: 'Las dos casillas son excluyentes: una factura no puede ser un anticipo **y** deducir anticipos al mismo tiempo. Al marcar una, la otra se desmarca sola.',
        },
        {
          type: 'consejo',
          text: 'Si no aparecen las facturas de anticipo del cliente, revisa que hayas escrito su **RUC** y que esos anticipos ya estén **aceptados por SUNAT**. Los rechazados o pendientes no se ofrecen.',
        },
      ],
    },

    {
      id: 'medios-pago',
      title: 'Medios de pago: contado, crédito y pago dividido',
      blocks: [
        {
          type: 'texto',
          text: 'En boletas y facturas eliges la **Forma de Pago**: **Contado** o **Crédito**. Con crédito defines la fecha de vencimiento y, si quieres, las cuotas; la venta queda pendiente de cobro y se controla desde la página de Ventas.',
        },
        {
          type: 'texto',
          text: 'Dentro de contado eliges el método: efectivo, Yape, Plin, tarjeta o los métodos propios que hayas configurado. Si el cliente paga con varios métodos a la vez (una parte en efectivo y otra por Yape), agrega cada método con su monto hasta completar el total.',
        },
        {
          type: 'consejo',
          text: 'Los métodos de pago se personalizan en Configuración: puedes ocultar los que no usas y crear los tuyos. Cada método sale desglosado en el cierre de caja.',
        },
      ],
    },

    {
      id: 'vuelto',
      title: 'Recordatorio de vuelto en efectivo',
      requiereOpcion: {
        flag: 'showChangeReminder',
        nombre: 'el recordatorio de vuelto',
        donde: 'Configuración > Ventas',
        ruta: '/app/configuracion?tab=ventas&opcion=showChangeReminder',
        defaultOn: false,
      },
      blocks: [
        {
          type: 'texto',
          text: 'Con esta opción activa, al cobrar en efectivo aparece la ventana **Recordatorio de vuelto**: indicas con cuánto paga el cliente y el sistema muestra en grande el vuelto a entregar, antes de imprimir el ticket. Útil para no equivocarse en hora punta.',
        },
      ],
    },

    {
      id: 'fecha-emision',
      title: 'Fecha de emisión',
      blocks: [
        {
          type: 'texto',
          text: 'Por defecto toda venta sale con la fecha de hoy. Puedes cambiarla en el campo **Fecha de Emisión** del panel derecho, con estos límites que pone SUNAT:',
        },
        {
          type: 'pasos',
          items: [
            '**Facturas**: hasta 3 días hacia atrás.',
            '**Boletas**: hasta 7 días hacia atrás.',
            '**Notas de Venta**: no tienen límite hacia atrás porque no van a SUNAT.',
            'Ningún comprobante puede llevar **fecha futura**. Si escribes una por error, el sistema la corrige solo y te avisa.',
          ],
        },
        {
          type: 'ojo',
          text: 'Si un comprobante llega a SUNAT con la fecha fuera del plazo, lo rechaza y ese número queda inutilizable. Por eso el sistema valida la fecha antes de cobrar.',
        },
      ],
    },

    {
      id: 'despues-venta',
      title: 'Después de cobrar: ticket, PDF y WhatsApp',
      blocks: [
        {
          type: 'texto',
          text: 'Al completar la venta se abre la ventana **Venta completada** con todo lo que puedes hacer con el comprobante: imprimir el **Ticket**, verlo en pantalla (**Preview**), descargar el **PDF** o **Enviar por WhatsApp** (si el cliente no tiene número registrado, te lo pide en el momento). El botón **Nueva venta** deja todo listo para el siguiente cliente.',
        },
        {
          type: 'texto',
          text: 'Si cierras esa ventana sin querer, no se pierde nada: queda un aviso verde con la venta y el botón **Opciones** para reabrirla.',
        },
        {
          type: 'texto',
          text: 'En Configuración puedes activar la **impresión automática** para que el ticket salga solo al completar cada venta, y también que el POS se limpie solo para la siguiente. Desde la aplicación Android puedes imprimir directo en una ticketera térmica Bluetooth (pestaña Impresora de Configuración).',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=autoPrintTicket',
          label: 'Activar la impresión automática',
        },
        {
          type: 'texto',
          text: 'Qué se imprime al pie del ticket se arma en Configuración > Documentos: el **Mensaje al pie del ticket térmico** (hasta 300 caracteres) y, si lo activas, tus **Términos y condiciones** completos. Estos últimos se escriben una sola vez y con un interruptor decides si salen solo en el PDF o también impresos.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=showTermsOnTicket',
          label: 'Imprimir los términos en el ticket',
        },
      ],
    },

    {
      id: 'referencias',
      title: 'Referencias: guía, orden de compra y pedido',
      blocks: [
        {
          type: 'texto',
          text: 'En el panel derecho, la sección **Referencias (opcional)** permite anotar el **N° Guía**, el **N° O/C** o el **N° Pedido** relacionados con la venta. Salen impresos en el comprobante; útil cuando el cliente exige referenciar su orden de compra en la factura.',
        },
      ],
    },

    {
      id: 'sin-internet',
      title: 'Si se corta el internet',
      blocks: [
        {
          type: 'texto',
          text: 'Puedes seguir vendiendo con **Notas de Venta**: quedan guardadas en el equipo y se envían solas cuando vuelve la conexión (verás un indicador con las ventas pendientes). Las boletas y facturas sí necesitan conexión, porque se validan con SUNAT al momento.',
        },
        {
          type: 'ojo',
          text: 'Las ventas guardadas sin conexión viven en ese equipo y navegador. No cierres sesión ni borres los datos del navegador mientras tengas ventas pendientes de sincronizar.',
        },
      ],
    },

    {
      id: 'restaurante',
      title: 'En modo restaurante',
      soloModos: ['restaurant'],
      blocks: [
        {
          type: 'texto',
          text: 'En restaurantes, lo habitual es atender desde la página **Mesas**: cada mesa acumula su pedido y se cobra al cerrar. El POS sirve para ventas directas sin mesa, como pedidos para llevar.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Emití mal una venta, ¿cómo la corrijo?',
      a: 'Desde la página **Ventas**. Si fue una boleta o factura ya enviada a SUNAT, se corrige con una nota de crédito o se da de baja (según el caso). Si fue una Nota de Venta, puedes anularla, y si tu negocio tiene activada la edición de notas de venta, también editarla.',
    },
    {
      q: '¿Por qué no me aparece la opción de Factura?',
      a: 'Tu negocio tiene definido qué comprobantes emite en **Configuración**. Si estás en el Nuevo RUS, SUNAT no permite emitir facturas y la opción se oculta a propósito. También pasa si tu cuenta aún no tiene la conexión con SUNAT habilitada: en ese caso solo verás Nota de Venta.',
    },
    {
      q: '¿Puedo vender aunque el producto esté en cero?',
      a: 'Depende de una opción de tu negocio: en **Configuración** existe "permitir stock negativo". Si está apagada, el sistema no deja vender más de lo que hay; si está encendida, la venta pasa y el stock queda en negativo para que luego cuadres el inventario.',
    },
    {
      q: '¿Cómo cambio el precio de un producto solo para esta venta?',
      a: 'En el carrito, toca el ícono de lápiz junto al precio del producto y escribe el nuevo. Ese precio vale solo para esta venta; el del catálogo no cambia.',
    },
    {
      q: 'Atendía a un cliente y llegó otro con apuro, ¿pierdo lo que llevaba?',
      a: 'No. Presiona **Aparcar** arriba del carrito: la venta queda en pausa. Atiendes al otro cliente y luego la recuperas desde **En espera**.',
    },
    {
      q: '¿La venta descuenta los insumos de una receta?',
      a: 'Sí: si el producto tiene receta (modo restaurante), al venderlo se descuentan sus insumos del inventario, además del plato.',
    },
  ],
}
