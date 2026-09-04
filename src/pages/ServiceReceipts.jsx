/**
 * RECIBOS Y COBRANZA (cobranza de servicios).
 *
 * Cierra el circuito: con las lecturas ya tomadas, acá se emiten los recibos
 * del mes, se imprimen y se van marcando cobrados.
 *
 * ── Emitir es un paso aparte de tomar la lectura ────────────────────────────
 * Porque son dos momentos distintos: las lecturas se toman caminando durante
 * varios días y se corrigen; el recibo, una vez emitido, tiene número y ya se
 * le entregó al vecino. Separarlos deja corregir sin miedo hasta que se decide
 * emitir.
 *
 * ── El cobro va a Caja ──────────────────────────────────────────────────────
 * Igual que en Préstamos: si hay una sesión de caja abierta, cobrar en efectivo
 * registra el ingreso. Si no la hay, el cobro se registra igual —la caja es
 * secundaria y no puede bloquear que el vecino pague.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Printer, Loader2, FileText, Check, Undo2, Ban, AlertTriangle, Coins,
} from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import GuideLink from '@/components/guide/GuideLink'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import {
  getSupplies, getPeriod, getReadings, getReceipts,
  emitReceipts, payReceipt, unpayReceipt, voidReceipt,
  PENDIENTE, PAGADO, ANULADO,
} from '@/services/serviceBillingService'
import { getCashRegisterSession, addCashMovement, getCompanySettings } from '@/services/firestoreService'
import {
  SIN_MEDIDOR, clavePeriodo, nombreDePeriodo, vencimientoDelPeriodo,
  importeDelRecibo, conciliacionDelPeriodo, r2,
} from '@/utils/cobranzaServicios'
import { reciboServicioHtml, recibosServicioHtml } from '@/utils/reciboServicioTicket'
import { printHtmlIframe } from '@/utils/printHtmlIframe'
import { buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'

const soles = (n) => `S/ ${(Number(n) || 0).toFixed(2)}`

const ESTADO = {
  [PENDIENTE]: { texto: 'Pendiente', chip: 'chip-aviso' },
  [PAGADO]: { texto: 'Pagado', chip: 'chip-ok' },
  [ANULADO]: { texto: 'Anulado', chip: 'chip-neutro' },
}

const METODOS = ['Efectivo', 'Yape', 'Plin', 'Transferencia', 'Otro']

function ultimosPeriodos() {
  const hoy = new Date()
  return Array.from({ length: 12 }, (_, i) => clavePeriodo(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)))
}

export default function ServiceReceipts() {
  const { getBusinessId, user, isDemoMode, businessSettings } = useAppContext()
  const toast = useToast()

  const [cargando, setCargando] = useState(true)
  const [periodoClave, setPeriodoClave] = useState(clavePeriodo(new Date()))
  const [periodo, setPeriodo] = useState(null)
  const [suministros, setSuministros] = useState([])
  const [lecturas, setLecturas] = useState({})
  const [recibos, setRecibos] = useState([])
  const [empresa, setEmpresa] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')  // todos | pendiente | pagado
  const [emitiendo, setEmitiendo] = useState(false)
  const [numeroInicial, setNumeroInicial] = useState('')
  const [cobrando, setCobrando] = useState(null)   // el recibo que se está cobrando
  const [metodo, setMetodo] = useState('Efectivo')
  const [guardandoCobro, setGuardandoCobro] = useState(false)
  const [anulando, setAnulando] = useState(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')

  const cargar = useCallback(async () => {
    const businessId = getBusinessId()
    if (!businessId) return
    setCargando(true)
    const [rs, rp, rl, rr, re] = await Promise.all([
      getSupplies(businessId),
      getPeriod(businessId, periodoClave),
      getReadings(businessId, periodoClave),
      getReceipts(businessId, periodoClave),
      getCompanySettings(businessId),
    ])
    if (rs.success) setSuministros(rs.data)
    setPeriodo(rp.success ? rp.data : null)
    setLecturas(rl.success ? rl.data : {})
    setRecibos(rr.success ? rr.data : [])
    setEmpresa(re?.success ? re.data : (re || null))
    setCargando(false)
  }, [getBusinessId, periodoClave])

  useEffect(() => { cargar() }, [cargar])

  /** Los datos del negocio que van impresos en el recibo. */
  const negocio = useMemo(() => ({
    titulo: businessSettings?.servicioTituloRecibo || 'RECIBO POR CONSUMO DE ENERGÍA ELÉCTRICA',
    nombre: empresa?.tradeName || empresa?.businessName || empresa?.name || '',
    ruc: empresa?.ruc || '',
    telefonos: [empresa?.phone, empresa?.phone2].filter(Boolean).join(' - '),
    firma: businessSettings?.servicioFirma || '',
    lema: businessSettings?.servicioLema || '',
  }), [empresa, businessSettings])

  // ─────────────────────────────────────────── lo que se emitiría este mes

  /** Los recibos que salen de las lecturas guardadas, todavía sin emitir. */
  const porEmitir = useMemo(() => {
    if (!periodo) return []
    const tarifario = {
      tarifa: periodo.tarifa || 0,
      minimoImporte: periodo.minimoImporte || 0,
      cargoFijo: periodo.cargoFijo || 0,
    }
    const vencimiento = periodo.vencimiento || vencimientoDelPeriodo(periodoClave, 15)

    return suministros.map((s) => {
      const l = lecturas[s.id]
      // Con medidor y sin lectura guardada no hay nada que cobrar: se salta.
      if (s.tipo !== SIN_MEDIDOR && (!l || l.consumo === null || l.consumo === undefined)) return null
      const calculo = importeDelRecibo(s, l?.consumo ?? null, tarifario)
      return {
        supplyId: s.id,
        tipo: s.tipo,
        nombre: s.nombre,
        numeroSuministro: s.numeroSuministro || '',
        direccion: s.direccion || '',
        referencia: s.referencia || '',
        lecturaAnterior: l?.lecturaAnterior ?? null,
        lecturaActual: l?.lecturaActual ?? null,
        consumo: calculo.consumo,
        tarifa: tarifario.tarifa,
        importeConsumo: calculo.importeConsumo,
        cargoFijo: calculo.cargoFijo,
        aplicoMinimo: calculo.aplicoMinimo,
        total: calculo.total,
        vencimiento,
      }
    }).filter(Boolean)
  }, [periodo, periodoClave, suministros, lecturas])

  const vivos = useMemo(() => recibos.filter(r => r.estado !== ANULADO), [recibos])

  const resumen = useMemo(() => {
    const pagados = vivos.filter(r => r.estado === PAGADO)
    const pendientes = vivos.filter(r => r.estado === PENDIENTE)
    return {
      emitidos: vivos.length,
      anulados: recibos.length - vivos.length,
      cobrado: r2(pagados.reduce((a, r) => a + (Number(r.total) || 0), 0)),
      porCobrar: r2(pendientes.reduce((a, r) => a + (Number(r.total) || 0), 0)),
      facturado: r2(vivos.reduce((a, r) => a + (Number(r.total) || 0), 0)),
      pagados: pagados.length,
      conciliacion: conciliacionDelPeriodo(periodo || {}, vivos),
    }
  }, [vivos, recibos, periodo])

  const pajar = useMemo(() => {
    const m = new Map()
    for (const r of recibos) {
      m.set(r.id, buildSearchHaystack(r.nombre, r.numeroSuministro, r.referencia, String(r.numero)))
    }
    return m
  }, [recibos])

  const visibles = useMemo(() => {
    let lista = recibos
    if (filtro === 'pendiente') lista = lista.filter(r => r.estado === PENDIENTE)
    else if (filtro === 'pagado') lista = lista.filter(r => r.estado === PAGADO)
    const q = busqueda.trim()
    if (!q) return lista
    return lista.filter(r => matchesPrebuilt(q, pajar.get(r.id)))
  }, [recibos, filtro, busqueda, pajar])

  // ─────────────────────────────────────────────────────────────── acciones

  const emitir = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    const businessId = getBusinessId()
    if (!businessId || porEmitir.length === 0) return

    setEmitiendo(true)
    const r = await emitReceipts(businessId, periodoClave, porEmitir, {
      desde: numeroInicial === '' ? null : Number(numeroInicial) - 1,
    })
    setEmitiendo(false)
    if (!r.success) { toast.error(r.error || 'No se pudieron emitir los recibos'); return }
    toast.success(
      r.data.nuevos === r.data.emitidos
        ? `${r.data.emitidos} recibos emitidos`
        : `${r.data.nuevos} recibos nuevos. Los ${r.data.emitidos - r.data.nuevos} ya emitidos conservan su número.`,
    )
    setNumeroInicial('')
    cargar()
  }

  const cobrar = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    const businessId = getBusinessId()
    if (!businessId || !cobrando) return

    setGuardandoCobro(true)
    const r = await payReceipt(businessId, cobrando.id, {
      metodo,
      userId: user?.uid,
      userName: user?.displayName || user?.email || '',
    })
    if (!r.success) { setGuardandoCobro(false); toast.error('No se pudo registrar el cobro'); return }

    // La caja es secundaria: si no hay sesión abierta, el cobro ya quedó hecho.
    if (metodo === 'Efectivo') {
      try {
        const sesion = await getCashRegisterSession(businessId, null, user?.uid)
        if (sesion.success && sesion.data?.id) {
          await addCashMovement(businessId, sesion.data.id, {
            type: 'income',
            amount: Number(cobrando.total) || 0,
            reason: `Recibo N° ${cobrando.numero} - ${cobrando.nombre}`,
            category: 'Servicios',
            userId: user?.uid,
            userName: user?.displayName || user?.email || '',
          })
        }
      } catch { /* el cobro ya está registrado */ }
    }

    setGuardandoCobro(false)
    toast.success(`Recibo N° ${cobrando.numero} cobrado`)
    imprimir(cobrando, { estado: PAGADO })
    setCobrando(null)
    cargar()
  }

  const deshacerCobro = async (recibo) => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    const r = await unpayReceipt(getBusinessId(), recibo.id)
    if (!r.success) { toast.error('No se pudo deshacer'); return }
    toast.success('El recibo vuelve a Pendiente. Revisa el movimiento en Caja si ya lo registraste.')
    cargar()
  }

  const anular = async () => {
    if (isDemoMode) { toast.error('No disponible en modo demo'); return }
    const r = await voidReceipt(getBusinessId(), anulando.id, motivoAnulacion)
    if (!r.success) { toast.error('No se pudo anular'); return }
    toast.success(`Recibo N° ${anulando.numero} anulado`)
    setAnulando(null)
    setMotivoAnulacion('')
    cargar()
  }

  const imprimir = (recibo, extra = {}) => {
    printHtmlIframe(reciboServicioHtml({ ...recibo, ...extra }, periodo || {}, negocio))
  }

  const imprimirTodos = () => {
    const lista = visibles.filter(r => r.estado !== ANULADO)
    if (lista.length === 0) { toast.error('No hay recibos para imprimir'); return }
    printHtmlIframe(recibosServicioHtml(lista, periodo || {}, negocio))
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando recibos...</p>
        </div>
      </div>
    )
  }

  const c = resumen.conciliacion

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Recibos y cobranza</h1>
          <GuideLink />
          <select
            value={periodoClave}
            onChange={(e) => setPeriodoClave(e.target.value)}
            className="px-3 py-1.5 text-sm font-semibold border border-gray-300 rounded-md bg-white"
          >
            {ultimosPeriodos().map(p => (
              <option key={p} value={p}>{nombreDePeriodo(p)}</option>
            ))}
          </select>
        </div>
        {recibos.length > 0 && (
          <Button variant="outline" onClick={imprimirTodos}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir {visibles.filter(r => r.estado !== ANULADO).length}
          </Button>
        )}
      </div>

      {/* Emitir el mes */}
      {porEmitir.length > 0 && vivos.length < porEmitir.length && (
        <Card>
          <CardContent className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <FileText className="w-5 h-5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold text-gray-900">
                  {vivos.length === 0
                    ? `Hay ${porEmitir.length} recibos listos para emitir`
                    : `Hay ${porEmitir.length - vivos.length} recibos nuevos por emitir`}
                </p>
                <p className="text-xs text-gray-500">
                  Salen de las lecturas guardadas de {nombreDePeriodo(periodoClave)}.
                  {vivos.length > 0 && ' Los ya emitidos conservan su número.'}
                </p>
              </div>
              {vivos.length === 0 && recibos.length === 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 whitespace-nowrap">Empezar en el N°</span>
                  <input
                    type="number" inputMode="numeric" min="1"
                    value={numeroInicial}
                    onChange={(e) => setNumeroInicial(e.target.value)}
                    placeholder="134"
                    className="w-24 px-2 py-1.5 border border-gray-300 rounded-md text-right tabular-nums focus:ring-2 focus:ring-primary-500"
                  />
                </label>
              )}
              <Button onClick={emitir} disabled={emitiendo || isDemoMode}>
                {emitiendo
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <FileText className="w-4 h-4 mr-2" />}
                Emitir recibos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {porEmitir.length === 0 && recibos.length === 0 && (
        <Card>
          <CardContent className="px-4 py-10 text-center">
            <p className="text-gray-500">Todavía no hay lecturas guardadas de {nombreDePeriodo(periodoClave)}.</p>
            <Link
              to="/app/servicios-lecturas"
              className="inline-block mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Ir a tomar las lecturas
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Cómo va el mes */}
      {recibos.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600">
          <span>Emitidos <strong className="ml-1 text-base text-gray-900 tabular-nums">{resumen.emitidos}</strong></span>
          <span>Cobrado <strong className="ml-1 text-base text-emerald-600 tabular-nums">{soles(resumen.cobrado)}</strong>
            <span className="text-gray-400"> ({resumen.pagados})</span>
          </span>
          <span>Por cobrar <strong className="ml-1 text-base text-amber-600 tabular-nums">{soles(resumen.porCobrar)}</strong></span>
          {resumen.anulados > 0 && <span className="text-gray-400">Anulados {resumen.anulados}</span>}
          {Number(periodo?.reciboSoles) > 0 && (
            <span className={`sm:ml-auto px-2 py-0.5 rounded-md font-semibold tabular-nums ${c.resultado < 0 ? 'chip-error' : 'chip-ok'}`}>
              Facturado {soles(c.facturado)} · paga {soles(c.compradoSoles)} ·
              {c.resultado < 0 ? ' le falta ' : ' le sobra '}{soles(Math.abs(c.resultado))}
            </span>
          )}
        </div>
      )}

      {recibos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, suministro o N° de recibo"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex bg-gray-100 rounded-md p-0.5">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'pendiente', label: `Por cobrar (${vivos.filter(r => r.estado === PENDIENTE).length})` },
              { id: 'pagado', label: `Cobrados (${resumen.pagados})` },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`px-3 py-1 text-sm font-semibold rounded-[5px] transition-colors ${
                  filtro === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {recibos.length > 0 && (
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            {visibles.length === 0 && (
              <p className="px-4 py-10 text-center text-gray-500">Ninguno coincide con la búsqueda.</p>
            )}
            {visibles.map((r) => {
              const estado = ESTADO[r.estado] || ESTADO[PENDIENTE]
              const anulado = r.estado === ANULADO
              return (
                <div key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${anulado ? 'opacity-60' : ''}`}>
                  <span className="w-12 shrink-0 text-sm font-semibold text-gray-500 tabular-nums">
                    {r.numero}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium text-gray-900 leading-snug truncate ${anulado ? 'line-through' : ''}`}>
                      {r.nombre}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {r.numeroSuministro || 'Sin N° de suministro'}
                      {r.tipo === SIN_MEDIDOR
                        ? ' · Cuota fija'
                        : r.consumo !== null && ` · ${r.consumo} kWh`}
                      {r.aplicoMinimo && ' · mínimo'}
                    </p>
                  </div>

                  <span className={`shrink-0 px-2 py-0.5 text-xs font-semibold rounded-md ${estado.chip}`}>
                    {estado.texto}
                  </span>

                  <span className="w-24 shrink-0 text-right font-bold text-gray-900 tabular-nums">
                    {soles(r.total)}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => imprimir(r)}
                      className="w-9 h-9 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                      title="Imprimir"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    {r.estado === PENDIENTE && (
                      <>
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => { setCobrando(r); setMetodo('Efectivo') }}
                          disabled={isDemoMode}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Cobrar
                        </Button>
                        <button
                          type="button"
                          onClick={() => { setAnulando(r); setMotivoAnulacion('') }}
                          className="w-9 h-9 flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Anular"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {r.estado === PAGADO && (
                      <button
                        type="button"
                        onClick={() => deshacerCobro(r)}
                        className="w-9 h-9 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                        title="Deshacer el cobro"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Cobrar */}
      <Modal isOpen={!!cobrando} onClose={() => setCobrando(null)} title="Registrar cobro">
        {cobrando && (
          <div className="space-y-4">
            <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-md">
              <p className="text-sm text-gray-600">Recibo N° {cobrando.numero}</p>
              <p className="font-semibold text-gray-900">{cobrando.nombre}</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{soles(cobrando.total)}</p>
            </div>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Método de pago</span>
              <Select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="w-full">
                {METODOS.map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
              <span className="block text-xs text-gray-500 mt-1">
                En efectivo, el ingreso entra a la caja del día si tienes una abierta.
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCobrando(null)}>Cancelar</Button>
              <Button variant="success" onClick={cobrar} disabled={guardandoCobro}>
                {guardandoCobro
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Coins className="w-4 h-4 mr-2" />}
                Cobrar e imprimir
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Anular */}
      <Modal isOpen={!!anulando} onClose={() => setAnulando(null)} title="Anular recibo">
        {anulando && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 px-4 py-3 text-sm text-amber-800 bg-amber-50 border-l-2 border-amber-400 rounded-r-md">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                El recibo N° {anulando.numero} de <strong>{anulando.nombre}</strong> queda anulado.
                El número no se reutiliza, igual que en el talonario de papel.
              </span>
            </div>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Motivo</span>
              <input
                type="text" autoFocus
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                placeholder="Lectura equivocada, medidor cambiado..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAnulando(null)}>Cancelar</Button>
              <Button variant="danger" onClick={anular}>
                <Ban className="w-4 h-4 mr-2" />
                Anular
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
