/**
 * Export a Excel del HISTÓRICO de horarios (Personal > Horarios).
 *
 * El horario se guarda por semana ISO y la pantalla muestra una semana a la
 * vez; esto arma el acumulado de un rango de fechas cualquiera. Tres hojas:
 *
 *   1. Resumen      — por colaborador: días trabajados, de descanso y horas.
 *   2. Total por día — cuánta gente y cuántas horas hay programadas cada fecha.
 *   3. Detalle      — un renglón por turno, para auditar de dónde sale cada hora.
 *
 * Son horas PROGRAMADAS (lo planificado), no marcaciones de asistencia.
 */
import {
  XLSX,
  cellStyle, centerStyle, numberStyle, intStyle,
  totalLabelStyle, totalNumberStyle,
  setStyle,
  applyTitleRow, applyMetadataRows, applyHeaderRow,
  applyFreezeBelow, applyColumnWidths,
  buildBusinessMetadataRows,
  buildExcelFileName,
  saveAndShareExcel,
} from './excelStyles'
import { calcShiftHours, DAY_LABELS } from './scheduleService'

const DIAS_LARGOS = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
}

/** YYYY-MM-DD → dd/MM/yyyy, sin pasar por Date (evita corrimientos de zona). */
const fechaLegible = (iso) => {
  const [a, m, d] = String(iso || '').split('-')
  return a && m && d ? `${d}/${m}/${a}` : (iso || '')
}

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Clasifica una celda del horario. `rest` es día libre; `recovery` es un turno
 * entero de recuperación, que se trabaja pero no suma horas productivas —
 * mismo criterio que `calculateWeekHours`, para que los totales del Excel
 * coincidan con los que muestra la pantalla.
 */
const clasificar = (cell) => {
  if (!cell) return { tipo: 'sin', horas: 0 }
  if (cell.rest) return { tipo: 'descanso', horas: 0 }
  if (!cell.start || !cell.end) return { tipo: 'sin', horas: 0 }
  const horas = calcShiftHours(cell.start, cell.end, cell.breakMinutes || 0, cell.recoveryMinutes || 0)
  if (cell.recovery) return { tipo: 'recuperacion', horas: 0, horasReloj: horas }
  return { tipo: 'trabajo', horas }
}

const ESTADO_LABEL = {
  trabajo: 'Trabaja',
  descanso: 'Descanso',
  recuperacion: 'Recuperación',
  sin: 'Sin programar',
}

/**
 * @param {Array}  celdas      de `getScheduleRange`: { fecha, dayKey, userId, cell }
 * @param {Array}  employees   colaboradores { id|uid, name, department, ... }
 * @param {Object} businessData doc del negocio (para la cabecera)
 * @param {Object} opts        { periodLabel, branchLabel, nombreSucursal }
 */
export const generateScheduleHistoryExcel = async (celdas, employees, businessData, opts = {}) => {
  const { periodLabel = '', branchLabel = '' } = opts
  const wb = XLSX.utils.book_new()

  // El horario indexa por `userId`, que en el planner es `emp.id`. Se acepta
  // `uid` como respaldo por si llega una lista armada de otra forma.
  const nombrePorId = new Map()
  const areaPorId = new Map()
  employees.forEach((e) => {
    const id = e.id || e.uid
    if (!id) return
    nombrePorId.set(id, e.name || e.displayName || e.email || 'Sin nombre')
    areaPorId.set(id, e.department || '')
  })

  const nombreDe = (uid) => nombrePorId.get(uid) || 'Colaborador retirado'

  // ---------- Acumulados ----------
  const porColaborador = new Map()   // uid -> { trabajados, descansos, horas }
  const porFecha = new Map()         // YYYY-MM-DD -> { dayKey, personas, descansos, horas }

  celdas.forEach(({ fecha, dayKey, userId, cell }) => {
    const { tipo, horas } = clasificar(cell)

    if (!porColaborador.has(userId)) {
      porColaborador.set(userId, { trabajados: 0, descansos: 0, horas: 0 })
    }
    const c = porColaborador.get(userId)
    if (tipo === 'descanso') c.descansos += 1
    else if (tipo === 'trabajo' || tipo === 'recuperacion') c.trabajados += 1
    c.horas += horas

    if (!porFecha.has(fecha)) {
      porFecha.set(fecha, { dayKey, personas: 0, descansos: 0, horas: 0 })
    }
    const f = porFecha.get(fecha)
    if (tipo === 'descanso') f.descansos += 1
    else if (tipo === 'trabajo' || tipo === 'recuperacion') f.personas += 1
    f.horas += horas
  })

  const metaComun = (totalLabel, totalItems) => buildBusinessMetadataRows(businessData, {
    periodLabel,
    branchLabel,
    totalLabel,
    totalItems,
    // Son horas planificadas; dejarlo escrito evita que se lean como asistencia.
    extra: [['Contenido:', 'Horas PROGRAMADAS (planificación, no marcaciones de asistencia)']],
  })

  // ===== HOJA 1: RESUMEN POR COLABORADOR =====
  {
    const cols = [
      { header: '#', width: 6, kind: 'center' },
      { header: 'Colaborador', width: 30, kind: 'text' },
      { header: 'Área', width: 20, kind: 'text' },
      { header: 'Días trabajados', width: 16, kind: 'int' },
      { header: 'Días de descanso', width: 17, kind: 'int' },
      { header: 'Horas programadas', width: 18, kind: 'number' },
      { header: 'Promedio h/día', width: 15, kind: 'number' },
    ]
    const totalCols = cols.length

    const filas = [...porColaborador.entries()]
      .map(([uid, v]) => ({ uid, ...v }))
      .sort((a, b) => nombreDe(a.uid).localeCompare(nombreDe(b.uid), 'es'))

    const aoa = [['HISTÓRICO DE HORARIOS — RESUMEN'], []]
    const metaStart = aoa.length
    aoa.push(...metaComun('Total colaboradores', filas.length))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(cols.map(c => c.header))
    const dataStart = aoa.length

    let tTrab = 0, tDesc = 0, tHoras = 0
    filas.forEach((f, i) => {
      const prom = f.trabajados > 0 ? f.horas / f.trabajados : 0
      aoa.push([
        i + 1,
        nombreDe(f.uid),
        areaPorId.get(f.uid) || '',
        f.trabajados,
        f.descansos,
        redondear(f.horas),
        redondear(prom),
      ])
      tTrab += f.trabajados
      tDesc += f.descansos
      tHoras += f.horas
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push(['', 'TOTALES', '', tTrab, tDesc, redondear(tHoras), ''])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, cols.map(c => c.width))
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < filas.length; i++) {
      for (let c = 0; c < totalCols; c++) {
        const kind = cols[c].kind
        if (kind === 'number') setStyle(ws, dataStart + i, c, numberStyle(i))
        else if (kind === 'int') setStyle(ws, dataStart + i, c, intStyle(i))
        else if (kind === 'center') setStyle(ws, dataStart + i, c, centerStyle(i))
        else setStyle(ws, dataStart + i, c, cellStyle(i))
      }
    }
    for (let c = 0; c < totalCols; c++) {
      setStyle(ws, totalRowIdx, c, c >= 3 && c <= 5 ? totalNumberStyle : totalLabelStyle)
    }
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen')
  }

  // ===== HOJA 2: TOTAL POR DÍA =====
  {
    const cols = [
      { header: 'Fecha', width: 14, kind: 'center' },
      { header: 'Día', width: 12, kind: 'text' },
      { header: 'Colaboradores', width: 15, kind: 'int' },
      { header: 'En descanso', width: 13, kind: 'int' },
      { header: 'Horas programadas', width: 18, kind: 'number' },
    ]
    const totalCols = cols.length

    const fechas = [...porFecha.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))

    const aoa = [['HORAS PROGRAMADAS POR DÍA'], []]
    const metaStart = aoa.length
    aoa.push(...metaComun('Días con horario', fechas.length))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(cols.map(c => c.header))
    const dataStart = aoa.length

    let tPers = 0, tDesc = 0, tHoras = 0
    fechas.forEach(([fecha, v]) => {
      aoa.push([
        fechaLegible(fecha),
        DIAS_LARGOS[v.dayKey] || DAY_LABELS[v.dayKey] || '',
        v.personas,
        v.descansos,
        redondear(v.horas),
      ])
      tPers += v.personas
      tDesc += v.descansos
      tHoras += v.horas
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    aoa.push(['TOTALES', '', tPers, tDesc, redondear(tHoras)])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, cols.map(c => c.width))
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < fechas.length; i++) {
      for (let c = 0; c < totalCols; c++) {
        const kind = cols[c].kind
        if (kind === 'number') setStyle(ws, dataStart + i, c, numberStyle(i))
        else if (kind === 'int') setStyle(ws, dataStart + i, c, intStyle(i))
        else if (kind === 'center') setStyle(ws, dataStart + i, c, centerStyle(i))
        else setStyle(ws, dataStart + i, c, cellStyle(i))
      }
    }
    for (let c = 0; c < totalCols; c++) {
      setStyle(ws, totalRowIdx, c, c >= 2 ? totalNumberStyle : totalLabelStyle)
    }
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Por día')
  }

  // ===== HOJA 3: DETALLE DE TURNOS =====
  {
    const cols = [
      { header: 'Fecha', width: 14, kind: 'center' },
      { header: 'Día', width: 12, kind: 'text' },
      { header: 'Colaborador', width: 30, kind: 'text' },
      { header: 'Área', width: 18, kind: 'text' },
      { header: 'Estado', width: 15, kind: 'center' },
      { header: 'Entrada', width: 10, kind: 'center' },
      { header: 'Salida', width: 10, kind: 'center' },
      { header: 'Refrigerio (min)', width: 15, kind: 'int' },
      { header: 'Recuperación (min)', width: 17, kind: 'int' },
      { header: 'Horas', width: 10, kind: 'number' },
    ]
    const totalCols = cols.length

    const aoa = [['DETALLE DE TURNOS'], []]
    const metaStart = aoa.length
    aoa.push(...metaComun('Total registros', celdas.length))
    const metaEnd = aoa.length - 1
    aoa.push([])
    const headerRow = aoa.length
    aoa.push(cols.map(c => c.header))
    const dataStart = aoa.length

    let tHoras = 0
    celdas.forEach(({ fecha, dayKey, userId, cell }) => {
      const { tipo, horas } = clasificar(cell)
      aoa.push([
        fechaLegible(fecha),
        DIAS_LARGOS[dayKey] || DAY_LABELS[dayKey] || '',
        nombreDe(userId),
        areaPorId.get(userId) || '',
        ESTADO_LABEL[tipo] || '',
        tipo === 'descanso' ? '' : (cell?.start || ''),
        tipo === 'descanso' ? '' : (cell?.end || ''),
        cell?.breakMinutes || 0,
        cell?.recoveryMinutes || 0,
        redondear(horas),
      ])
      tHoras += horas
    })
    aoa.push([])
    const totalRowIdx = aoa.length
    const totalRow = new Array(totalCols).fill('')
    totalRow[0] = 'TOTALES'
    totalRow[totalCols - 1] = redondear(tHoras)
    aoa.push(totalRow)

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyColumnWidths(ws, cols.map(c => c.width))
    applyTitleRow(ws, 0, totalCols)
    applyMetadataRows(ws, metaStart, metaEnd)
    applyHeaderRow(ws, headerRow, totalCols)
    for (let i = 0; i < celdas.length; i++) {
      for (let c = 0; c < totalCols; c++) {
        const kind = cols[c].kind
        if (kind === 'number') setStyle(ws, dataStart + i, c, numberStyle(i))
        else if (kind === 'int') setStyle(ws, dataStart + i, c, intStyle(i))
        else if (kind === 'center') setStyle(ws, dataStart + i, c, centerStyle(i))
        else setStyle(ws, dataStart + i, c, cellStyle(i))
      }
    }
    for (let c = 0; c < totalCols; c++) {
      setStyle(ws, totalRowIdx, c, c === totalCols - 1 ? totalNumberStyle : totalLabelStyle)
    }
    applyFreezeBelow(ws, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle')
  }

  const fileName = buildExcelFileName('Horarios', [periodLabel])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: 'Histórico de horarios',
    shareText: `Histórico de horarios${periodLabel ? ` — ${periodLabel}` : ''}`,
  })
  return { success: true, fileName }
}
