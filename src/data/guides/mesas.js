/**
 * GUÍA DE USO: Mesas (modo restaurante)
 *
 * Auditada contra src/pages/Tables.jsx (2.468 líneas) y sus modales de
 * src/components/restaurant/ el 16/08/2026.
 *
 * La versión anterior no cubría: dividir mesa (mover items a otra mesa, que
 * NO es lo mismo que dividir la cuenta), dividir la cuenta entre N personas,
 * mover/transferir una mesa, separar mesas unidas, reservas, el estado
 * mantenimiento, marcar items como servidos ni las precuentas por persona.
 *
 * Nombres verificados en TableActionModal, SplitBillModal, SplitTableModal,
 * IndividualPaymentModal, CloseTableModal y PreBillPreviewModal.
 *
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'mesas',
  actualizado: '16/08/2026',
  intro:
    'Mesas es el tablero de tu salón: qué está ocupado, cuánto lleva consumido cada mesa y cuál está libre. Desde acá se toma el pedido, se maneja lo que pasa durante la comida —juntar, mover, dividir— y se cobra.',

  sections: [
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tablero',
      title: 'Leer el tablero',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba tienes el conteo del salón: **Total Mesas**, **Disponibles**, **Ocupadas** y **Reservadas**. Cada mesa muestra su número y, si está ocupada, el **Consumo** acumulado y la hora de **Inicio**.',
        },
        {
          type: 'tabla',
          encabezados: ['Estado', 'Qué significa'],
          filas: [
            ['Disponible', 'Libre, lista para recibir'],
            ['Ocupada', 'Tiene una cuenta abierta con consumo'],
            ['Reservada', 'Apartada para un cliente que va a llegar'],
            ['Mantenimiento', 'Fuera de servicio: no se puede ocupar'],
          ],
        },
        {
          type: 'texto',
          text: 'Una marca de **Precuenta impresa** avisa que a esa mesa ya le llevaste la cuenta: sirve para saber de un vistazo cuáles están por irse y anticipar la rotación.',
        },
        {
          type: 'consejo',
          text: 'El tablero se actualiza solo. Si dos mozos toman pedidos a la vez, ambos ven lo mismo sin recargar nada.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'crear-mesas',
      title: 'Crear y organizar las mesas',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Nueva Mesa** registras cada mesa con su número y su **zona** (salón, terraza, segundo piso). Las zonas agrupan el tablero para que el mozo encuentre rápido.',
        },
        { type: 'ui', kind: 'boton', label: 'Nueva Mesa' },
        {
          type: 'ojo',
          text: 'Ponles los mismos números que usa tu personal en el día a día. Si en el salón le dicen "la 5", que en el sistema sea la 5: renombrarlas "bonito" solo genera confusión al cantar los pedidos.',
        },
        {
          type: 'texto',
          text: 'Si una mesa se rompe o la sacas de circulación, pásala a **Mantenimiento** en vez de borrarla: deja de aparecer como disponible pero conservas su historial.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tomar-pedido',
      title: 'Tomar el pedido',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Toca la mesa en el tablero y elige **Ocupar Mesa**.',
            'Selecciona el **mozo** que la atiende.',
            'Agrega los platos y bebidas.',
            'Confirma: la comanda sale hacia **Cocina** y la mesa pasa a **Ocupada**.',
          ],
        },
        {
          type: 'texto',
          text: 'El buscador de la carta funciona igual que el del POS: escribe pedazos de palabras, en el orden que sea y sin tildes. "ju le fre" encuentra "Jugo de leche de fresa", y también busca por código, categoría, presentación o el color y la talla de una variante.',
        },
        {
          type: 'texto',
          text: 'Puedes seguir agregando a lo largo de la comida: cada agregado se suma a la cuenta y va a cocina como pedido nuevo, sin repetir lo ya enviado.',
        },
        {
          type: 'texto',
          text: 'A medida que llegan los platos puedes ir marcándolos como **servidos**, uno por uno o todos de golpe. Es lo que le permite a un mozo que agarra el turno a mitad saber qué falta salir.',
        },
        {
          type: 'consejo',
          text: 'Elegir bien el mozo importa más de lo que parece: al cobrar, la venta queda registrada a su nombre y con la sucursal de esa mesa, así los reportes por vendedor y por sede salen correctos sin que nadie los ajuste después.',
        },
        { type: 'enlace', to: '/app/cocina', label: 'Ver Cocina' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'cliente-de-la-mesa',
      title: 'Identificar al cliente desde la mesa',
      blocks: [
        {
          type: 'texto',
          text: 'Esta opción aparece solo si tienes activo el **programa de sellos** (Clientes → Fidelización). Con el programa apagado, la mesa se ve como siempre.',
        },
        {
          type: 'texto',
          text: 'En la mesa ocupada, la línea **Cliente** te deja pegarle un comensal a la cuenta sin esperar a la caja. El mozo toca **Escanear tarjeta**, apunta al QR de la tarjeta de sellos que el cliente tiene en el celular, y listo.',
        },
        {
          type: 'texto',
          text: 'El QR lleva el celular del cliente, que es la llave de todo el sistema: se trae su ficha (con su documento, si lo tiene registrado) y se ve al instante cómo va su tarjeta — "7 de 10 sellos" o "Premio disponible". Es información útil para el mozo en ese momento, cuando todavía puede ofrecerle algo.',
        },
        {
          type: 'texto',
          text: 'Al cerrar la cuenta, el Punto de Venta trae los datos ya cargados y **el sello se suma solo**: nadie vuelve a pedir el número en la caja, con la cola esperando.',
        },
        {
          type: 'consejo',
          text: 'Si el cliente no tiene la tarjeta a mano, puedes escribir su celular y buscarlo igual. Y si el número todavía no está registrado, se asigna con su nombre y queda listo para la boleta.',
        },
        {
          type: 'ojo',
          text: 'El escaneo con cámara funciona en la **app instalada**. Desde el navegador el botón te deja escribir el celular a mano.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'reservas',
      title: 'Reservar una mesa',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Reservar Mesa** apartas una para un cliente que va a llegar: queda en **Reservada** y nadie la ocupa por error. Cuando llega, la ocupas normalmente; si no llega, **Cancelar Reserva** la devuelve a disponible.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'durante-la-comida',
      title: 'Juntar, mover y dividir',
      blocks: [
        {
          type: 'texto',
          text: 'Acá está lo que más se usa en un salón real, y conviene tener clara la diferencia entre cuatro cosas que suenan parecido:',
        },
        {
          type: 'tabla',
          encabezados: ['Acción', 'Qué hace'],
          filas: [
            ['Unir mesas', 'Un grupo grande junta varias: el consumo se acumula en UNA cuenta y se cobra todo junto'],
            ['Mover / Transferir', 'El grupo se cambia de sitio: la cuenta entera se pasa a otra mesa'],
            ['Dividir mesa', 'Parte de los items se pasa a OTRA mesa (el grupo se separó en dos)'],
            ['Dividir cuenta', 'La mesa se queda igual, pero la cuenta se reparte para pagar'],
          ],
        },
        {
          type: 'texto',
          text: 'Las mesas **unidas** se muestran atenuadas y su cuenta apunta a la principal. Si el grupo se deshace antes de pagar, puedes **separarlas** y cada una recupera lo suyo.',
        },
        {
          type: 'consejo',
          text: 'La regla para no equivocarse: si cambia **dónde** se sientan, es mover o dividir mesa. Si cambia **quién paga qué**, es dividir la cuenta.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'precuenta',
      title: 'La precuenta',
      blocks: [
        {
          type: 'texto',
          text: 'Antes de cobrar le llevas al cliente la **precuenta**: el detalle de lo consumido, **sin valor tributario**. Puedes verla en pantalla antes de imprimir y aplicarle un descuento si corresponde.',
        },
        {
          type: 'texto',
          text: 'Si la cuenta ya está dividida, puedes imprimir la **precuenta de una persona** o **todas las precuentas divididas** de una vez, para repartirlas juntas en la mesa.',
        },
        {
          type: 'ojo',
          text: 'La precuenta no es comprobante y no declara nada ante SUNAT. Después de imprimirla todavía hay que cobrar y emitir la boleta o factura.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'cobrar',
      title: 'Cobrar la mesa',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Cerrar Cuenta** se abre el cobro con todo el consumo ya cargado, listo para emitir la boleta o la factura. Al terminar, la mesa se libera sola.',
        },
        {
          type: 'texto',
          text: 'Cuando la mesa quiere pagar por separado tienes dos caminos, según cómo lo pidan:',
        },
        {
          type: 'pasos',
          items: [
            '**Dividir la cuenta**: repartes entre N personas por monto parejo, o asignas cada item a quien lo consumió. Sirve cuando quieren saber cuánto le toca a cada uno.',
            '**Cobro Individual**: eliges qué items se pagan AHORA y se emite su comprobante. El resto queda abierto en la mesa hasta que se cobre. Sirve cuando uno se va antes que los demás.',
          ],
        },
        {
          type: 'texto',
          text: 'También existe **Cerrar sin comprobante** para casos puntuales —una cortesía, consumo del personal— y **Liberar Mesa** para devolverla a disponible.',
        },
        {
          type: 'ojo',
          text: 'Lo que cierres sin comprobante no queda documentado ante SUNAT. Úsalo solo para lo que de verdad no es una venta; si le cobraste al cliente, corresponde emitir.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'barra',
      title: 'Cuentas de barra',
      blocks: [
        {
          type: 'texto',
          text: 'Con **Nueva cuenta de barra** abres un consumo **a nombre del cliente**, sin ocupar mesa. Es para quien toma en la barra o se mueve por el local, y funciona igual que una mesa: se le agregan items, se le imprime precuenta y se cobra.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Cobré la mesa pero sigue apareciendo ocupada.',
      a: 'Suele ser un **cobro individual**: se pagaron algunos items y quedaron otros abiertos. Ábrela y revisa qué falta; cuando la cuenta llega a cero, la mesa se libera sola.',
    },
    {
      q: '¿Cuál es la diferencia entre dividir la mesa y dividir la cuenta?',
      a: '**Dividir la mesa** mueve parte de los items a otra mesa: el grupo se separó y ahora son dos mesas distintas. **Dividir la cuenta** no toca la mesa, solo reparte lo consumido para que cada uno pague su parte. Si cambia dónde se sientan, divides la mesa; si cambia quién paga qué, divides la cuenta.',
    },
    {
      q: 'Dos mozos tomaron pedido en la misma mesa a la vez.',
      a: 'No hay problema: los items se suman a la misma cuenta. Al cobrar, el sistema reserva la mesa para que no se emitan dos comprobantes por lo mismo.',
    },
    {
      q: 'Junté dos mesas y el grupo se deshizo.',
      a: 'Puedes separarlas mientras no hayas cobrado: cada mesa recupera sus items y vuelve a tener su propia cuenta.',
    },
    {
      q: 'Imprimí la precuenta y el cliente pidió algo más.',
      a: 'Agrégalo normalmente y vuelve a imprimir. La precuenta no bloquea nada: es un papel informativo, y la marca de "precuenta impresa" solo es una ayuda visual para ti.',
    },
    {
      q: '¿Dónde veo todo lo que está en curso, no solo el salón?',
      a: 'En **Órdenes**: ahí están juntos los pedidos de mesa, los de para llevar, los de delivery y los de mostrador.',
    },
  ],
}
