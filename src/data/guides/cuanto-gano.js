/**
 * RECORRIDO: Saber cuánto ganas de verdad
 *
 * Categoría "Cómo hacer". Nace del caso real de un usuario (16-ago-2026) que
 * vendía stock comprado antes y creía tener 93% de margen. Los hechos son los
 * de la auditoría de Reportes: el costo congelado por venta, la tarjeta
 * Ganancia Final y la diferencia Rentabilidad vs margen.
 */
export default {
  id: 'cuanto-gano',
  actualizado: '16/08/2026',
  intro:
    'La pregunta más repetida del sistema: "¿cuánto gané este mes?". La respuesta existe y está calculada — la tarjeta Ganancia Final del Resumen General — pero solo dice la verdad si alimentas dos datos: el costo de tus productos y tus gastos. Este recorrido arma las tres piezas.',

  sections: [
    {
      id: 'formula',
      title: 'La cuenta completa, en una línea',
      blocks: [
        {
          type: 'texto',
          text: '**Ventas − costo de la mercadería vendida − gastos del negocio = ganancia final.** El sistema resta solo; tu trabajo es que las dos restas tengan datos de verdad.',
        },
        {
          type: 'tabla',
          encabezados: ['Pieza', 'De dónde sale', 'Si falta'],
          filas: [
            ['Ventas', 'De tus comprobantes, automático', '—'],
            ['Costo de lo vendido', 'Del costo cargado en cada producto', 'La utilidad sale INFLADA (margen 100%)'],
            ['Gastos', 'De lo que registras en Gastos', 'La ganancia sale optimista'],
          ],
        },
      ],
    },

    {
      id: 'costos',
      title: '1. Carga el costo de tus productos',
      blocks: [
        {
          type: 'pasos',
          items: [
            'En **Productos**, revisa que cada producto tenga su **costo** (lo que a ti te cuesta, no el precio de venta).',
            'Empieza por los que más vendes: ahí está casi todo el efecto.',
            'Si registras tus **compras** en el sistema, el costo se actualiza con cada compra y no tienes que mantenerlo a mano.',
          ],
        },
        {
          type: 'texto',
          text: 'Detalle que trabaja a tu favor: cada venta **congela el costo del día en que se vendió**. Corregir un costo hoy no reescribe el margen de lo que vendiste el año pasado, pero deja bien todo lo que viene — por eso conviene cargarlos cuanto antes.',
        },
        {
          type: 'consejo',
          text: 'Un margen altísimo (70%, 90%) casi nunca es una buena noticia: casi siempre significa que faltan costos por cargar. Sospecha de los números demasiado lindos.',
        },
        { type: 'enlace', to: '/app/productos', label: 'Cargar costos en Productos' },
      ],
    },

    {
      id: 'gastos',
      title: '2. Registra tus gastos, todos',
      blocks: [
        {
          type: 'texto',
          text: 'Alquiler, sueldos, luz, agua, internet, movilidad, el gasfitero. En **Gastos**, cada uno con su categoría. La disciplina acá define qué tan cierto es tu número final: si solo anotas las facturas grandes, tu ganancia "oficial" será mayor que la real, y las decisiones que tomes con ella, peores.',
        },
        {
          type: 'consejo',
          text: 'Las compras de mercadería NO van en Gastos — van en Compras, porque son costo de lo que vendes, no gasto de operación. Y si compras un activo (una congeladora, un horno), márcalo como activo: no te hunde el margen del mes.',
        },
        { type: 'enlace', to: '/app/gastos', label: 'Ir a Gastos' },
        { type: 'enlace', to: '/app/compras', label: 'Ir a Compras' },
      ],
    },

    {
      id: 'leer',
      title: '3. Lee la respuesta: la tarjeta Ganancia Final',
      blocks: [
        {
          type: 'texto',
          text: 'En **Reportes → Resumen General**, la tarjeta **Ganancia Final** trae la cuenta hecha: utilidad de lo vendido menos gastos del período, con la resta visible debajo. Si dejas el mouse encima de cualquier tarjeta, te explica qué es y de dónde sale.',
        },
        {
          type: 'texto',
          text: 'La misma cifra sale en el **Excel del Reporte General** (fila "GANANCIA FINAL"), listo para tu contador. El archivo respeta el período y la sucursal que tengas filtrados.',
        },
        { type: 'enlace', to: '/app/reportes', label: 'Ver mi Ganancia Final' },
      ],
    },

    {
      id: 'rentabilidad',
      title: 'La trampa: Rentabilidad no es tu margen',
      blocks: [
        {
          type: 'ojo',
          text: 'El reporte de **Rentabilidad** compara lo que entró contra las COMPRAS de ese mes — es una mirada de caja, no el costo de lo vendido. Si este mes vendiste stock comprado antes, ahí verás compras en cero y un "margen" del 100%: no significa que ganaste todo. Para saber cuánto ganaste sobre lo vendido, la respuesta es la Ganancia Final del Resumen General.',
        },
        {
          type: 'texto',
          text: 'Rentabilidad sirve para otra pregunta, igual de útil: "¿este mes gasté más de lo que entró?". Un restaurante que compra y vende al mismo ritmo la mira a diario; una tienda que se stockea por temporada la lee con ese lente.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Mi margen sale 100% o rarísimo.',
      a: 'Faltan costos. La utilidad es venta menos costo: sin costo cargado, el sistema asume cero y todo parece ganancia. Carga el costo de los productos que más vendes y el número aterriza.',
    },
    {
      q: 'Rentabilidad me dice una cifra y Resumen General otra. ¿Cuál creo?',
      a: 'Miden cosas distintas y las dos están bien. Rentabilidad compara contra las COMPRAS del mes (caja); Resumen General usa el costo de cada producto vendido (margen). Para "cuánto gané", hazle caso a la **Ganancia Final** del Resumen General.',
    },
    {
      q: 'Empecé con stock que compré antes de usar el sistema. ¿Cómo veo mi utilidad?',
      a: 'Carga el **costo** en la ficha de cada producto (aunque la compra sea vieja) y guíate del Resumen General, que calcula con ese costo. Rentabilidad te va a mostrar compras en cero — es normal: ese stock no se compró este mes.',
    },
    {
      q: '¿La Ganancia Final incluye lo que aún no me pagan?',
      a: 'Las ventas al crédito cuentan como venta del período aunque no estén cobradas. Para ver cuánto de tu ganancia sigue en la calle, cruza con **Estados de Pago** en el mismo Resumen General.',
    },
    {
      q: '¿Compré una congeladora y mi mes salió pésimo?',
      a: 'Marca esa compra como **activo o equipamiento**: sale del costo de ventas y se muestra aparte. Un horno no es mercadería vendida y no debería hundir el margen del mes.',
    },
  ],
}
