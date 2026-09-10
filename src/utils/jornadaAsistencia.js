/**
 * LA JORNADA: qué hora cuenta, cuántas horas se trabajaron y cómo fue el break.
 *
 * Pedido de Mandil Taquería (10-set-2026). Las marcas NO se tocan: se guardan
 * tal cual las hizo el trabajador. Lo que cambia es qué hora CUENTA, y eso se
 * calcula acá con el horario del local, el turno de la persona y lo que decidió
 * el administrador. Lo usan la vista "Por jornada" del administrador, la
 * tarjeta "Hoy" y "Días anteriores" del trabajador y el Excel, para que digan
 * todos lo mismo.
 *
 * ENTRADA. Con el horario del local activado, quien marca antes de la apertura
 * entra "alineado" a la apertura y su marca queda por revisar. El
 * administrador decide: la hora que marcó, la de apertura u otra hora. Si el
 * TURNO de la persona empieza antes de que abra el local (producción entra a
 * las 8 y el local abre a las 12), para esa persona cuenta el inicio de su
 * turno: si no, a producción se le recortarían cuatro horas cada día.
 *
 * SALIDA. Lo mismo con el cierre: quien marca después del cierre sale alineado
 * al cierre, por revisar. Quien no marca salida sale al cierre, una vez que el
 * cierre pasó. Un turno que termina después del cierre lo extiende.
 *
 * BREAK. Con "Descontar el break del turno" activado se descuenta el break
 * programado del turno (12:00 a 21:00 con 1 hora de break = 8 horas), lo haya
 * marcado o no. Lo que marcó queda como control: si lo tomó completo, lo cortó
 * antes o se pasó. Sin esa opción, como siempre: se descuenta lo marcado.
 *
 * Una marca que carga el administrador a mano (Marcación manual) no se alinea:
 * esa hora ya la decidió él. Una marca RECHAZADA no cuenta.
 */
import { MARCA_ENTRADA, MARCA_SALIDA, breaksDelDia } from './attendanceMarks'

// La Principal no es un documento de `branches`: las marcas del QR la guardan
// como 'main' y las manuales como null. Las dos son la misma sucursal.
export const SUCURSAL_PRINCIPAL = 'main'

// Un break de 58 minutos contra 60 programados es un break completo. Sin esta
// holgura, casi todos saldrían "interrumpidos" por segundos.
export const TOLERANCIA_DEL_BREAK_MIN = 5

// Lo que decide el administrador sobre una marca fuera de horario.
export const DECISION_HORA_MARCADA = 'real'
export const DECISION_HORARIO = 'horario'
export const DECISION_AJUSTADA = 'ajustada'
export const DECISIONES_DE_HORA = [DECISION_HORA_MARCADA, DECISION_HORARIO, DECISION_AJUSTADA]

// `key` es Date.getDay() (0 = domingo), el mismo formato del horario del
// catálogo. Se muestran de lunes a domingo.
export const DIAS_DEL_HORARIO = [
  { key: 1, nombre: 'Lunes' },
  { key: 2, nombre: 'Martes' },
  { key: 3, nombre: 'Miércoles' },
  { key: 4, nombre: 'Jueves' },
  { key: 5, nombre: 'Viernes' },
  { key: 6, nombre: 'Sábado' },
  { key: 0, nombre: 'Domingo' },
]

const DESDE_POR_DEFECTO = '09:00'
const HASTA_POR_DEFECTO = '18:00'

const pad = (n) => String(n).padStart(2, '0')

/** El horario con el que arranca una sucursal que nunca lo configuró. */
export const horarioPorDefecto = () => ({
  enabled: false,
  days: Object.fromEntries(DIAS_DEL_HORARIO.map(({ key }) => [key, { open: true, from: DESDE_POR_DEFECTO, to: HASTA_POR_DEFECTO }])),
})

/** 'HH:mm' a minutos desde la medianoche. null si no es una hora válida. */
export const aMinutos = (hhmm) => {
  const partes = String(hhmm ?? '').trim().split(':')
  if (partes.length !== 2 || !partes.every((p) => /^\d{1,2}$/.test(p))) return null
  const [h, m] = partes.map(Number)
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** Acepta Date, Timestamp de Firestore ({toDate} o {seconds}) o texto. */
export const aFecha = (valor) => {
  if (!valor) return null
  let d
  if (valor instanceof Date) d = valor
  else if (typeof valor.toDate === 'function') d = valor.toDate()
  else if (typeof valor.seconds === 'number') d = new Date(valor.seconds * 1000)
  else d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 'YYYY-MM-DD' en hora local. */
export const claveDeFecha = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** '09:05', en 24 horas, igual en la pantalla, en el celular y en el Excel. */
export const horaCorta = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '')

/** Duración en 'h:mm' para el Excel. */
export const duracionHHMM = (ms) => {
  if (ms == null || ms < 0) return ''
  const min = Math.floor(ms / 60000)
  return `${Math.floor(min / 60)}:${pad(min % 60)}`
}

/** Horas con dos decimales, para sumar en el Excel. */
export const horasDecimales = (ms) => (ms == null ? '' : Math.round(ms / 36000) / 100)

const enHora = (fecha, hhmm) => {
  const min = aMinutos(hhmm)
  if (min == null || !fecha) return null
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), Math.floor(min / 60), min % 60, 0, 0)
}

// Se compara al minuto: quien marca 11:59:40 marcó a las 11:59, y quien marca
// 12:00:30 marcó a las 12:00, que es la apertura.
const minutoDe = (d) => Math.floor(d.getTime() / 60000)

const mismoDia = (a, b) => !!a && !!b
  && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** La sucursal de una marca, con la Principal siempre como 'main'. */
export const sucursalDeLaMarca = (marca) => marca?.branchId || SUCURSAL_PRINCIPAL

// Firestore guarda las claves del mapa como texto ('0'..'6').
const diaDelHorario = (horario, key) => horario?.days?.[key] ?? horario?.days?.[String(key)] ?? null

/** Completa y ordena un horario para guardarlo. */
export const normalizarHorario = (horario) => {
  const base = horarioPorDefecto()
  const hora = (valor, porDefecto) => (aMinutos(valor) == null ? porDefecto : String(valor).trim().padStart(5, '0'))
  const days = {}
  for (const { key } of DIAS_DEL_HORARIO) {
    const d = diaDelHorario(horario, key) || {}
    days[key] = {
      open: d.open === undefined ? base.days[key].open : d.open === true,
      from: hora(d.from, base.days[key].from),
      to: hora(d.to, base.days[key].to),
    }
  }
  return { enabled: horario?.enabled === true, days }
}

/**
 * Qué está mal en un horario, en palabras del usuario. null si está bien.
 *
 * El cierre no puede pasar de la medianoche: la jornada se agrupa por día y
 * una salida a la 1 de la mañana caería en el día siguiente.
 */
export const errorDelHorario = (horario) => {
  if (!horario || horario.enabled !== true) return null
  let abiertos = 0
  for (const { key, nombre } of DIAS_DEL_HORARIO) {
    const d = diaDelHorario(horario, key)
    if (!d || d.open !== true) continue
    abiertos++
    const desde = aMinutos(d.from)
    const hasta = aMinutos(d.to)
    if (desde == null || hasta == null) return `${nombre}: falta la hora de apertura o la de cierre.`
    if (hasta <= desde) return `${nombre}: el cierre tiene que ser después de la apertura. El horario no puede pasar de la medianoche.`
  }
  if (abiertos === 0) return 'Marca al menos un día abierto, o apaga el horario del local.'
  return null
}

/** Apertura y cierre del local ese día. null si no hay horario o no abre. */
export const horarioDelLocalEnFecha = (horario, fecha) => {
  if (!horario || horario.enabled !== true || !fecha) return null
  const d = diaDelHorario(horario, fecha.getDay())
  if (!d || d.open !== true) return null
  const desde = aMinutos(d.from)
  const hasta = aMinutos(d.to)
  if (desde == null || hasta == null || hasta <= desde) return null
  return { apertura: enHora(fecha, d.from), cierre: enHora(fecha, d.to) }
}

/** ¿La celda del planificador es un turno de trabajo (no un descanso)? */
export const esTurnoDeTrabajo = (celda) => !!celda && !celda.rest && !!celda.start && !!celda.end

/** Minutos de break programados en el turno. null si ese día no tiene turno. */
export const breakProgramadoDelTurno = (celda) => (
  esTurnoDeTrabajo(celda) ? Math.max(0, Number(celda.breakMinutes) || 0) : null
)

/**
 * Desde y hasta qué hora se cuenta ese día, para esa persona.
 *
 * Es el horario del local, estirado por el turno: si el turno empieza antes de
 * la apertura, cuenta desde el inicio del turno; si termina después del
 * cierre, hasta el fin del turno. Sin horario del local, o si el local no abre
 * ese día, no se alinea nada (null).
 */
export const referenciaDelDia = ({ fecha, horario, turno = null }) => {
  const local = horarioDelLocalEnFecha(horario, fecha)
  if (!local) return null
  let { apertura, cierre } = local
  let aperturaPorTurno = false
  let cierrePorTurno = false
  if (esTurnoDeTrabajo(turno)) {
    const inicio = aMinutos(turno.start)
    const fin = aMinutos(turno.end)
    if (inicio != null && inicio < apertura.getHours() * 60 + apertura.getMinutes()) {
      apertura = enHora(fecha, turno.start)
      aperturaPorTurno = true
    }
    // Un turno que cruza la medianoche no estira el cierre: no se puede.
    if (inicio != null && fin != null && fin > inicio && fin > cierre.getHours() * 60 + cierre.getMinutes()) {
      cierre = enHora(fecha, turno.end)
      cierrePorTurno = true
    }
  }
  return { apertura, cierre, aperturaPorTurno, cierrePorTurno }
}

/** Lo que decidió el administrador sobre esta marca, o null. */
export const decisionDeLaMarca = (marca) => {
  const a = marca?.ajusteHorario
  if (!a || !DECISIONES_DE_HORA.includes(a.decision)) return null
  const hora = a.decision === DECISION_AJUSTADA ? aFecha(a.hora) : null
  if (a.decision === DECISION_AJUSTADA && !hora) return null
  return { decision: a.decision, hora, porNombre: a.porNombre || '', en: aFecha(a.en) }
}

/** Agrupa las marcas por persona y por día. Cada marca queda con `_ts`. */
export const agruparPorJornada = (registros = []) => {
  const grupos = new Map()
  for (const r of registros || []) {
    const ts = r?._ts instanceof Date ? r._ts : aFecha(r?.timestamp)
    if (!ts) continue
    const clave = `${r.userId || ''}|${claveDeFecha(ts)}`
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        clave,
        userId: r.userId || '',
        fecha: new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()),
        marcas: [],
      })
    }
    grupos.get(clave).marcas.push({ ...r, _ts: ts })
  }
  const lista = [...grupos.values()]
  lista.forEach((g) => g.marcas.sort((a, b) => a._ts - b._ts))
  return lista
}

/**
 * Los tramos trabajados del día: de cada entrada a su salida.
 *
 * Casi siempre es uno. Hay dos cuando alguien sale y vuelve (turno partido), y
 * el rato de afuera no cuenta. Una salida sin entrada abierta alarga el último
 * tramo (es la corrección que carga el administrador a mano), pero la del
 * cierre automático nunca alarga lo que ya estaba cerrado.
 */
const tramosTrabajados = (marcas) => {
  const tramos = []
  let abierto = null
  for (const m of marcas) {
    if (m.type === MARCA_ENTRADA) {
      if (!abierto) abierto = { inicio: m, fin: null }
      continue
    }
    if (m.type !== MARCA_SALIDA) continue
    if (abierto) {
      abierto.fin = m
      tramos.push(abierto)
      abierto = null
      continue
    }
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && !m.autoClosed && m._ts > ultimo.fin._ts) ultimo.fin = m
  }
  if (abierto) tramos.push(abierto)
  return tramos
}

const horaQueCuenta = (decision, real, referencia, respaldo) => {
  if (decision.decision === DECISION_AJUSTADA) return decision.hora
  if (decision.decision === DECISION_HORARIO) return referencia || respaldo
  return real || respaldo
}

/**
 * La jornada de UNA persona en UN día.
 *
 * @param {{fecha: Date, userId: string, marcas: Array}} grupo  de agruparPorJornada
 * @param {object} op
 * @param {(sucursalId: string) => object|null} op.horarioDe  horario del local de cada sucursal
 * @param {object|null} op.turno   la celda del planificador de ese día (o null)
 * @param {boolean} op.descontarBreakProgramado
 * @param {Date} op.ahora
 */
export const calcularJornada = (grupo, { horarioDe = () => null, turno = null, descontarBreakProgramado = false, ahora = new Date() } = {}) => {
  const todas = [...(grupo?.marcas || [])].sort((a, b) => a._ts - b._ts)
  const marcas = todas.filter((m) => m.approvalStatus !== 'rejected')
  const fecha = grupo?.fecha || (todas[0] ? new Date(todas[0]._ts.getFullYear(), todas[0]._ts.getMonth(), todas[0]._ts.getDate()) : null)
  const turnoDelDia = esTurnoDeTrabajo(turno) ? turno : null
  const referenciaDe = (marca) => referenciaDelDia({ fecha, horario: horarioDe(sucursalDeLaMarca(marca)), turno: turnoDelDia })

  const tramos = tramosTrabajados(marcas)
  const primero = tramos[0] || null
  const ultimo = tramos[tramos.length - 1] || null

  // ── Entrada ──
  let entrada = null
  if (primero) {
    const marca = primero.inicio
    const real = marca._ts
    const ref = referenciaDe(marca)
    const decision = decisionDeLaMarca(marca)
    const fueraDeHorario = !!ref && marca.approvalStatus !== 'manual' && minutoDe(real) < minutoDe(ref.apertura)
    let cuenta = real
    let estado = 'normal'
    if (decision) {
      estado = decision.decision
      cuenta = horaQueCuenta(decision, real, ref?.apertura, real)
    } else if (fueraDeHorario) {
      estado = 'por-revisar'
      cuenta = ref.apertura
    }
    entrada = {
      tipo: 'entrada', marca, real, cuenta, estado, fueraDeHorario, ajuste: decision,
      referencia: ref?.apertura || null, porTurno: !!ref?.aperturaPorTurno,
    }
  }

  // ── Salida ──
  let salida = null
  if (ultimo) {
    const marca = ultimo.fin
    const automatica = !!marca?.autoClosed
    const real = marca && !automatica ? marca._ts : null
    const ref = referenciaDe(marca && !automatica ? marca : primero.inicio)
    const decision = decisionDeLaMarca(marca)
    const fueraDeHorario = !!ref && real != null && marca.approvalStatus !== 'manual' && minutoDe(real) > minutoDe(ref.cierre)
    let cuenta = null
    let estado
    if (decision && marca) {
      estado = decision.decision
      cuenta = horaQueCuenta(decision, real, ref?.cierre, marca._ts)
    } else if (real != null) {
      estado = fueraDeHorario ? 'por-revisar' : 'normal'
      cuenta = fueraDeHorario ? ref.cierre : real
    } else if (ref) {
      // No marcó la salida, o la cerró el sistema al día siguiente: cuenta el
      // cierre, pero solo una vez que el cierre pasó.
      if (marca || ahora >= ref.cierre) { estado = 'automatica'; cuenta = ref.cierre } else { estado = 'en-curso' }
    } else if (marca) {
      // Sin horario del local: el cierre automático de siempre (23:59).
      estado = 'auto-cerrada'
      cuenta = marca._ts
    } else {
      estado = mismoDia(fecha, ahora) ? 'en-curso' : 'sin-salida'
    }
    salida = {
      tipo: 'salida', marca: marca || null, real, cuenta, estado, fueraDeHorario, ajuste: marca ? decision : null,
      referencia: ref?.cierre || null, porTurno: !!ref?.cierrePorTurno,
    }
  }

  // ── Break ──
  const marcado = breaksDelDia(marcas)
  const programadoMin = breakProgramadoDelTurno(turnoDelDia)
  const usaProgramado = descontarBreakProgramado === true && programadoMin != null
  const descontadoMs = usaProgramado ? programadoMin * 60000 : marcado.ms
  const tomadoMin = Math.round(marcado.ms / 60000)
  const enCurso = salida?.estado === 'en-curso'
  let estadoBreak = null
  if (programadoMin != null && programadoMin > 0) {
    if (marcado.abierto) estadoBreak = enCurso ? 'en-curso' : 'abierto'
    else if (marcado.tramos === 0) estadoBreak = enCurso ? null : 'no-marcado'
    else if (tomadoMin < programadoMin - TOLERANCIA_DEL_BREAK_MIN) estadoBreak = enCurso ? null : 'corto'
    else if (tomadoMin > programadoMin + TOLERANCIA_DEL_BREAK_MIN) estadoBreak = 'excedido'
    else estadoBreak = 'completo'
  } else if (marcado.abierto) {
    estadoBreak = enCurso ? 'en-curso' : 'abierto'
  } else if (marcado.tramos > 0) {
    estadoBreak = 'sin-programa'
  }

  // ── Horas ──
  let trabajadoMs = null
  if (entrada && salida?.cuenta) {
    let bruto = 0
    tramos.forEach((t, i) => {
      const desde = i === 0 ? entrada.cuenta : t.inicio._ts
      const hasta = i === tramos.length - 1 ? salida.cuenta : t.fin?._ts
      if (desde && hasta && hasta > desde) bruto += hasta - desde
    })
    trabajadoMs = Math.max(0, bruto - descontadoMs)
  }

  const conNombre = todas.find((m) => m.userName) || todas[0] || {}
  const deSucursal = primero?.inicio || todas[0] || {}
  return {
    clave: grupo?.clave || '',
    fecha,
    userId: grupo?.userId || conNombre.userId || '',
    userName: conNombre.userName || '',
    userEmail: conNombre.userEmail || '',
    sucursalId: sucursalDeLaMarca(deSucursal),
    branchName: deSucursal.branchName || '',
    turno: turnoDelDia,
    marcas: todas,
    rechazadas: todas.length - marcas.length,
    entrada,
    salida,
    break: {
      programadoMin, tomadoMs: marcado.ms, tramos: marcado.tramos, abierto: marcado.abierto,
      estado: estadoBreak, descontadoMs, fuente: usaProgramado ? 'programado' : 'marcado',
    },
    trabajadoMs,
    porRevisar: entrada?.estado === 'por-revisar' || salida?.estado === 'por-revisar',
    ubicacionPendiente: marcas.some((m) => m.approvalStatus === 'pending'),
  }
}

/** Busca el turno de una persona en una fecha ('YYYY-MM-DD'). */
export const indiceDeTurnos = (celdas = []) => {
  const mapa = new Map()
  for (const c of celdas || []) {
    if (c?.userId && c?.fecha) mapa.set(`${c.userId}|${c.fecha}`, c.cell || null)
  }
  return (userId, fecha) => mapa.get(`${userId}|${fecha}`) || null
}

/** Todas las jornadas de una lista de marcas, de la más reciente a la más vieja. */
export const construirJornadas = (registros, { horarioDe, turnoDe = null, descontarBreakProgramado = false, ahora = new Date() } = {}) => (
  agruparPorJornada(registros)
    .map((g) => calcularJornada(g, {
      horarioDe,
      turno: turnoDe ? turnoDe(g.userId, claveDeFecha(g.fecha)) : null,
      descontarBreakProgramado,
      ahora,
    }))
    .sort((a, b) => (b.fecha - a.fecha) || String(a.userName).localeCompare(String(b.userName)))
)

export const ETIQUETA_DEL_BREAK = {
  completo: 'Completo',
  corto: 'Interrumpido',
  excedido: 'Excedido',
  'no-marcado': 'No marcó break',
  abierto: 'Break sin cerrar',
  'sin-programa': 'Sin break programado',
  'en-curso': 'En break',
}

/** '45 de 60 min · en 2 tramos'. Vacío si no hay nada que decir. */
export const detalleDelBreak = (b) => {
  if (!b) return ''
  const tomado = Math.round((b.tomadoMs || 0) / 60000)
  const tramos = b.tramos > 1 ? ` · en ${b.tramos} tramos` : ''
  if (b.programadoMin > 0) return `${tomado} de ${b.programadoMin} min${tramos}`
  if (b.tramos > 0) return `${tomado} min${tramos}`
  return ''
}

/**
 * 'la apertura', 'el inicio de su turno', 'el cierre' o 'el fin de su turno'.
 * Con `{ tu: true }` le habla al trabajador: 'el inicio de tu turno'.
 */
export const nombreDeLaReferencia = (lado, { tu = false } = {}) => {
  const suyo = tu ? 'tu' : 'su'
  if (lado?.tipo === 'entrada') return lado.porTurno ? `el inicio de ${suyo} turno` : 'la apertura'
  return lado?.porTurno ? `el fin de ${suyo} turno` : 'el cierre'
}

/** '8h 15m', '45m' u '8h': igual en la tarjeta del trabajador y en la del administrador. */
export const duracionCorta = (ms) => {
  if (ms == null || ms < 0) return '—'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const fechaDDMMAAAA = (d) => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '')

/** Las columnas del Excel por jornada. */
export const ENCABEZADOS_DE_JORNADAS = [
  'Fecha', 'Empleado', 'Email', 'Sucursal', 'Turno',
  'Entrada marcada', 'Entrada que cuenta', 'Entrada: detalle',
  'Salida marcada', 'Salida que cuenta', 'Salida: detalle',
  'Break programado (min)', 'Break tomado (min)', 'Break: estado', 'Break descontado (min)',
  'Horas trabajadas', 'Horas (decimal)',
]

/**
 * Una fila del Excel por jornada. Sin breaks activados el estado del break va
 * en blanco: "No marcó break" no dice nada si no hay cómo marcarlo.
 */
export const filaDeJornadaParaExcel = (j, { breaksActivos = true } = {}) => [
  fechaDDMMAAAA(j.fecha),
  j.userName || '',
  j.userEmail || '',
  j.branchName || '',
  j.turno ? `${j.turno.start}-${j.turno.end}` : '',
  horaCorta(j.entrada?.real),
  horaCorta(j.entrada?.cuenta),
  textoDelEstadoDeHora(j.entrada),
  horaCorta(j.salida?.real),
  horaCorta(j.salida?.cuenta),
  textoDelEstadoDeHora(j.salida),
  j.break.programadoMin ?? '',
  Math.round(j.break.tomadoMs / 60000),
  breaksActivos && j.break.estado ? ETIQUETA_DEL_BREAK[j.break.estado] : '',
  Math.round(j.break.descontadoMs / 60000),
  duracionHHMM(j.trabajadoMs),
  horasDecimales(j.trabajadoMs),
]

/** El estado de la entrada o la salida, en palabras (para el Excel y los avisos). */
export const textoDelEstadoDeHora = (lado) => {
  if (!lado) return ''
  switch (lado.estado) {
    case 'por-revisar': return `Por revisar: marcó ${horaCorta(lado.real)}, cuenta ${nombreDeLaReferencia(lado)}`
    case DECISION_HORA_MARCADA: return 'Hora marcada aprobada'
    case DECISION_HORARIO: return `Se dejó ${nombreDeLaReferencia(lado)}`
    case DECISION_AJUSTADA: return `Ajustada${lado.ajuste?.porNombre ? ` por ${lado.ajuste.porNombre}` : ''}`
    case 'automatica': return `No marcó salida: se tomó ${nombreDeLaReferencia(lado)}`
    case 'auto-cerrada': return 'Cierre automático del sistema'
    case 'en-curso': return 'En curso'
    case 'sin-salida': return 'Sin salida'
    default: return ''
  }
}
