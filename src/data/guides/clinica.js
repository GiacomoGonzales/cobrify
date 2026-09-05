/**
 * GUÍA DE USO: Modo Clínica (estética, dental, consultorio)
 *
 * Es la guía de ENTRADA del modo: no documenta una pantalla sino el recorrido
 * de una clínica que recién pasa a este modo. Va con `route: null` y se lee
 * desde el manual, igual que la guía del catálogo online.
 *
 * Nombres verificados el 04/09/2026 contra Sidebar.jsx (el menú), Products.jsx
 * ("Nuevo Producto", "No manejar stock", "Recordar servicio (días)"),
 * Sellers.jsx ("Nuevo Vendedor"), VeterinaryAgenda.jsx ("Agendar cita",
 * "Atender ahora", "Iniciar atención", "Finalizar y Cobrar", "Especialista"),
 * settings/Modulos.jsx ("Tipo de negocio", "Menú lateral"),
 * settings/Catalogo.jsx ("Recibir reservas desde el catálogo", "Quién atiende")
 * y settings/PuntoDeVenta.jsx ("Recordar cada venta a los (días)").
 *
 * Ver reglas de redacción en pos.js y en GuideRenderer.jsx: cada botón que se
 * nombra existe con ese nombre exacto en la pantalla.
 */
export default {
  id: 'clinica',
  actualizado: '04/09/2026',
  intro:
    'El modo Clínica es para quien atiende con cita: estética, odontología, podología, un consultorio. El menú se queda con lo que una clínica usa todos los días —Agenda, Pacientes, Tratamientos y el cobro— y lo demás va en grupos plegados. Tus datos no cambian al pasar a este modo: los clientes, productos y ventas de antes siguen ahí.',

  sections: [
    {
      id: 'activar',
      title: 'Pasar tu negocio a modo Clínica',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Entra a **Configuración > Módulos**.',
            'En **Tipo de negocio**, elige **Clínica** en el desplegable Modo.',
            'Presiona **Guardar**. El menú lateral cambia al instante.',
          ],
        },
        {
          type: 'texto',
          text: 'Nada se borra ni se convierte. Clientes pasa a llamarse **Pacientes**, Productos y Servicios pasa a ser **Tratamientos y productos** y Vendedores pasa a ser **Profesionales**: son las mismas pantallas con el nombre de tu rubro.',
        },
        {
          type: 'ojo',
          text: 'Si un sub-usuario ya tenía permisos, los conserva: el permiso es de la pantalla, no del nombre que lleva en el menú.',
        },
      ],
    },

    {
      id: 'menu',
      title: 'Qué hay en el menú',
      blocks: [
        {
          type: 'tabla',
          encabezados: ['Entrada', 'Para qué'],
          filas: [
            ['**Agenda**', 'El calendario: agendar, confirmar, atender y cobrar cada cita.'],
            ['**Pacientes**', 'La ficha de cada persona: datos, alergias, antecedentes e historial de atenciones.'],
            ['**Tratamientos y productos**', 'Lo que vendes: tratamientos (sin stock) y productos (con stock).'],
            ['**Punto de Venta**', 'Donde se cobra y se emite la boleta o la factura.'],
            ['**Ventas**', 'Todo lo emitido, con los saldos pendientes y el botón Registrar Pago.'],
            ['**Control de Caja**', 'Apertura y cierre del día.'],
            ['**Recordatorios**', 'Pestaña Citas: confirmar por WhatsApp las de mañana. Pestaña Ventas y servicios: a quién le toca volver.'],
            ['**Mi Catálogo Online**', 'Tu página pública, con reservas de citas si las activas.'],
            ['**Inventario y compras, Equipo, Reportes & Finanzas, Otros**', 'Grupos plegados con lo que se usa de vez en cuando.'],
          ],
        },
        {
          type: 'texto',
          text: 'Lo que no uses se apaga en **Configuración > Módulos**, en la sección **Menú lateral**: desmarca la casilla, guarda y desaparece del menú.',
        },
      ],
    },

    {
      id: 'tratamientos',
      title: 'Cargar tus tratamientos',
      blocks: [
        {
          type: 'pasos',
          items: [
            'Ve a **Tratamientos y productos** y presiona **Nuevo Producto**.',
            'Escribe el nombre (Limpieza facial profunda, Consulta de evaluación) y el precio.',
            'Marca **No manejar stock**: un tratamiento es un servicio, no se descuenta de ningún almacén.',
            'Pon la **Duración (minutos)**: la Agenda ocupa esos huecos cuando lo agendas.',
            'Si el tratamiento se repite cada cierto tiempo, pon los días en **Recordar servicio (días)**. Guarda.',
          ],
        },
        {
          type: 'texto',
          text: 'Los productos que sí vendes —una crema, un protector solar— se cargan igual pero con su stock, y el sistema los descuenta al cobrarlos.',
        },
        { type: 'enlace', to: '/app/manual/productos', label: 'Guía completa de Productos' },
      ],
    },

    {
      id: 'ficha',
      title: 'La ficha del paciente',
      blocks: [
        {
          type: 'texto',
          text: 'En **Pacientes**, toca la fila de la persona: se abre su ficha con lo importante arriba —alergia en rojo, **próxima cita**, **última atención**, **sesiones disponibles** y **deuda pendiente**— y debajo las pestañas **Resumen**, **Atenciones**, **Paquetes**, **Galería** y **Compras**.',
        },
        {
          type: 'pasos',
          items: [
            'En la pestaña **Anamnesis** marcas enfermedades, alergias, medicación y hábitos, y presionas **Guardar anamnesis**. La alergia sale en rojo en la lista; embarazo y lactancia, como aviso.',
            'Para cambiar datos de contacto, presiona **Editar**.',
            'Cada visita, **Agregar atención** (en la pestaña Atenciones o al terminar la cita en la Agenda). La más reciente queda primero.',
            'Las fotos del antes y el después van en la pestaña **Galería**: **Agregar foto** con su etiqueta; apenas hay una de cada lado, se ven juntas arriba.',
            '**Agendar cita** abre la Agenda con el paciente ya elegido; **WhatsApp** abre el chat.',
          ],
        },
        {
          type: 'consejo',
          text: 'La lista muestra teléfono, edad y **última atención**, y se puede ordenar por ella: así sabes de un vistazo quién no vuelve hace tiempo. Fidelización, Importar y Exportar están bajo el botón **Más**.',
        },
        {
          type: 'texto',
          text: 'Tus propias preguntas de anamnesis ("¿se hizo botox hace poco?", "¿toma isotretinoína?") se arman en **Configuración > Punto de venta**, en **Preguntas propias de la anamnesis**, con **Agregar pregunta**. Aparecen al final de la anamnesis de cada paciente.',
        },
        { type: 'enlace', to: '/app/manual/clientes', label: 'Guía completa de la ficha' },
      ],
    },

    {
      id: 'paquetes',
      title: 'Paquetes de sesiones',
      blocks: [
        {
          type: 'texto',
          text: 'Un paquete ("6 sesiones de láser") se cobra una vez y se va usando cita por cita. Para que el sistema lo lleve por ti:',
        },
        {
          type: 'pasos',
          items: [
            'En el tratamiento, pon **Sesiones incluidas** (por ejemplo 6) y guarda.',
            'Cóbralo en el Punto de Venta con el paciente **elegido**: el paquete queda en su ficha.',
            'En cada cita, desde **En atención**, presiona **Usar sesión del paquete**: la cita se completa sin volver a cobrar.',
            'En la ficha del paciente, la pestaña **Paquetes** muestra cuántas sesiones le quedan; ahí también se descuenta a mano (**Usar sesión**) o se carga con **Agregar paquete** uno que venía de antes.',
          ],
        },
        {
          type: 'consejo',
          text: 'La lista de Pacientes muestra las sesiones disponibles junto al nombre, así en recepción se sabe sin abrir nada.',
        },
      ],
    },

    {
      id: 'profesionales',
      title: 'Quién atiende',
      blocks: [
        {
          type: 'texto',
          text: 'Los profesionales se cargan en **Equipo > Profesionales**. Por dentro la pantalla se llama Vendedores —es la misma del resto del sistema— y el botón para agregar es **Nuevo Vendedor**.',
        },
        {
          type: 'texto',
          text: 'Con ellos cargados, la Agenda pregunta **Especialista** al agendar y cada venta queda a nombre de quien atendió. Eso es lo que alimenta las comisiones por profesional.',
        },
        { type: 'enlace', to: '/app/manual/vendedores', label: 'Guía de Vendedores y comisiones' },
      ],
    },

    {
      id: 'agenda',
      title: 'Agendar, atender y cobrar',
      blocks: [
        {
          type: 'pasos',
          items: [
            'En **Agenda**, toca el día y luego una hora libre, o presiona **Agendar cita**.',
            'Elige al paciente (o créalo ahí mismo), los tratamientos y, si corresponde, el Especialista.',
            'Cuando llega, **Iniciar atención**. Si viene sin cita, **Atender ahora**.',
            'Al terminar, **Registrar atención**: tratamiento, recomendaciones y próximo control quedan en la ficha.',
            '**Finalizar y Cobrar** (o **Guardar y cobrar** desde el mismo registro): el Punto de Venta se abre con el paciente y los tratamientos ya cargados.',
          ],
        },
        {
          type: 'consejo',
          text: 'El botón verde de WhatsApp de cada cita arma el mensaje de confirmación con el día y la hora. Tú solo lo envías.',
        },
        { type: 'enlace', to: '/app/manual/agenda-citas', label: 'Guía completa de la Agenda' },
      ],
    },

    {
      id: 'reservas',
      title: 'Que el paciente reserve solo',
      blocks: [
        {
          type: 'texto',
          text: 'Tu catálogo online puede mostrar un calendario con tus horas libres. El paciente elige el tratamiento, el día y la hora, deja su nombre y su teléfono, y la cita aparece sola en tu Agenda.',
        },
        {
          type: 'pasos',
          items: [
            'En **Configuración > Catálogo**, activa **Recibir reservas desde el catálogo**.',
            'Define los días, el horario y cada cuántos minutos hay un turno.',
            'Agrega los tratamientos que se pueden reservar y, si atienden varias personas, a cada una en **Quién atiende**.',
            'Presiona **Guardar** y comparte el link de tu catálogo.',
          ],
        },
      ],
    },

    {
      id: 'cobrar',
      title: 'Cobrar en partes',
      blocks: [
        {
          type: 'texto',
          text: 'Un tratamiento largo muchas veces se paga en cuotas. Al cobrar en el Punto de Venta puedes dejar un saldo pendiente y registrar cada abono después desde **Ventas**, con **Registrar Pago**. Lo que debe cada paciente se ve en el reporte **Pagos Pendientes** de esa misma pantalla.',
        },
        { type: 'enlace', to: '/app/manual/vender-al-credito', label: 'Cómo vender al crédito y cobrar después' },
      ],
    },

    {
      id: 'recordatorios',
      title: 'Hacer que vuelvan',
      blocks: [
        {
          type: 'texto',
          text: 'En **Recordatorios**, la pestaña **Citas** lista las de hoy, mañana o la semana que faltan confirmar, con el botón de WhatsApp y **Marcar como confirmada**; el texto del mensaje se edita en **Configuración > Punto de venta** (**Mensaje de recordatorio de cita**). La pestaña **Ventas y servicios** se arma sola con tus ventas: si cobraste una limpieza facial a un paciente registrado, a los 30 días aparece para que le escribas. El plazo general está en **Recordar cada venta a los (días)**; el de un tratamiento puntual, en su ficha.',
        },
        { type: 'enlace', to: '/app/manual/recordatorios-veterinaria', label: 'Guía de Recordatorios' },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Pierdo algo al cambiar de General a Clínica?',
      a: 'No. Cambian el menú y los nombres; los datos, las series de comprobantes y la configuración de SUNAT quedan igual. Y puedes volver a General por el mismo camino.',
    },
    {
      q: '¿Puedo seguir vendiendo productos con stock?',
      a: 'Sí. Tratamientos y productos conviven en la misma lista: los tratamientos sin stock y los productos con el suyo. Inventario y Compras siguen en el menú, dentro del grupo Inventario y compras.',
    },
    {
      q: 'Soy odontólogo, ¿me sirve?',
      a: 'Sí, es el mismo modo. Lo que cambia entre una estética y un consultorio dental es el catálogo de tratamientos que cargues.',
    },
    {
      q: 'No veo Recordatorios ni Cotizaciones en el menú.',
      a: 'Alguien las desmarcó en Configuración > Módulos, en Menú lateral. Vuelve a marcar la casilla y guarda.',
    },
  ],
}
