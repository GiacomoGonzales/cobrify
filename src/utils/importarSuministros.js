/**
 * IMPORTAR EL PADRÓN DE SUMINISTROS DESDE EXCEL.
 *
 * El negocio ya lleva su padrón en una hoja de cálculo —es de donde salía cada
 * recibo antes—, así que el importador lee ESE archivo tal como está en vez de
 * pedirle que vuelva a tipear 179 filas en una plantilla nuestra.
 *
 * ── Lo que hay que tolerar de una hoja hecha a mano ─────────────────────────
 * Del archivo del primer negocio que lo pidió (`JULIO 2026.xlsx`):
 *
 *   - Dos hojas: los que tienen medidor y los que pagan cuota fija.
 *   - Dos filas de título antes de los encabezados, y dos filas en blanco
 *     entre los encabezados y los datos.
 *   - Encabezados con erratas ("N° Suninistro") y con tildes.
 *   - Filas de totales al final, sin nombre pero con números.
 *   - Numeración con saltos (falta el 44 y el 147) y sufijos en el nombre
 *     —"(T)", "(P)", "(TALL)"— que marcan el segundo medidor de un titular.
 *   - 13 filas sin número de suministro y un número repetido en dos personas.
 *
 * Nada de eso puede frenar la importación: se avisa y se importa igual, salvo
 * lo que no tiene arreglo posible (una fila sin nombre no es un suministro).
 *
 * ── La última lectura ───────────────────────────────────────────────────────
 * De la columna "L. Actual": la lectura actual del mes que se importa es la
 * ANTERIOR del mes siguiente, que es con la que arranca la primera cobranza
 * hecha en el sistema. Es el dato que hace que la migración no pierda el hilo.
 */

/** Normaliza un encabezado o valor para comparar sin tildes ni signos. */
export const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[\s/._°º-]/g, '')
  .trim()

/** Los nombres con los que puede venir cada columna. */
const COLUMNAS = {
  orden: ['N', 'No', 'Nro', 'Item', 'Orden'],
  nombre: ['Cliente', 'Usuario', 'Nombre', 'Nombres', 'Titular', 'Abonado'],
  referencia: ['Direccion', 'Referencia', 'Zona', 'Sector', 'Ubicacion'],
  numeroSuministro: ['N Suministro', 'N Suninistro', 'Suministro', 'Medidor', 'N Medidor', 'Codigo'],
  lecturaAnterior: ['L Anter', 'L Anterior', 'Lectura Anterior', 'Anterior'],
  lecturaActual: ['L Actual', 'Lectura Actual', 'Actual', 'Lectura'],
  total: ['TOTAL', 'Total', 'Importe', 'Monto', 'Cuota', 'Pago'],
}

const aNumero = (v) => {
  if (v === null || v === undefined || v === '') return null
  // "S/ 1,234.50" y "12,5" (coma decimal) también tienen que entrar.
  const limpio = String(v).replace(/[^\d,.-]/g, '')
  if (!limpio) return null
  const punto = limpio.lastIndexOf('.')
  const coma = limpio.lastIndexOf(',')
  let n
  if (coma > punto) n = Number(limpio.replace(/\./g, '').replace(',', '.'))
  else n = Number(limpio.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Encuentra la fila de encabezados y arma el mapa columna → índice.
 *
 * No se puede asumir que esté en la primera fila: la hoja real trae el nombre
 * del centro poblado y el periodo encima. Se busca la primera fila que tenga
 * la columna del nombre, que es la única que no puede faltar.
 *
 * @param {Array<Array>} filas Matriz cruda de la hoja.
 * @returns {{fila: number, mapa: object}|null}
 */
export function detectarEncabezados(filas) {
  const limite = Math.min(filas.length, 20)
  for (let i = 0; i < limite; i++) {
    const fila = filas[i] || []
    const mapa = {}
    for (let c = 0; c < fila.length; c++) {
      const celda = norm(fila[c])
      if (!celda) continue
      for (const [campo, alias] of Object.entries(COLUMNAS)) {
        if (mapa[campo] !== undefined) continue
        if (alias.some(a => norm(a) === celda)) { mapa[campo] = c; break }
      }
    }
    if (mapa.nombre !== undefined) return { fila: i, mapa }
  }
  return null
}

/** Motivos por los que una fila queda observada (se importa igual). */
export const SIN_SUMINISTRO = 'sin_suministro'
export const SUMINISTRO_REPETIDO = 'suministro_repetido'
export const SIN_LECTURA = 'sin_lectura'
export const LECTURA_INCOHERENTE = 'lectura_incoherente'
export const SIN_CUOTA = 'sin_cuota'

const TEXTO_DEL_AVISO = {
  [SIN_SUMINISTRO]: 'Sin N° de suministro',
  [SUMINISTRO_REPETIDO]: 'N° de suministro repetido',
  [SIN_LECTURA]: 'Sin lectura actual: arranca en 0',
  [LECTURA_INCOHERENTE]: 'La lectura actual es menor que la anterior',
  [SIN_CUOTA]: 'Sin cuota mensual',
}

export const textoDelAviso = (motivo) => TEXTO_DEL_AVISO[motivo] || motivo

/**
 * Lee una hoja y devuelve los suministros que trae.
 *
 * @param {Array<Array>} filas   Matriz cruda de la hoja (`sheet_to_json` con `header: 1`).
 * @param {object} opciones
 * @param {'medidor'|'fijo'} opciones.tipo
 * @param {string} [opciones.direccion] La que se imprime en el recibo, igual para todos.
 * @param {Set}    [opciones.suministrosVistos] Para detectar repetidos entre hojas.
 * @returns {{filas: Array, encabezadoEn: number|null, columnas: object}}
 */
export function leerHoja(filas, { tipo, direccion = '', suministrosVistos = new Set() } = {}) {
  const encabezado = detectarEncabezados(filas)
  if (!encabezado) return { filas: [], encabezadoEn: null, columnas: {} }

  const { fila: filaEncabezado, mapa } = encabezado
  const leidas = []

  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i] || []
    const nombre = String(fila[mapa.nombre] ?? '').trim()

    // Fila vacía, o la de totales del final: tiene números pero nadie a quien
    // cobrarle. Sin nombre no hay suministro.
    if (!nombre) continue

    const avisos = []
    const numeroSuministro = mapa.numeroSuministro === undefined
      ? ''
      : String(fila[mapa.numeroSuministro] ?? '').trim()

    if (!numeroSuministro) {
      // Solo es un problema con medidor: el de cuota fija no tiene ninguno.
      if (tipo === 'medidor') avisos.push(SIN_SUMINISTRO)
    } else if (suministrosVistos.has(numeroSuministro)) {
      avisos.push(SUMINISTRO_REPETIDO)
    } else {
      suministrosVistos.add(numeroSuministro)
    }

    const registro = {
      tipo,
      nombre,
      numeroSuministro,
      // La columna "Dirección" de la hoja es la referencia con la que el
      // cobrador ubica la casa ("3-Jun", "Carretera", "Tienda 1"); la dirección
      // que se imprime es la del centro poblado, igual para todos.
      referencia: mapa.referencia === undefined ? '' : String(fila[mapa.referencia] ?? '').trim(),
      direccion,
      orden: mapa.orden === undefined ? null : aNumero(fila[mapa.orden]),
      avisos,
    }

    if (tipo === 'medidor') {
      const anterior = mapa.lecturaAnterior === undefined ? null : aNumero(fila[mapa.lecturaAnterior])
      const actual = mapa.lecturaActual === undefined ? null : aNumero(fila[mapa.lecturaActual])

      if (actual === null) {
        // Los dos medidores que el Excel facturó en negativo por no tener
        // lectura. Se importan arrancando en 0: el primer mes en el sistema
        // cobrará lo que marque el medidor, que es lo correcto.
        avisos.push(SIN_LECTURA)
        registro.ultimaLectura = 0
      } else {
        if (anterior !== null && actual < anterior) avisos.push(LECTURA_INCOHERENTE)
        registro.ultimaLectura = actual
      }
      registro.cuotaFija = 0
    } else {
      const cuota = mapa.total === undefined ? null : aNumero(fila[mapa.total])
      if (cuota === null || cuota <= 0) avisos.push(SIN_CUOTA)
      registro.cuotaFija = cuota === null ? 0 : cuota
      registro.ultimaLectura = null
    }

    leidas.push(registro)
  }

  return { filas: leidas, encabezadoEn: filaEncabezado, columnas: mapa }
}

/**
 * Decide de qué tipo es una hoja por sus columnas.
 *
 * Con columna de lectura es de medidores; sin ella, de cuota fija. Se mira la
 * hoja y no su nombre porque "SIN MEDI" no lo va a escribir igual el negocio
 * siguiente.
 */
export function tipoDeHoja(filas) {
  const encabezado = detectarEncabezados(filas)
  if (!encabezado) return null
  return encabezado.mapa.lecturaActual !== undefined ? 'medidor' : 'fijo'
}

/**
 * Lee el libro entero: cada hoja se clasifica sola.
 *
 * @param {Array<{nombre: string, filas: Array<Array>}>} hojas
 * @param {object} [opciones] `{ direccion }`
 */
export function leerLibro(hojas, { direccion = '' } = {}) {
  const suministrosVistos = new Set()
  const resultado = []
  const porHoja = []

  for (const hoja of hojas) {
    const tipo = tipoDeHoja(hoja.filas)
    if (!tipo) {
      porHoja.push({ nombre: hoja.nombre, tipo: null, leidas: 0 })
      continue
    }
    const { filas } = leerHoja(hoja.filas, { tipo, direccion, suministrosVistos })
    resultado.push(...filas)
    porHoja.push({ nombre: hoja.nombre, tipo, leidas: filas.length })
  }

  // El orden de ruta se renumera de corrido: en la hoja original saltaba
  // números y las dos hojas arrancaban las dos en 1.
  resultado.forEach((r, i) => { r.orden = i + 1 })

  return {
    suministros: resultado,
    hojas: porHoja,
    resumen: {
      total: resultado.length,
      conMedidor: resultado.filter(r => r.tipo === 'medidor').length,
      sinMedidor: resultado.filter(r => r.tipo === 'fijo').length,
      observados: resultado.filter(r => r.avisos.length > 0).length,
    },
  }
}
