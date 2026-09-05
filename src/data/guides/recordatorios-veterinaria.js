/**
 * GUÍA DE USO: Recordatorios (veterinaria y clínica)
 *
 * Documenta la pantalla /app/alertas-veterinaria. La fuente son las VENTAS:
 * ver src/services/salesRemindersService.js. Reglas de redacción en pos.js.
 */
export default {
  id: 'recordatorios-veterinaria',
  actualizado: '02/09/2026',
  intro:
    'El baño, el alimento y la desparasitación —o la limpieza facial y el retoque, en una clínica— se repiten cada tanto, pero el cliente no lleva la cuenta: el que tiene que acordarse eres tú. Esta pantalla toma tus ventas y te dice a quién llamar — qué se llevó cada cliente, cuándo, y a quién ya se le pasó la fecha.',

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
          text: 'Si el mismo cliente vuelve a comprar lo mismo, el recordatorio se corre solo a partir de la compra nueva. No se acumulan avisos repetidos del mismo cliente.',
        },
      ],
    },

    {
      id: 'plazos',
      title: 'Cada cuánto se recuerda',
      blocks: [
        {
          type: 'texto',
          text: 'De fábrica son **30 días** para todo. Ese número lo cambias en **Configuración > Punto de venta**, en "Recordar cada venta a los (días)".',
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
          text: 'La pantalla abre en **Esta semana**: las personas a las que se les cumple el plazo en los próximos siete días. Esa es la rutina — entras, ves quiénes son y les escribes.',
        },
        {
          type: 'tabla',
          encabezados: ['Filtro', 'Qué muestra'],
          filas: [
            ['**Hoy**', 'Solo los de hoy: quien compró hace exactamente el plazo de ese producto. Es un día, así que muy seguido está vacío.'],
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
          type: 'ojo',
          text: '**Hoy en cero no es un error.** Para entrar ahí, un cliente tiene que haber comprado hace exactamente el plazo de ese producto: con el plazo en 30 días, los que compraron hace justo 30 días. Si ese día no vendiste, o esos clientes ya volvieron después, no hay nadie. Lo que sirve para la rutina es **Esta semana**.',
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
      id: 'filtros',
      title: 'Filtrar: ver solo lo que te interesa',
      blocks: [
        {
          type: 'texto',
          text: 'Arriba de la lista hay tres filtros. Dos recortan lo que ya está en pantalla y son instantáneos; el primero es distinto, porque decide **cuántas ventas se leen** y por lo tanto cuánto tarda la pantalla en abrir.',
        },
        {
          type: 'tabla',
          encabezados: ['Filtro', 'Qué hace'],
          filas: [
            ['**Ventas desde**', 'Hasta dónde mirar hacia atrás. Menos rango, menos espera. Empieza en 3 meses.'],
            ['**Servicio o producto**', 'Marca solo los que te interesan: el baño, la desparasitación. Lo demás desaparece de la lista.'],
            ['**Cliente o paciente**', 'Busca por nombre del cliente, nombre de la mascota o teléfono.'],
          ],
        },
        {
          type: 'ojo',
          text: '**Ventas desde** es el que hay que entender. Si tienes plazos largos —una vacuna que se repite al año— y el rango está en 3 meses, esa venta de hace diez meses no se leyó y su recordatorio no aparece. Para verlo, amplía el rango a **Último año** o **Todo el historial**.',
        },
        {
          type: 'consejo',
          text: 'El desplegable de servicios no ofrece tu catálogo entero: solo lo que de verdad está generando recordatorios, con el número de cuántos hay de cada uno al lado. Así se ve de un vistazo cuál conviene trabajar hoy.',
        },
        {
          type: 'texto',
          text: 'Los filtros de servicio y de cliente **no vuelven a consultar nada**: la lista ya está en memoria, así que marcarlos y desmarcarlos es inmediato. Solo cambiar **Ventas desde** vuelve a leer.',
        },
      ],
    },

    {
      id: 'vacunas',
      title: 'Vacunas y controles del historial',
      // La ficha con vacunas es de veterinaria; en clínica todo sale de las ventas.
      soloModos: ['veterinary'],
      blocks: [
        {
          type: 'texto',
          text: 'Además de las ventas, la pantalla muestra lo que cargaste a mano en la ficha del paciente: las **vacunas con su próxima dosis** y los servicios recurrentes del historial clínico. Se cargan desde **Clientes**, abriendo la ficha de la mascota.',
        },
        {
          type: 'consejo',
          text: 'Sirve para lo que no pasa por caja: un refuerzo que corresponde en seis meses, un control post-operatorio.',
        },
        {
          type: 'texto',
          text: 'Estos llegan **unos segundos después** que el resto: viven dentro de la ficha de cada cliente, así que hay que recorrerlas una por una. La pantalla no espera por ellos — muestra primero lo de las ventas y los suma cuando terminan. Mientras tanto verás el aviso *sumando vacunas y controles* abajo de los filtros.',
        },
        {
          type: 'ojo',
          text: 'Si tu negocio tiene **muchos clientes**, ese recorrido tarda de más y no se hace solo: aparece un aviso con un botón **Traerlas igual**. Los recordatorios de ventas —que son la mayoría— ya están completos en pantalla sin esperar nada.',
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
      a: 'Pon **0** en Configuración > Punto de venta, en "Recordar cada venta a los (días)". Ahí solo aparecerán los productos a los que les hayas puesto su propio plazo.',
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
