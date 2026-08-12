/**
 * GUÍA DE USO: Control de Caja
 *
 * Nombres verificados contra src/pages/CashRegister.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'caja',
  actualizado: '12/08/2026',
  intro:
    'Control de Caja es el ritual de apertura y cierre del día: cuánto empezaste, qué entró y salió, y si al final el dinero cuadra con lo que el sistema esperaba.',

  sections: [
    {
      id: 'abrir',
      title: 'Abrir la caja',
      blocks: [
        {
          type: 'texto',
          text: 'Al empezar el día presionas **Abrir Caja** y declaras el **Monto Inicial**: el dinero con el que arrancas (el sencillo para dar vuelto). Si trabajas con Yape, Plin o dólares, puedes declarar también su saldo inicial por separado.',
        },
        { type: 'ui', kind: 'boton', label: 'Abrir Caja' },
        {
          type: 'consejo',
          text: 'Declara el monto inicial real, aunque sean S/ 50. Si pones cero teniendo sencillo, al cerrar te va a salir un sobrante que no existe.',
        },
      ],
    },

    {
      id: 'durante-el-dia',
      title: 'Durante el día: movimientos adicionales',
      blocks: [
        {
          type: 'texto',
          text: 'Las ventas entran solas a la caja. Los **Movimientos Adicionales** son para el dinero que se mueve por fuera de una venta: un **Ingreso** (un cobro a cliente, un aporte) o un **Egreso** (pagar un delivery, comprar sencillo, sacar dinero).',
        },
        {
          type: 'pasos',
          items: [
            'Presiona registrar movimiento.',
            'Elige si es **Ingreso** o **Egreso**.',
            'Pon el monto, el **Método** (efectivo, Yape, tarjeta) y el **Motivo**.',
            'Guarda: queda en los **Movimientos de la Sesión** con hora y usuario.',
          ],
        },
        {
          type: 'ojo',
          text: 'Todo lo que sacas de la caja tiene que quedar registrado como egreso. Es la causa número uno de faltantes al cerrar: dinero que salió y nadie anotó.',
        },
      ],
    },

    {
      id: 'cerrar',
      title: 'Cerrar la caja y el arqueo',
      blocks: [
        {
          type: 'texto',
          text: 'Al final del turno presionas **Cerrar Caja** y haces el **Arqueo de Cierre**: cuentas el dinero físico y anotas el **Efectivo Contado**. El sistema compara contra el **Efectivo Esperado** y muestra la **Diferencia**.',
        },
        {
          type: 'texto',
          text: 'El efectivo esperado sale de una fórmula simple: monto inicial + ventas en efectivo + ingresos − egresos. Si tienes Yape, Plin, tarjeta o dólares, cada fondo se arquea por separado.',
        },
        {
          type: 'texto',
          text: 'Cerrada la caja, puedes descargar o imprimir la **Constancia de Caja** con todo el detalle de la sesión.',
        },
        {
          type: 'consejo',
          text: 'Si la diferencia sale grande, antes de asumir un descuadre revisa los **Movimientos de la Sesión**: casi siempre falta registrar un egreso, o una venta se cobró por un método distinto al que dice el sistema.',
        },
      ],
    },

    {
      id: 'cierre-a-ciegas',
      title: 'Cierre a ciegas (para cajeros)',
      requiereOpcion: {
        flag: 'hideCashExpectedFromCashier',
        nombre: 'ocultar el "Efectivo Esperado" a sub-usuarios',
        donde: 'Configuración > Documentos',
        ruta: '/app/configuracion?tab=documentos&opcion=hideCashExpectedFromCashier',
        defaultOn: false,
      },
      blocks: [
        {
          type: 'texto',
          text: 'Con esta opción activa, los sub-usuarios no ven el efectivo esperado ni la diferencia al cerrar: solo cuentan lo que hay y lo reportan. Tú como dueño sí ves todo.',
        },
        {
          type: 'consejo',
          text: 'Sirve para que el conteo sea honesto: si el cajero ve el monto que "debería" haber, la tentación de cuadrarlo a mano existe.',
        },
      ],
    },

    {
      id: 'historial',
      title: 'Historial de cajas',
      blocks: [
        {
          type: 'texto',
          text: 'La pestaña **Historial de Cajas** guarda todos los cierres anteriores: quién abrió, quién cerró, cuánto vendió cada sesión y qué diferencia hubo. Puedes filtrar por mes y por usuario.',
        },
        {
          type: 'texto',
          text: 'La **Diferencia Acumulada** te dice si los descuadres son un accidente aislado o un patrón que se repite.',
        },
      ],
    },

    {
      id: 'varias-cajas',
      title: 'Si tienes varias cajas o sucursales',
      blocks: [
        {
          type: 'texto',
          text: '**Mi Caja** muestra la sesión que tienes abierta tú. **Vista General** muestra todas las cajas del negocio a la vez, útil cuando tienes varios puntos de cobro o sucursales y quieres ver el día completo.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Cerré la caja con un error, ¿puedo corregirla?',
      a: 'Los cierres quedan en el historial como constancia. Si el negocio permite editar el cuadre, puedes ajustarlo desde el historial; si esa opción está bloqueada en Configuración, el cierre es definitivo y lo que corresponde es dejar la observación.',
    },
    {
      q: 'Me sale faltante todos los días, ¿qué reviso?',
      a: 'Casi siempre son egresos no registrados (propinas, delivery, compras de sencillo) o ventas cobradas en efectivo que se registraron como Yape. Revisa los movimientos de la sesión y los métodos de pago de las ventas del día.',
    },
    {
      q: '¿Tengo que abrir caja para poder vender?',
      a: 'No es obligatorio para emitir comprobantes, pero sin caja abierta no tienes el control del día: no hay monto inicial, ni arqueo, ni constancia de cierre.',
    },
    {
      q: 'Vendí con Yape, ¿entra al efectivo esperado?',
      a: 'No. Cada método tiene su propio saldo esperado: el efectivo se arquea contra el dinero físico y Yape, Plin y tarjeta contra sus propios saldos. Por eso el arqueo pide varios conteos.',
    },
  ],
}
