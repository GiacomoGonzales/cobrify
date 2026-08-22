/**
 * GUÍA DE USO: Recordatorios (Alertas de Veterinaria)
 *
 * Documenta la pantalla /app/alertas-veterinaria y el recordatorio automático
 * que deja cada servicio cobrado. Ver reglas de redacción en pos.js.
 */
export default {
  id: 'recordatorios-veterinaria',
  actualizado: '22/08/2026',
  intro:
    'El baño, el spa y la desparasitación se repiten cada tanto, pero el cliente no lleva la cuenta: el que tiene que acordarse eres tú. Esta pantalla te dice qué mascota toca esta semana y cuál ya se pasó de fecha, para llamarlas antes de que se olviden.',

  sections: [
    {
      id: 'automatico',
      title: 'El recordatorio se programa solo',
      blocks: [
        {
          type: 'texto',
          text: 'La clave está en el producto: cada servicio lleva un campo **Recordar servicio (días)**. Se configura una sola vez y desde ahí en adelante trabaja solo.',
        },
        {
          type: 'pasos',
          items: [
            'Entra a **Productos** y abre el servicio (por ejemplo, Baño).',
            'En **Recordar servicio (días)** escribe cada cuánto se repite: baño 30, desparasitación 90, vacuna anual 365.',
            'Guarda. Listo — no hay que volver a tocarlo.',
          ],
        },
        {
          type: 'texto',
          text: 'A partir de ahí, **cada vez que cobres ese servicio** el recordatorio de esa mascota se agenda para dentro de esos días. Si ya tenía uno, se corre la fecha en vez de duplicarse.',
        },
        {
          type: 'ojo',
          text: 'El recordatorio se guarda en la ficha del cliente, así que la venta tiene que ser a un **cliente registrado**. Si cobras sin elegir cliente, el POS te avisa que no va a quedar agendado.',
        },
      ],
    },

    {
      id: 'cambiar-dias',
      title: 'Cuando el cliente pide otro plazo',
      blocks: [
        {
          type: 'texto',
          text: 'Si el dueño te dice "tráemelo en 15 días" en vez de los 30 de siempre, no hay que ir a ninguna configuración: al cobrar, junto al botón de Procesar Venta aparece el servicio con sus días. Cambias el número ahí mismo y esa mascota queda con ese plazo.',
        },
        {
          type: 'consejo',
          text: 'El cambio vale para esa mascota, no para el servicio. Los demás clientes siguen con los días de siempre — y el próximo cobro de esa misma mascota ya viene con el plazo nuevo.',
        },
      ],
    },

    {
      id: 'usarla',
      title: 'Usar la pantalla de Recordatorios',
      blocks: [
        {
          type: 'texto',
          text: 'La pantalla separa lo que viene de lo que ya se pasó. De cada mascota tienes dos botones:',
        },
        {
          type: 'tabla',
          encabezados: ['Botón', 'Qué hace'],
          filas: [
            ['**WhatsApp**', 'Abre el chat con el mensaje ya escrito: nombre de la mascota, qué le toca y la fecha. Solo revisas y envías.'],
            ['**Marcar como completado**', 'Da el servicio por hecho y agenda el siguiente. Úsalo si lo atendiste sin pasar por el POS.'],
          ],
        },
        {
          type: 'consejo',
          text: 'Si cobras el servicio en el Punto de Venta no hace falta marcar nada: el recordatorio se corre solo. El botón está para las veces que no hubo cobro de por medio.',
        },
        { type: 'enlace', to: '/app/alertas-veterinaria', label: 'Ir a Recordatorios' },
      ],
    },

    {
      id: 'manual',
      title: 'Cargar un recordatorio a mano',
      blocks: [
        {
          type: 'texto',
          text: 'También puedes agendar algo sin haberlo cobrado: entra a **Clientes**, abre la ficha de la mascota y ahí cargas el servicio con su frecuencia. Es lo mismo que hace el cobro automático, pero escrito por ti.',
        },
        {
          type: 'consejo',
          text: 'Sirve para arrancar: si ya tienes clientes que vienen hace meses, cárgales el recordatorio una vez y de ahí en adelante se mantiene solo con cada cobro.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Cobré el servicio y no quedó ningún recordatorio.',
      a: 'Revisa dos cosas: que el producto tenga **Recordar servicio (días)** con un número, y que la venta haya sido a un cliente registrado (no a "Cliente General"). Sin cliente no hay ficha donde guardarlo.',
    },
    {
      q: 'El cliente tiene dos mascotas, ¿se mezclan?',
      a: 'No. El recordatorio guarda a qué mascota corresponde, así que el baño de cada una va por separado y el aviso dice el nombre correcto.',
    },
    {
      q: 'No quiero que un servicio recuerde nada.',
      a: 'Deja el campo **Recordar servicio (días)** vacío en ese producto. Vacío significa que no agenda nada.',
    },
    {
      q: '¿Manda el WhatsApp solo?',
      a: 'Todavía no: la pantalla te arma el mensaje y tú lo envías. Es a propósito — así revisas a quién le escribes antes de que salga.',
    },
  ],
}
