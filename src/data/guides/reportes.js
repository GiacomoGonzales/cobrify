/**
 * GUÍA DE USO: Reportes
 *
 * Nombres verificados contra src/pages/Reports.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'reportes',
  actualizado: '12/08/2026',
  intro:
    'Reportes responde las preguntas que no se ven en el día a día: qué se vende de verdad, quién compra, cuánto ganas y en qué se te va el dinero. Todo sale de tus ventas y gastos ya registrados.',

  sections: [
    {
      id: 'periodo',
      title: 'Lo primero: elegir el período',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba eliges el rango: **Hoy**, **Semana**, **Este mes**, **Trimestre**, **Este año**, **Todo** o **Personalizado** con tus fechas. Todo lo que veas abajo corresponde a ese período; si un número te sorprende, revisa primero qué rango tienes puesto.',
        },
        {
          type: 'consejo',
          text: 'Si manejas sucursales, el selector de sucursal del encabezado también filtra los reportes. Un total "que no cuadra" muchas veces es una sucursal filtrada.',
        },
      ],
    },

    {
      id: 'resumen-general',
      title: 'Resumen General',
      blocks: [
        {
          type: 'texto',
          text: 'La foto del negocio en el período: ingresos totales, cantidad de comprobantes, **Ticket Promedio**, evolución de ventas, **Top 5 Productos**, **Top 5 Categorías** y la distribución por método de pago.',
        },
        {
          type: 'texto',
          text: 'El **Ticket Promedio** es cuánto gasta en promedio cada cliente por compra. Subirlo suele ser más fácil que conseguir clientes nuevos: es la métrica que mira quien quiere vender más sin gastar en publicidad.',
        },
      ],
    },

    {
      id: 'ventas',
      title: 'Ventas: cuándo y cómo te compran',
      blocks: [
        {
          type: 'texto',
          text: 'Además del total, esta pestaña muestra **Ventas por Hora del Día** y **Qué días del mes se vende más**. Sirve para decidir horarios de personal, cuándo hacer promociones y cuándo conviene reponer.',
        },
        {
          type: 'texto',
          text: 'También tienes la **Distribución de Comprobantes** (cuánto emites de cada tipo) y el **Resumen por Método de Pago**, que es el que te dice cuánto de tu venta es efectivo y cuánto digital.',
        },
      ],
    },

    {
      id: 'productos-marcas',
      title: 'Productos y Marcas',
      blocks: [
        {
          type: 'texto',
          text: '**Productos** ordena lo que más se vende por unidades y por ingresos, con su **Distribución por Categoría**. **Marcas** hace lo mismo por marca, y al entrar en una tienes el **Detalle de marca** con el desglose por **variante**: qué tallas o colores se están vendiendo de verdad.',
        },
        {
          type: 'consejo',
          text: 'Lo más vendido en unidades no siempre es lo que más te deja. Cruza esta pestaña con **Rentabilidad** antes de decidir qué comprar más.',
        },
      ],
    },

    {
      id: 'clientes-zonas',
      title: 'Clientes y Zonas',
      blocks: [
        {
          type: 'texto',
          text: '**Clientes** te da el **Top 10 Clientes por Ingresos** y cuánto ha gastado cada uno. **Zonas** agrupa las ventas por distrito, con el **Mapa de Ventas por Departamento**, útil si haces delivery o quieres saber de dónde viene tu clientela.',
        },
      ],
    },

    {
      id: 'vendedores',
      title: 'Vendedores',
      blocks: [
        {
          type: 'texto',
          text: 'Ingresos y cantidad de ventas por vendedor, con su **Comisión** cuando la tienes configurada, y el detalle de cada uno. Las ventas sin vendedor asignado aparecen agrupadas aparte.',
        },
        {
          type: 'consejo',
          text: 'Para que este reporte sirva, hay que elegir el vendedor al cobrar en el POS. Si ves todo en "Sin vendedor asignado", ese es el motivo.',
        },
      ],
    },

    {
      id: 'rentabilidad',
      title: 'Rentabilidad: lo que de verdad ganas',
      blocks: [
        {
          type: 'texto',
          text: 'Es la pestaña más importante y la que casi nadie mira. Aquí están la **Utilidad Bruta** (ventas menos costo de la mercadería), la **Utilidad Neta** (después de gastos), el **Margen de Utilidad** y la **Evolución de la Utilidad Neta**.',
        },
        {
          type: 'ojo',
          text: 'Este reporte depende de dos cosas: que tus productos tengan **costo** cargado y que registres tus **gastos**. Si falta el costo, la utilidad sale inflada; si faltan los gastos, la utilidad neta también.',
        },
        {
          type: 'texto',
          text: 'Las compras marcadas como **activo o equipamiento** (mobiliario, equipos) no entran al Costo de Ventas: se muestran aparte, como línea informativa. Comprar una congeladora no hace que tu margen del mes se vea peor.',
        },
        {
          type: 'consejo',
          text: 'Vender más no siempre es ganar más. Si tus ventas suben y el margen baja, algo está pasando con los precios o con los costos: aquí es donde se ve.',
        },
      ],
    },

    {
      id: 'exportar',
      title: 'Descargar los reportes',
      blocks: [
        {
          type: 'texto',
          text: 'Cada pestaña tiene su botón verde de descarga en Excel: **Descargar Reporte General**, de **Ventas**, **Productos**, **Marcas**, **Clientes**, **Vendedores**, **Gastos** o **Rentabilidad**. El archivo respeta el período y la sucursal que tengas filtrados.',
        },
        { type: 'ui', kind: 'boton', label: 'Descargar Reporte General (Excel)' },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Por qué mi utilidad sale en cero o rarísima?',
      a: 'Casi siempre porque los productos no tienen **costo** cargado en su ficha. La utilidad es venta menos costo: sin costo, no hay cálculo posible. Revísalo en Productos.',
    },
    {
      q: 'Los totales de Reportes no coinciden con los de Ventas.',
      a: 'Compara los filtros: período y sucursal. También ten en cuenta que los reportes excluyen comprobantes anulados y las notas de venta ya convertidas, para no contar la misma venta dos veces.',
    },
    {
      q: '¿Las ventas anuladas cuentan?',
      a: 'No. Una venta anulada sale de los totales. Distinto es una rechazada por SUNAT: esa sigue contando como venta hasta que la anules, porque el rechazo es un tema de envío, no de si la venta ocurrió.',
    },
    {
      q: '¿Puedo ver un mes cerrado del año pasado?',
      a: 'Sí: usa **Personalizado** y pon las fechas exactas de ese mes. El historial completo está disponible.',
    },
    {
      q: '¿Cuál es la diferencia entre Utilidad Bruta y Neta?',
      a: 'La **bruta** es lo que te queda después de pagar la mercadería que vendiste. La **neta** es lo que queda después de restar además tus gastos (alquiler, sueldos, servicios). La neta es la que te dice si el negocio gana dinero.',
    },
  ],
}
