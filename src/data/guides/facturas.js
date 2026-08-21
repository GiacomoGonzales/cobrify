/**
 * GUÍA DE USO: Ventas (historial de comprobantes)
 *
 * Reescrita el 14-ago-2026 tras auditoría completa de InvoiceList.jsx (5.585
 * líneas): estados montados, entradas del menú de acciones, flags de
 * businessSettings y textos visibles. La versión anterior cubría 9 secciones y
 * le faltaban: crédito con cuotas, WhatsApp, duplicar, editar/eliminar (y sus
 * interruptores), Nota de Salida, la diferencia anular interna vs anular en
 * SUNAT con la devolución a caja, el detalle del comprobante, los campos
 * Alumno/Placa y TODOS los enlaces a Configuración (tenía cero).
 *
 * Anclas verificadas contra Settings.jsx (tab real de cada opción, 14-ago):
 * ventas → notaVentaCreditTerms, multiCurrencyEnabled, enabledDocumentTypes,
 *          showStudentField, allowEditNotaVenta
 * documentos → autoSendToSunat, dispatchGuidesEnabled, exitNoteEnabled,
 *              allowDeleteInvoices
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'facturas',
  actualizado: '14/08/2026',
  intro:
    'Ventas es el historial de todo lo que emitiste: facturas, boletas, notas de venta, notas de crédito y de débito. Desde acá consultas, cobras lo pendiente, corriges errores, reimprimes y descargas. Es la página a la que vuelves cuando algo de una venta pasada necesita atención.',

  sections: [
    {
      id: 'encontrar-comprobante',
      title: 'Encontrar un comprobante',
      blocks: [
        {
          type: 'texto',
          text: 'El buscador acepta **número, cliente, RUC/DNI o producto**. Sí: puedes buscar por lo que se vendió, no solo por el número del documento. Si un cliente vuelve con "la semana pasada compré un taladro", escribe "taladro" y aparecen las ventas que lo incluyen.',
        },
        {
          type: 'ui',
          kind: 'campo',
          label: 'Buscar por número, cliente, RUC/DNI, producto...',
        },
        {
          type: 'texto',
          text: 'Arriba está el **Período**: Todo, Hoy, 3 días, 7 días, 30 días o Personalizado. En Personalizado puedes elegir un rango con **Desde** y **Hasta**, o directamente un **mes completo** con el selector de mes y año — lo más cómodo para revisar "todo julio". Debajo, los filtros por tipo de comprobante, estado de pago, forma de pago, vendedor y sucursal se combinan entre sí.',
        },
        {
          type: 'consejo',
          text: 'Las cuatro tarjetas de arriba (**Comprobantes**, **Pagadas**, **Pendientes**, **Monto Total**) resumen lo que estás viendo con los filtros puestos, no todo el historial. Si los números "no cuadran", casi siempre es un filtro: revisa el período, la sucursal y si estás viendo archivados o no.',
        },
        {
          type: 'texto',
          text: 'El filtro de sucursal obedece al **selector de sucursal del encabezado** de la app. Y si un vendedor entra con su usuario, ve solo lo que le corresponde según sus permisos de sucursal y de vendedor.',
        },
      ],
    },

    {
      id: 'estados',
      title: 'Los dos estados: pago y SUNAT',
      blocks: [
        {
          type: 'texto',
          text: 'Cada comprobante muestra dos estados **independientes**, y confundirlos es la fuente clásica de sustos:',
        },
        {
          type: 'tabla',
          encabezados: ['Estado', 'De qué habla', 'Valores'],
          filas: [
            ['Estado de pago', 'Si el cliente ya te pagó', 'Pagada, Pendiente, Parcial, Vencida'],
            ['Estado SUNAT', 'Si SUNAT aceptó el documento', 'Aceptado, Pendiente de envío, Rechazado, Anulada, Anulación en proceso'],
          ],
        },
        {
          type: 'texto',
          text: 'Una factura puede estar **aceptada por SUNAT y sin pagar** (venta al crédito), o **pagada y rechazada por SUNAT** (el dinero entró pero el documento tiene un error). Son problemas distintos con soluciones distintas: el primero se resuelve cobrando, el segundo corrigiendo el documento.',
        },
        {
          type: 'ojo',
          text: 'Un comprobante **Rechazado por SUNAT** no se arregla reenviándolo igual: SUNAT ya conoció ese número y responderá que el documento ya fue informado. Según el motivo del rechazo, usa **Editar y reemitir** (corrige el error manteniendo el número cuando se puede) o **Editar fecha y reenviar** (cuando el rechazo fue por la fecha). Y si esa venta no debe existir, anúlala: el rechazo por sí solo no la saca de tus totales.',
        },
      ],
    },

    {
      id: 'credito-y-cuotas',
      title: 'Ventas al crédito, cuotas y cobranza',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando una venta sale al crédito, queda **Pendiente** con su saldo visible. Si pasó la fecha acordada sin pagarse, pasa a **Vencida**. En sus acciones tienes **Registrar Pago**: anotas cuánto te pagaron y con qué método, y el sistema baja el saldo. Puedes registrar tantos pagos parciales como haga falta; cada uno queda en el historial con fecha, método y quién lo registró. Si el cobro entró un día anterior, puedes cambiar la **fecha del pago** al registrarlo: el sistema te avisa que ese cobro irá al cuadre de caja de ese día y no al de hoy.',
        },
        {
          type: 'texto',
          text: '**Ejemplo:** vendiste S/ 900 al crédito. El cliente abona S/ 300 en efectivo → Registras el pago y la venta queda **Parcial** con saldo S/ 600. Quince días después paga los S/ 600 por transferencia → registras el segundo pago y pasa a **Pagada**. En el detalle quedan los dos abonos, con sus fechas.',
        },
        {
          type: 'texto',
          text: 'Si el crédito se pactó **en cuotas**, el detalle del comprobante muestra el cronograma: cada cuota con su fecha de vencimiento y su monto. Las cuotas se definen al momento de la venta; para poder pactarlas en notas de venta hay que activar la opción:',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=notaVentaCreditTerms',
          label: 'Permitir crédito y cuotas en notas de venta',
        },
        {
          type: 'texto',
          text: 'Para la cobranza del día a día, el botón **Pagos Pendientes** de la cabecera abre las cuentas por cobrar **agrupadas por cliente**: quién te debe, cuánto en total y qué ya venció. Es la vista para salir a cobrar, en lugar de revisar factura por factura.',
        },
        { type: 'ui', kind: 'botonSecundario', label: 'Pagos Pendientes' },
        {
          type: 'ojo',
          text: 'No se puede registrar un pago mayor que el saldo, ni pagos sobre una venta anulada. Si te pagaron de más, el excedente es un tema aparte (vuelto o adelanto), no parte de este comprobante.',
        },
      ],
    },

    {
      id: 'corregir',
      title: 'Corregir o anular: qué corresponde en cada caso',
      blocks: [
        {
          type: 'texto',
          text: 'Depende de dos cosas: **qué documento es** y **si SUNAT ya lo aceptó**. Esta tabla resume todos los caminos:',
        },
        {
          type: 'tabla',
          encabezados: ['Situación', 'Qué usar', 'Qué pasa'],
          filas: [
            ['Factura o boleta aceptada, con error o devolución', 'Crear Nota de Crédito', 'La NC corrige o anula ante SUNAT; el documento original queda intacto'],
            ['Factura o boleta aceptada, emitida por error (dentro de 7 días)', 'Anular en SUNAT', 'Envía la Comunicación de Baja; el documento deja de existir para SUNAT'],
            ['Factura o boleta aceptada, pasaron más de 7 días', 'Crear Nota de Crédito', 'La baja ya no procede; la NC es el único camino'],
            ['Comprobante rechazado por SUNAT', 'Editar y reemitir / Editar fecha y reenviar', 'Corriges y vuelve a viajar; o lo anulas internamente si no debe existir'],
            ['Falta cobrar más (intereses, cargos)', 'Crear Nota de Débito', 'Aumenta el importe del comprobante original'],
            ['Nota de venta', 'Anular Nota de Venta', 'Anulación interna: no viaja a SUNAT porque nunca fue'],
          ],
        },
        {
          type: 'texto',
          text: '**Anular en SUNAT** pasa por el estado **Anulación en proceso** hasta que SUNAT confirma con su constancia (el CDR de baja). Si quedó detenida, el botón **Reintentar anulación** vuelve a consultar. Anular no es eliminar: el trámite queda registrado ante SUNAT.',
        },
        {
          type: 'texto',
          text: 'Al anular una venta que **ya tenía cobros**, el sistema te pregunta si devolviste el dinero. Si marcas que sí, registra un **egreso de caja con la fecha de hoy** por ese monto. El cobro original no se borra — ese día la plata sí entró — pero la salida de hoy queda con su motivo, y el arqueo del día cuadra. La anulación también **devuelve el stock** de los productos.',
        },
        {
          type: 'ojo',
          text: 'Emitir la nota de crédito o anular **no devuelve el dinero solo**: registra el hecho tributario. La devolución física al cliente la haces tú, y el checkbox de arriba es lo que la deja anotada en caja.',
        },
      ],
    },

    {
      id: 'editar-eliminar',
      title: 'Editar o eliminar (con sus interruptores)',
      blocks: [
        {
          type: 'texto',
          text: 'Dos acciones que **no aparecen** hasta que las habilitas en Configuración, porque relajan el control contable y conviene decidirlo a propósito:',
        },
        {
          type: 'texto',
          text: '**Editar documento** (solo notas de venta): abre la nota en el POS para cambiar productos o cantidades. El inventario se ajusta **por la diferencia** — si la nota decía 5 y ahora dice 3, vuelven 2 al stock — y queda un movimiento de ajuste como rastro. No se pueden editar las ya convertidas ni las anuladas.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=allowEditNotaVenta',
          label: 'Permitir editar notas de venta',
        },
        {
          type: 'texto',
          text: '**Eliminar**: borra el comprobante del historial. Solo aplica a notas de venta y a documentos que SUNAT **no** aceptó — un comprobante aceptado tiene validez fiscal y nunca se elimina, se corrige con NC o baja. Si trabajas con cajeros, piénsalo dos veces: anular deja rastro, eliminar no.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=allowDeleteInvoices',
          label: 'Permitir eliminar comprobantes',
        },
      ],
    },

    {
      id: 'convertir',
      title: 'Convertir una nota de venta en comprobante',
      blocks: [
        {
          type: 'texto',
          text: 'Si vendiste con nota de venta y después el cliente pide su boleta o factura, usa **Convertir a Comprobante**: se abre el POS con los productos ya cargados para que emitas el documento formal. La nota original queda marcada como convertida y no vuelve a sumar en tus totales.',
        },
        {
          type: 'texto',
          text: 'El filtro **Conversión** separa las notas **sin convertir** de las **convertidas**, para saber qué te falta formalizar. Y si tienes varias por convertir, selecciónalas con las casillas y el botón **Convertir a Comprobante** de la barra las procesa juntas.',
        },
        {
          type: 'consejo',
          text: '**Ejemplo de fin de mes:** filtras Período = Este mes, Tipo = Notas de Venta, Conversión = Sin convertir. Lo que aparece es exactamente lo que aún puedes formalizar si algún cliente lo pide.',
        },
      ],
    },

    {
      id: 'reimprimir-compartir',
      title: 'Reimprimir, descargar y enviar por WhatsApp',
      blocks: [
        {
          type: 'texto',
          text: 'En cada comprobante tienes **Imprimir ticket**, **Descargar PDF**, **Vista Previa** y **Descargar XML**. Para los que fueron a SUNAT están además los **Archivos SUNAT**: el XML firmado y el **CDR**, que es la constancia de aceptación — lo que te pide el contador o un cliente cuando quiere la prueba de que SUNAT lo aceptó.',
        },
        {
          type: 'texto',
          text: '**Enviar por WhatsApp** genera el PDF, lo sube y abre WhatsApp con un enlace corto listo para mandar. Usa el teléfono guardado del cliente: si no tiene, el sistema te lo dice — agrégaselo en Clientes y vuelve a intentar.',
        },
        {
          type: 'texto',
          text: 'La impresión del ticket respeta la **configuración de impresora de este equipo** (ancho de papel, tamaño de letra, impresión compacta o legible). Si los tickets salen distintos en otra computadora, es porque cada equipo guarda su propia configuración.',
        },
        {
          type: 'texto',
          text: '**Duplicar comprobante** es para el cliente que "quiere lo mismo de la semana pasada": abre el POS con los mismos productos cargados para emitir una venta nueva, sin tocar la original.',
        },
        {
          type: 'texto',
          text: 'Y si necesitas que el PDF de las **notas de venta** salga sin los datos de tu empresa — sin logo, nombre, RUC ni dirección, solo "NOTA DE VENTA" con su número, el cliente y los productos — hay una opción para eso. No toca facturas ni boletas.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=hideCompanyDataInNotaVenta',
          label: 'Ocultar datos de la empresa en Notas de Venta (PDF)',
        },
      ],
    },

    {
      id: 'lote',
      title: 'Trabajar en lote',
      blocks: [
        {
          type: 'texto',
          text: 'Marca varios comprobantes con las casillas (o **Seleccionar todos** sobre lo filtrado) y aparece la barra de acciones en lote:',
        },
        {
          type: 'pasos',
          items: [
            '**Imprimir tickets**: los imprime uno tras otro, con contador de avance.',
            '**Descargar PDFs**: genera y descarga el PDF de cada uno.',
            '**Enviar a SUNAT**: reenvía juntos los pendientes o rechazados.',
            '**Convertir a Comprobante**: si todo lo marcado son notas de venta convertibles.',
            '**Archivar / Desarchivar**: los saca de (o devuelve a) la vista del día a día.',
          ],
        },
        {
          type: 'consejo',
          text: 'La combinación filtro + lote es la jugada: filtra "Estado SUNAT = Pendiente" en el mes, selecciona todos y reenvía en una pasada.',
        },
      ],
    },

    {
      id: 'exportar',
      title: 'Exportar a Excel',
      blocks: [
        {
          type: 'texto',
          text: 'El botón **Exportar Excel** abre una ventana para elegir qué incluir: rango de fechas (con accesos rápidos Hoy, Ayer, Esta semana, Este mes), tipos de comprobante, vendedores, formas de pago y estado SUNAT. Puedes incluir el detalle de productos de cada venta y una hoja aparte con el resumen **Por Vendedor**.',
        },
        { type: 'ui', kind: 'botonSecundario', label: 'Exportar Excel' },
        {
          type: 'texto',
          text: 'La casilla **Evitar duplicados por conversión** viene marcada y conviene dejarla así: excluye las notas de venta ya convertidas y deja el comprobante formal, para que la misma venta no aparezca dos veces. Desmárcala solo si necesitas ver todos los documentos tal cual.',
        },
        {
          type: 'consejo',
          text: 'Es la forma más directa de mandarle el mes al contador sin que entre al sistema: Este mes + todos los tipos + detalle de productos, y le envías el archivo.',
        },
      ],
    },

    {
      id: 'detalle',
      title: 'El detalle del comprobante',
      blocks: [
        {
          type: 'texto',
          text: '**Ver detalles** abre la ficha completa: productos con sus cantidades y afectación (Op. Gravadas, Exoneradas, Inafectas), datos del cliente, sucursal y almacén de donde salió el stock, el desglose del pago — cuánto recibiste del cliente y cuánto **vuelto** entregaste —, el historial de pagos si fue al crédito, las cuotas si las hay, y las observaciones.',
        },
        {
          type: 'texto',
          text: 'Si la venta se cobró con recargo por tarjeta o en dólares, acá se ve: el recargo aparece indicado y las ventas en USD muestran su tipo de cambio congelado del día. Para vender en dólares primero activa la multi-divisa:',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=multiCurrencyEnabled',
          label: 'Habilitar ventas en dólares (multi-divisa)',
        },
        {
          type: 'texto',
          soloModos: ['restaurant'],
          text: 'En restaurante, el detalle muestra además el **tipo de pedido** (En mesa, Para llevar, Delivery, Mostrador) y el **mozo** que atendió.',
        },
      ],
    },

    {
      id: 'campos-extra',
      title: 'Campos extra: Alumno y Placa',
      blocks: [
        {
          type: 'texto',
          text: 'Para rubros que necesitan un dato más por venta, hay campos opcionales que se capturan en el POS y viajan al comprobante. El campo **Alumno** (colegios, academias) agrega su columna a esta tabla y — importante — deja **buscar el comprobante por el nombre del alumno**, que suele ser lo único que el padre recuerda. El campo **Placa de Vehículo** (talleres, lavaderos) se muestra en el detalle y en el documento, igual que **Modelo**, **Año**, **Licencia / Resolución** y **Tarjeta de Propiedad** (transporte). Todos se activan en Configuración → Campos del cliente, y los de licencia y tarjeta de propiedad salen además como columnas del reporte de ventas en Excel.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=showStudentField',
          label: 'Activar el campo "Alumno" y otros campos del POS',
        },
      ],
    },

    {
      id: 'traslados',
      title: 'Guía de remisión y Nota de Salida',
      blocks: [
        {
          type: 'texto',
          text: 'Si la mercadería vendida se traslada, **Generar Guía de Remisión** arma la GRE arrastrando cliente y productos de la venta, para que solo completes los datos del traslado. La opción aparece cuando las guías están habilitadas:',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=dispatchGuidesEnabled',
          label: 'Habilitar Guías de Remisión Electrónicas',
        },
        {
          type: 'texto',
          text: 'La **Nota de Salida** es otra cosa: un PDF interno con las cantidades **sin precios**, pensado para el encargado de almacén que prepara el pedido y no tiene por qué ver cuánto pagó el cliente.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=exitNoteEnabled',
          label: 'Habilitar Nota de Salida',
        },
      ],
    },

    {
      id: 'archivados',
      title: 'Comprobantes archivados',
      blocks: [
        {
          type: 'texto',
          text: 'Archivar saca un comprobante de la lista del día a día **sin borrarlo**: no aparece ni suma en las tarjetas de totales. Sirve para limpiar la vista de documentos viejos o casos raros ya resueltos. Para verlos, activa **Ver comprobantes archivados**; desde ahí también puedes desarchivarlos.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Emití una boleta a la persona equivocada, ¿qué hago?',
      a: 'Si ya fue aceptada por SUNAT, emite una **Nota de Crédito** por anulación de la operación y luego el comprobante correcto. Si SUNAT aún no la aceptó (pendiente o rechazada), puedes **editar y reemitir**. No intentes cambiarle el cliente a una aceptada: SUNAT ya la tiene.',
    },
    {
      q: '¿Cuál es la diferencia entre anular y eliminar?',
      a: '**Anular** deja el comprobante en el historial, marcado, con su stock devuelto y su rastro; si fue a SUNAT, además envía la Comunicación de Baja. **Eliminar** lo borra y solo existe si lo habilitaste en Configuración, y nunca para documentos aceptados por SUNAT. Ante la duda, anula.',
    },
    {
      q: 'Dice "Anulación en proceso" desde hace rato, ¿está trabada?',
      a: 'La Comunicación de Baja no es instantánea: SUNAT la procesa y responde con su constancia. Usa **Reintentar anulación** para volver a consultar; cuando SUNAT responde, pasa a Anulada y aparece el CDR de baja.',
    },
    {
      q: 'Anulé una venta que ya estaba cobrada, ¿y la plata?',
      a: 'Al anular, el sistema te pregunta si devolviste el dinero. Si marcas que sí, registra un egreso de caja de hoy por ese monto, con el motivo. El cobro original no se toca — ese día el dinero sí entró — y el arqueo de hoy cuadra con la devolución anotada.',
    },
    {
      q: '¿Por qué mis totales no cuadran con lo que esperaba?',
      a: 'Casi siempre es un filtro: el período (Hoy vs 30 días vs Todo), la sucursal seleccionada en el encabezado, o los archivados que no suman. Y si exportaste a Excel, revisa la casilla de duplicados por conversión: una nota convertida y su boleta son la misma venta.',
    },
    {
      q: 'Un cliente quiere su comprobante de nuevo, ¿cómo se lo mando?',
      a: 'Búscalo por nombre, RUC o producto, y usa **Enviar por WhatsApp** (le llega un enlace con el PDF) o **Descargar PDF**. Si te pide la constancia de SUNAT, entrégale también el **CDR SUNAT** desde Archivos SUNAT.',
    },
    {
      q: '¿Puedo cambiar la fecha de un comprobante ya emitido?',
      a: 'Solo en los que SUNAT no aceptó, con **Editar fecha y reenviar a SUNAT**. A un comprobante aceptado no se le cambia la fecha: se corrige con nota de crédito.',
    },
    {
      q: '¿Hasta cuándo puedo anular en SUNAT?',
      a: 'La Comunicación de Baja tiene un plazo de **7 días** desde la emisión. Pasado el plazo, el camino es la **Nota de Crédito**, que no vence.',
    },
  ],
}
