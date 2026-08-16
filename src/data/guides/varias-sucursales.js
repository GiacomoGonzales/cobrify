/**
 * RECORRIDO: Trabajar con varias sucursales
 *
 * Categoría "Cómo hacer". Hechos verificados 16/08/2026:
 *  - Las sucursales viven en businesses/{id}/branches y las habilita el
 *    ADMINISTRADOR del sistema (branchService.js: "puntos de venta/emisión
 *    configurados por el admin"); el dueño no tiene botón de crear sucursal.
 *  - El selector del header (branchScope) filtra las páginas operativas.
 *  - Series por Sucursal en Configuración → Series (por almacén).
 *  - branchPricingEnabled y branchCatalogEnabled con ancla verificada.
 */
export default {
  id: 'varias-sucursales',
  actualizado: '16/08/2026',
  intro:
    'Cuando abres tu segundo local, la pregunta cambia de "cuánto vendí" a "cuánto vendió CADA local, con qué stock y con qué series". Este recorrido arma la operación multi-sede completa: qué configura cada cosa y dónde.',

  sections: [
    {
      id: 'modelo',
      title: 'Primero: sucursal no es lo mismo que almacén',
      blocks: [
        {
          type: 'tabla',
          encabezados: ['Concepto', 'Qué es'],
          filas: [
            ['Sucursal', 'Un punto de venta y emisión: tiene sus series, sus ventas, su caja, sus mesas'],
            ['Almacén', 'Un lugar donde vive stock. Cada sucursal tiene uno o más almacenes'],
          ],
        },
        {
          type: 'texto',
          text: 'La distinción importa porque el stock se mueve entre **almacenes** (transferencias), mientras que las ventas, las series y los reportes se separan por **sucursal**.',
        },
        {
          type: 'ojo',
          text: 'Las sucursales las **habilita tu proveedor del sistema** — no hay botón de "nueva sucursal" en tu cuenta. Cuando abras un local nuevo, pídela; los almacenes de esa sucursal sí los creas y administras tú.',
        },
        { type: 'enlace', to: '/app/almacenes', label: 'Ir a Almacenes' },
      ],
    },

    {
      id: 'selector',
      title: 'El selector del encabezado manda en todo',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba, junto a tu nombre, está el **selector de sucursal**. Es UNO solo y manda en todas las páginas operativas: el POS vende en esa sucursal, Ventas muestra lo de esa sucursal, Caja abre la caja de esa sucursal, Reportes filtra por ella. Cambias ahí y toda la aplicación te sigue.',
        },
        {
          type: 'consejo',
          text: 'Cuando un total "no cuadra" o "faltan ventas", lo primero que hay que mirar es este selector. La mitad de los sustos multi-sede son estar parado en la sucursal equivocada.',
        },
      ],
    },

    {
      id: 'series',
      title: 'Series por sucursal: cada local emite lo suyo',
      blocks: [
        {
          type: 'texto',
          text: 'Dos locales emitiendo con el mismo RUC **no pueden compartir serie**: generarían correlativos duplicados y SUNAT los rechaza. En **Configuración → Series** le das a cada almacén sus propias series (B001 y F001 para el principal, B002 y F002 para el segundo, y así).',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=series',
          label: 'Configurar Series por Sucursal',
        },
        {
          type: 'texto',
          text: 'Cada sucursal puede llevar además su propio **nombre comercial** y dirección en sus datos, para que los tickets salgan con la identidad del local que vendió.',
        },
      ],
    },

    {
      id: 'precios-catalogo',
      title: 'Precios y catálogo distintos por local (opcional)',
      blocks: [
        {
          type: 'texto',
          text: 'Dos funciones que se activan solo si las necesitas:',
        },
        {
          type: 'pasos',
          items: [
            '**Precios de venta por sucursal**: el mismo producto cuesta distinto según el local — útil cuando el alquiler o el flete cambian tus costos por zona.',
            '**Catálogo de productos por sucursal**: cada local muestra solo lo que vende. Ojo: esto **filtra lo que se ve, nunca descuenta stock** — el inventario sigue siendo el de los almacenes.',
          ],
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=branchPricingEnabled',
          label: 'Activar precios por sucursal',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=branchCatalogEnabled',
          label: 'Activar catálogo por sucursal',
        },
      ],
    },

    {
      id: 'usuarios',
      title: 'Tu personal: cada quien en su sede',
      blocks: [
        {
          type: 'texto',
          text: 'En **Usuarios**, a cada sub-usuario le asignas sus **sucursales y almacenes permitidos**: el cajero del local 2 entra y trabaja directamente sobre su sede, sin ver el resto en su día a día.',
        },
        {
          type: 'ojo',
          text: 'La asignación de sucursal **organiza la operación**, no es una bóveda: si lo que te preocupa es que el personal vea cifras del negocio, eso se maneja aparte con las opciones de privacidad (ocultar totales a secundarios, cierre de caja a ciegas).',
        },
        { type: 'enlace', to: '/app/usuarios', label: 'Ir a Usuarios' },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=hideDashboardDataFromSecondary',
          label: 'Ocultar totales a secundarios',
        },
      ],
    },

    {
      id: 'stock',
      title: 'El stock entre locales',
      blocks: [
        {
          type: 'pasos',
          items: [
            'El stock de cada producto vive **por almacén**: en Productos e Inventario ves el desglose.',
            'Para mandar mercadería de un local a otro usa las **transferencias entre almacenes** de Inventario: descuentan de origen y suman en destino, con su registro.',
            'Las ventas de cada sucursal descuentan del almacén de esa sucursal, automáticamente.',
          ],
        },
        { type: 'enlace', to: '/app/inventario', label: 'Ir a Inventario' },
      ],
    },

    {
      id: 'restaurante',
      title: 'Si eres restaurante multi-sede',
      soloModos: ['restaurant'],
      blocks: [
        {
          type: 'texto',
          text: 'Las **mesas, las órdenes y la cocina también se separan por sucursal**: cada local ve su salón y sus comandas. Los mozos y repartidores se asignan a su sede, así el local 1 no le "presta" mozos fantasma al 2 en los reportes.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Cómo agrego una sucursal nueva?',
      a: 'Pídesela a tu proveedor del sistema: las sucursales se habilitan desde la administración. Una vez creada, tú le configuras sus almacenes, sus series y su personal.',
    },
    {
      q: 'Los reportes me muestran menos ventas de las que hice.',
      a: 'Revisa el selector de sucursal del encabezado: probablemente está filtrando una sola sede. Para el consolidado, selecciona todas.',
    },
    {
      q: '¿Puedo vender en el local 2 con stock del almacén del local 1?',
      a: 'La venta descuenta del almacén de la sucursal donde se emite. Si la mercadería está físicamente en otro local, primero haz la transferencia entre almacenes — así el sistema cuenta lo mismo que la realidad.',
    },
    {
      q: '¿Cada local necesita su propia caja?',
      a: 'Cada sucursal maneja sus propias sesiones de caja, y dentro de una sucursal puedes tener además cajeros con caja independiente. El arqueo siempre es por sesión.',
    },
    {
      q: '¿Las dos sucursales pueden compartir la serie B001?',
      a: 'No, si emiten con el mismo RUC: los correlativos chocarían y SUNAT rechaza los duplicados. Series distintas por sucursal — para eso existen.',
    },
  ],
}
