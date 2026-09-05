/**
 * GUÍA DE USO: Dashboard
 *
 * Nombres verificados contra src/pages/Dashboard.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'dashboard',
  actualizado: '12/08/2026',
  intro:
    'El Dashboard es la primera pantalla al entrar: cómo va el día, cómo va el mes y qué se está vendiendo. Está pensado para mirarlo 30 segundos y saber si todo va bien.',

  sections: [
    {
      id: 'empieza-aca',
      title: 'Empieza por acá',
      blocks: [
        {
          type: 'texto',
          text: 'Si es tu primera vez, esta es la puerta de entrada. El sistema se organiza en cuatro cosas, y casi todo lo que vas a hacer cae en una de ellas:',
        },
        {
          type: 'pasos',
          items: [
            '**Vender** — el Punto de Venta, donde emites boletas, facturas y notas de venta.',
            '**Tu mercadería** — Productos e Inventario: qué vendes, a qué precio y cuánto te queda.',
            '**Tu dinero** — Caja, Gastos y Reportes: qué entró, qué salió y cuánto ganaste.',
            '**Tus documentos** — Ventas, Compras y todo lo que viaja a SUNAT.',
          ],
        },
        {
          type: 'consejo',
          text: 'El orden que menos problemas da al empezar: primero carga tus **productos** con su precio y su stock, después haz una **venta de prueba** en el POS, y recién ahí ajusta la Configuración. Configurar antes de vender lleva a activar cosas que todavía no sabes si necesitas.',
        },
        {
          type: 'enlace',
          to: '/app/manual/productos',
          label: '1. Cargar mis productos',
        },
        {
          type: 'enlace',
          to: '/app/manual/pos',
          label: '2. Hacer mi primera venta',
        },
        {
          type: 'enlace',
          to: '/app/manual/caja',
          label: '3. Abrir y cerrar la caja del día',
        },
        {
          type: 'texto',
          text: 'Cada pantalla del sistema tiene su propia guía: el botón **?** del encabezado abre la que corresponde a donde estás parado. En **Manual de uso**, en el menú lateral, están todas juntas y con buscador.',
        },
        {
          type: 'enlace',
          to: '/app/manual',
          label: 'Ver el manual completo',
        },
      ],
    },

    {
      id: 'tarjetas',
      title: 'Las cuatro tarjetas de arriba',
      blocks: [
        {
          type: 'pasos',
          items: [
            '**Ventas del Día**: lo vendido hoy, con el porcentaje comparado contra ayer.',
            '**Ventas del Mes**: el acumulado desde el día 1, comparado con el mes anterior.',
            '**N° Ventas (mes)**: cuántos comprobantes emitiste.',
            '**Ticket Promedio (mes)**: cuánto gasta en promedio cada cliente por compra.',
          ],
        },
        {
          type: 'consejo',
          text: 'El **Ticket Promedio** es el número más accionable de los cuatro: subirlo (con combos, sugerencias o productos complementarios) suele ser más barato que conseguir clientes nuevos.',
        },
      ],
    },

    {
      id: 'graficos',
      title: 'Los gráficos',
      blocks: [
        {
          type: 'texto',
          text: 'Debajo tienes **Ventas de los últimos 7 días**, **Ventas del mes** día por día, la curva de los **Últimos 12 meses** y **Cómo te pagaron este mes** (la distribución por método de pago).',
        },
        {
          type: 'texto',
          text: 'También los **Top productos del mes** (por unidades vendidas) y los **Top clientes del mes** (por monto comprado), más las **Facturas Recientes** con su estado de pago.',
        },
        {
          type: 'consejo',
          text: 'La curva de 12 meses es la que muestra si el negocio crece de verdad. El día a día sube y baja demasiado como para sacar conclusiones.',
        },
      ],
    },

    {
      id: 'clinica',
      title: 'En modo Clínica',
      soloModos: ['clinic'],
      blocks: [
        {
          type: 'texto',
          text: 'Debajo de las tarjetas aparece **Hoy en la clínica**: cuántas citas hay hoy (por confirmar, confirmadas, en atención, completadas) y las próximas cinco con su hora, paciente, tratamiento y quién atiende. Se actualiza sola cuando alguien agenda, desde el mostrador o desde el catálogo.',
        },
        {
          type: 'texto',
          text: 'Al lado, **Por cobrar**: la suma de lo que los pacientes todavía deben (tratamientos pagados en partes). **Ver en Ventas** lleva a los comprobantes con saldo, donde se registra cada abono.',
        },
        { type: 'enlace', to: '/app/agenda', label: 'Ir a la Agenda' },
      ],
    },

    {
      id: 'restaurante',
      title: 'En modo restaurante',
      soloModos: ['restaurant'],
      blocks: [
        {
          type: 'texto',
          text: 'La tarjeta del día se abre en tres: **Cerrado** (lo ya cobrado), **Abierto (mesas)** (lo que está consumiéndose y aún no se cobra) y el **Total proyectado**. Así sabes cuánto llevas de verdad aunque el salón esté lleno.',
        },
      ],
    },

    {
      id: 'sucursales-privacidad',
      title: 'Sucursales y privacidad',
      blocks: [
        {
          type: 'texto',
          text: 'Si tienes sucursales, el selector del encabezado cambia todo el Dashboard: puedes ver una sede o la vista consolidada de todas.',
        },
        {
          type: 'texto',
          text: 'El ojo junto a **Ventas del Día** oculta los montos en pantalla, útil cuando alguien está mirando por encima del hombro. Los reemplaza por asteriscos sin tocar ningún dato.',
        },
        {
          type: 'ojo',
          text: 'Ese ojo **se queda como lo dejaste** en ese equipo, incluso si cierras sesión. Si un día entras y todo aparece en asteriscos, no se rompió nada: quedó oculto de antes. Vuelve a tocarlo.',
        },
        {
          type: 'texto',
          text: 'Aparte, puedes ocultarle a tus **sub-usuarios** los datos del Dashboard, para que un cajero pueda vender sin ver las cifras del negocio.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=documentos&opcion=hideDashboardDataFromSecondary',
          label: 'Ocultar el Dashboard a los sub-usuarios',
        },
        {
          type: 'texto',
          text: 'Y si un usuario está asignado como **vendedor**, el Dashboard le muestra solo sus propias ventas. No es un error ni un permiso mal puesto: es para que cada vendedor mida lo suyo.',
        },
      ],
    },

    {
      id: 'moneda',
      title: 'Si vendes en dólares',
      blocks: [
        {
          type: 'texto',
          text: 'Con el soporte multi-divisa activo, las tarjetas pueden mostrar una línea extra: **+ $ X USD (incluido en el total)**. No es un monto aparte que haya que sumar — es cuánto de ese total se cobró en dólares, convertido y ya contado adentro.',
        },
        {
          type: 'texto',
          text: 'Puedes elegir en qué moneda quieres leer el Dashboard y los reportes. Es solo la moneda en que **se muestran** los números: no cambia nada de lo emitido ni de lo declarado.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=reportsCurrency',
          label: 'Elegir la moneda de mis reportes',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Las ventas del día no coinciden con lo que dice la página Ventas.',
      a: 'Revisa dos cosas: la sucursal seleccionada en el encabezado, y que la página Ventas tenga el filtro en **Hoy**. Ambas pantallas cuentan lo mismo cuando miran el mismo rango y la misma sede.',
    },
    {
      q: 'El Dashboard tarda en cargar.',
      a: 'Carga por tramos: primero hoy, después el mes y por último el mes anterior. Los números del día aparecen enseguida y los comparativos se completan solos en unos segundos.',
    },
    {
      q: '¿Las notas de venta cuentan?',
      a: 'Sí, cuentan como ventas. Las que ya convertiste a boleta o factura no se cuentan dos veces, y las anuladas no cuentan.',
    },
    {
      q: 'Un vendedor entra y no ve nada.',
      a: 'Puede estar activada la opción de ocultar los datos del Dashboard a los sub-usuarios, o su usuario tiene el acceso limitado a ciertas sucursales.',
    },
  ],
}
