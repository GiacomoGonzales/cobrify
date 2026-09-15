/**
 * GUÍA DE USO: Reservas del hotel (modo hotel)
 *
 * Nace el 15/09/2026 con la reprogramación con fecha abierta, pedido de San
 * Ignacio Bamboo Lodge. Auditada contra src/pages/HotelReservations.jsx y
 * src/utils/reprogramacionHotel.js.
 *
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 */
export default {
  id: 'reservas-hotel',
  actualizado: '15/09/2026',
  intro:
    'En Reservas ves todas las estadías de tu hotel, agrupadas por cabaña o habitación: las que llegan, las que están hospedadas y las que ya salieron. Desde acá se crea la reserva, se hace el check-in y el check-out, se carga el folio y se emite el comprobante.',

  sections: [
    {
      id: 'registro-huespedes',
      title: 'Registro de huéspedes con enlace',
      blocks: [
        {
          type: 'texto',
          text: 'Cada reserva tiene su propio **registro de huéspedes**. En vez de un formulario aparte, le mandas al huésped un enlace: lo abre en su celular, ve su habitación, sus fechas y la tarifa ya puestas, y solo llena la hora de llegada, el motivo del viaje, los menores y los datos de cada persona (nombres, apellidos, documento, sexo, fecha de nacimiento, país y ciudad, más el celular y el correo del titular).',
        },
        {
          type: 'pasos',
          items: [
            'En la reserva, toca **Registro**.',
            'Toca **Enviar por WhatsApp**: se abre el chat con el mensaje y el enlace listos. También puedes **Copiar enlace**.',
            'Cuando el huésped lo envía, te llega un aviso y el botón **Registro** se pone en verde. Ahí ves a cada huésped con su edad.',
          ],
        },
        {
          type: 'texto',
          text: 'Si el huésped llega sin haberlo llenado, toca **Llenarlo yo** y regístralo tú. Para el registro del mes, toca **Registro de huéspedes** arriba de la lista, elige las fechas y descarga un Excel con una fila por huésped; las reservas que todavía no se registraron salen como Pendiente.',
        },
        {
          type: 'ojo',
          text: 'El enlace es la llave de esa reserva: quien lo tiene puede ver y corregir su registro hasta que la estadía termine. Mándalo solo al titular.',
        },
      ],
    },
    {
      id: 'reprogramar',
      title: 'Reprogramar con fecha abierta',
      blocks: [
        {
          type: 'texto',
          text: 'Cuando un huésped no puede venir pero quiere mantener su reserva para más adelante, **reprográmala con fecha abierta**. La cabaña queda libre para otras reservas, lo que ya facturaste se guarda y la reserva pasa a la pestaña **Reprogramadas** con una fecha límite.',
        },
        {
          type: 'pasos',
          items: [
            'En la reserva confirmada, toca **Reprogramar**.',
            'Revisa la **fecha límite**: se sugieren 6 meses desde la fecha de entrada original y puedes cambiarla.',
            'Confirma. En la lista vas a ver cuántos días le quedan al huésped para elegir.',
          ],
        },
        {
          type: 'texto',
          text: 'Cuando el huésped elija sus nuevas fechas, toca **Asignar fechas** en la reserva reprogramada, elige las fechas y guarda. La reserva vuelve a **Confirmada** y las noches que ya estaban facturadas pasan a las nuevas fechas, así no se cobran dos veces.',
        },
        {
          type: 'ojo',
          text: 'Mientras está reprogramada, la reserva no aparece en la vista semanal ni cuenta en las llegadas, la ocupación o el reporte por noche. Si la fecha límite pasa, la lista te lo marca en rojo: tú decides si la cancelas o le das más tiempo.',
        },
      ],
    },
  ],
}
