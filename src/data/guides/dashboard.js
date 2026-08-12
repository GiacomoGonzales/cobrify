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
          text: 'El ojo junto a **Ventas del Día** oculta los montos en pantalla, útil cuando alguien está mirando. Y en Configuración puedes ocultar los datos del Dashboard a los sub-usuarios, para que un cajero no vea las cifras del negocio.',
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
