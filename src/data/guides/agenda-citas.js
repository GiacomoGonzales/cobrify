/**
 * GUÍA DE USO: Agenda de Citas (veterinaria, clínica y modo General con la agenda activada)
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
    'La Agenda es el calendario de tu negocio: quién viene hoy, quién está siendo atendido y quién ya pagó. Desde acá se agenda una cita nueva, se atiende al que llega sin cita y se termina cada atención cobrándola en el Punto de Venta. En veterinaria la cita es de la mascota; en los demás rubros, del cliente.',

  sections: [
    {
      id: 'activar',
      title: 'Activarla en modo General',
      // Solo General la tiene apagada: en veterinaria y clínica viene de fábrica.
      soloModos: ['retail'],
      requiereOpcion: {
        flag: 'appointmentsEnabled',
        nombre: 'Agenda de Citas',
        donde: 'Configuración > Preferencias > Personalizar Menú Lateral',
        ruta: '/app/configuracion?tab=preferencias',
        defaultOn: false,
      },
      blocks: [
        {
          type: 'texto',
          text: 'En veterinaria y en clínica la agenda viene de fábrica. En los demás rubros está apagada, porque la mayoría de los negocios no atiende con cita. Si el tuyo sí (consultorio, podología, estética, taller, asesoría), enciéndela y aparece como una página más en el menú.',
        },
        {
          type: 'pasos',
          items: [
            'Entra a **Configuración > Preferencias**.',
            'Baja hasta **Personalizar Menú Lateral**, en el grupo "Ventas y cobro".',
            'Marca **Agenda de Citas** y guarda. Aparece en el menú al instante.',
          ],
        },
      ],
    },
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
            'Busca al cliente por nombre, documento o teléfono (en veterinaria, también por el nombre de su mascota). Si es nuevo, usa la pestaña "Cliente nuevo": con el DNI o RUC la lupa completa el nombre sola.',
            'Elige los servicios con su precio. En veterinaria, antes eliges la mascota (o la agregas si no está registrada).',
            'Si tienes personal cargado en Vendedores, elige el **Especialista** que va a atender. Puedes dejarlo sin asignar.',
            'Presiona "Agendar cita". La cita queda como Programada, en su hora, en el panel del día.',
          ],
        },
        {
          type: 'texto',
          text: 'El **Especialista** sale de tu lista de **Vendedores**: ahí es donde el sistema guarda a tu personal, así no tienes que cargar a la misma gente dos veces. Si todavía no tienes a nadie ahí, el campo no aparece — créalos en Vendedores y listo. Una vez asignado, el nombre se ve en la agenda del día junto a cada cita.',
        },
        { type: 'enlace', to: '/app/vendedores', label: 'Ir a Vendedores' },
        {
          type: 'consejo',
          text: 'Si dos clientes piden la misma hora, el sistema te avisa pero no te bloquea: tú decides si tu equipo puede atender a dos a la vez.',
        },
        {
          type: 'texto',
          text: 'En veterinaria también puedes agendar desde la historia clínica del paciente (Pacientes → ver mascota), útil cuando terminas una consulta y dejas programado el control siguiente.',
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
            ['En atención', 'El cliente (o la mascota) está siendo atendido', 'Finalizar y Cobrar'],
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
          text: 'Para el cliente que llega sin cita: en la pestaña "En atención", presiona "Atender ahora". Es el mismo formulario de agendar, pero sin fecha ni hora — la atención arranca de inmediato y aparece en el tablero.',
        },
        {
          type: 'consejo',
          text: 'La pestaña "En atención" es el tablero del día: cada tarjeta es alguien siendo atendido ahora mismo. Cuando terminas, "Finalizar y Cobrar" desde la misma tarjeta.',
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
          text: 'El botón verde de WhatsApp en cada cita abre un mensaje listo con el servicio, el día y la hora (y la mascota, en veterinaria), pidiendo confirmación. Solo aparece si el cliente tiene teléfono registrado.',
        },
        {
          type: 'consejo',
          text: 'El calendario marca cada día con puntos: azul si tiene citas pendientes, verde si tiene completadas, y el número total. De un vistazo sabes qué días están cargados.',
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'reservas-catalogo',
      title: 'Que tus clientes reserven solos desde el catálogo',
      requiereOpcion: {
        flag: 'appointmentsBooking',
        nombre: 'Recibir reservas desde el catálogo',
        donde: 'Configuración > Catálogo > Reservas de citas',
        ruta: '/app/configuracion?tab=catalogo',
        defaultOn: false,
      },
      blocks: [
        {
          type: 'texto',
          text: 'Con esta opción, tu catálogo online muestra una **sección de reservas**: el cliente ve tus servicios, un calendario del mes y las horas libres, deja su nombre y su teléfono, y la cita **aparece sola en tu Agenda** al instante, con una notificación para ti.',
        },
        {
          type: 'pasos',
          items: [
            'En **Configuración > Catálogo**, activa **Recibir reservas desde el catálogo**.',
            'Define los **días** que atiendes con cita, el **horario** y cada cuántos minutos hay un turno.',
            'Agrega los **servicios que se pueden reservar** (baño, consulta, podología...) buscándolos entre tus productos. El cliente elige uno al reservar, con el precio que publicaste.',
            'Si en tu negocio atiende más de una persona, agrega en **Quién atiende** a cada doctor, terapeuta o estilista (y cómo se llama en tu rubro). Es opcional: si lo dejas vacío, el catálogo no lo pregunta.',
            'Guarda. La sección aparece en tu catálogo de inmediato.',
          ],
        },
        {
          type: 'ojo',
          text: 'El cliente solo ve horas **libres** — nunca los datos de otros clientes ni cuántas citas tienes. Y una misma hora no puede reservarse dos veces desde el catálogo: el segundo recibe "esa hora acaba de ocuparse". Tú, en cambio, sí puedes sobre-agendar a mano desde tu Agenda, como siempre.',
        },
        {
          type: 'texto',
          text: 'Cuando configuras **quién atiende**, cada persona lleva su propia agenda: dos clientes pueden reservar las 10:00 con doctores distintos, y solo se bloquea la hora de quien ya está ocupado.',
        },
        {
          type: 'consejo',
          text: 'La reserva llega con el teléfono del cliente: usa el botón verde de WhatsApp de la cita para confirmarle. Un mismo teléfono puede tener hasta 3 citas pendientes, para que nadie te llene la agenda por deporte.',
        },
      ],
    },
  ],
}
