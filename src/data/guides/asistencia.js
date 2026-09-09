/**
 * GUÍA DE USO: Personal / Control de Asistencia
 *
 * Nombres verificados contra src/pages/Attendance.jsx, src/services/attendanceService.js
 * y src/components/personnel/*. Ver reglas de redacción en pos.js y en GuideRenderer.jsx.
 *
 * Escrita el 8-set-2026 junto con el arreglo del geofence: hasta ese día, una
 * marcación sin ubicación se aprobaba sola desde cualquier lugar, y no había
 * ninguna guía que explicara que el permiso de ubicación es parte del circuito.
 */
export default {
  id: 'asistencia',
  actualizado: '09/09/2026',
  intro:
    'Personal es donde tu equipo marca entrada y salida, y donde tú ves quién llegó, a qué hora y desde dónde. La marcación se hace escaneando un QR pegado en el local, desde la app del celular.',

  sections: [
    {
      id: 'como-funciona',
      title: 'Cómo funciona en una frase',
      blocks: [
        {
          type: 'texto',
          text: 'Cada sucursal tiene **su propio QR**. Lo imprimes y lo pegas en la entrada. Tu empleado abre la app, va a **Personal**, toca **Marcar** y escanea ese QR. El sistema registra la hora, la sucursal y **dónde estaba** al marcar.',
        },
        {
          type: 'texto',
          text: 'No hace falta decirle al sistema si es entrada o salida: lo deduce de la marcación anterior. La primera del día es **Entrada**, la siguiente **Salida**. Si alguien entró y se olvidó de marcar la salida, al día siguiente el sistema cierra ese turno solo y lo deja anotado como **Auto-cerrado**.',
        },
        {
          type: 'ojo',
          text: 'La pestaña **Marcar** solo aparece en la **app del celular**, porque necesita la cámara y el GPS. Desde una computadora se ven las marcaciones, pero no se marca.',
        },
      ],
    },

    {
      id: 'configurar',
      title: 'Configurar una sucursal',
      blocks: [
        {
          type: 'texto',
          text: 'En la pestaña **Configuración** aparece cada una de tus sucursales. Marca **Habilitar asistencia** en las que quieras usar y se genera el QR de esa sucursal.',
        },
        {
          type: 'tabla',
          encabezados: ['Control', 'Para qué sirve'],
          filas: [
            ['Descargar PNG', 'Baja el QR de esa sucursal para imprimirlo.'],
            ['Regenerar', 'Crea un QR nuevo. Úsalo si alguien le sacó foto al cartel: los carteles viejos dejan de funcionar en el acto.'],
            ['Zona permitida (GPS)', 'La latitud, la longitud y el radio en metros dentro del cual se puede marcar. **Usar mi ubicación** los llena parado en la puerta del local.'],
            ['Tolerancia de tardanza', 'Los minutos de gracia antes de que una entrada cuente como Tardanza. Por defecto, 15.'],
          ],
        },
        {
          type: 'consejo',
          text: 'Para el radio, 100 o 150 metros suele ser lo correcto. Más chico y el GPS de un celular en interiores empieza a fallar; más grande y cubre la cuadra entera.',
        },
      ],
    },

    {
      id: 'ubicacion',
      title: 'La zona y el permiso de ubicación',
      blocks: [
        {
          type: 'texto',
          text: 'Si **no** configuras zona, todas las marcaciones se aprueban solas: no hay nada que comprobar. Si configuras zona, el sistema mide la distancia entre donde está la persona y el centro que fijaste, y aprueba solo las que caen dentro del radio.',
        },
        {
          type: 'ojo',
          text: 'Con zona configurada, una marcación queda **Pendiente de aprobación** en dos casos distintos, y el sistema te dice cuál: **Fuera de zona**, cuando la persona marcó lejos; y **Sin ubicación**, cuando el celular no entregó su posición. Los dos aparecen así en el historial y en el Excel.',
        },
        {
          type: 'texto',
          text: '"Sin ubicación" casi siempre significa que la app **no tiene el permiso de ubicación** en ese celular. Revísalo con tu equipo la primera vez: sin ese permiso, todas sus marcaciones te van a llegar pendientes de aprobación.',
        },
        {
          type: 'consejo',
          text: 'Una marcación sin ubicación no se rechaza, queda para que la revises. Perder el fichaje de alguien que sí fue a trabajar sería peor que darte una revisión de más.',
        },
      ],
    },

    {
      id: 'marcaciones',
      title: 'Ver y aprobar las marcaciones',
      blocks: [
        {
          type: 'texto',
          text: 'La pestaña **Marcaciones** lista todo lo registrado, con filtros por empleado, sucursal y rango de fechas. Cada fila muestra la fecha y hora, quién marcó, la sucursal, el turno y el estado: **Aprobado**, **Pendiente**, **Rechazado**, **Manual** o **Auto-cerrado**.',
        },
        {
          type: 'texto',
          text: 'Las pendientes traen los botones para **Aprobar** o **Rechazar**. Es tu decisión: el sistema solo te avisa que algo no cuadró.',
        },
        {
          type: 'texto',
          text: 'Con **Marcación manual** registras a mano una entrada o salida que se perdió, eligiendo empleado, tipo, fecha y hora, y dejando una nota del motivo. Queda marcada como **Manual** para que después se sepa que no salió de un escaneo.',
        },
        {
          type: 'texto',
          text: 'El botón de exportar baja todo a Excel, con una columna de **Ubicación** (dentro de zona, fuera de zona o sin ubicación) y otra con la **distancia en metros**.',
        },
      ],
    },

    {
      id: 'horarios-tardanza',
      title: 'Horarios, tardanzas y breaks',
      blocks: [
        {
          type: 'texto',
          text: 'En **Horarios** asignas a cada persona sus turnos. Con un horario cargado, el sistema compara la hora de entrada contra la hora que le tocaba y etiqueta la marcación como **Tardanza** si se pasó de la tolerancia. Sin horario asignado no hay contra qué comparar y no hay tardanza.',
        },
        {
          type: 'texto',
          text: 'Si el día está cubierto por una vacación o un permiso aprobado, la entrada se etiqueta como **Justificada** en lugar de tardanza.',
        },
        {
          type: 'texto',
          text: 'Los **breaks** son opcionales y se activan para todo el negocio. Con ellos encendidos, tu equipo puede marcar inicio y fin de su refrigerio, y el tiempo de break se descuenta de la jornada.',
        },
        {
          type: 'texto',
          text: 'El sistema **no adivina** si vas a break o te vas a casa: el botón grande de **Marcar** dice de antemano qué va a registrar el próximo escaneo, y el break tiene su propio botón aparte.',
        },
        {
          type: 'tabla',
          encabezados: ['Si el botón dice', 'El QR registra'],
          filas: [
            ['Marcar entrada', 'Tu entrada del día'],
            ['Marcar salida', 'Tu salida (y cierra la jornada)'],
            ['Iniciar break (botón aparte, color ámbar)', 'El inicio de tu refrigerio'],
            ['Terminar break', 'El fin del refrigerio; vuelves a trabajar'],
          ],
        },
        {
          type: 'ojo',
          text: 'Estando en break, **cualquier** marcación lo termina: no se puede cerrar la jornada con el refrigerio abierto, porque quedaría un tiempo que nadie puede medir. Primero vuelves del break y después marcas tu salida.',
        },
        {
          type: 'consejo',
          text: 'El botón de **Iniciar break** solo aparece mientras estás trabajando y si el negocio tiene los breaks encendidos. Si no lo ves, o no están activados en Configuración, o todavía no marcaste tu entrada.',
        },
      ],
    },

    {
      id: 'personal-vacaciones',
      title: 'Personal y Vacaciones',
      blocks: [
        {
          type: 'texto',
          text: '**Personal** es el directorio de tu equipo, con su área y sus datos, y se puede buscar y filtrar. **Vacaciones** lleva la cuenta de los días de cada uno: cuántos le tocan al año, cuántos gozó, cuántos tiene pendientes y cuántos le quedan disponibles, con el historial de cada solicitud.',
        },
        {
          type: 'texto',
          text: 'Desde ahí creas un permiso o unas vacaciones eligiendo la persona y el rango de fechas. Un permiso aprobado es lo que hace que una entrada tarde de ese día salga como Justificada.',
        },
      ],
    },

    {
      id: 'que-ve-cada-uno',
      title: 'Qué ve cada quien',
      blocks: [
        {
          type: 'texto',
          text: 'El dueño y los administradores ven todo: Marcaciones, Personal, Horarios, Vacaciones y Configuración. Un sub-usuario común solo ve **Marcar** y **Mi historial**, con su jornada de hoy y sus últimos días. Nadie que no administre puede ver ni aprobar las marcaciones de otros.',
        },
      ],
    },
  ],

  preguntas: [
    {
      q: '¿Por qué mis empleados marcan bien pero todo queda pendiente de aprobación?',
      a: 'Casi siempre es el **permiso de ubicación**. Si el celular no entrega su posición y tienes una zona configurada, la marcación queda pendiente y el historial la muestra como **Sin ubicación**. Revisa que la app tenga activado el permiso de ubicación en cada teléfono.',
    },
    {
      q: '¿Puedo usar el mismo QR en todos mis locales?',
      a: 'No, y es a propósito: el QR es lo que identifica en qué sucursal se marcó. Cada sucursal genera el suyo desde **Configuración**.',
    },
    {
      q: 'Alguien le sacó foto al QR para marcar desde su casa. ¿Qué hago?',
      a: 'Dos cosas. **Regenera** el QR de esa sucursal, con lo que el cartel fotografiado deja de servir, y configura la **zona permitida** si aún no lo hiciste: con zona, marcar desde lejos ya no se aprueba solo.',
    },
    {
      q: 'Se me olvidó marcar la salida ayer. ¿Queda abierta para siempre?',
      a: 'No. Al día siguiente el sistema cierra ese turno al final del día anterior y lo deja como **Auto-cerrado**. Si la hora real fue otra, corrígela con una **Marcación manual**.',
    },
    {
      q: '¿Puedo marcar desde la computadora?',
      a: 'No. La pestaña **Marcar** solo existe en la app del celular, porque necesita la cámara para el QR y el GPS para la ubicación. Desde la computadora se administra y se consulta.',
    },
    {
      q: 'No quiero controlar por ubicación, solo la hora. ¿Se puede?',
      a: 'Sí. Deja la sucursal sin zona configurada, o usa **Quitar zona** si ya la tenías. Sin zona, todas las marcaciones se aprueban automáticamente y solo se registra la hora.',
    },
  ],
}
