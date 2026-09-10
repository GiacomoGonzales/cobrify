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
  actualizado: '10/09/2026',
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
            ['Horario del local', 'La apertura y el cierre de cada día: desde qué hora cuenta una entrada y hasta qué hora una salida. Ver **Horario del local y jornadas**.'],
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
          text: 'Arriba de la lista eliges cómo verla: **Por jornada**, una fila por persona y por día con la hora que cuenta de entrada y de salida, el break y las horas trabajadas; o **Cada marcación**, la lista de siempre, una fila por escaneo.',
        },
        {
          type: 'texto',
          text: 'El botón de exportar baja a Excel la vista que tienes abierta. **Por jornada** trae la hora marcada y la que cuenta, el break programado y el tomado, y las horas. **Cada marcación** trae una columna de **Ubicación** (dentro de zona, fuera de zona o sin ubicación), otra con la **distancia en metros** y otra con la **hora que cuenta** cuando no es la marcada.',
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
          text: 'Los **breaks** son opcionales y se activan para todo el negocio. Con ellos encendidos, tu equipo puede marcar inicio y fin de su refrigerio, y el tiempo marcado se descuenta de la jornada, salvo que uses el break programado (más abajo).',
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
        {
          type: 'texto',
          text: 'Con **Descontar el break del turno** (en Configuración, debajo de los breaks), las horas del día descuentan el break que tiene el turno de cada persona en **Horarios**, lo haya marcado o no. Un turno de 12:00 a 21:00 con 1 hora de break da **8 horas**. Un día sin turno asignado descuenta lo marcado, como siempre.',
        },
        {
          type: 'tabla',
          encabezados: ['En la vista Por jornada', 'Quiere decir'],
          filas: [
            ['Completo', 'Tomó el break programado, con 5 minutos de holgura para arriba o para abajo.'],
            ['Interrumpido', 'Volvió antes de completarlo.'],
            ['Excedido', 'Se pasó del tiempo programado.'],
            ['No marcó break', 'Ese día no hay marcas de break.'],
            ['Break sin cerrar', 'Empezó un break y no lo terminó.'],
            ['Sin break programado', 'Marcó un break en un turno que no lo tiene (por ejemplo, un part time).'],
          ],
        },
        {
          type: 'consejo',
          text: 'Si alguien tomó su break en dos partes, la vista lo dice (por ejemplo, 60 de 60 min en 2 tramos). Lo que se compara es el total contra lo programado.',
        },
      ],
    },

    {
      id: 'horario-del-local',
      title: 'Horario del local y jornadas',
      blocks: [
        {
          type: 'texto',
          text: 'En **Configuración**, cada sucursal tiene su **Horario del local**. Marca **Contar las horas según el horario del local** y pon la apertura y el cierre de cada día. Desde ahí, las horas se cuentan dentro de ese horario.',
        },
        {
          type: 'tabla',
          encabezados: ['Si la persona', 'Lo que cuenta'],
          filas: [
            ['Marca antes de la apertura (11:30, y el local abre a las 12:00)', 'Desde la apertura (12:00). La marca queda **Por revisar**.'],
            ['Marca después del cierre (23:40, y el local cierra a las 23:00)', 'Hasta el cierre (23:00). La marca queda **Por revisar**.'],
            ['No marca su salida', 'Hasta el cierre, una vez que el cierre pasó.'],
            ['Marca dentro del horario', 'La hora que marcó, como siempre.'],
          ],
        },
        {
          type: 'texto',
          text: 'Tú decides en **Marcaciones**, vista **Por jornada**. Cada entrada o salida por revisar trae el botón **Revisar**, con tres opciones: la hora que marcó, la del local u otra hora que escribes tú, por ejemplo 11:45. Lo que elijas es lo que la persona ve en su app. Si no decides nada, se queda la hora del local.',
        },
        {
          type: 'ojo',
          text: 'La marca original no se borra ni se cambia: sigue diciendo a qué hora se escaneó. Lo que cambia es la hora que **cuenta** para las horas del día.',
        },
        {
          type: 'consejo',
          text: 'Si el turno de alguien empieza antes de la apertura, por ejemplo producción a las 8:00, para esa persona cuenta el inicio de su turno y no la apertura. Lo mismo con un turno que termina después del cierre.',
        },
        {
          type: 'texto',
          text: 'A quien no marcó su salida le puedes poner la hora real con **Poner hora de salida**: queda guardada como una marcación manual. Una **Marcación manual** no se alinea al horario, porque esa hora ya la pusiste tú, y una marcación **rechazada** no cuenta para las horas.',
        },
        {
          type: 'ojo',
          text: 'El horario no puede pasar de la medianoche: el cierre tiene que ser el mismo día que la apertura. Un día marcado como cerrado cuenta las horas tal como se marcaron.',
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
          text: 'El dueño y los administradores ven todo: Marcaciones, Personal, Horarios, Vacaciones y Configuración. Un sub-usuario común solo ve **Marcar** y **Mi historial**, con su jornada de hoy y sus últimos días. En su jornada ve la **hora que cuenta**: si aprobaste o ajustaste una hora, ve esa, y si una marca está por revisar, se lo dice. **Mi historial** muestra cada escaneo tal como lo hizo. Nadie que no administre puede ver ni aprobar las marcaciones de otros.',
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
      a: 'No. Con el **Horario del local** activado, esa jornada sale a la hora del cierre. Sin horario, al día siguiente el sistema cierra ese turno al final del día anterior y lo deja como **Auto-cerrado**. En los dos casos puedes poner la hora real desde **Marcaciones**, vista **Por jornada**, con **Poner hora de salida**.',
    },
    {
      q: '¿Puedo marcar desde la computadora?',
      a: 'No. La pestaña **Marcar** solo existe en la app del celular, porque necesita la cámara para el QR y el GPS para la ubicación. Desde la computadora se administra y se consulta.',
    },
    {
      q: 'No quiero controlar por ubicación, solo la hora. ¿Se puede?',
      a: 'Sí. Deja la sucursal sin zona configurada, o usa **Quitar zona** si ya la tenías. Sin zona, todas las marcaciones se aprueban automáticamente y solo se registra la hora.',
    },
    {
      q: 'Mi empleado llegó antes de que abra el local. ¿Se le cuenta ese tiempo?',
      a: 'Con el **Horario del local** activado, no, hasta que tú lo apruebes: su entrada cuenta desde la apertura y la marca queda **Por revisar**. En **Marcaciones**, vista **Por jornada**, tocas **Revisar** y eliges la hora que marcó, la de apertura u otra hora.',
    },
    {
      q: '¿Por qué mi empleado ve 8 horas si estuvo 9?',
      a: 'Porque está activado **Descontar el break del turno**: su turno tiene 1 hora de break programado y esa hora se descuenta, la haya marcado o no. Lo que marcó queda como control en la vista **Por jornada**.',
    },
  ],
}
