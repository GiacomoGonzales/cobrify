/**
 * GUÍA DE USO: Recordatorios (Alertas de Veterinaria)
 *
 * Documenta la pantalla /app/alertas-veterinaria. La fuente son las VENTAS:
 * ver src/services/salesRemindersService.js. Reglas de redacción en pos.js.
 */
export default {
  id: 'recordatorios-veterinaria',
  actualizado: '26/08/2026',
  intro:
    'El baño, el alimento y la desparasitación se repiten cada tanto, pero el cliente no lleva la cuenta: el que tiene que acordarse eres tú. Esta pantalla toma tus ventas y te dice a quién llamar — qué se llevó cada cliente, cuándo, y a quién ya se le pasó la fecha.',

  sections: [
    {
      id: 'de-donde-sale',
      title: 'Se arma solo con tus ventas',
      blocks: [
        {
          type: 'texto',
          text: 'No hay que cargar nada. Cada venta que cobras a un **cliente con nombre** —boleta, factura o nota de venta— entra sola: pasado el plazo, ese cliente aparece en la lista con lo que se llevó.',
        },
        {
          type: 'texto',
          text: 'Como sale de las ventas, **también aparece lo que vendiste antes** de empezar a usar esta pantalla. No arranca vacía.',
        },
        {
          type: 'ojo',
          text: 'Las ventas de mostrador no generan recordatorio: si cobras sin cliente o a "Cliente General", no hay a quién volver a llamar. Las ventas anuladas tampoco cuentan.',
        },
        {
          type: 'consejo',
          text: 'Si el mismo cliente vuelve a comprar lo mismo, el recordatorio se corre solo a partir de la compra nueva. No se acumulan avisos repetidos del mismo perro.',
        },
      ],
    },

    {
      id: 'plazos',
      title: 'Cada cuánto se recuerda',
      blocks: [
        {
          type: 'texto',
          text: 'De fábrica son **30 días** para todo. Ese número lo cambias en **Configuración > Ventas**, en "Recordar cada venta a los ___ días".',
        },
        {
          type: 'texto',
          text: 'Si un producto necesita otro plazo, se lo pones en su ficha, en **Productos y Servicios > Recordar servicio (días)**:',
        },
        {
          type: 'tabla',
          encabezados: ['En la ficha del producto', 'Qué pasa'],
          filas: [
            ['**Vacío**', 'Usa el plazo del negocio (30 días de fábrica).'],
            ['**Un número**', 'Ese plazo solo para ese producto: desparasitación 90, vacuna anual 365.'],
            ['**0**', 'Ese producto nunca genera recordatorio. Para el collar, la correa o los accesorios.'],
          ],
        },
        {
          type: 'ojo',
          text: 'El **0** es la única forma de decir "este no se recuerda". Dejar el campo vacío ya no significa eso: significa "usa el plazo del negocio".',
        },
      ],
    },

    {
      id: 'usarla',
      title: 'Usar la pantalla',
      blocks: [
        {
          type: 'texto',
          text: 'La pantalla abre en **Hoy**: las personas a las que hoy se les cumple el plazo desde su última compra. Esa es la rutina — entras, ves quiénes son y les escribes.',
        },
        {
          type: 'tabla',
          encabezados: ['Filtro', 'Qué muestra'],
          filas: [
            ['**Hoy**', 'A quiénes se les cumple el plazo hoy.'],
            ['**Esta semana**', 'Los de hoy más los de los próximos 7 días, para adelantarte.'],
            ['**Este mes**', 'Los próximos 30 días.'],
            ['**Vencidos**', 'A los que ya se les pasó la fecha, empezando por los que se vencieron recién.'],
          ],
        },
        {
          type: 'consejo',
          text: 'Cada filtro va por su lado: **Hoy** muestra solo los de hoy, sin mezclar lo vencido de meses atrás. Y en Vencidos, primero aparece lo que se pasó ayer o anteayer — que es lo que todavía se recupera con una llamada — y al final lo más viejo.',
        },
        {
          type: 'texto',
          text: 'En computadora se ve como tabla, con el cliente, el paciente, el teléfono, cuándo fue la última vez y cuándo toca. En el celular, la misma información en tarjetas. De cada fila tienes dos botones:',
        },
        {
          type: 'tabla',
          encabezados: ['Botón', 'Qué hace'],
          filas: [
            ['**WhatsApp**', 'Abre el chat con el mensaje ya escrito. Solo revisas y envías. Aparece únicamente si el cliente tiene teléfono.'],
            ['**Ya lo atendí**', 'Saca ese aviso de la lista. Úsalo cuando ya lo resolviste y todavía no pasaste por el POS.'],
          ],
        },
        {
          type: 'consejo',
          text: 'Si cobras la próxima visita en el Punto de Venta no hace falta marcar nada: la venta nueva corre la fecha sola.',
        },
        {
          type: 'texto',
          text: 'No hay botón de actualizar ni hace falta recargar: si cobras una venta mientras tienes esta pantalla abierta, la lista se pone al día sola en un par de segundos.',
        },
        { type: 'enlace', to: '/app/alertas-veterinaria', label: 'Ir a Recordatorios' },
      ],
    },

    {
      id: 'vacunas',
      title: 'Vacunas y controles del historial',
      blocks: [
        {
          type: 'texto',
          text: 'Además de las ventas, la pantalla muestra lo que cargaste a mano en la ficha del paciente: las **vacunas con su próxima dosis** y los servicios recurrentes del historial clínico. Se cargan desde **Clientes**, abriendo la ficha de la mascota.',
        },
        {
          type: 'consejo',
          text: 'Sirve para lo que no pasa por caja: un refuerzo que corresponde en seis meses, un control post-operatorio.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: 'Vendí y no aparece nada en la lista.',
      a: 'Fíjate primero en que la venta haya salido con un cliente con nombre — las de mostrador o a "Cliente General" no cuentan. Después, en que el producto no tenga **0** en "Recordar servicio (días)", que significa que no se recuerda. Y por último, que el plazo no sea más largo que el período que estás mirando: prueba con "Este mes".',
    },
    {
      q: 'No quiero que un producto recuerde nada.',
      a: 'Ponle **0** en "Recordar servicio (días)" en su ficha. Es el caso del collar, la correa y todo lo que no se repite.',
    },
    {
      q: 'No quiero recordatorios de nada, solo de lo que yo elija.',
      a: 'Pon **0** en Configuración > Ventas, en "Recordar cada venta a los ___ días". Ahí solo aparecerán los productos a los que les hayas puesto su propio plazo.',
    },
    {
      q: 'El cliente tiene dos mascotas, ¿se mezclan?',
      a: 'El recordatorio guarda el nombre de la mascota que figuraba en la venta, así que el aviso sale con ese nombre. Si vendes sin elegir la mascota, el aviso sale igual pero a nombre del cliente.',
    },
    {
      q: 'Marqué "Ya lo atendí" por error.',
      a: 'El aviso reaparece solo la próxima vez que ese cliente compre ese producto. Si necesitas verlo antes, vuelve a cobrarlo o cárgalo a mano en la ficha del paciente.',
    },
    {
      q: '¿Manda el WhatsApp solo?',
      a: 'Todavía no: la pantalla te arma el mensaje y tú lo envías. Es a propósito — así revisas a quién le escribes antes de que salga.',
    },
  ],
}
