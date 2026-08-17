/**
 * GUÍA DE USO: Agenda de Citas (modo veterinaria)
 *
 * Auditada contra src/pages/VeterinaryAgenda.jsx el 17/08/2026, el mismo día
 * que se agregó "Agendar cita" desde la propia agenda (antes solo se podía
 * agendar desde la historia clínica del paciente).
 *
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'agenda-citas',
  actualizado: '17/08/2026',
  intro:
    'La Agenda es el calendario de la clínica: qué mascotas vienen hoy, cuáles están siendo atendidas y cuáles ya se cobraron. Desde acá se agenda una cita nueva, se atiende al que llega sin cita y se termina cada atención cobrándola en el Punto de Venta.',

  sections: [
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'agendar',
      title: 'Agendar una cita',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Haz clic en el día en el calendario: sus horas aparecen en el panel del costado, con las citas ya tomadas puestas en su horario.',
            'Toca una hora libre (las casillas punteadas). Se abre el formulario con la fecha y la hora ya puestas — puedes cambiarlas ahí mismo si hace falta.',
            'Busca al cliente por nombre, documento, teléfono o el nombre de su mascota. Si es nuevo, usa la pestaña "Cliente nuevo": con el DNI o RUC la lupa completa el nombre sola.',
            'Elige la mascota (o agrégala si no está registrada) y los servicios con su precio.',
            'Presiona "Agendar cita". La cita queda como Programada, en su hora, en el panel del día.',
          ],
        },
        {
          type: 'consejo',
          text: 'Si dos clientes piden la misma hora, el sistema te avisa pero no te bloquea: tú decides si tu equipo puede atender dos mascotas a la vez.',
        },
        {
          type: 'texto',
          text: 'También puedes agendar desde la historia clínica del paciente (Pacientes → ver mascota), útil cuando terminas una consulta y dejas programado el control siguiente.',
        },
        { type: 'enlace', to: '/app/pacientes', label: 'Ver Pacientes' },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'recorrido',
      title: 'El recorrido de una cita',
      blocks: [
        {
          type: 'tabla',
          encabezados: ['Estado', 'Qué significa', 'Botón para avanzar'],
          filas: [
            ['Programada', 'Agendada, sin confirmar', 'Confirmar (check verde)'],
            ['Confirmada', 'El cliente confirmó que viene', 'Iniciar atención (play)'],
            ['En atención', 'La mascota está siendo atendida', 'Finalizar y Cobrar'],
            ['Completada', 'Atendida y cobrada', '—'],
          ],
        },
        {
          type: 'texto',
          text: '"Finalizar y Cobrar" te lleva al Punto de Venta con el cliente y los servicios ya cargados: solo eliges el comprobante y cobras. Ahí es donde la cita se convierte en venta.',
        },
        {
          type: 'texto',
          text: 'Si el cliente no vino, márcala como "No asistió" (queda en el historial del paciente). Si avisó antes, cancélala con su motivo. Las citas programadas, canceladas o no asistidas también se pueden eliminar con el tacho.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'walkin',
      title: 'Atender sin cita (walk-in)',
      blocks: [
        {
          type: 'texto',
          text: 'Para el cliente que llega sin cita: en la pestaña "En atención", presiona "Atender ahora". Es el mismo formulario de agendar, pero sin fecha ni hora — la atención arranca de inmediato y la mascota aparece en el tablero.',
        },
        {
          type: 'consejo',
          text: 'La pestaña "En atención" es el tablero del día: cada tarjeta es una mascota siendo atendida ahora mismo. Cuando terminas con ella, "Finalizar y Cobrar" desde la misma tarjeta.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'recordatorio',
      title: 'Recordarle la cita al cliente',
      blocks: [
        {
          type: 'texto',
          text: 'El botón verde de WhatsApp en cada cita abre un mensaje listo con la mascota, el servicio, el día y la hora, pidiendo confirmación. Solo aparece si el cliente tiene teléfono registrado.',
        },
        {
          type: 'consejo',
          text: 'El calendario marca cada día con puntos: azul si tiene citas pendientes, verde si tiene completadas, y el número total. De un vistazo sabes qué días están cargados.',
        },
      ],
    },
  ],
}
