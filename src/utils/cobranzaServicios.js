/**
 * COBRANZA DE SERVICIOS POR MEDIDOR (luz, agua).
 *
 * El negocio compra UN recibo mayorista a la distribuidora y lo reparte entre
 * los vecinos del centro poblado. No revende a precio propio: traslada el
 * precio al que le venden.
 *
 * ── De dónde sale la tarifa ─────────────────────────────────────────────────
 * De su propio recibo: `tarifa = total S/ ÷ total kWh`. Cambia todos los meses,
 * así que NO se escribe a mano: se cargan los dos números del recibo y sale
 * sola. Se congela en el periodo, porque un recibo de julio no puede cambiar
 * de importe porque en setiembre subió el precio.
 *
 * Verificado contra el Excel de julio 2026 del primer negocio que lo pidió:
 * 8823.83 kWh por S/ 4606.04 dan 0.522, que es el número que venía usando.
 *
 * ── Por qué existe el consumo mínimo ────────────────────────────────────────
 * Entre lo que compra y lo que miden los medidores se pierde energía —12.5% en
 * ese mes: cables, medidores parados, tomas sin medir—. Esa merma la paga él.
 * El cobro mínimo a los consumos chicos es lo que la cubre: en julio habría
 * sumado S/ 137.62 sobre un déficit de S/ 135.30.
 *
 * ── Redondeo ────────────────────────────────────────────────────────────────
 * Cada recibo se redondea a 2 decimales por separado y el reporte suma esos
 * redondeos, para que lo impreso y lo contado coincidan al céntimo. Es el
 * mismo criterio de `calculateMixedInvoiceAmounts` en los comprobantes.
 */

/** Un suministro con medidor: se cobra lo que marca. */
export const CON_MEDIDOR = 'medidor'

/** Un suministro sin medidor: cuota fija mensual acordada. */
export const SIN_MEDIDOR = 'fijo'

/** Redondeo a céntimos. */
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Las lecturas se toman con un decimal. */
export const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10

const num = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * La tarifa del periodo, a partir del recibo que le llega al negocio.
 *
 * @param {number} totalSoles Importe del recibo principal.
 * @param {number} totalKwh   Consumo del recibo principal.
 * @returns {number|null} S/ por kWh, o null si no se puede calcular.
 */
export function tarifaDelRecibo(totalSoles, totalKwh) {
  const s = num(totalSoles)
  const k = num(totalKwh)
  if (s === null || k === null || k <= 0 || s < 0) return null
  // Tres decimales: es como el usuario venía escribiendo la tarifa (0.522) y
  // como se imprime en el recibo. Con más decimales el vecino no puede rehacer
  // la cuenta a mano, que es justo lo que hace cuando reclama.
  return Math.round((s / k) * 1000) / 1000
}

/**
 * El consumo de un medidor. `null` cuando falta una lectura: sin lectura no
 * hay consumo, y arrastrarlo como 0 esconde el medidor que nadie leyó.
 */
export function consumoDelMedidor(lecturaAnterior, lecturaActual) {
  const ant = num(lecturaAnterior)
  const act = num(lecturaActual)
  if (ant === null || act === null) return null
  return r1(act - ant)
}

/** Motivos por los que una lectura no se puede facturar. */
export const LECTURA_SIN_ACTUAL = 'sin_actual'
export const LECTURA_RETROCEDE = 'retrocede'

/**
 * Revisa una lectura antes de facturarla.
 *
 * El Excel de julio traía dos medidores sin lectura actual que se facturaron
 * en NEGATIVO (−0.52 y −2.66): la resta salió negativa y nadie la miró. Un
 * consumo negativo nunca es un cobro; es una lectura que falta o un medidor
 * que se cambió y volvió a cero.
 *
 * @returns {{ok: boolean, motivo?: string, mensaje?: string, consumo: number|null}}
 */
export function revisarLectura(lecturaAnterior, lecturaActual, { medidorNuevo = false } = {}) {
  const consumo = consumoDelMedidor(lecturaAnterior, lecturaActual)

  if (num(lecturaActual) === null) {
    return {
      ok: false,
      motivo: LECTURA_SIN_ACTUAL,
      mensaje: 'Falta la lectura de este mes',
      consumo: null,
    }
  }
  // Con el medidor recién cambiado la cuenta arranca de cero y la lectura
  // anterior del medidor viejo no sirve: se cobra lo que marca el nuevo.
  if (medidorNuevo) return { ok: true, consumo: r1(num(lecturaActual)) }

  if (consumo !== null && consumo < 0) {
    return {
      ok: false,
      motivo: LECTURA_RETROCEDE,
      mensaje: 'La lectura es menor que la del mes pasado. ¿Se cambió el medidor?',
      consumo,
    }
  }
  return { ok: true, consumo }
}

/**
 * Hasta qué consumo llega a aplicarse el mínimo, con la tarifa vigente.
 *
 * Solo para explicarlo en pantalla: "a S/ 0.522 el kWh, el mínimo alcanza a
 * los consumos de hasta 9.6 kWh". Sube y baja solo cuando cambia la tarifa.
 */
export function consumoHastaElMinimo(tarifa, minimoImporte) {
  const t = num(tarifa)
  const m = num(minimoImporte)
  if (!t || t <= 0 || !m || m <= 0) return null
  return Math.floor((m / t) * 10) / 10
}

/**
 * Lo que se le cobra a un suministro.
 *
 * ── Sobre el mínimo ─────────────────────────────────────────────────────────
 * El acuerdo se enunció como "de 0 a 9 kWh se cobra S/ 5". Tomado al pie de la
 * letra deja un agujero: a S/ 0.522 el kWh, quien consume 9.0 paga S/ 5.00 y
 * quien consume 9.5 paga S/ 4.96 —consumir más sale más barato—, y el hueco
 * se agranda si la tarifa baja. Los 9 kWh eran, en realidad, el punto donde el
 * consumo alcanza los S/ 5 a la tarifa de julio.
 *
 * Así que el mínimo es un piso, sin tope: nadie paga menos de S/ 5. Da el
 * mismo resultado en todos los casos que él ya cobraba y no se rompe cuando la
 * tarifa cambie, que es todos los meses.
 *
 * @param {object} suministro       `{ tipo, cuotaFija }`
 * @param {number|null} consumo     kWh del mes (solo con medidor)
 * @param {object} tarifario        `{ tarifa, minimoImporte, cargoFijo }`
 * @returns {{consumo, importeConsumo, cargoFijo, total, aplicoMinimo}}
 */
export function importeDelRecibo(suministro, consumo, tarifario) {
  const cargoFijo = r2(tarifario?.cargoFijo)

  if (suministro?.tipo === SIN_MEDIDOR) {
    const cuota = r2(suministro.cuotaFija)
    return {
      consumo: null,
      importeConsumo: cuota,
      cargoFijo,
      total: r2(cuota + cargoFijo),
      aplicoMinimo: false,
    }
  }

  const kwh = num(consumo)
  if (kwh === null || kwh < 0) {
    return { consumo: kwh, importeConsumo: 0, cargoFijo, total: 0, aplicoMinimo: false }
  }

  const tarifa = num(tarifario?.tarifa) || 0
  const minimoImporte = r2(tarifario?.minimoImporte)

  let importeConsumo = r2(kwh * tarifa)
  let aplicoMinimo = false

  // El mínimo se compara contra el consumo, no contra el total: el cargo fijo
  // —si el negocio usa alguno— se suma después y no debe tapar el mínimo.
  if (minimoImporte > 0 && importeConsumo < minimoImporte) {
    importeConsumo = minimoImporte
    aplicoMinimo = true
  }

  return {
    consumo: kwh,
    importeConsumo,
    cargoFijo,
    total: r2(importeConsumo + cargoFijo),
    aplicoMinimo,
  }
}

/**
 * La conciliación del periodo: lo que compró contra lo que repartió.
 *
 * Es la cuenta que el negocio no ve hasta que suma a mano, y la que decide si
 * el mes le cerró. En julio le faltaban S/ 135.30 y no lo sabía.
 *
 * @param {object} periodo  `{ reciboKwh, reciboSoles }` del recibo mayorista
 * @param {Array}  recibos  `[{ consumo, total, tipo }]` los emitidos del mes
 */
export function conciliacionDelPeriodo(periodo, recibos = []) {
  const compradoKwh = num(periodo?.reciboKwh) || 0
  const compradoSoles = r2(periodo?.reciboSoles)

  let medidoKwh = 0
  let facturadoMedidor = 0
  let facturadoFijo = 0
  let conMedidor = 0
  let sinMedidor = 0

  for (const r of recibos) {
    if (r?.tipo === SIN_MEDIDOR) {
      sinMedidor++
      facturadoFijo += Number(r.total) || 0
    } else {
      conMedidor++
      medidoKwh += Number(r.consumo) || 0
      facturadoMedidor += Number(r.total) || 0
    }
  }

  // A dos decimales y no a uno: las lecturas vienen con un decimal, pero el
  // recibo mayorista trae dos, y la resta se comia centesimas de kWh.
  medidoKwh = r2(medidoKwh)
  const facturado = r2(facturadoMedidor + facturadoFijo)
  const perdidaKwh = r2(compradoKwh - medidoKwh)

  return {
    compradoKwh,
    compradoSoles,
    medidoKwh,
    perdidaKwh,
    // Cuánto de lo que compró no llegó a ningún medidor. Es la salud de la red:
    // si sube mes a mes, hay una conexión sin medir o un medidor parado.
    perdidaPorcentaje: compradoKwh > 0 ? Math.round((perdidaKwh / compradoKwh) * 1000) / 10 : 0,
    facturadoMedidor: r2(facturadoMedidor),
    facturadoFijo: r2(facturadoFijo),
    facturado,
    // Positivo = le alcanza para pagar su recibo. Negativo = pone de su bolsillo.
    resultado: r2(facturado - compradoSoles),
    conMedidor,
    sinMedidor,
  }
}

/** El periodo "2026-07" a partir de una fecha. */
export function clavePeriodo(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** "2026-07" -> "Julio 2026". */
export function nombreDePeriodo(clave) {
  const [a, m] = String(clave || '').split('-')
  const i = Number(m) - 1
  if (!a || !MESES[i]) return clave || ''
  return `${MESES[i]} ${a}`
}

/** Primer y último día del periodo, como 'YYYY-MM-DD'. */
export function rangoDelPeriodo(clave) {
  const [a, m] = String(clave || '').split('-').map(Number)
  if (!a || !m) return { desde: '', hasta: '' }
  const ultimo = new Date(a, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${ultimo}` }
}

/**
 * El vencimiento del recibo: el día acordado del mes SIGUIENTE al consumo.
 * El consumo de julio se cobra en agosto.
 */
export function vencimientoDelPeriodo(clave, diaDeVencimiento = 15) {
  const [a, m] = String(clave || '').split('-').map(Number)
  if (!a || !m) return ''
  // Se topea en 28 para que el dia exista en cualquier mes, y cualquier valor
  // que no sirva (0, texto, vacio) cae en el 15.
  const pedido = Number(diaDeVencimiento)
  const dia = Number.isFinite(pedido) && pedido >= 1 ? Math.min(pedido, 28) : 15
  const siguiente = new Date(a, m, dia)
  const mm = String(siguiente.getMonth() + 1).padStart(2, '0')
  return `${siguiente.getFullYear()}-${mm}-${String(dia).padStart(2, '0')}`
}
