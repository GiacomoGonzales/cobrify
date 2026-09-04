/**
 * LECTURAS DEL MES (cobranza de servicios).
 *
 * Reemplaza al Excel con el que el negocio venía anotando: una fila por
 * medidor, en el orden en que se camina el pueblo, con la lectura anterior ya
 * puesta y un solo campo que llenar.
 *
 * ── Pensada para el celular ─────────────────────────────────────────────────
 * Las lecturas se toman caminando, medidor por medidor, no sentado frente a
 * una computadora. Por eso: teclado numérico, campos grandes, "siguiente" del
 * teclado que salta al de abajo, y un buscador para cuando hay que volver a
 * una casa suelta. El importe se ve al instante para poder cantarlo en el acto.
 *
 * ── Por qué no se guarda solo ───────────────────────────────────────────────
 * En el campo no hay señal. Se escribe todo sin conexión y se guarda al final,
 * en un lote; mientras tanto, lo tipeado queda en este navegador para que
 * cerrar la app por accidente no borre la caminata de una mañana.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Save, Loader2, AlertTriangle, CheckCircle2, RefreshCw, Zap, CircleDot } from 'lucide-react'
import Card, { CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import GuideLink from '@/components/guide/GuideLink'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getSupplies, getPeriod, getReadings, saveReadings, savePeriod } from '@/services/serviceBillingService'
import {
  SIN_MEDIDOR,
  clavePeriodo, nombreDePeriodo, rangoDelPeriodo, vencimientoDelPeriodo,
  tarifaDelRecibo, revisarLectura, importeDelRecibo, conciliacionDelPeriodo,
  consumoHastaElMinimo, LECTURA_SIN_ACTUAL, LECTURA_RETROCEDE, r2,
} from '@/utils/cobranzaServicios'
import { leerBorrador, guardarBorrador, borrarBorrador } from '@/utils/borradorLocal'
import { buildSearchHaystack, matchesPrebuilt } from '@/lib/utils'

const soles = (n) => `S/ ${(Number(n) || 0).toFixed(2)}`

/** Los últimos 12 meses, del más reciente hacia atrás. */
function ultimosPeriodos() {
  const hoy = new Date()
  return Array.from({ length: 12 }, (_, i) => clavePeriodo(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)))
}

export default function ServiceReadings() {
  const { getBusinessId } = useAppContext()
  const toast = useToast()

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [suministros, setSuministros] = useState([])
  const [periodoClave, setPeriodoClave] = useState(clavePeriodo(new Date()))
  const [periodo, setPeriodo] = useState(null)

  // Lo que se escribe, por suministro: { [supplyId]: { actual, medidorNuevo } }
  const [lecturas, setLecturas] = useState({})
  const [busqueda, setBusqueda] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)

  // El recibo mayorista, que da la tarifa del mes
  const [reciboKwh, setReciboKwh] = useState('')
  const [reciboSoles, setReciboSoles] = useState('')
  const [minimoImporte, setMinimoImporte] = useState('5')
  const [cargoFijo, setCargoFijo] = useState('0')

  const camposRef = useRef([])
  const cargadoRef = useRef(false)
  const claveBorrador = `lecturas_${getBusinessId()}_${periodoClave}`

  // ─────────────────────────────────────────────────────────── carga

  const cargar = useCallback(async () => {
    const businessId = getBusinessId()
    if (!businessId) return
    setCargando(true)
    cargadoRef.current = false

    const [rs, rp, rl] = await Promise.all([
      getSupplies(businessId),
      getPeriod(businessId, periodoClave),
      getReadings(businessId, periodoClave),
    ])

    if (rs.success) setSuministros(rs.data)
    else toast.error('No se pudieron cargar los suministros')

    const p = rp.success ? rp.data : null
    setPeriodo(p)
    setReciboKwh(p?.reciboKwh ? String(p.reciboKwh) : '')
    setReciboSoles(p?.reciboSoles ? String(p.reciboSoles) : '')
    setMinimoImporte(p ? String(p.minimoImporte ?? 5) : '5')
    setCargoFijo(p ? String(p.cargoFijo ?? 0) : '0')

    // Lo ya guardado en el servidor manda; encima se pone lo que quedó a medio
    // escribir en este navegador, que es más nuevo.
    const guardadas = {}
    if (rl.success) {
      for (const [id, l] of Object.entries(rl.data)) {
        guardadas[id] = {
          actual: l.lecturaActual === null || l.lecturaActual === undefined ? '' : String(l.lecturaActual),
          medidorNuevo: l.medidorNuevo === true,
        }
      }
    }
    const borrador = leerBorrador(`lecturas_${businessId}_${periodoClave}`, { horas: 72 })
    setLecturas({ ...guardadas, ...(borrador?.lecturas || {}) })
    if (borrador?.lecturas && Object.keys(borrador.lecturas).length > 0) {
      toast.info('Se recuperaron las lecturas que quedaron sin guardar')
    }

    setCargando(false)
    cargadoRef.current = true
    // `toast` fuera de las dependencias a propósito: el provider devuelve un
    // objeto nuevo en cada render, así que un error acá mostraría un toast, que
    // recrearía `cargar`, que volvería a cargar y a fallar. Bucle infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getBusinessId, periodoClave])

  useEffect(() => { cargar() }, [cargar])

  // Se guarda en el navegador mientras se escribe: en el campo no hay señal y
  // cerrar la app por accidente no puede borrar la caminata de una mañana.
  useEffect(() => {
    if (!cargadoRef.current) return
    const t = setTimeout(() => {
      const conValor = Object.fromEntries(
        Object.entries(lecturas).filter(([, v]) => v?.actual !== '' || v?.medidorNuevo),
      )
      if (Object.keys(conValor).length === 0) borrarBorrador(claveBorrador)
      else guardarBorrador(claveBorrador, { lecturas: conValor })
    }, 600)
    return () => clearTimeout(t)
  }, [lecturas, claveBorrador])

  // ─────────────────────────────────────────────────────────── cálculo

  const tarifa = useMemo(() => tarifaDelRecibo(reciboSoles, reciboKwh), [reciboSoles, reciboKwh])

  const tarifario = useMemo(() => ({
    // Mientras no se cargue el recibo del mes se usa la tarifa congelada del
    // periodo, si ya se abrió: así se puede seguir tomando lecturas antes de
    // que llegue el recibo mayorista.
    tarifa: tarifa ?? (periodo?.tarifa || 0),
    minimoImporte: Number(minimoImporte) || 0,
    cargoFijo: Number(cargoFijo) || 0,
  }), [tarifa, periodo, minimoImporte, cargoFijo])

  /** Una fila por suministro, ya con su consumo, su importe y su aviso. */
  const filas = useMemo(() => suministros.map((s) => {
    const escrito = lecturas[s.id] || {}
    const medidorNuevo = escrito.medidorNuevo === true

    if (s.tipo === SIN_MEDIDOR) {
      const calculo = importeDelRecibo(s, null, tarifario)
      return { suministro: s, sinMedidor: true, revision: { ok: true, consumo: null }, calculo, escrito }
    }

    const actual = escrito.actual === '' || escrito.actual === undefined ? null : escrito.actual
    const revision = revisarLectura(s.ultimaLectura, actual, { medidorNuevo })
    const calculo = importeDelRecibo(s, revision.ok ? revision.consumo : null, tarifario)
    return { suministro: s, sinMedidor: false, revision, calculo, escrito }
  }), [suministros, lecturas, tarifario])

  // El texto buscable se arma una vez por suministro y no en cada tecla, con
  // el mismo criterio del resto del sistema: sin tildes y por palabras
  // sueltas, para que "castro tello" encuentre "CASTRO  TELLO ,Policarpio".
  const pajar = useMemo(() => {
    const m = new Map()
    for (const s of suministros) {
      m.set(s.id, buildSearchHaystack(s.nombre, s.numeroSuministro, s.referencia, s.direccion, s.documento))
    }
    return m
  }, [suministros])

  const visibles = useMemo(() => {
    let lista = filas
    if (soloPendientes) {
      lista = lista.filter(f => !f.sinMedidor && f.revision.motivo === LECTURA_SIN_ACTUAL)
    }
    const q = busqueda.trim()
    if (!q) return lista
    return lista.filter(f => matchesPrebuilt(q, pajar.get(f.suministro.id)))
  }, [filas, busqueda, soloPendientes, pajar])

  const resumen = useMemo(() => {
    const conMedidor = filas.filter(f => !f.sinMedidor)
    const leidos = conMedidor.filter(f => f.revision.ok)
    const conProblema = conMedidor.filter(f => f.revision.motivo === LECTURA_RETROCEDE)
    const recibos = filas
      .filter(f => f.revision.ok)
      .map(f => ({ tipo: f.suministro.tipo, consumo: f.calculo.consumo, total: f.calculo.total }))
    return {
      total: conMedidor.length,
      leidos: leidos.length,
      faltan: conMedidor.length - leidos.length,
      conProblema: conProblema.length,
      conMinimo: filas.filter(f => f.calculo.aplicoMinimo).length,
      conciliacion: conciliacionDelPeriodo({ reciboKwh, reciboSoles }, recibos),
    }
  }, [filas, reciboKwh, reciboSoles])

  const topeDelMinimo = useMemo(
    () => consumoHastaElMinimo(tarifario.tarifa, tarifario.minimoImporte),
    [tarifario],
  )

  // ─────────────────────────────────────────────────────────── acciones

  const escribir = (id, valor) => setLecturas(prev => ({
    ...prev,
    [id]: { ...(prev[id] || {}), actual: valor },
  }))

  const marcarMedidorNuevo = (id) => setLecturas(prev => ({
    ...prev,
    [id]: { ...(prev[id] || {}), medidorNuevo: !prev[id]?.medidorNuevo },
  }))

  /** Enter salta al campo de abajo, para no tener que tocar la pantalla. */
  const alPresionar = (e, i) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    camposRef.current[i + 1]?.focus()
    camposRef.current[i + 1]?.select()
  }

  const guardar = async () => {
    const businessId = getBusinessId()
    if (!businessId) return
    setGuardando(true)

    const { desde, hasta } = rangoDelPeriodo(periodoClave)
    const rp = await savePeriod(businessId, periodoClave, {
      desde,
      hasta,
      reciboKwh: Number(reciboKwh) || 0,
      reciboSoles: Number(reciboSoles) || 0,
      tarifa: tarifario.tarifa,
      minimoImporte: tarifario.minimoImporte,
      cargoFijo: tarifario.cargoFijo,
      vencimiento: vencimientoDelPeriodo(periodoClave, 15),
      createdAt: periodo?.createdAt,
    })
    if (!rp.success) {
      toast.error('No se pudo guardar el periodo')
      setGuardando(false)
      return
    }

    // Solo lo que tiene lectura: un medidor sin leer no debe pisar su última
    // lectura con un vacío.
    const aGuardar = filas
      .filter(f => !f.sinMedidor && f.revision.ok && f.revision.consumo !== null)
      .map(f => ({
        supplyId: f.suministro.id,
        lecturaAnterior: f.escrito.medidorNuevo ? 0 : f.suministro.ultimaLectura ?? null,
        lecturaActual: Number(f.escrito.actual),
        consumo: f.revision.consumo,
        medidorNuevo: f.escrito.medidorNuevo === true,
      }))

    const r = await saveReadings(businessId, periodoClave, aGuardar)
    setGuardando(false)
    if (!r.success) {
      toast.error('No se pudieron guardar las lecturas')
      return
    }
    borrarBorrador(claveBorrador)
    toast.success(`${aGuardar.length} lecturas guardadas`)
    cargar()
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando lecturas...</p>
        </div>
      </div>
    )
  }

  const c = resumen.conciliacion

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Lecturas del mes</h1>
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
        <Button onClick={guardar} disabled={guardando || resumen.leidos === 0}>
          {guardando
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Save className="w-4 h-4 mr-2" />}
          Guardar lecturas
        </Button>
      </div>

      {/* El recibo mayorista: de acá sale la tarifa del mes */}
      <Card>
        <CardContent className="px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900">Recibo que le llega al negocio</h2>
            <span className="text-xs text-gray-500">— de acá sale la tarifa del mes</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Consumo (kWh)</span>
              <input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={reciboKwh}
                onChange={(e) => setReciboKwh(e.target.value)}
                placeholder="8823.83"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right tabular-nums focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Importe (S/)</span>
              <input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={reciboSoles}
                onChange={(e) => setReciboSoles(e.target.value)}
                placeholder="4606.04"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right tabular-nums focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <div className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Tarifa del mes</span>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-right tabular-nums font-bold text-gray-900">
                {tarifa === null ? '—' : `${tarifa.toFixed(3)} S/kWh`}
              </div>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Cobro mínimo (S/)</span>
              <input
                type="number" inputMode="decimal" step="0.10" min="0"
                value={minimoImporte}
                onChange={(e) => setMinimoImporte(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right tabular-nums focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Cargo fijo (S/)</span>
              <input
                type="number" inputMode="decimal" step="0.10" min="0"
                value={cargoFijo}
                onChange={(e) => setCargoFijo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right tabular-nums focus:ring-2 focus:ring-primary-500"
              />
            </label>
          </div>
          {topeDelMinimo !== null && (
            <p className="text-xs text-gray-500 mt-2">
              Con esta tarifa, el mínimo de {soles(tarifario.minimoImporte)} alcanza a los
              consumos de hasta {topeDelMinimo} kWh.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Conciliación: lo que compró contra lo que va a repartir */}
      {Number(reciboKwh) > 0 && (
        <Card>
          <CardContent className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="text-gray-600">
                Medido
                <strong className="ml-1 text-gray-900 tabular-nums">{c.medidoKwh} kWh</strong>
                <span className="text-gray-400"> de {c.compradoKwh}</span>
              </span>
              <span className="text-gray-600">
                Sin medir
                <strong className={`ml-1 tabular-nums ${c.perdidaPorcentaje > 15 ? 'text-red-600' : 'text-gray-900'}`}>
                  {c.perdidaKwh} kWh ({c.perdidaPorcentaje}%)
                </strong>
              </span>
              <span className="text-gray-600">
                A cobrar <strong className="ml-1 text-gray-900 tabular-nums">{soles(c.facturado)}</strong>
              </span>
              <span className="text-gray-600">
                Paga <strong className="ml-1 text-gray-900 tabular-nums">{soles(c.compradoSoles)}</strong>
              </span>
              <span className={`px-2 py-0.5 rounded-md font-semibold tabular-nums ${c.resultado < 0 ? 'chip-error' : 'chip-ok'}`}>
                {c.resultado < 0 ? 'Le falta ' : 'Le sobra '}{soles(Math.abs(c.resultado))}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Buscador y avance */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, suministro o referencia"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setSoloPendientes(v => !v)}
          className={`px-3 py-2 text-sm font-semibold rounded-md border transition-colors ${
            soloPendientes
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Solo los que faltan ({resumen.faltan})
        </button>
        <span className="text-sm text-gray-600">
          <strong className="text-gray-900 tabular-nums">{resumen.leidos}</strong> de {resumen.total} leídos
          {resumen.conMinimo > 0 && <span className="text-gray-400"> · {resumen.conMinimo} al mínimo</span>}
        </span>
      </div>

      {resumen.conProblema > 0 && (
        <div className="flex items-start gap-2 px-4 py-2 text-sm text-amber-800 bg-amber-50 border-l-2 border-amber-400 rounded-r-md">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {resumen.conProblema} {resumen.conProblema === 1 ? 'lectura es menor' : 'lecturas son menores'} que
            la del mes pasado. Revísalas: si se cambió el medidor, márcalo con el botón de la fila.
            No se van a guardar hasta que se resuelvan.
          </span>
        </div>
      )}

      {/* Las filas */}
      <Card>
        <CardContent className="p-0 divide-y divide-gray-100">
          {visibles.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-gray-500">
                {suministros.length === 0
                  ? 'Todavía no hay suministros cargados.'
                  : 'Ningún suministro coincide con la búsqueda.'}
              </p>
              {suministros.length === 0 && (
                <Link
                  to="/app/servicios-suministros"
                  className="inline-block mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  Cargar el padrón de suministros
                </Link>
              )}
            </div>
          )}
          {visibles.map((f, i) => {
            const s = f.suministro
            const problema = !f.revision.ok && f.revision.motivo === LECTURA_RETROCEDE
            return (
              <div
                key={s.id}
                className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${problema ? 'bg-amber-50' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 leading-snug truncate">{s.nombre}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {s.numeroSuministro || 'Sin N° de suministro'}
                    {s.referencia && <span> · {s.referencia}</span>}
                  </p>
                </div>

                {f.sinMedidor ? (
                  <span className="text-sm text-gray-500">Cuota fija</span>
                ) : (
                  <>
                    <div className="text-right w-20 shrink-0">
                      <span className="block text-[11px] text-gray-500">Anterior</span>
                      <span className="block text-sm text-gray-700 tabular-nums">
                        {f.escrito.medidorNuevo ? '0.0' : (s.ultimaLectura ?? '—')}
                      </span>
                    </div>
                    <input
                      ref={(el) => { camposRef.current[i] = el }}
                      type="number" inputMode="decimal" step="0.1" min="0"
                      value={f.escrito.actual ?? ''}
                      onChange={(e) => escribir(s.id, e.target.value)}
                      onKeyDown={(e) => alPresionar(e, i)}
                      onFocus={(e) => e.target.select()}
                      enterKeyHint="next"
                      placeholder="Actual"
                      className={`w-24 shrink-0 px-2 py-2 text-right tabular-nums font-semibold border rounded-md focus:ring-2 focus:ring-primary-500 ${
                        problema ? 'border-amber-400 bg-white' : 'border-gray-300'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => marcarMedidorNuevo(s.id)}
                      title="El medidor se cambió: la cuenta arranca de cero"
                      className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-md border transition-colors ${
                        f.escrito.medidorNuevo
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-400 border-gray-300 hover:text-gray-700'
                      }`}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <div className="text-right w-16 shrink-0">
                      <span className="block text-[11px] text-gray-500">Consumo</span>
                      <span className="block text-sm text-gray-700 tabular-nums">
                        {f.revision.ok && f.revision.consumo !== null ? f.revision.consumo : '—'}
                      </span>
                    </div>
                  </>
                )}

                <div className="text-right w-24 shrink-0">
                  <span className="block text-[11px] text-gray-500">
                    {f.calculo.aplicoMinimo ? 'Mínimo' : 'Importe'}
                  </span>
                  <span className={`block font-bold tabular-nums ${f.calculo.aplicoMinimo ? 'text-amber-700' : 'text-gray-900'}`}>
                    {f.revision.ok ? soles(f.calculo.total) : '—'}
                  </span>
                </div>

                <div className="w-5 shrink-0">
                  {problema
                    ? <AlertTriangle className="w-5 h-5 text-amber-500" />
                    : f.revision.ok && !f.sinMedidor
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      : <CircleDot className="w-5 h-5 text-gray-300" />}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {visibles.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando || resumen.leidos === 0}>
            {guardando
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Save className="w-4 h-4 mr-2" />}
            Guardar {resumen.leidos} lecturas — {soles(r2(c.facturado))}
          </Button>
        </div>
      )}
    </div>
  )
}
