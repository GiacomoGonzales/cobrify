import { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  ChefHat,
  Minus,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useAppContext } from '@/hooks/useAppContext'
import { useToast } from '@/contexts/ToastContext'
import { getProducts } from '@/services/firestoreService'
import { getWarehouses } from '@/services/warehouseService'
import { buildProductHaystack } from '@/utils/productSearch'
import { matchesPrebuilt } from '@/lib/utils'
import { toDateString } from '@/utils/emissionDate'
import {
  MOTIVOS_CONSUMO,
  motivoPorId,
  createInternalConsumption,
  voidInternalConsumption,
  getInternalConsumptions,
  resumirPorMotivo,
} from '@/services/internalConsumptionService'

/**
 * CONSUMO INTERNO — lo que sale del stock sin venderse.
 *
 * El almuerzo del personal, la merma, la cortesía. Se arma como un pedido
 * (buscar, agregar, cantidades) porque es el gesto que el usuario ya conoce,
 * pero al confirmar no cobra nada: descuenta stock y deja el costo registrado.
 */
export default function InternalConsumption() {
  // filterWarehousesByAccess sale del mismo hook: respeta el acceso por
  // sucursal del sub-usuario, igual que Movimientos de Stock.
  const {
    user, getBusinessId, businessMode, businessSettings, isDemoMode,
    filterWarehousesByAccess,
  } = useAppContext()
  const toast = useToast()

  const [productos, setProductos] = useState([])
  const [almacenes, setAlmacenes] = useState([])
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)

  // Formulario
  const [motivo, setMotivo] = useState('personal')
  const [fecha, setFecha] = useState(() => toDateString())
  const [almacenId, setAlmacenId] = useState('')
  const [empleado, setEmpleado] = useState('')
  const [nota, setNota] = useState('')
  const [carrito, setCarrito] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Historial
  const [filtroMotivo, setFiltroMotivo] = useState('')
  const [mes, setMes] = useState(() => toDateString().slice(0, 7))

  useEffect(() => {
    (async () => {
      const businessId = getBusinessId()
      if (!businessId) return
      try {
        const [prodRes, almRes, histRes] = await Promise.all([
          getProducts(businessId),
          getWarehouses(businessId),
          getInternalConsumptions(businessId),
        ])
        setProductos(prodRes.success ? prodRes.data : [])
        const alm = filterWarehousesByAccess
          ? filterWarehousesByAccess(almRes.success ? almRes.data : [])
          : (almRes.success ? almRes.data : [])
        setAlmacenes(alm)
        // El almacén principal por defecto: es el que se usa casi siempre.
        setAlmacenId((prev) => prev || alm.find((a) => a.isDefault)?.id || alm[0]?.id || '')
        setHistorial(histRes.data || [])
      } catch (e) {
        console.error(e)
        toast.error('No se pudieron cargar los datos')
      } finally {
        setCargando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recargarHistorial = async () => {
    const r = await getInternalConsumptions(getBusinessId())
    setHistorial(r.data || [])
  }

  // Mismo criterio de búsqueda que el resto del sistema (POS, Compras,
  // Cotizaciones): un solo builder para que no vuelvan a divergir.
  const resultados = useMemo(() => {
    if (busqueda.trim().length < 2) return []
    return productos
      .filter((p) => p.trackStock !== false)
      .filter((p) => matchesPrebuilt(busqueda, buildProductHaystack(p)))
      .slice(0, 8)
  }, [productos, busqueda])

  /** El costo es lo que vale reponerlo, no lo que se cobra. */
  const costoDe = (p) => Number(p.cost ?? p.costPrice ?? p.purchasePrice ?? 0) || 0

  const agregar = (p) => {
    setCarrito((prev) => {
      const i = prev.findIndex((x) => x.productId === p.id)
      if (i >= 0) {
        const copia = [...prev]
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 }
        return copia
      }
      return [...prev, {
        productId: p.id,
        nombre: p.name,
        cantidad: 1,
        costoUnitario: costoDe(p),
        unidad: p.unit || null,
        stockActual: Number(p.stock) || 0,
      }]
    })
    setBusqueda('')
  }

  const cambiarCantidad = (productId, delta) => {
    setCarrito((prev) => prev
      .map((x) => (x.productId === productId ? { ...x, cantidad: Math.max(0, x.cantidad + delta) } : x))
      .filter((x) => x.cantidad > 0))
  }

  const fijarCantidad = (productId, valor) => {
    const n = parseFloat(valor)
    setCarrito((prev) => prev.map((x) => (x.productId === productId ? { ...x, cantidad: isNaN(n) ? 0 : n } : x)))
  }

  const fijarCosto = (productId, valor) => {
    const n = parseFloat(valor)
    setCarrito((prev) => prev.map((x) => (x.productId === productId ? { ...x, costoUnitario: isNaN(n) ? 0 : n } : x)))
  }

  const total = carrito.reduce((a, x) => a + (Number(x.costoUnitario) || 0) * Number(x.cantidad), 0)
  const motivoActual = motivoPorId(motivo)
  const sinCosto = carrito.some((x) => !x.costoUnitario)

  const registrar = async () => {
    if (isDemoMode) { toast.info('Esta función no está disponible en modo demo'); return }
    if (carrito.length === 0) { toast.error('Agregá al menos un producto'); return }
    if (!almacenId) { toast.error('Elegí de qué almacén sale'); return }
    if (fecha > toDateString()) { toast.error('La fecha no puede ser futura'); return }

    setGuardando(true)
    try {
      const [a, m, d] = fecha.split('-').map(Number)
      const r = await createInternalConsumption(getBusinessId(), {
        items: carrito,
        motivo,
        // Al mediodía y por partes: `new Date('2026-08-19')` es medianoche UTC
        // y en Perú caería el día anterior.
        fecha: fecha === toDateString() ? new Date() : new Date(a, m - 1, d, 12, 0, 0),
        empleadoNombre: motivoActual?.pideEmpleado ? (empleado.trim() || null) : null,
        nota: nota.trim() || null,
        warehouseId: almacenId,
        businessMode,
        permitirNegativo: !!businessSettings?.allowNegativeStock,
        usuario: { uid: user?.uid, email: user?.email, nombre: user?.displayName },
      })

      if (!r.success) throw new Error(r.error)

      if (r.advertencias?.length) {
        toast.warning(`Registrado, pero ${r.advertencias.length} producto(s) no se pudieron descontar. Revisá el inventario.`, 8000)
      } else {
        toast.success(`Consumo interno registrado por S/ ${r.total.toFixed(2)}`)
      }

      setCarrito([])
      setEmpleado('')
      setNota('')
      await recargarHistorial()
    } catch (e) {
      toast.error(e.message || 'No se pudo registrar')
    } finally {
      setGuardando(false)
    }
  }

  const anular = async (c) => {
    if (!window.confirm(`¿Anular este consumo de S/ ${Number(c.total).toFixed(2)}? El stock se devuelve.`)) return
    const r = await voidInternalConsumption(getBusinessId(), c.id, {
      uid: user?.uid, email: user?.email, nombre: user?.displayName,
    })
    if (r.success) {
      toast.success('Consumo anulado y stock devuelto')
      await recargarHistorial()
    } else {
      toast.error(r.error || 'No se pudo anular')
    }
  }

  const historialFiltrado = useMemo(() => historial.filter((c) => {
    if (filtroMotivo && c.motivo !== filtroMotivo) return false
    if (mes) {
      const f = c.fecha?.toDate?.()
      if (!f || toDateString(f).slice(0, 7) !== mes) return false
    }
    return true
  }), [historial, filtroMotivo, mes])

  const resumen = useMemo(() => resumirPorMotivo(historialFiltrado), [historialFiltrado])

  if (cargando) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UtensilsCrossed className="w-6 h-6 text-gray-400" />
          Consumo interno
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Lo que sale del stock sin venderse: el almuerzo del personal, la merma, una cortesía.
          No emite comprobante ni suma a las ventas — queda como costo.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ---------- Registrar ---------- */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Registrar una salida</h2>

          {/* Motivo */}
          <div className="flex flex-wrap gap-2 mb-4">
            {MOTIVOS_CONSUMO.map((m) => (
              <button
                key={m.id}
                onClick={() => setMotivo(m.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  motivo === m.id ? 'text-white' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
                style={motivo === m.id ? { backgroundColor: m.color, borderColor: m.color } : {}}
              >
                {m.nombre}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                max={toDateString()}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Sale del almacén</label>
              <select
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {almacenes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {motivoActual?.pideEmpleado && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Empleado <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={empleado}
                  onChange={(e) => setEmpleado(e.target.value)}
                  placeholder="Nombre"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Buscador */}
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto por nombre o código"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {resultados.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-64 overflow-y-auto">
                {resultados.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => agregar(p)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-3 border-b border-gray-100 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">
                        Stock: {Number(p.stock) || 0}
                        {costoDe(p) > 0 && ` · Costo S/ ${costoDe(p).toFixed(2)}`}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-blue-600 flex-none" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Carrito */}
          {carrito.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <ChefHat className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Buscá los productos que se consumieron.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {carrito.map((x) => (
                <div key={x.productId} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{x.nombre}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-gray-400">Costo S/</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={x.costoUnitario}
                        onChange={(e) => fijarCosto(x.productId, e.target.value)}
                        className="w-20 px-1.5 py-0.5 text-[11px] border border-gray-200 rounded"
                      />
                      {x.cantidad > x.stockActual && (
                        <span className="text-[11px] text-amber-600 font-medium">
                          Stock: {x.stockActual}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    <button onClick={() => cambiarCantidad(x.productId, -1)} className="p-1 text-gray-400 hover:text-gray-700">
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={x.cantidad}
                      onChange={(e) => fijarCantidad(x.productId, e.target.value)}
                      className="w-14 text-center px-1 py-1 text-sm border border-gray-300 rounded"
                    />
                    <button onClick={() => cambiarCantidad(x.productId, 1)} className="p-1 text-gray-400 hover:text-gray-700">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm font-semibold text-gray-900 flex-none">
                    S/ {((Number(x.costoUnitario) || 0) * Number(x.cantidad)).toFixed(2)}
                  </span>
                  <button
                    onClick={() => setCarrito((prev) => prev.filter((y) => y.productId !== x.productId))}
                    className="p-1 text-gray-300 hover:text-red-500 flex-none"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {carrito.length > 0 && (
            <>
              {sinCosto && (
                <div className="mt-3 flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-none mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Hay productos sin costo cargado. El stock se va a descontar igual, pero el
                    total no va a reflejar lo que realmente costó.
                  </p>
                </div>
              )}

              <textarea
                rows={2}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Nota (opcional)"
                className="w-full mt-3 px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Costo total</p>
                  <p className="text-2xl font-bold text-gray-900">S/ {total.toFixed(2)}</p>
                </div>
                <button
                  onClick={registrar}
                  disabled={guardando}
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {guardando ? 'Registrando...' : 'Registrar salida'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ---------- Historial ---------- */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
              />
              <select
                value={filtroMotivo}
                onChange={(e) => setFiltroMotivo(e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Todos los motivos</option>
                {MOTIVOS_CONSUMO.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>

            <p className="text-xs text-gray-500">Costo del período</p>
            <p className="text-2xl font-bold text-gray-900 mb-3">S/ {resumen.total.toFixed(2)}</p>

            {resumen.lineas.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-1.5 border-t border-gray-100">
                <span className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.nombre}
                </span>
                <span className="text-sm font-semibold text-gray-900">S/ {l.monto.toFixed(2)}</span>
              </div>
            ))}
            {resumen.lineas.length === 0 && (
              <p className="text-sm text-gray-400 py-2">Sin movimientos en este período.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
            {historialFiltrado.length === 0 && (
              <p className="text-sm text-gray-400 p-4 text-center">Nada registrado todavía.</p>
            )}
            {historialFiltrado.map((c) => {
              const m = motivoPorId(c.motivo)
              const anulado = c.estado === 'anulado'
              return (
                <div key={c.id} className={`p-3 ${anulado ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-semibold"
                          style={{ backgroundColor: `${m?.color || '#6B7280'}18`, color: m?.color || '#6B7280' }}
                        >
                          {c.motivoNombre}
                        </span>
                        {anulado && <span className="text-[11px] font-semibold text-red-600">ANULADO</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {c.fecha?.toDate?.().toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                        {c.empleadoNombre && ` · ${c.empleadoNombre}`}
                        {c.registradoPorNombre && ` · por ${c.registradoPorNombre}`}
                      </p>
                      <p className="text-xs text-gray-600 mt-1 truncate">
                        {(c.items || []).map((i) => `${i.cantidad}× ${i.nombre}`).join(', ')}
                      </p>
                      {c.nota && <p className="text-[11px] text-gray-400 italic mt-0.5">{c.nota}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-none">
                      <span className="text-sm font-bold text-gray-900">S/ {Number(c.total).toFixed(2)}</span>
                      {!anulado && (
                        <button
                          onClick={() => anular(c)}
                          className="text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Anular
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
