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
        {
          type: 'ojo',
          text: 'Si al entrar al POS te pide abrir la caja antes de vender, es porque tienes activada esa exigencia. Sirve para que el cierre de caja cuadre siempre —nadie vende sin haber declarado con cuánto empezó—, pero es la causa más común de "no me deja vender" a primera hora.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=requireOpenCashRegister',
          label: 'Exigir caja abierta para vender',
        },
        {
          type: 'texto',
          text: 'Al procesar la venta, el comprobante puede irse **solo a SUNAT** o quedar guardado para enviarlo después desde la página Ventas. Enviarlo en el momento es lo habitual; dejarlo manual sirve si prefieres revisar antes de que salga.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=autoSendToSunat',
          label: 'Envío automático a SUNAT',
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
        {
          type: 'texto',
          text: 'Hay cuatro opciones que cambian cómo se comporta esta pantalla y conviene conocerlas, porque explican casi todas las dudas de "por qué veo esto":',
        },
        {
          type: 'pasos',
          items: [
            '**Mostrar todos los productos**: el POS abre con el catálogo entero a la vista en vez de esperar a que busques. Cómodo con pocos productos; con catálogos grandes hace la pantalla más lenta.',
            '**Ocultar los agotados**: los productos en cero no se muestran. Evita que el cajero los ofrezca, pero también los esconde de la vista.',
            '**Mostrar la descripción**: agrega la descripción del producto debajo del nombre, para diferenciar artículos de nombre parecido.',
            '**Reiniciar la búsqueda al agregar**: al sumar un producto el buscador se limpia solo, listo para el siguiente. Viene **activada**; apágala si sueles agregar varias unidades del mismo.',
          ],
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=showAllProductsInPOS',
          label: 'Ajustar cómo se ven los productos en el POS',
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
          text: 'En el **Carrito de Compras** cada producto permite más que cambiar la cantidad: puedes aplicar **descuento** por línea y marcar un producto como **bonificación** (regalo: sale en el comprobante pero no suma al total). Al marcar bonificación en un producto libre, el precio que escribes pasa a ser el **valor referencial**: lo que regalas vale eso y así se declara a SUNAT, aunque el cliente no lo pague. Funciona en boleta, factura y nota de venta. El total va siempre visible arriba del carrito.',
        },
        {
          type: 'texto',
          text: 'Cambiar el **precio** de un producto solo para esta venta requiere activar la opción antes: recién ahí aparece el ícono de lápiz junto al precio. Viene **apagada**, para que un cajero no pueda rebajar precios por su cuenta.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=allowPriceEdit',
          label: 'Permitir modificar el precio en el POS',
        },
        {
          type: 'texto',
          text: 'Lo mismo con el **nombre** del producto: hay una opción aparte para dejar que se edite en el momento, útil cuando el comprobante necesita un detalle distinto al del catálogo.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=allowNameEdit',
          label: 'Permitir modificar el nombre en el POS',
        },
        {
          type: 'ojo',
          text: 'Si intentas vender más de lo que tienes, el sistema te frena. Se puede permitir vender **sin stock** —para negocios que entregan después o hacen pedidos—, pero deja el inventario en negativo a propósito, así que actívalo solo si sabes por qué lo necesitas.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=allowNegativeStock',
          label: 'Permitir vender sin stock',
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
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=multiplePricesEnabled',
          label: 'Ver los niveles de precio',
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
        {
          type: 'consejo',
          text: 'En esa misma pantalla eliges con **qué comprobante abre el POS**. Si casi siempre emites boleta, ponla por defecto y te ahorras un clic por venta. También puedes dejarlo en **Ninguno**: así el cajero está obligado a elegir y no se emiten boletas por inercia cuando el cliente pedía factura.',
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
          text: 'Los métodos de pago se personalizan en Configuración: puedes ocultar los que no usas y crear los tuyos. Cada método sale desglosado en el cierre de caja. Ahí mismo puedes dejar uno **preseleccionado**, útil si casi todo te lo pagan en efectivo o por Yape.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=defaultPaymentMethod',
          label: 'Configurar mis métodos de pago',
        },
        {
          type: 'texto',
          text: 'Las **notas de venta** salen al contado. Si también las das al crédito —con vencimiento y cuotas, igual que una factura— hay que habilitarlo aparte.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=notaVentaCreditTerms',
          label: 'Permitir crédito en notas de venta',
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
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=autoResetPOS',
          label: 'Reiniciar el POS solo, después de imprimir',
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
      id: 'pantalla-cliente',
      title: 'Pantalla para el cliente',
      blocks: [
        {
          type: 'texto',
          text: 'Si tu equipo tiene **doble pantalla** (por ejemplo un iMin Swan 2), la segunda puede mostrarle al cliente el detalle de su compra en vivo, con el logo y los colores de tu negocio, mientras el cajero trabaja en la principal.',
        },
        {
          type: 'consejo',
          text: 'Reduce discusiones al cobrar: el cliente ve lo que se va agregando y a qué precio, en vez de enterarse recién con el total.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=preferencias&opcion=enableCustomerDisplay',
          label: 'Activar la pantalla de cliente',
        },
      ],
    },

    {
      id: 'sucursales',
      title: 'Si vendes en varias sucursales',
      blocks: [
        {
          type: 'texto',
          text: 'Dos opciones cambian lo que ve el cajero según dónde esté parado, y conviene saber que existen porque explican diferencias que de otro modo parecen errores.',
        },
        {
          type: 'texto',
          text: '**Precios por sucursal**: un mismo producto puede costar distinto en cada local. El POS aplica el precio de la sucursal activa; los que no tengan precio propio usan el general.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=branchPricingEnabled',
          label: 'Activar precios por sucursal',
        },
        {
          type: 'texto',
          text: '**Catálogo por sucursal**: puedes ocultar productos en los locales donde no se venden, para que el cajero no los ofrezca.',
        },
        {
          type: 'ojo',
          text: 'Ocultar un producto **no toca su stock**: solo deja de mostrarse. Si esa sucursal igual tiene mercadería, sigue existiendo en el inventario — esconderla no la hace desaparecer.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=branchCatalogEnabled',
          label: 'Activar catálogo por sucursal',
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
      id: 'fidelizacion',
      title: 'Tarjeta de sellos (fidelización)',
      blocks: [
        {
          type: 'texto',
          text: 'El clásico "compra 10 y el siguiente va gratis". Se activa en **Clientes → Fidelización**, defines cuántos sellos valen el premio y cuál es el premio, y a partir de ahí **cada venta suma un sello sola**. Ahí mismo eliges el diseño de la tarjeta que el cliente guarda en Google Wallet.',
        },
        {
          type: 'enlace',
          to: '/app/clientes',
          label: 'Ir a Clientes para activar la fidelización',
        },
        {
          type: 'texto',
          text: 'La tarjeta se identifica por el **teléfono del cliente**. Por eso, al elegir un cliente con teléfono, arriba del carrito ves cuántos sellos lleva: *"Sellos: 7 de 10"*. Cuando completa la meta, ese recuadro se pone ámbar con el botón **Canjear**.',
        },
        {
          type: 'ojo',
          text: 'Sin teléfono no hay tarjeta: una venta a "Cliente General" no suma sellos, porque no hay a quién sumárselos. Si el cliente quiere acumular, hay que registrarle el teléfono.',
        },
        {
          type: 'consejo',
          text: 'El teléfono como identificador es lo que hace que el **mismo cliente acumule compre donde compre**: en el mostrador o por tu catálogo online. Los pedidos online suman su sello al marcarlos como completados.',
        },
        {
          type: 'texto',
          text: 'Al canjear, se descuenta la meta de sellos (si tenía 12 y la meta es 10, le quedan 2) y queda registrado quién lo canjeó. El producto gratis o el descuento lo aplicas tú en la venta.',
        },
        {
          type: 'texto',
          text: 'Debajo del contador aparece **Enviar su tarjeta por WhatsApp**: le llega al cliente un enlace para guardar su tarjeta en **Google Wallet**, con sus sellos y su código QR. A partir de ahí, **cada sello nuevo se actualiza solo en su celular** — no tiene que volver a agregarla ni abrir nada.',
        },
        {
          type: 'consejo',
          text: 'Esa tarjeta en el celular es la que hace que el cliente vuelva: la ve cada vez que abre su billetera y sabe cuánto le falta. Ofrécesela apenas gane su primer sello.',
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
          text: 'En restaurantes, lo habitual es atender desde la página **Mesas**: cada mesa acumula su pedido y se cobra al cerrar. El POS sirve para ventas directas sin mesa: para llevar, delivery o consumo **En Local** sin mesa asignada (patio de comidas, mostrador).',
        },
        {
          type: 'texto',
          text: 'El selector de **tipo de pedido** del carrito guarda cómo se atendió la venta: En Mesa, Para Llevar, Delivery o En Local. Ese dato aparece en el detalle del comprobante y en el reporte de ventas por tipo.',
        },
        {
          type: 'texto',
          text: 'Si tu operación es de mostrador (patio de comidas, dark kitchen), activa **"La venta del POS genera la orden en Cocina"**: al cobrar una venta directa se emite el comprobante, se crea la orden en Cocina ya pagada, y se imprime la comanda junto con el ticket. Un solo paso, sin pasar por Órdenes.',
        },
        {
          type: 'texto',
          text: 'Con esa opción activa, el tipo de pedido aparece como **botones** arriba del carrito — **En Local**, **Para Llevar**, **Delivery** — porque es lo que la comanda le grita a cocina: elígelo antes de cobrar. Y si una venta no va a cocina (una gaseosa, un producto envasado), desmarca **"Enviar comanda a cocina"**: la boleta sale igual, sin orden ni comanda.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=posCreatesKitchenOrder',
          label: 'La venta del POS genera la orden en Cocina',
        },
        {
          type: 'ojo',
          text: 'Con esa opción activa, las ventas que vienen de una **mesa** o de una **orden existente** no crean otra orden: esa orden ya está en Cocina, y duplicarla haría que preparen el pedido dos veces. Solo la venta directa la genera.',
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
