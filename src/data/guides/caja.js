/**
 * GUÍA DE USO: Control de Caja
 *
 * Auditada contra src/pages/CashRegister.jsx (4.875 líneas) el 16/08/2026.
 *
 * Correcciones sobre la versión anterior:
 *  - "Mi Caja" y "Vista General" NO son dos vistas equivalentes. Hay un
 *    SELECTOR de usuario de caja (Mi Caja / cada sub-usuario / Todos) y dos
 *    pestañas (actual e Historial). Con "Todos" seleccionado, la pestaña
 *    actual solo muestra un cartel "Vista General" que remite al Historial:
 *    ahí es donde se ven todas las sesiones juntas.
 *  - El arqueo no es solo de efectivo: se cuenta cada fondo por separado
 *    (efectivo, dólares, Yape, Plin, tarjetas, transferencias y las apps de
 *    delivery), y cada uno tiene su propio esperado y su propia diferencia.
 *
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'caja',
  actualizado: '22/08/2026',
  intro:
    'Control de Caja es el ritual de apertura y cierre del turno: con cuánto empezaste, qué entró y salió por fuera de las ventas, y si al final el dinero cuadra con lo que el sistema esperaba. No arquea solo el efectivo: cada medio de pago se cuadra por su cuenta.',

  sections: [
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'abrir',
      title: 'Abrir la caja',
      blocks: [
        {
          type: 'texto',
          text: 'Al empezar el turno presionas **Abrir Caja** y declaras el **Monto Inicial**: el sencillo con el que arrancas para dar vuelto.',
        },
        { type: 'ui', kind: 'boton', label: 'Abrir Caja' },
        {
          type: 'texto',
          text: 'Si además manejas otros fondos, puedes declarar su saldo de arranque por separado: **Monto Inicial en Dólares**, **en Yape** y **en Plin**. Los tres son opcionales — déjalos vacíos si empiezas en cero.',
        },
        {
          type: 'ojo',
          text: 'Declara el monto inicial REAL, aunque sean S/ 50. Si pones cero teniendo sencillo en el cajón, al cerrar te va a salir un sobrante que no existe, y el arqueo deja de servir para detectar problemas de verdad.',
        },
        {
          type: 'consejo',
          text: 'Si quieres obligar a que nadie venda sin haber abierto caja, hay un interruptor para eso. Es lo que garantiza que ninguna venta quede fuera del arqueo.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=ventas&opcion=requireOpenCashRegister',
          label: 'Requerir caja abierta para vender',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'durante-el-dia',
      title: 'Durante el turno: movimientos',
      blocks: [
        {
          type: 'texto',
          text: 'Las ventas entran solas a la caja; no tienes que registrarlas. Los **movimientos** son para el dinero que se mueve **por fuera de una venta**: un **Ingreso** (un aporte, un cobro de una deuda vieja) o un **Egreso** (pagar al delivery, comprar sencillo, sacar dinero para el banco).',
        },
        {
          type: 'pasos',
          items: [
            'Presiona el botón de registrar movimiento.',
            'Elige si es **Ingreso** o **Egreso**.',
            'Pon el **Monto**, el método por el que se movió (efectivo, Yape, tarjeta…) y la **Descripción** del motivo.',
            'Guarda: queda listado en **Movimientos de la Sesión** con su hora y el usuario que lo hizo.',
          ],
        },
        {
          type: 'ojo',
          text: 'Todo lo que sacas de la caja tiene que quedar como egreso, sin excepción. Es la causa número uno de faltantes al cerrar: dinero que salió por una razón legítima y nadie anotó.',
        },
        {
          type: 'consejo',
          text: 'Fíjate en el método del movimiento, no solo en el monto. Un egreso pagado con Yape que registras como efectivo descuadra dos fondos a la vez: te sobra en uno y te falta en el otro.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'cerrar',
      title: 'Cerrar la caja: el arqueo',
      blocks: [
        {
          type: 'texto',
          text: 'Al final del turno presionas **Cerrar Caja** y cuentas. Y acá está lo que más sorprende la primera vez: **no se cuenta solo el efectivo**. El cierre te pide, de cada fondo que hayas movido, cuánto tienes:',
        },
        {
          type: 'tabla',
          encabezados: ['Fondo', 'Qué cuentas'],
          filas: [
            ['Efectivo en caja', 'El dinero físico en soles'],
            ['Efectivo en dólares', 'Los billetes en dólares, si trabajas con ellos'],
            ['Saldo en Yape / Saldo en Plin', 'Lo que muestra la app de cada billetera'],
            ['Tarjetas', 'El total de los vouchers o del POS del banco'],
            ['Transferencias', 'Lo recibido por transferencia'],
            ['Rappi / PedidosYa / DiDiFood', 'Lo liquidado por cada app de delivery'],
          ],
        },
        {
          type: 'texto',
          text: 'Si creaste **métodos de pago propios**, también aparecen con su casilla. Y si vendes en dólares, cada fondo tiene su versión en dólares aparte, para que no se mezclen las monedas.',
        },
        {
          type: 'ojo',
          text: 'En **modo restaurante**, si quedan mesas ocupadas al presionar Cerrar Caja, el sistema avisa y las lista antes de que empieces a contar. Puedes ir a cobrarlas o cerrar igual — el aviso no bloquea, solo te da la oportunidad de no pasar una por alto.',
        },
        {
          type: 'consejo',
          text: 'Si una mesa se te pasó, cóbrala **antes** de contar. Si la cobras después, el efectivo esperado ya cambió y el arqueo te va a marcar una diferencia que no existe.',
        },
      ],
    },

    {
      id: 'formula',
      title: 'De dónde sale el "esperado"',
      blocks: [
        {
          type: 'texto',
          text: 'Cada fondo se compara contra su propio esperado, y la fórmula es la misma para todos:',
        },
        {
          type: 'texto',
          text: '**Saldo inicial de ese fondo + ventas cobradas por ese medio + ingresos de ese medio − egresos de ese medio.**',
        },
        {
          type: 'texto',
          text: 'Por eso el efectivo se compara contra el dinero físico, y Yape contra el saldo de Yape. Una venta cobrada por Yape no engorda el efectivo esperado: cada fondo vive su propia vida y tiene su propia **Diferencia**.',
        },
        {
          type: 'ojo',
          text: 'Ahí está el origen del descuadre más común: una venta cobrada en efectivo pero registrada como Yape deja **dos** fondos mal — sobrante en efectivo y faltante en Yape, por el mismo monto. Si ves eso, no busques dinero perdido; busca una venta con el método equivocado.',
        },
        {
          type: 'consejo',
          text: 'Antes de dar por perdido un faltante, revisa los **Movimientos de la Sesión**. Entre eso y los métodos de pago del día se explica la enorme mayoría de las diferencias.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
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
          text: 'Con esta opción activa, los sub-usuarios no ven el monto esperado ni la diferencia al cerrar: solo cuentan lo que hay y lo reportan. Tú como dueño o administrador sí ves todo.',
        },
        {
          type: 'consejo',
          text: 'Es la práctica estándar en retail, y la razón es simple: si el cajero ve cuánto "debería" haber antes de contar, el arqueo deja de medir la realidad y pasa a medir su capacidad de cuadrar el número. Un conteo a ciegas es el único que sirve para detectar un problema.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'constancia',
      title: 'La constancia del cierre',
      blocks: [
        {
          type: 'texto',
          text: 'Cerrada la caja puedes generar el reporte del turno en **PDF** para imprimirlo y archivarlo, o en **Excel** si quieres trabajarlo. Lleva el detalle completo: montos iniciales, ventas por método, movimientos, lo contado y las diferencias.',
        },
        {
          type: 'consejo',
          text: 'Si manejas varios cajeros, imprimir la constancia y que la firme quien cerró convierte el arqueo en un documento con responsable. Cuesta diez segundos y evita discusiones después.',
        },
        {
          type: 'texto',
          text: 'El PDF además trae **Productos Vendidos**: qué salió en el turno, con cantidad e importe, agrupado y ordenado de lo que más se vendió a lo que menos. Sirve para no tener que entrar venta por venta a ver qué se movió.',
        },
        {
          type: 'texto',
          text: 'Si quieres esa misma lista en el **ticket impreso** del cierre, actívala en Configuración. Viene apagada porque con muchos productos el ticket se alarga bastante; el PDF los trae siempre.',
        },
        {
          type: 'enlace',
          to: '/app/configuracion?tab=preferencias&opcion=showProductsInCashClosure',
          label: 'Imprimir los productos vendidos en el cierre',
        },
        {
          type: 'texto',
          text: 'Sobre las **notas de crédito**: se descuentan de la lista solo cuando la mercadería volvió de verdad — motivo *Anulación de la operación*, *Devolución total* o *Devolución por ítem*— y sobre una venta del mismo turno. Una nota por *descuento global* o por *error en el RUC* no toca la lista: ahí el producto se vendió igual, solo cambió el monto o los datos.',
        },
        {
          type: 'ojo',
          text: 'Ese total de productos puede **no coincidir** con el Total Ventas del turno, y es correcto: en las ventas entran los cobros de comprobantes de días anteriores, que no movieron mercadería hoy.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'historial',
      title: 'Historial de cajas',
      blocks: [
        {
          type: 'texto',
          text: 'La pestaña **Historial** guarda todas las sesiones cerradas: quién abrió, quién cerró, a qué hora, cuánto se vendió y qué diferencia hubo en cada fondo. Al entrar en una sesión ves su detalle completo.',
        },
        {
          type: 'consejo',
          text: 'Un faltante aislado es un accidente; el mismo faltante repitiéndose todas las semanas es un patrón, y eso solo se ve mirando el historial seguido. Revísalo una vez por semana aunque no haya pasado nada.',
        },
      ],
    },

    {
      id: 'varias-cajas',
      title: 'Si tienes varios cajeros',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando hay sub-usuarios con caja propia, arriba aparece un **selector de caja**. Por defecto está en **Mi Caja** (la tuya), y puedes cambiar al de cualquier sub-usuario — los que tienen una sesión abierta salen marcados como **(Caja abierta)** — o elegir **Todos**.',
        },
        {
          type: 'ojo',
          text: 'Con **Todos** seleccionado, la pestaña actual no te muestra las cajas juntas: te avisa que vayas al **Historial**. Ahí es donde se ven todas las sesiones de todos los cajeros en una sola lista.',
        },
        {
          type: 'texto',
          text: 'El **selector de sucursal del encabezado** también manda: cada sucursal tiene sus propias cajas, y un cajero de otra sede no aparece si estás mirando la tuya.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Anulé una venta con nota de crédito y el producto sigue apareciendo.',
      a: 'Revisa el **motivo** de la nota. Solo se descuentan las de *Anulación de la operación*, *Devolución total* y *Devolución por ítem*, que son las que implican que la mercadería volvió. Una nota por *descuento global*, *disminución en el valor* o *error en el RUC* corrige el monto o los datos, pero el producto salió igual del depósito. Tampoco se descuenta si la nota corrige una venta de otro día: eso dejaría la lista de hoy por debajo de lo que realmente vendiste.',
    },
    {
      q: 'Los productos del cierre no suman lo mismo que el Total Ventas.',
      a: 'Es lo esperado y las dos cifras son correctas: miden cosas distintas. El **Total Ventas** es la plata que entró al turno, e incluye cobros de comprobantes emitidos otros días. **Productos Vendidos** es la mercadería que salió hoy del depósito.',
    },
    {
      q: '¿Tengo que abrir caja para poder vender?',
      a: 'Por defecto no, pero puedes hacerlo obligatorio desde Configuración → Ventas con **Requerir caja diaria abierta para vender**. Sin caja abierta no hay monto inicial, ni arqueo, ni constancia: se pierde el control del turno aunque los comprobantes salgan bien.',
    },
    {
      q: 'Vendí con Yape, ¿entra al efectivo esperado?',
      a: 'No. Cada fondo tiene su propio esperado: el efectivo se arquea contra el dinero físico y Yape contra el saldo de Yape. Por eso el cierre te pide varios conteos en vez de uno solo.',
    },
    {
      q: 'Me sale faltante todos los días, ¿qué reviso?',
      a: 'Dos cosas, en este orden. Primero, **egresos no registrados**: propinas, delivery, compras de sencillo, dinero llevado al banco. Segundo, **ventas con el método equivocado**: si una venta en efectivo se registró como Yape, te va a faltar en efectivo y sobrar en Yape exactamente lo mismo. Si el faltante y el sobrante coinciden en monto, ya sabes qué pasó.',
    },
    {
      q: 'Cerré la caja con un error, ¿puedo corregirla?',
      a: 'Los cierres quedan en el historial como constancia. Si tu negocio permite editar el cuadre, puedes ajustarlo desde el historial; si esa opción está bloqueada en Configuración, el cierre es definitivo y lo que corresponde es dejarlo registrado y explicarlo.',
    },
    {
      q: 'Abrí la caja con el monto en cero por error.',
      a: 'Registra la diferencia como un **Ingreso** con una descripción clara ("sencillo inicial no declarado al abrir"). Así el esperado se corrige y queda explicado por escrito, que es mejor que un sobrante sin motivo.',
    },
    {
      q: 'No veo el selector para ver la caja de otro usuario.',
      a: 'Solo aparece si tienes sub-usuarios con caja independiente y permiso para verlos. Si eres el único que cobra, no hay nada que seleccionar.',
    },
  ],
}
