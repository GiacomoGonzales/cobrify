import { useState, useMemo } from 'react'
import { Minus, Plus, Search, Trash2, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useToast } from '@/contexts/ToastContext'
import { buildProductHaystack } from '@/utils/productSearch'
import { matchesPrebuilt } from '@/lib/utils'
import {
  MOTIVOS_CONSUMO,
  motivoPorId,
  createInternalConsumption,
} from '@/services/internalConsumptionService'

/**
 * CONSUMO INTERNO — descontar stock sin cobrar nada.
 *
 * Es una merma, pero con motivo: lo que se comió el personal, lo que se
 * malogró, la cortesía. Elegís el motivo, los productos y listo — no emite
 * comprobante, no suma a ventas y no pasa por caja.
 *
 * Vive acá dentro y no como página propia: es una acción puntual de
 * inventario, del mismo tamaño que un recuento o un traslado.
 */
export default function ConsumoInternoModal({
  isOpen,
  onClose,
  productos = [],
  almacenes = [],
  almacenIdInicial = null,
  businessMode,
  permitirNegativo = false,
  usuario,
  businessId,
  onRegistrado,
}) {
  const toast = useToast()
  const [motivo, setMotivo] = useState('personal')
  const [empleado, setEmpleado] = useState('')
  const [nota, setNota] = useState('')
  const [almacenId, setAlmacenId] = useState(
    almacenIdInicial || almacenes.find((a) => a.isDefault)?.id || almacenes[0]?.id || '',
  )
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState([])
  const [guardando, setGuardando] = useState(false)

  const motivoActual = motivoPorId(motivo)

  // Mismo criterio de búsqueda que el resto del sistema, para que no diverjan.
  const resultados = useMemo(() => {
    if (busqueda.trim().length < 2) return []
    return productos
      .filter((p) => p.trackStock !== false)
      .filter((p) => matchesPrebuilt(busqueda, buildProductHaystack(p)))
      .slice(0, 6)
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
        stockActual: Number(p.stock) || 0,
      }]
    })
    setBusqueda('')
  }

  const cambiar = (productId, delta) => {
    setCarrito((prev) => prev
      .map((x) => (x.productId === productId ? { ...x, cantidad: Math.max(0, x.cantidad + delta) } : x))
      .filter((x) => x.cantidad > 0))
  }

  const fijar = (productId, valor) => {
    const n = parseFloat(valor)
    setCarrito((prev) => prev.map((x) => (x.productId === productId ? { ...x, cantidad: isNaN(n) ? 0 : n } : x)))
  }

  const total = carrito.reduce((a, x) => a + (Number(x.costoUnitario) || 0) * Number(x.cantidad), 0)

  const limpiar = () => {
    setCarrito([])
    setEmpleado('')
    setNota('')
    setBusqueda('')
  }

  const registrar = async () => {
    if (carrito.length === 0) { toast.error('Agregá al menos un producto'); return }
    if (!almacenId) { toast.error('Elegí de qué almacén sale'); return }

    setGuardando(true)
    try {
      const r = await createInternalConsumption(businessId, {
        items: carrito,
        motivo,
        fecha: new Date(),
        empleadoNombre: motivoActual?.pideEmpleado ? (empleado.trim() || null) : null,
        nota: nota.trim() || null,
        warehouseId: almacenId,
        businessMode,
        permitirNegativo,
        usuario,
      })
      if (!r.success) throw new Error(r.error)

      if (r.advertencias?.length) {
        toast.warning(`Registrado, pero ${r.advertencias.length} producto(s) no se pudieron descontar. Revisá el inventario.`, 8000)
      } else {
        toast.success('Consumo registrado y stock descontado')
      }
      limpiar()
      onRegistrado?.()
      onClose()
    } catch (e) {
      toast.error(e.message || 'No se pudo registrar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Consumo interno" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Descuenta stock sin cobrar nada: lo que consumió el personal, lo que se malogró,
          una cortesía. No emite comprobante ni suma a tus ventas.
        </p>

        {/* Motivo */}
        <div className="flex flex-wrap gap-2">
          {MOTIVOS_CONSUMO.map((m) => (
            <button
              key={m.id}
              type="button"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {almacenes.length > 1 && (
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
          )}
          {motivoActual?.pideEmpleado && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Para quién <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={empleado}
                onChange={(e) => setEmpleado(e.target.value)}
                placeholder="Nombre del empleado"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto por nombre o código"
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {resultados.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-56 overflow-y-auto">
              {resultados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregar(p)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-3 border-b border-gray-100 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">Stock: {Number(p.stock) || 0}</p>
                  </div>
                  <Plus className="w-4 h-4 text-blue-600 flex-none" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lo elegido */}
        {carrito.length > 0 && (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {carrito.map((x) => (
              <div key={x.productId} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{x.nombre}</p>
                  {x.cantidad > x.stockActual && (
                    <p className="text-[11px] text-amber-600">Solo hay {x.stockActual} en stock</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-none">
                  <button type="button" onClick={() => cambiar(x.productId, -1)} className="p-1 text-gray-400 hover:text-gray-700">
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={x.cantidad}
                    onChange={(e) => fijar(x.productId, e.target.value)}
                    className="w-14 text-center px-1 py-1 text-sm border border-gray-300 rounded"
                  />
                  <button type="button" onClick={() => cambiar(x.productId, 1)} className="p-1 text-gray-400 hover:text-gray-700">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCarrito((prev) => prev.filter((y) => y.productId !== x.productId))}
                  className="p-1 text-gray-300 hover:text-red-500 flex-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Comentario (opcional)"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex items-center justify-between pt-3 border-t border-gray-200">
          <div>
            {/* El costo es informativo: lo que importa es que el stock baje. */}
            {total > 0 && (
              <>
                <p className="text-xs text-gray-500">Costo de lo consumido</p>
                <p className="text-lg font-bold text-gray-900">S/ {total.toFixed(2)}</p>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button variant="primary" onClick={registrar} disabled={guardando || carrito.length === 0}>
              {guardando ? 'Descontando...' : 'Descontar del stock'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
