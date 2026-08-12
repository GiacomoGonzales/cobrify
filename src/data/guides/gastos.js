/**
 * GUÍA DE USO: Gastos
 *
 * Nombres verificados contra src/pages/Expenses.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'gastos',
  actualizado: '12/08/2026',
  intro:
    'Gastos es el otro lado de la moneda: lo que sale del negocio. Sin esto, tus reportes muestran cuánto vendiste pero no cuánto te quedó, que es lo que en realidad importa.',

  sections: [
    {
      id: 'registrar',
      title: 'Registrar un gasto',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Nuevo Gasto**.',
            'Escribe la descripción (por ejemplo "Pago de luz del mes") y el monto.',
            'Elige la **categoría**: Servicios (luz, agua, internet), Sueldos y Salarios, Transporte, Gastos Operativos, entre otras.',
            'Si tienes el comprobante, anota el número de factura o recibo y el proveedor.',
            'Guarda.',
          ],
        },
        { type: 'ui', kind: 'boton', label: 'Nuevo Gasto' },
        {
          type: 'consejo',
          text: 'Categorizar bien desde el principio es lo que hace útil el reporte de **Gastos por categoría**. Si mandas todo a "Otros", después no vas a poder decidir dónde recortar.',
        },
      ],
    },

    {
      id: 'analizar',
      title: 'Ver en qué se te va el dinero',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba tienes **Total Gastos**, **Promedio diario** y **Top categoría** del período elegido. Más abajo, el gráfico de **Gastos por categoría** y la **Evolución últimos 6 meses**, que es donde se ven las tendencias.',
        },
        {
          type: 'texto',
          text: 'El filtro de **Período** cambia todo lo que ves; el buscador acepta descripción, proveedor o referencia.',
        },
        {
          type: 'consejo',
          text: 'La evolución de 6 meses sirve para detectar el gasto que creció sin que te dieras cuenta. Un aumento de a poco cada mes no se nota en el día a día pero sí en el gráfico.',
        },
      ],
    },

    {
      id: 'moneda',
      title: 'Gastos en dólares',
      blocks: [
        {
          type: 'texto',
          text: 'Puedes registrar un gasto en **USD** eligiendo la **Moneda del gasto**. El sistema pide el tipo de cambio y puede traer el del día desde la **SBS** con un botón. Ese tipo de cambio queda guardado con el gasto, así que el monto en soles no cambia después aunque el dólar se mueva.',
        },
      ],
    },

    {
      id: 'exportar',
      title: 'Exportar a Excel',
      blocks: [
        {
          type: 'texto',
          text: 'El botón **Excel** descarga los gastos del período con sus categorías, montos y referencias. Es lo que tu contador necesita para cruzar con tus comprobantes de compra.',
        },
      ],
    },

    {
      id: 'gastos-y-sucursales',
      title: 'Gastos generales y por sucursal',
      blocks: [
        {
          type: 'texto',
          text: 'Si tienes sucursales, un gasto puede pertenecer a una sucursal concreta o ser **general** del negocio (el alquiler de la oficina, la contabilidad). Los gastos generales son visibles para todos, porque no le corresponden a ninguna sede en particular.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Los gastos se descuentan de mi caja?',
      a: 'No automáticamente: son dos registros distintos. El dinero que sale físicamente de la caja se registra como **Egreso** en Control de Caja; el gasto acá es el registro contable del negocio. Si pagaste la luz con dinero de la caja, corresponde anotar ambos.',
    },
    {
      q: '¿Registro acá las compras de mercadería?',
      a: 'No. La mercadería que vas a revender va por **Compras**, porque además de costar dinero suma stock a tu inventario. Gastos es para lo que se consume y no se vende: servicios, sueldos, alquiler, transporte.',
    },
    {
      q: '¿Dónde veo cuánto gané de verdad?',
      a: 'En **Reportes** y en **Flujo de Caja**: ahí se cruzan tus ventas con tus gastos. Por eso importa registrar los gastos: sin ellos, la utilidad que muestra el sistema está inflada.',
    },
    {
      q: 'Registré un gasto con el monto equivocado.',
      a: 'Búscalo en la lista y edítalo o elimínalo. No queda comprometido con SUNAT, así que se corrige libremente.',
    },
  ],
}
