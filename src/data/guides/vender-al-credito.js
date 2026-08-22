/**
 * RECORRIDO: Vender al crédito y cobrar después
 *
 * Categoría "Cómo hacer": cruza POS → Ventas → Clientes → Reportes.
 * Hechos verificados 16/08/2026: selector Contado/Crédito con vencimiento y
 * cuotas en POS.jsx, botón "Registrar Pago" y "Cuotas de Pago" en
 * InvoiceList.jsx, "Vencidas" en Customers.jsx, "Estados de Pago" en Reports.
 */
export default {
  id: 'vender-al-credito',
  actualizado: '22/08/2026',
  intro:
    'Vender hoy y cobrar después es normal en el negocio peruano — lo peligroso es perderle el rastro a quién te debe. Este recorrido cubre el circuito completo: emitir al crédito, registrar los cobros y vigilar la deuda.',

  sections: [
    {
      id: 'emitir',
      title: '1. La venta: emitir al crédito',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Arma la venta en el **Punto de Venta** como siempre.',
            'En la condición de pago cambia **Contado** por **Crédito**.',
            'Pon la **fecha de vencimiento** y, si acordaron pagos parciales, las **cuotas** con sus fechas.',
            'Emite. El comprobante nace con su saldo pendiente completo.',
          ],
        },
        {
          type: 'ojo',
          text: 'Ponle SIEMPRE una fecha de vencimiento real, la que acordaste de palabra. Es la fecha que después separa "deuda normal" de "deuda vencida" — sin ella, todo parece estar bien para siempre.',
        },
        {
          type: 'ojo',
          text: 'Toda venta que queda debiendo pide el **nombre del cliente**: sin él no deja cobrar. No es un capricho — la deuda sin nombre se junta con la de todos los demás anónimos en una sola fila del reporte de cobranzas, y ya no hay forma de saber a quién reclamarle.',
        },
        {
          type: 'consejo',
          text: 'Si el cliente ya está en **Clientes**, elígelo de la lista en vez de escribir el nombre a mano. Escrito distinto cada vez ("Rosa", "Sra. Rosa") sale como si fueran personas diferentes; elegido de la lista, toda su deuda queda junta.',
        },
        { type: 'enlace', to: '/app/pos', label: 'Ir al Punto de Venta' },
      ],
    },

    {
      id: 'nota-venta-credito',
      title: 'Si vendes al crédito con nota de venta',
      requiereOpcion: {
        flag: 'notaVentaCreditTerms',
        nombre: 'vencimiento y cuotas en notas de venta al crédito',
        donde: 'Configuración > Ventas',
        ruta: '/app/configuracion?tab=ventas&opcion=notaVentaCreditTerms',
        defaultOn: false,
      },
      blocks: [
        {
          type: 'texto',
          text: 'Las facturas y boletas al crédito llevan vencimiento y cuotas de fábrica. Para que las **notas de venta** también los lleven, hay que activar esta opción — sin ella, la nota de venta al crédito queda como deuda sin fecha.',
        },
      ],
    },

    {
      id: 'cobrar',
      title: '2. El cobro: registrar cada pago',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Cuando el cliente paga (todo o una parte), ve a **Ventas** y busca su comprobante.',
            'Usa **Registrar Pago**: monto, método (efectivo, Yape, transferencia) y fecha.',
            'El saldo baja solo. Cuando llega a cero, el comprobante pasa a **pagado**.',
          ],
        },
        {
          type: 'texto',
          text: 'Los pagos parciales se acumulan: puedes registrar tres abonos de fechas distintas sobre la misma venta y el historial queda completo. Si la venta tiene **Cuotas de Pago**, ves el cronograma y qué cuota está cubriendo cada abono.',
        },
        {
          type: 'consejo',
          text: 'Registra el pago con el método REAL del día que cobras: ese cobro entra al arqueo de caja de ese día, no al de la venta original. Es lo que hace que caja y deuda cuadren a la vez.',
        },
        { type: 'enlace', to: '/app/facturas', label: 'Ir a Ventas' },
      ],
    },

    {
      id: 'vigilar',
      title: '3. La vigilancia: quién te debe',
      blocks: [
        {
          type: 'texto',
          text: 'Tres lugares, cada uno para una pregunta distinta:',
        },
        {
          type: 'tabla',
          encabezados: ['Dónde', 'Qué responde'],
          filas: [
            ['Clientes', 'Cuánto debe cada cliente, y cuáles tienen deudas VENCIDAS'],
            ['Ventas (filtro de pendientes)', 'Qué comprobantes exactos faltan cobrar'],
            ['Reportes → Estados de Pago', 'Del total vendido en el período, cuánto está cobrado y cuánto no'],
          ],
        },
        {
          type: 'consejo',
          text: 'El de Reportes es el que avisa temprano: si el mes se ve buenísimo en ventas pero "Pendientes" crece y crece, estás regalando mercadería con otra etiqueta. Vender mucho a crédito y cobrar poco se ve ahí antes que en tu cuenta bancaria.',
        },
        { type: 'enlace', to: '/app/clientes', label: 'Ver quién te debe (Clientes)' },
        { type: 'enlace', to: '/app/reportes', label: 'Ver Estados de Pago (Reportes)' },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿El crédito afecta mi caja del día?',
      a: 'La venta al crédito NO entra al arqueo del día que la emites (no entró dinero). Entra el día que registras cada cobro, por el método con que te pagaron. Por eso importa registrar los pagos el día real.',
    },
    {
      q: 'El cliente me pagó por partes en fechas distintas.',
      a: 'Registra cada abono por separado con su fecha y su método. El saldo va bajando y el historial de pagos queda completo — es justo el caso para el que existe.',
    },
    {
      q: '¿Dónde veo el total que me deben todos juntos?',
      a: 'En **Clientes** está la deuda por cliente y las vencidas. Para el total del período, **Reportes → Estados de Pago** muestra pagado contra pendiente.',
    },
    {
      q: 'Emití al contado pero en realidad era al crédito.',
      a: 'Un comprobante emitido no cambia de condición. Si fue nota de venta, puedes anularla y volver a emitir al crédito. Si fue factura o boleta aceptada por SUNAT, corresponde nota de crédito y nueva emisión — mira el recorrido "Corregir o anular un comprobante emitido".',
    },
  ],
}
