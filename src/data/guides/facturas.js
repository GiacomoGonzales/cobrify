/**
 * GUÍA DE USO: Ventas (historial de comprobantes)
 *
 * Nombres verificados contra src/pages/InvoiceList.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'facturas',
  actualizado: '12/08/2026',
  intro:
    'Ventas es el historial de todo lo que emitiste: facturas, boletas, notas de venta y notas de crédito. Desde acá consultas, cobras lo pendiente, corriges errores y descargas comprobantes.',

  sections: [
    {
      id: 'encontrar-comprobante',
      title: 'Encontrar un comprobante',
      blocks: [
        {
          type: 'texto',
          text: 'El buscador acepta **número, cliente, RUC/DNI o producto**. Sí: puedes buscar por lo que se vendió, no solo por el número del documento.',
        },
        {
          type: 'texto',
          text: 'Arriba tienes los filtros de **Período**: Todo, Hoy, 3 días, 7 días, 30 días o Personalizado (con Desde y Hasta). Debajo puedes acotar por tipo de comprobante, estado, forma de pago, vendedor y sucursal.',
        },
        {
          type: 'ui',
          kind: 'campo',
          label: 'Buscar por número, cliente, RUC/DNI, producto...',
        },
        {
          type: 'consejo',
          text: 'Las cuatro tarjetas de arriba (**Comprobantes**, **Pagadas**, **Pendientes**, **Monto Total**) resumen lo que estás viendo con los filtros puestos, no todo el historial. Si cambias el período, los números cambian con él.',
        },
      ],
    },

    {
      id: 'estados',
      title: 'Entender los estados',
      blocks: [
        {
          type: 'texto',
          text: 'Cada comprobante muestra dos cosas distintas que conviene no confundir: el **estado de pago** (Pagada, Pendiente, Parcial, Vencida) y el **Estado SUNAT** (aceptado, Rechazado por SUNAT, Anulada, Anulación en proceso).',
        },
        {
          type: 'texto',
          text: 'Que SUNAT haya rechazado un comprobante no significa que la venta no ocurrió. Si esa venta no debe contar, hay que **anularla**; el rechazo por sí solo no la borra de tus totales.',
        },
        {
          type: 'ojo',
          text: 'Un comprobante **Rechazado por SUNAT** no se arregla reenviándolo con el mismo número: SUNAT ya quemó ese correlativo y responderá que el documento ya está informado. Lo que corresponde es emitir uno nuevo.',
        },
      ],
    },

    {
      id: 'cobrar-pendientes',
      title: 'Cobrar ventas pendientes',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando una venta quedó al crédito o con pago parcial, en sus acciones tienes **Registrar Pago**: anotas cuánto te pagaron y el sistema actualiza el saldo. Puedes registrar varios pagos parciales hasta saldar la deuda.',
        },
        {
          type: 'texto',
          text: 'El botón **Pagos Pendientes** de la cabecera abre el reporte de cuentas por cobrar **agrupadas por cliente**: quién te debe, cuánto y qué está vencido. Es la vista para salir a cobrar.',
        },
        { type: 'ui', kind: 'botonSecundario', label: 'Pagos Pendientes' },
      ],
    },

    {
      id: 'corregir',
      title: 'Corregir o anular una venta',
      blocks: [
        {
          type: 'texto',
          text: 'Qué corresponde según el caso:',
        },
        {
          type: 'pasos',
          items: [
            '**Boleta o factura ya aceptada por SUNAT**: se corrige con **Crear Nota de Crédito** (devolución, anulación o corrección de montos), o se da de baja con **Anular en SUNAT**, que envía la Comunicación de Baja.',
            '**Comprobante rechazado por SUNAT**: puedes usar **Editar y reemitir** o **Editar fecha y reenviar a SUNAT** según el motivo del rechazo.',
            '**Nota de venta**: se elimina o se edita directamente, porque no viaja a SUNAT.',
          ],
        },
        {
          type: 'texto',
          text: 'También existe **Crear Nota de Débito** para lo contrario: aumentar el importe de un comprobante ya emitido (intereses, cargos adicionales).',
        },
        {
          type: 'ojo',
          text: 'Anular en SUNAT no es lo mismo que eliminar. La anulación es un trámite ante SUNAT que queda registrado y pasa por el estado "Anulación en proceso" hasta que SUNAT la confirma.',
        },
      ],
    },

    {
      id: 'convertir',
      title: 'Convertir una nota de venta en comprobante',
      blocks: [
        {
          type: 'texto',
          text: 'Si vendiste con nota de venta y luego el cliente pide su boleta o factura, usa **Convertir a Comprobante**: se abre el POS con los productos cargados para que emitas el documento formal.',
        },
        {
          type: 'texto',
          text: 'El filtro **Conversión** te deja ver por separado las notas **sin convertir** y las **convertidas**, para saber qué te falta formalizar.',
        },
        {
          type: 'consejo',
          text: 'La nota original queda marcada como convertida y ya no suma dos veces en tus totales.',
        },
      ],
    },

    {
      id: 'imprimir-descargar',
      title: 'Imprimir, descargar y enviar',
      blocks: [
        {
          type: 'texto',
          text: 'En cada comprobante encuentras **Imprimir ticket**, **Descargar PDF**, **Vista Previa** y **Descargar XML**. Para los que fueron a SUNAT también están los **Archivos SUNAT**: el XML firmado y el **CDR SUNAT**, que es la constancia de aceptación.',
        },
        {
          type: 'texto',
          text: 'Puedes marcar varios comprobantes con las casillas (o **Seleccionar todos**) y trabajarlos en bloque: **Imprimir tickets**, **Descargar PDFs** o enviarlos a SUNAT juntos.',
        },
        {
          type: 'consejo',
          text: 'El **CDR** es lo que te pide un cliente o tu contador cuando quiere la prueba de que SUNAT aceptó el comprobante.',
        },
      ],
    },

    {
      id: 'exportar',
      title: 'Exportar a Excel',
      blocks: [
        {
          type: 'texto',
          text: 'El botón **Exportar Excel** de la cabecera abre una ventana donde eliges qué incluir: rango de fechas, tipos de comprobante, vendedores, formas de pago y estado SUNAT. Puedes incluir el detalle de productos de cada venta y sacar una hoja aparte con el resumen **Por Vendedor**.',
        },
        { type: 'ui', kind: 'botonSecundario', label: 'Exportar Excel' },
        {
          type: 'consejo',
          text: 'Es la forma más directa de mandarle el mes a tu contador sin que tenga que entrar al sistema.',
        },
      ],
    },

    {
      id: 'guia-remision',
      title: 'Generar una guía de remisión',
      blocks: [
        {
          type: 'texto',
          text: 'Si la mercadería se traslada, desde el comprobante puedes usar **Generar Guía de Remisión** y el sistema arrastra los datos de la venta (cliente y productos) para que solo completes el traslado.',
        },
      ],
    },

    {
      id: 'archivados',
      title: 'Comprobantes archivados',
      blocks: [
        {
          type: 'texto',
          text: 'Archivar saca un comprobante de la lista del día a día sin borrarlo. Para verlos, activa **Ver comprobantes archivados**. Los archivados no se cuentan en las tarjetas de totales.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Emití una boleta a la persona equivocada, ¿qué hago?',
      a: 'Si ya fue aceptada por SUNAT, emite una **Nota de Crédito** por anulación de la operación y luego emite el comprobante correcto. No intentes editar la original: SUNAT ya la tiene.',
    },
    {
      q: 'Dice "Anulación en proceso" desde hace rato, ¿está trabada?',
      a: 'La Comunicación de Baja no es instantánea: SUNAT la procesa y responde con su constancia. Usa **Reintentar anulación** si quedó detenida; cuando SUNAT responde, el estado pasa a Anulada y aparece el CDR de baja.',
    },
    {
      q: '¿Por qué mis totales no cuadran con lo que esperaba?',
      a: 'Revisa los filtros: las tarjetas resumen solo lo filtrado. Ojo también con el período (Hoy vs Todo), la sucursal seleccionada y si estás incluyendo o no los archivados.',
    },
    {
      q: 'Un cliente me pide el comprobante otra vez, ¿cómo se lo mando?',
      a: 'Búscalo por su nombre o RUC, entra a sus acciones y usa **Descargar PDF** (o **Imprimir ticket**). Si te pide la constancia de SUNAT, entrégale además el **CDR SUNAT**.',
    },
    {
      q: '¿Puedo cambiar la fecha de un comprobante ya emitido?',
      a: 'Solo en los que SUNAT rechazó, con **Editar fecha y reenviar a SUNAT**. Un comprobante aceptado no se le cambia la fecha: se corrige con nota de crédito.',
    },
  ],
}
