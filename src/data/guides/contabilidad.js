/**
 * GUÍA DE USO: Contabilidad
 *
 * Nombres verificados contra src/pages/Accounting.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'contabilidad',
  actualizado: '13/09/2026',
  intro:
    'Contabilidad es lo que le entregas a tu contador cada mes: los comprobantes electrónicos que enviaste a SUNAT, con sus totales, en el formato que él necesita.',

  sections: [
    {
      id: 'periodo',
      title: 'Elegir el mes',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba, en **Período**, eliges el año y el mes. Todo lo que ves y todo lo que descargas es de ese período; con **Todos los meses** tomas el año entero.',
        },
        {
          type: 'texto',
          text: 'Cada comprobante muestra su estado ante SUNAT: **Aceptado**, **Pendiente**, **Rechazado** o **Anulado**.',
        },
        {
          type: 'consejo',
          text: 'Si tu negocio emite con más de un RUC, aquí se trabaja con **un RUC a la vez**: elige cuál antes de descargar, y cada archivo sale solo con ese RUC.',
        },
      ],
    },

    {
      id: 'descargar',
      title: 'Qué le puedes entregar a tu contador',
      blocks: [
        { type: 'ui', kind: 'boton', label: 'Descargar' },
        {
          type: 'tabla',
          headers: ['Opción', 'Qué es'],
          rows: [
            ['Excel de comprobantes', 'Todos los comprobantes del período con su desglose: gravado, exonerado, inafecto, IGV y total.'],
            ['TXT para el contador', 'El registro de ventas en texto, para que lo importe a su sistema contable.'],
            ['Formato 13.1 SUNAT', 'El inventario permanente valorizado: el kardex del mes.'],
            ['XMLs y CDRs', 'Los archivos que se enviaron a SUNAT y sus constancias de recepción.'],
            ['Todo en un ZIP', 'PDFs, XMLs y CDRs juntos.'],
          ],
        },
        {
          type: 'texto',
          text: 'Los comprobantes **anulados** y los **rechazados** por SUNAT aparecen en el Excel con su estado, pero van en cero y no suman en los totales: no son ventas. Su detalle está en la hoja **Anulados-Rechazados**.',
        },
      ],
    },

    {
      id: 'txt',
      title: 'El TXT para el sistema del contador',
      blocks: [
        {
          type: 'texto',
          text: 'Muchos contadores cargan las ventas a su sistema desde un archivo de texto. **TXT para el contador** lo arma con el registro de ventas del período, una línea por comprobante:',
        },
        {
          type: 'pasos',
          items: [
            'Las **boletas** de un mismo día van juntas en una línea "VENTAS DEL DIA", con el rango de números (por ejemplo B001-00001892 a B001-00001894).',
            'Las **facturas** van una por una, con el RUC y la razón social del cliente.',
            'Las **notas de crédito** restan, y llevan el comprobante que corrigen.',
            'Los comprobantes **anulados** aparecen con importes en cero, para que la numeración no tenga huecos. Los **rechazados** por SUNAT no van, porque no llegaron a existir.',
          ],
        },
        {
          type: 'ojo',
          text: 'Los montos son los mismos del Excel de comprobantes: la base gravada va sin IGV. Si tu contador cruza los dos archivos, tienen que sumar lo mismo.',
        },
        {
          type: 'consejo',
          text: 'Si el sistema de tu contador no reconoce el archivo, pídele un ejemplo del formato que usa y compártelo con soporte.',
        },
      ],
    },
  ],
}
