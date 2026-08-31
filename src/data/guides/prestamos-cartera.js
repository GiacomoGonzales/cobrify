/**
 * GUÍA DE USO: Cartera de Préstamos (modo Préstamos)
 *
 * Nombres verificados contra src/pages/LendingPortfolio.jsx.
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'prestamos-cartera',
  actualizado: '15/08/2026',
  intro:
    'Tu cartera completa: cada préstamo con su capital vivo, su próximo vencimiento y su balance. Desde acá registras préstamos nuevos, cobras las cuotas y entregas la constancia de cada pago.',

  sections: [
    {
      id: 'registrar',
      title: 'Registrar un préstamo',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Presiona **Nuevo Préstamo** y elige el cliente: busca en tus clientes registrados, o escribe el **DNI/RUC** y toca la **lupa** para traer sus datos de RENIEC/SUNAT.',
            'Indica el **capital**, el **interés % por período** y la **modalidad**: Diario, Semanal, Quincenal o Mensual.',
            'Elige la amortización: **Cuota Fija** o **Solo Interés**.',
            'Si cobras **mora** por atraso, configúrala: % sobre lo vencido o monto fijo por período.',
            'Revisa la vista previa del cronograma y guarda.',
          ],
        },
        {
          type: 'tabla',
          encabezados: ['Amortización', 'Cómo funciona', 'Ejemplo (S/ 200 al 15% mensual)'],
          filas: [
            ['Cuota Fija', 'Capital + interés total repartidos en cuotas iguales, con cronograma cerrado', 'En 4 cuotas: total S/ 320, cuotas de S/ 80'],
            ['Solo Interés', 'Cada período vence el interés del capital vivo; el capital se abona cuando se pueda', 'Paga S/ 30 al mes; si un mes abona S/ 230, cancela todo'],
          ],
        },
        {
          type: 'consejo',
          text: 'La **lupa** junto al documento consulta RENIEC con 8 dígitos y SUNAT con 11, y llena el nombre (y la dirección, en el caso del RUC). El teléfono y el correo no vienen de ahí: esos se escriben a mano.',
        },
        {
          type: 'ojo',
          text: 'En **Solo Interés** el interés se genera **por tiempo**, no por pago: se suma uno cada vez que se cumple el período. Si el cliente abona dos veces el mismo mes, el primer pago cubre el interés y el **segundo va íntegro a capital**. Y si se atrasa tres meses, se acumulan los tres intereses.',
        },
        {
          type: 'ojo',
          text: 'El interés es **flat sobre el capital**, como se maneja en este rubro — no es el interés bancario sobre saldo decreciente. En Solo Interés, cuando el cliente amortiza capital, el interés del período siguiente **baja solo** (siempre se calcula sobre lo que queda vivo).',
        },
      ],
    },

    {
      id: 'cobrar',
      title: 'Cobrar y entregar constancia',
      blocks: [
        {
          type: 'texto',
          text: 'Cada tarjeta tiene su botón **Agregar Pago**, con el monto del período ya sugerido (cuota vigente o interés + mora). El pago se aplica en orden: **mora → interés → capital**, y el desglose queda registrado.',
        },
        {
          type: 'texto',
          text: 'Al registrar se imprime la **constancia de pago**: qué cubrió (mora, interés, capital), el capital que queda y el próximo vencimiento. Es un documento interno sin valor tributario. Si el pago es en efectivo y tienes la **caja diaria** abierta, entra como ingreso automáticamente.',
        },
        {
          type: 'consejo',
          text: 'Las tarjetas te muestran el estado de un vistazo: **Pendiente** (al día), **Vencido** (pasó el próximo pago) y la **mora acumulada** si la configuraste. Arriba, el resumen: capital en la calle, intereses cobrados del mes y cuántos préstamos están vencidos.',
        },
      ],
    },

    {
      id: 'estado-de-cuenta',
      title: 'Enviarle el estado de cuenta al cliente',
      blocks: [
        {
          type: 'texto',
          text: 'Cada tarjeta tiene el botón **Estado de cuenta**: abre el resumen completo de ese préstamo — cuánto pidió, los pagos que hizo, cuánto debe hoy y cuándo es el próximo vencimiento.',
        },
        {
          type: 'texto',
          text: 'Antes de mandar nada ves **el mensaje exacto** que va a recibir el cliente. Léelo: son tus números frente a tu cliente. Desde ahí puedes **enviarlo por WhatsApp** (se abre el chat con el texto ya escrito) o **imprimirlo / guardarlo en PDF** si te lo piden en papel.',
        },
        {
          type: 'texto',
          text: 'Se envía como mensaje de texto y no como archivo a propósito: el cliente lo lee en la notificación, sin descargar nada.',
        },
        {
          type: 'texto',
          text: 'Cuando un préstamo está **atrasado**, junto a ese botón aparece **Recordar**: manda un mensaje corto con cuánto debe y desde cuándo, sin el historial completo. Es para cobrar, no para informar.',
        },
        {
          type: 'ojo',
          text: 'Para enviar por WhatsApp el cliente tiene que tener **teléfono registrado** en el préstamo. Si no lo tiene, el botón queda deshabilitado y el sistema te avisa — pero igual puedes imprimir el estado de cuenta.',
        },
        {
          type: 'ojo',
          text: 'El estado de cuenta sigue disponible cuando el préstamo ya está **cancelado**: en ese caso el mensaje dice que no queda saldo. Sirve como constancia de que terminó de pagar.',
        },
      ],
    },
    {
      id: 'detalle',
      title: 'El detalle de cada préstamo',
      blocks: [
        {
          type: 'texto',
          text: 'En el menú de tres puntos de la tarjeta, **Ver detalle** abre el cronograma completo (en Cuota Fija) y el historial de pagos con el desglose de cada uno. **Anular préstamo** lo saca de la cartera activa — no registra devoluciones, solo lo marca.',
        },
        {
          type: 'ui',
          kind: 'menu',
          label: 'Acciones del préstamo',
          nota: 'En la esquina de cada tarjeta. Desde ahí salen Ver detalle y Anular préstamo.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Qué pasa si el cliente paga menos que la cuota?',
      a: 'El pago se aplica igual, en orden mora → interés → capital. En Cuota Fija la cuota queda parcialmente pagada y sigue pendiente por el resto; en Solo Interés, si no cubre el interés del período, el vencimiento no corre.',
    },
    {
      q: '¿Y si paga de más?',
      a: 'En Solo Interés, una vez cubierto el interés ya devengado, todo lo demás amortiza capital — y como el interés se calcula sobre el capital vivo, el del próximo período baja solo. En Cuota Fija va llenando las cuotas siguientes en orden.',
    },
    {
      q: '¿Cómo se calcula la mora?',
      a: 'Como la configuraste en ese préstamo: un **%** sobre lo vencido por cada período de atraso, o un **monto fijo** por período. Se cobra primero, antes que el interés y el capital.',
    },
    {
      q: 'El botón de WhatsApp está apagado.',
      a: 'Ese cliente no tiene teléfono registrado en el préstamo. El estado de cuenta igual se puede imprimir o guardar en PDF.',
    },
    {
      q: '¿La constancia vale ante SUNAT?',
      a: 'No — es un documento interno para que el pago quede registrado y el cliente tenga su comprobante. Este modo no emite documentos tributarios.',
    },
    {
      q: '¿Puedo prestarle de nuevo a alguien que ya tiene un préstamo?',
      a: 'Sí. Cada préstamo es independiente, con su propio cronograma, su tasa y su mora. En la cartera verás una tarjeta por préstamo.',
    },
  ],
}
