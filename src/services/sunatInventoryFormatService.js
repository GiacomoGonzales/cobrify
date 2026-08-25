/**
 * FORMATO 13.1 SUNAT — Registro de Inventario Permanente Valorizado.
 *
 * Es el kardex que pide el contador: por cada existencia, un bloque con todos
 * sus movimientos del período y, en cada línea, cuánto entró, cuánto salió y
 * con qué costo quedó el saldo.
 *
 * ── El costo: de dónde sale ─────────────────────────────────────────────────
 * Los movimientos de stock NO guardan el costo (solo la cantidad), así que se
 * reconstruye como manda el método de valuación:
 *
 *   ENTRADAS  → costo real de su origen. Las compras traen `unitPrice` por
 *               ítem; ese es el costo de esa entrada concreta.
 *   SALIDAS   → al PROMEDIO PONDERADO vigente en ese instante, recalculado
 *               después de cada entrada. Es el método declarado en la cabecera
 *               y el que espera SUNAT.
 *
 * Cuando una entrada no tiene costo rastreable (un ajuste manual, un traslado
 * desde otro almacén), se usa el promedio vigente: no inventa valor nuevo, que
 * es lo correcto — un traslado no cambia cuánto vale la mercadería.
 *
 * ── Saldo inicial ───────────────────────────────────────────────────────────
 * La primera línea de cada bloque es el saldo al arrancar el período,
 * reconstruido hacia atrás desde el stock actual restando los movimientos
 * posteriores. Sin esa línea el kardex arranca en cero y no cuadra con nada.
 */
import {
  XLSX,
  buildExcelFileName,
  saveAndShareExcel,
} from './excelStyles'
import { normalizeSunatUnit } from '@/data/sunatUnits'

/** Tabla 10 — tipo de documento que sustenta el movimiento. */
const TIPO_DOC = {
  invoice: '01',        // Factura
  boleta: '03',         // Boleta de venta
  nota_venta: '00',     // Otros (la nota de venta no es comprobante SUNAT)
  guia: '09',           // Guía de remisión
  ninguno: '00',
}

/**
 * Tabla 12 — tipo de operación. Se mapea desde el `type` del movimiento.
 * Lo que no tiene correspondencia clara va a 99 (Otros) a propósito: inventar
 * un código para que "se vea completo" es lo que hace que un libro no cuadre
 * en una fiscalización.
 */
const TIPO_OPERACION = {
  sale: '01',                  // Venta
  purchase: '02',              // Compra
  entry: '02',                 // Entrada (normalmente compra/ingreso)
  return: '05',                // Devolución recibida
  void_return: '05',
  purchase_void: '06',         // Devolución entregada
  purchase_delete: '06',
  production: '10',            // Salida a producción / ingreso de producto terminado
  production_manual: '10',
  production_consumption: '10',
  production_reversal: '10',
  transfer_in: '11',           // Transferencia entre almacenes
  transfer_out: '11',
  internal_use: '12',          // Retiro
  damage: '13',                // Mermas
  exit: '99',
  adjustment: '99',
  saldo_inicial: '16',         // Saldo inicial
}

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const r2 = (v) => Math.round(num(v) * 100) / 100
const r4 = (v) => Math.round(num(v) * 10000) / 10000

/** Firestore Timestamp | Date | string → Date, o null. */
const aFecha = (v) => {
  if (!v) return null
  try {
    const d = v.toDate ? v.toDate() : new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

const ddmmyyyy = (d) => {
  if (!d) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/**
 * Separa serie y número de un "F001-00000123". Sin guion, todo va a número:
 * las notas de venta y los ajustes no tienen serie.
 */
const partirDocumento = (numero) => {
  const s = String(numero || '').trim()
  if (!s) return { serie: '', numero: '' }
  const i = s.indexOf('-')
  return i > 0
    ? { serie: s.slice(0, i), numero: s.slice(i + 1) }
    : { serie: '', numero: s }
}

const tipoDocDe = (m) => {
  const ref = String(m.referenceType || '').toLowerCase()
  const numero = String(m.referenceNumber || '')
  if (ref.includes('purchase')) return TIPO_DOC.invoice
  if (ref.includes('guide') || ref.includes('guia')) return TIPO_DOC.guia
  if (ref.includes('invoice')) {
    // La serie dice qué comprobante es: F=factura, B=boleta, N=nota de venta.
    const inicial = numero.trim().charAt(0).toUpperCase()
    if (inicial === 'F') return TIPO_DOC.invoice
    if (inicial === 'B') return TIPO_DOC.boleta
    return TIPO_DOC.nota_venta
  }
  return TIPO_DOC.ninguno
}

/**
 * Recorre los movimientos de UN producto en orden y arma las líneas del
 * formato, llevando el promedio ponderado.
 *
 * @param {Array}  movs         movimientos del período, ya ordenados por fecha
 * @param {Object} saldoInicial { cantidad, costoUnitario }
 * @param {Map}    costosPorRef costo unitario por `${referenceId}:${productId}`
 */
function construirLineas(movs, saldoInicial, costosPorRef, productId) {
  const lineas = []
  let cant = num(saldoInicial.cantidad)
  let cu = num(saldoInicial.costoUnitario)
  let total = r2(cant * cu)

  lineas.push({
    fecha: '', tipoDoc: '00', serie: '', numero: '', tipoOp: TIPO_OPERACION.saldo_inicial,
    eCant: '', eCu: '', eTot: '',
    sCant: '', sCu: '', sTot: '',
    fCant: r4(cant), fCu: r4(cu), fTot: r2(total),
  })

  for (const m of movs) {
    const q = num(m.quantity)
    if (q === 0) continue
    const { serie, numero } = partirDocumento(m.referenceNumber)
    const base = {
      fecha: ddmmyyyy(aFecha(m.createdAt)),
      tipoDoc: tipoDocDe(m),
      serie,
      numero,
      tipoOp: TIPO_OPERACION[m.type] || '99',
    }

    if (q > 0) {
      // ENTRADA: costo real si la fuente lo tiene; si no, el promedio vigente
      // (un traslado o un ajuste no crea valor nuevo).
      const costoRef = costosPorRef.get(`${m.referenceId}:${productId}`)
      const costoEntrada = costoRef != null ? num(costoRef) : cu
      const totalEntrada = r2(q * costoEntrada)

      total = r2(total + totalEntrada)
      cant = r4(cant + q)
      cu = cant > 0 ? r4(total / cant) : 0

      lineas.push({
        ...base,
        eCant: r4(q), eCu: r4(costoEntrada), eTot: totalEntrada,
        sCant: '', sCu: '', sTot: '',
        fCant: r4(cant), fCu: r4(cu), fTot: r2(total),
      })
    } else {
      // SALIDA: al promedio ponderado vigente.
      const salida = Math.abs(q)
      // `costoUnitario` lo guarda el consumo interno; si está, manda.
      const costoSalida = m.costoUnitario != null ? num(m.costoUnitario) : cu
      const totalSalida = r2(salida * costoSalida)

      total = r2(total - totalSalida)
      cant = r4(cant - salida)
      // El promedio NO se recalcula al salir (solo cambia con las entradas),
      // salvo que el saldo llegue a cero.
      if (cant <= 0) { cant = r4(cant); total = r2(cant === 0 ? 0 : total) }

      lineas.push({
        ...base,
        eCant: '', eCu: '', eTot: '',
        sCant: r4(salida), sCu: r4(costoSalida), sTot: totalSalida,
        fCant: r4(cant), fCu: r4(cu), fTot: r2(total),
      })
    }
  }

  return lineas
}

/**
 * Genera el Excel del Formato 13.1.
 *
 * @param {Object} datos
 * @param {Array}  datos.movimientos  del período (con productId, type, quantity, createdAt, referenceType/Id/Number)
 * @param {Array}  datos.productos    catálogo (id, name, sku/code, unit, cost, stock)
 * @param {Array}  datos.compras      del período, para el costo real de las entradas
 * @param {Object} datos.empresa      { ruc, businessName, address }
 * @param {string} datos.periodo      'AAAA-MM'
 * @param {string} datos.establecimiento
 */
export const generarFormato131 = async ({
  movimientos = [],
  productos = [],
  compras = [],
  empresa = {},
  periodo = '',
  establecimiento = '',
} = {}) => {
  // Costo unitario real de cada entrada, indexado por compra+producto.
  const costosPorRef = new Map()
  for (const c of compras) {
    for (const it of (c.items || [])) {
      const pid = it.productId || it.id
      if (!pid) continue
      // Las bonificaciones entran a costo cero: son gratis y así deben valorizarse.
      const unit = it.isBonus ? 0 : num(it.unitPrice)
      costosPorRef.set(`${c.id}:${pid}`, unit)
    }
  }

  // Movimientos por producto, en orden cronológico.
  const porProducto = new Map()
  for (const m of movimientos) {
    const pid = m.productId
    if (!pid) continue
    if (!porProducto.has(pid)) porProducto.set(pid, [])
    porProducto.get(pid).push(m)
  }
  for (const lista of porProducto.values()) {
    lista.sort((a, b) => (aFecha(a.createdAt)?.getTime() || 0) - (aFecha(b.createdAt)?.getTime() || 0))
  }

  const aoa = []
  const merges = []
  const productosConMovimiento = productos
    .filter(p => porProducto.has(p.id))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'))

  if (productosConMovimiento.length === 0) {
    throw new Error('No hay movimientos de inventario en el período seleccionado')
  }

  for (const p of productosConMovimiento) {
    const movs = porProducto.get(p.id) || []

    // Saldo al INICIO del período: se reconstruye hacia atrás desde el stock
    // actual restando lo que se movió después. Sin esto el kardex arranca en
    // cero y no cuadra con el inventario real.
    const netoPeriodo = movs.reduce((s, m) => s + num(m.quantity), 0)
    const cantidadInicial = r4(num(p.stock) - netoPeriodo)
    const costoInicial = num(p.cost)

    const lineas = construirLineas(
      movs,
      { cantidad: cantidadInicial, costoUnitario: costoInicial },
      costosPorRef,
      p.id
    )

    const filaBloque = aoa.length
    aoa.push(['FORMATO 13.1: "REGISTRO DE INVENTARIO PERMANENTE VALORIZADO - DETALLE DEL INVENTARIO VALORIZADO"'])
    aoa.push([])
    aoa.push(['PERÍODO:', periodo])
    aoa.push(['RUC:', empresa.ruc || ''])
    aoa.push(['APELLIDOS Y NOMBRES, DENOMINACIÓN O RAZÓN SOCIAL:', empresa.businessName || empresa.name || ''])
    aoa.push(['ESTABLECIMIENTO (1):', establecimiento || ''])
    aoa.push(['CÓDIGO DE LA EXISTENCIA:', p.sku || p.code || p.id])
    aoa.push(['TIPO (TABLA 5):', '01'])
    aoa.push(['DESCRIPCIÓN:', p.name || ''])
    aoa.push(['CÓDIGO DE LA UNIDAD DE MEDIDA (TABLA 6):', normalizeSunatUnit(p.unit) || 'NIU'])
    aoa.push(['MÉTODO DE VALUACIÓN:', 'PROMEDIO PONDERADO'])
    aoa.push([])

    // Cabecera de tres pisos, igual que el formato oficial.
    const filaCab = aoa.length
    aoa.push(['DOCUMENTO DE TRASLADO, COMPROBANTE DE PAGO,', '', '', '', 'TIPO DE', 'ENTRADAS', '', '', 'SALIDAS', '', '', 'SALDO FINAL', '', ''])
    aoa.push(['DOCUMENTO INTERNO O SIMILAR', '', '', '', 'OPERACIÓN', 'CANTIDAD', 'COSTO UNITARIO', 'COSTO TOTAL', 'CANTIDAD', 'COSTO UNITARIO', 'COSTO TOTAL', 'CANTIDAD', 'COSTO UNITARIO', 'COSTO TOTAL'])
    aoa.push(['FECHA', 'TIPO (TABLA 10)', 'SERIE', 'NÚMERO', '(TABLA 12)', '', '', '', '', '', '', '', '', ''])

    merges.push(
      { s: { r: filaBloque, c: 0 }, e: { r: filaBloque, c: 13 } },
      { s: { r: filaCab, c: 0 }, e: { r: filaCab + 1, c: 3 } },
      { s: { r: filaCab, c: 4 }, e: { r: filaCab + 1, c: 4 } },
      { s: { r: filaCab, c: 5 }, e: { r: filaCab, c: 7 } },
      { s: { r: filaCab, c: 8 }, e: { r: filaCab, c: 10 } },
      { s: { r: filaCab, c: 11 }, e: { r: filaCab, c: 13 } },
    )

    for (const l of lineas) {
      aoa.push([
        l.fecha, l.tipoDoc, l.serie, l.numero, l.tipoOp,
        l.eCant, l.eCu, l.eTot,
        l.sCant, l.sCu, l.sTot,
        l.fCant, l.fCu, l.fTot,
      ])
    }

    // Totales del bloque: lo que el contador cuadra contra el mayor.
    const totE = lineas.reduce((s, l) => s + num(l.eTot), 0)
    const totS = lineas.reduce((s, l) => s + num(l.sTot), 0)
    const ultima = lineas[lineas.length - 1]
    aoa.push(['TOTALES', '', '', '', '', '', '', r2(totE), '', '', r2(totS), '', '', num(ultima.fTot)])
    aoa.push([])
    aoa.push([])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
    { wch: 11 }, { wch: 14 }, { wch: 13 },
    { wch: 11 }, { wch: 14 }, { wch: 13 },
    { wch: 11 }, { wch: 14 }, { wch: 13 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'F 13.1 Det.Inv.Per.Val.')

  const fileName = buildExcelFileName('Formato_13.1_Inventario_Valorizado', [periodo])
  await saveAndShareExcel(wb, fileName, {
    shareTitle: 'Formato 13.1 — Inventario Permanente Valorizado',
    shareText: `Registro de Inventario Permanente Valorizado ${periodo}`,
  })
  return { success: true, fileName, productos: productosConMovimiento.length }
}
