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
            'Presiona **Nuevo Préstamo** y elige el cliente (busca en tus clientes o escribe un nombre nuevo).',
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
      a: 'En Solo Interés el excedente amortiza capital directamente (y el interés siguiente baja). En Cuota Fija va llenando las cuotas siguientes en orden.',
    },
    {
      q: '¿Cómo se calcula la mora?',
      a: 'Como la configuraste en ese préstamo: un **%** sobre lo vencido por cada período de atraso, o un **monto fijo** por período. Se cobra primero, antes que el interés y el capital.',
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
