/**
 * RECORRIDO: Corregir o anular un comprobante emitido
 *
 * Categoría "Cómo hacer". La tabla de decisión es la MISMA que la de la guía
 * de Ventas (auditada contra InvoiceList.jsx) — si cambia un criterio, hay
 * que cambiarlo en las dos. Acá se cuenta como TRABAJO: qué hago según qué
 * me pasó, empezando por la pregunta y no por el botón.
 */
export default {
  id: 'corregir-comprobante',
  actualizado: '16/08/2026',
  intro:
    'Te equivocaste en un comprobante, o el cliente devolvió, o SUNAT lo rechazó. La pregunta nunca es "cómo lo borro": es qué corresponde según qué documento es y si SUNAT ya lo aceptó. Este recorrido te lleva del problema a la acción correcta.',

  sections: [
    {
      id: 'primero',
      title: 'Primero: ubica tu caso',
      blocks: [
        {
          type: 'texto',
          text: 'Todo depende de dos cosas: **qué documento es** (nota de venta, o factura/boleta) y **si SUNAT ya lo aceptó**. Con eso, la tabla decide:',
        },
        {
          type: 'tabla',
          encabezados: ['Qué te pasó', 'Qué corresponde'],
          filas: [
            ['Error en una NOTA DE VENTA', 'Anularla (es interna, nunca viajó a SUNAT) y emitir de nuevo'],
            ['Factura/boleta ACEPTADA con error o devolución', 'Nota de Crédito'],
            ['Factura/boleta emitida por error, dentro de 7 días', 'Anular en SUNAT (Comunicación de Baja)'],
            ['Factura/boleta con error, pasaron más de 7 días', 'Nota de Crédito (la baja ya no procede)'],
            ['Comprobante RECHAZADO por SUNAT', 'Editar y reemitir — el rechazo significa que nunca existió para SUNAT'],
            ['Faltó cobrar más (intereses, cargos)', 'Nota de Débito'],
          ],
        },
        {
          type: 'ojo',
          text: 'La regla de los **7 días** es de SUNAT, no del sistema: la Comunicación de Baja solo procede dentro de ese plazo desde la emisión. Pasado el plazo, el único camino es la nota de crédito — por eso conviene revisar lo emitido el mismo día.',
        },
      ],
    },

    {
      id: 'nota-credito',
      title: 'El camino más común: la Nota de Crédito',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Ve a **Ventas**, busca el comprobante y elige **Crear Nota de Crédito**.',
            'Elige el **motivo** de la lista de SUNAT: anulación total, devolución, descuento, corrección… El motivo importa, es lo que declara qué pasó.',
            'Si es parcial (devolvieron una parte), ajusta los items y cantidades.',
            'Emite. La NC viaja a SUNAT y el comprobante original queda intacto — así funciona: no se toca el original, se emite el documento que lo corrige.',
          ],
        },
        {
          type: 'texto',
          text: 'La anulación **devuelve el stock** de los productos. Y si la venta ya tenía cobros, el sistema te pregunta si devolviste el dinero: al marcar que sí, registra el **egreso de caja con la fecha de hoy**, así el arqueo del día cuadra.',
        },
        {
          type: 'ojo',
          text: 'Emitir la NC no devuelve el dinero solo: registra el hecho tributario. La plata al cliente se la das tú, y el checkbox es lo que la deja anotada en caja.',
        },
        { type: 'enlace', to: '/app/facturas', label: 'Ir a Ventas' },
      ],
    },

    {
      id: 'baja',
      title: 'Anular en SUNAT (Comunicación de Baja)',
      blocks: [
        {
          type: 'texto',
          text: 'Para el comprobante que **no debió existir** (lo emitiste por error, dentro de los 7 días). El documento pasa por **Anulación en proceso** hasta que SUNAT confirma con su constancia. Si el trámite quedó detenido, el botón **Reintentar anulación** vuelve a consultar.',
        },
        {
          type: 'consejo',
          text: 'Anular no es eliminar: el trámite queda registrado ante SUNAT con su constancia. Es la diferencia entre "este documento se dio de baja formalmente" y un hueco en tu correlativo.',
        },
      ],
    },

    {
      id: 'rechazado',
      title: 'Rechazado por SUNAT: corregir y reenviar',
      blocks: [
        {
          type: 'texto',
          text: 'Un rechazo significa que el comprobante **nunca existió para SUNAT** — no necesita nota de crédito ni baja. Se corrige lo que causó el rechazo (el RUC del cliente, la fecha, el ubigeo) y se **reenvía**. Mientras tanto sigue contando como venta tuya, porque la venta sí ocurrió; el problema era del envío.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Puedo simplemente eliminar el comprobante?',
      a: 'Las notas de venta sí se anulan internamente, porque nunca viajaron a SUNAT. Una factura o boleta aceptada NO se elimina: existe ante SUNAT y solo se corrige con nota de crédito o comunicación de baja. Eliminar por eliminar deja un hueco en el correlativo que SUNAT sí nota.',
    },
    {
      q: 'El cliente devolvió solo una parte.',
      a: 'Nota de crédito PARCIAL: eliges los items y cantidades devueltos. El comprobante original sigue vivo por el resto, y el stock de lo devuelto regresa.',
    },
    {
      q: 'Me equivoqué solo en la fecha de emisión.',
      a: 'Si SUNAT lo rechazó por eso, edita la fecha y reenvía. Si ya fue aceptado, la fecha ya es un hecho tributario: corresponde nota de crédito y nueva emisión.',
    },
    {
      q: '¿La anulación me devuelve el stock?',
      a: 'Sí, la anulación devuelve el stock de los productos al almacén del que salieron. Por eso importa anular por el camino correcto en vez de "arreglarlo" con un ajuste manual de inventario, que deja la venta y el stock contándose distinto.',
    },
    {
      q: 'Anulé pero ya le había cobrado al cliente.',
      a: 'Al anular, el sistema pregunta si devolviste el dinero. Marca que sí y registra el egreso de caja de hoy por ese monto: el cobro original no se borra (ese día la plata entró de verdad) y la salida de hoy queda con su motivo.',
    },
  ],
}
