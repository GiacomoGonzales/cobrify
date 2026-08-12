/**
 * GUÍA DE USO: Vendedores
 *
 * Nombres verificados contra src/pages/Sellers.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'vendedores',
  actualizado: '12/08/2026',
  intro:
    'Vendedores sirve para saber quién vendió qué. Es una lista aparte de los usuarios del sistema: un vendedor puede no tener cuenta, y una cuenta puede no ser vendedora.',

  sections: [
    {
      id: 'vendedor-vs-usuario',
      title: 'Vendedor no es lo mismo que usuario',
      blocks: [
        {
          type: 'texto',
          text: 'Un **usuario** es quien entra al sistema con su correo y contraseña. Un **vendedor** es a quién se le atribuye la venta. Suelen coincidir, pero no siempre: puedes tener vendedores en el mostrador que no usan el sistema, y cobrar tú todas sus ventas desde la misma caja.',
        },
        {
          type: 'consejo',
          text: 'Por eso el vendedor se elige en el POS al cobrar: es un dato de la venta, no de quién está logueado.',
        },
      ],
    },

    {
      id: 'registrar',
      title: 'Registrar vendedores',
      blocks: [
        {
          type: 'texto',
          text: 'Cada vendedor se registra con su **Nombre**, su **Código** y su **Contacto**. Puedes ponerle una **Meta** de ventas y un porcentaje de **Comisión**, y dejarlo **Activo** o inactivo cuando ya no trabaje contigo.',
        },
      ],
    },

    {
      id: 'seguimiento',
      title: 'Ver cómo va cada uno',
      blocks: [
        {
          type: 'texto',
          text: 'La pantalla muestra **Ventas Hoy** y **Órdenes Hoy** por vendedor, y el **Total Ventas** del período que elijas. Entrando a cada uno ves su detalle de ventas.',
        },
        {
          type: 'texto',
          text: 'Para el análisis completo, la pestaña **Vendedores** de **Reportes** cruza ingresos, cantidad de ventas y comisiones, y se puede exportar a Excel.',
        },
        {
          type: 'ojo',
          text: 'Para que todo esto funcione hay que elegir el vendedor al cobrar en el POS. Si en los reportes ves todo agrupado en "Sin vendedor asignado", es porque no se está seleccionando.',
        },
      ],
    },

    {
      id: 'comisiones',
      title: 'Comisiones',
      blocks: [
        {
          type: 'texto',
          text: 'Si le defines un porcentaje de comisión, cada venta guarda la comisión calculada **en el momento de venderse**. Eso significa que cambiar el porcentaje hoy no altera lo ya vendido: las comisiones pasadas quedan como se acordaron entonces.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Mis reportes por vendedor salen vacíos.',
      a: 'Porque no se está eligiendo el vendedor al cobrar. Está en el panel derecho del POS, arriba, junto al almacén.',
    },
    {
      q: '¿Tengo que crear un usuario para cada vendedor?',
      a: 'No. Un vendedor puede existir solo como nombre al que se le atribuyen ventas. Crea usuarios solo para quienes necesitan entrar al sistema.',
    },
    {
      q: 'Un vendedor se fue del negocio.',
      a: 'Márcalo como inactivo en vez de eliminarlo: deja de aparecer en el POS pero conservas su historial de ventas y comisiones.',
    },
  ],
}
