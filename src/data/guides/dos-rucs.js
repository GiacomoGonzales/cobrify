/**
 * RECORRIDO: Vender con dos RUC en el mismo local
 *
 * Categoría "Cómo hacer". Hechos verificados 10/09/2026 (Varios RUC, fase 3):
 *  - Los RUC adicionales los configura el ADMINISTRADOR del sistema en la ficha
 *    de la cuenta (función "Varios RUC" + sección Emisores), con sus
 *    credenciales de SUNAT o QPse y sus series. El dueño no tiene botón.
 *  - POS: "Emitir con" junto al tipo de comprobante; el equipo recuerda la
 *    última elección; "Se emite con ..." encima de Procesar Venta.
 *  - Notas de crédito/débito y conversión de notas de venta heredan el RUC.
 *  - Ticket, PDF y WhatsApp salen con los datos del RUC del comprobante.
 *  - Configuración > Series muestra las series de cada RUC (solo lectura).
 *  - Guías, cotizaciones, comprobante manual, emisión masiva y chat: principal.
 *  - Fase 4: Ventas (lista y Excel), Contabilidad, Reportes y el cierre de
 *    caja separan por RUC. Contabilidad no tiene "todos": un RUC a la vez.
 */
export default {
  id: 'dos-rucs',
  actualizado: '10/09/2026',
  intro:
    'Hay locales que venden con dos RUC: la empresa emite las facturas y la persona natural del Nuevo RUS las boletas, o dos empresas de la familia comparten la tienda. Con Varios RUC usas un solo sistema —el mismo stock, los mismos productos y clientes— y eliges con qué RUC sale cada comprobante.',

  sections: [
    {
      id: 'que-cambia',
      title: 'Qué es de cada RUC y qué se comparte',
      blocks: [
        {
          type: 'tabla',
          encabezados: ['Se comparte', 'Es de cada RUC'],
          filas: [
            ['Productos, stock y precios', 'Razón social, dirección y cuentas bancarias'],
            ['Clientes', 'Series y numeración'],
            ['Caja, sucursales y usuarios', 'Régimen (general, exonerado, Nuevo RUS)'],
            ['El cupo mensual de comprobantes del plan', 'Credenciales de SUNAT o QPse'],
          ],
        },
        {
          type: 'ojo',
          text: 'Cada RUC lo **configura tu proveedor del sistema**: sus credenciales de emisión y sus series. No hay botón para agregar un RUC desde tu cuenta; pídelo cuando lo necesites.',
        },
      ],
    },

    {
      id: 'vender',
      title: 'Vender con el otro RUC',
      blocks: [
        {
          type: 'pasos',
          items: [
            'En el POS, junto al **Tipo de comprobante**, aparece **Emitir con**. Elige el RUC.',
            'Los comprobantes y el régimen cambian con el RUC: un RUC del Nuevo RUS solo emite **boletas y notas de venta**, a precio final.',
            'Cobra como siempre. Encima de **Procesar Venta** se lee con qué razón social y RUC sale el comprobante.',
          ],
        },
        {
          type: 'consejo',
          text: 'Cada equipo recuerda el último RUC que elegiste. Si una caja vende siempre con el mismo, lo eliges una vez y queda.',
        },
        {
          type: 'ojo',
          text: 'Mira el RUC antes de cobrar: un comprobante emitido con el RUC equivocado no se cambia. Se anula y se vuelve a emitir con el correcto.',
        },
      ],
    },

    {
      id: 'numeracion',
      title: 'Cada RUC con su numeración',
      blocks: [
        {
          type: 'texto',
          text: 'Cada RUC numera con sus **propias series** (por ejemplo B101 y F101) y ninguna se repite en la cuenta. Las ves en **Configuración → Series**, en "Otros RUC de la cuenta". Si intentas ponerle al negocio o a una sucursal una serie que ya usa otro RUC, el sistema no la guarda.',
        },
        { type: 'enlace', to: '/app/configuracion?tab=series', label: 'Ver las series' },
      ],
    },

    {
      id: 'notas',
      title: 'Notas de crédito, débito y conversiones',
      blocks: [
        {
          type: 'texto',
          text: 'Una nota de crédito o de débito sale **siempre con el RUC del comprobante que modifica**, con sus series. No hay que elegir nada. Lo mismo al convertir una nota de venta en boleta o factura: hereda su RUC.',
        },
        {
          type: 'texto',
          text: 'Solo la nota de crédito de un **documento externo** (emitido en otro sistema) te pregunta con qué RUC sale: elige el mismo que emitió el original.',
        },
        {
          type: 'ojo',
          text: 'Al convertir varias notas de venta en un solo comprobante, tienen que ser del mismo RUC. Si mezclas, el sistema te pide convertirlas por separado.',
        },
      ],
    },

    {
      id: 'impresion',
      title: 'Tickets, PDF y Ventas',
      blocks: [
        {
          type: 'texto',
          text: 'El ticket, el PDF y el mensaje de WhatsApp salen con la **razón social, la dirección y las cuentas bancarias del RUC que emitió**. Reimprimir desde Ventas también.',
        },
        {
          type: 'texto',
          text: 'En **Ventas**, debajo del número de cada comprobante se ve su RUC. Anular funciona igual que siempre: la baja sale con el RUC del comprobante.',
        },
      ],
    },

    {
      id: 'reportes',
      title: 'Lo de cada RUC, para su contador',
      blocks: [
        {
          type: 'texto',
          text: 'En **Ventas** eliges el RUC en el desplegable "Todos los RUC": la lista y los totales de arriba muestran solo lo de ese RUC. Al exportar a Excel también eliges el RUC, y el **Registro de Ventas** sale con su RUC y su razón social en la cabecera. Si exportas todos juntos, cada fila lleva su RUC en una columna.',
        },
        {
          type: 'texto',
          text: 'En **Contabilidad** se trabaja siempre con un RUC a la vez: los XML, los CDR y el Excel que le entregas al contador son solo de ese RUC, y los archivos llevan el RUC en el nombre.',
        },
        {
          type: 'texto',
          text: 'En **Reportes** el mismo desplegable filtra todas las pestañas, y el Excel sale con los datos del RUC elegido. En Rentabilidad, las ventas son del RUC elegido, pero los gastos y las compras son de toda la cuenta.',
        },
        {
          type: 'texto',
          text: 'El **cierre de caja** es uno solo, porque la caja es la misma. Debajo del total vendido dice cuánto se vendió con cada RUC, en la pantalla y en el ticket.',
        },
      ],
    },

    {
      id: 'limites',
      title: 'Lo que tienes que saber',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Las **guías de remisión**, las **cotizaciones**, el comprobante manual y la emisión masiva salen con el RUC principal.',
            'El cupo mensual de comprobantes de tu plan es **uno para todos los RUC**.',
          ],
        },
      ],
    },
  ],
}
