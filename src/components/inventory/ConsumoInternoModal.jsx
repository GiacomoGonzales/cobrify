import { useState, useMemo } from 'react'
import { Check, Minus, Plus, Search, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { useToast } from '@/contexts/ToastContext'
import { buildProductHaystack } from '@/utils/productSearch'
import { matchesPrebuilt } from '@/lib/utils'
import { lineasDeProducto, nombreDeLinea } from '@/utils/lineasDeStock'
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
 * inventario, del mismo tamaño que un recuento o un traslado. Se abre desde
 * Inventario y desde Órdenes; es el mismo modal, no una copia.
 *
 * Lo que se elige son LÍNEAS, no productos: un producto con variantes
 * (Cerveza: personal / 610 ml) aparece como una fila por variante, con el
 * stock de esa variante en el almacén elegido. El producto "Cerveza" a secas
 * no se puede elegir, porque descontarlo no descuenta ninguna variante (ver
 * utils/lineasDeStock).
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

  // La lista arranca mostrando las líneas, no vacía: la mayoría de las veces
  // lo que consume el personal está a la vista y no hace falta escribir nada.
  // El buscador usa el mismo criterio que el resto del sistema (y ya indexa el
  // SKU y los atributos de las variantes). Se recalcula al cambiar de almacén
  // porque el stock que se muestra es el de ESE almacén.
  const lineas = useMemo(() => {
    const q = busqueda.trim()
    const base = q ? productos.filter((p) => matchesPrebuilt(q, buildProductHaystack(p))) : productos
    const out = []
    for (const p of base) {
      out.push(...lineasDeProducto(p, { almacenId }))
      if (out.length >= 60) break
    }
    return out.slice(0, 60)
  }, [productos, busqueda, almacenId])

  const productoPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])

  // El stock de una línea del carrito se mira en el momento, no cuando se
  // agregó: si cambian de almacén a mitad, el aviso de "solo hay X" tiene que
  // hablar del almacén nuevo.
  const stockActualDe = (x) =>
    lineasDeProducto(productoPorId.get(x.productId), { almacenId })
      .find((l) => l.clave === x.clave)?.stockActual ?? x.stockActual

  const yaElegido = (clave) => carrito.some((x) => x.clave === clave)

  const agregar = (l) => {
    setCarrito((prev) => {
      const i = prev.findIndex((x) => x.clave === l.clave)
      if (i >= 0) {
        const copia = [...prev]
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 }
        return copia
      }
      // Un plato del menú suele no llevar stock propio: lo que se descuenta
      // son sus insumos, por la receta. El costo es lo que vale reponerlo, no
      // lo que se cobra.
      return [...prev, { ...l, cantidad: 1 }]
    })
    setBusqueda('')
  }

  const cambiar = (clave, delta) => {
    setCarrito((prev) => prev
      .map((x) => (x.clave === clave ? { ...x, cantidad: Math.max(0, x.cantidad + delta) } : x))
      .filter((x) => x.cantidad > 0))
  }

  const fijar = (clave, valor) => {
    const n = parseFloat(valor)
    setCarrito((prev) => prev.map((x) => (x.clave === clave ? { ...x, cantidad: isNaN(n) ? 0 : n } : x)))
  }

  const quitar = (clave) => setCarrito((prev) => prev.filter((x) => x.clave !== clave))

  const total = carrito.reduce((a, x) => a + (Number(x.costoUnitario) || 0) * Number(x.cantidad), 0)

  const limpiar = () => {
    setCarrito([])
    setEmpleado('')
    setNota('')
    setBusqueda('')
  }

  const registrar = async () => {
    if (carrito.length === 0) { toast.error('Agrega al menos un producto'); return }
    if (!almacenId) { toast.error('Elige de qué almacén sale'); return }

    setGuardando(true)
    try {
      const r = await createInternalConsumption(businessId, {
        items: carrito.map((x) => ({
          productId: x.productId,
          nombre: x.nombre,
          cantidad: x.cantidad,
          costoUnitario: x.costoUnitario,
          controlaStock: x.controlaStock,
          variantSku: x.variantSku || null,
          variantLabel: x.etiqueta || null,
        })),
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
        toast.warning(`Registrado, pero ${r.advertencias.length} producto(s) no se pudieron descontar. Revisa el inventario.`, 8000)
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          >
            {MOTIVOS_CONSUMO.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </Select>

          {almacenes.length > 1 && (
            <Select
              label="Sale del almacén"
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
            >
              {almacenes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          )}

          {motivoActual?.pideEmpleado && (
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Para quién <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={empleado}
                onChange={(e) => setEmpleado(e.target.value)}
                placeholder="Nombre del empleado"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>
          )}
        </div>

        {/* Líneas: la lista está a la vista y el buscador solo la filtra */}
        <div>
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto por nombre, código o variante"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
            />
          </div>

          <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
            {lineas.length === 0 && (
              <p className="text-sm text-gray-400 px-3 py-4 text-center">
                {busqueda ? 'Ningún producto coincide.' : 'No hay productos cargados.'}
              </p>
            )}
            {lineas.map((l) => (
              <button
                key={l.clave}
                type="button"
                onClick={() => agregar(l)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{nombreDeLinea(l)}</p>
                  <p className="text-xs text-gray-400">
                    {l.controlaStock
                      ? `Stock: ${l.stockActual}`
                      : 'Sin stock propio — descuenta sus insumos'}
                  </p>
                </div>
                {yaElegido(l.clave)
                  ? <Check className="w-4 h-4 text-primary-600 flex-none" />
                  : <Plus className="w-4 h-4 text-gray-400 flex-none" />}
              </button>
            ))}
          </div>
        </div>

        {/* Lo elegido */}
        {carrito.length > 0 && (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {carrito.map((x) => {
              const stock = stockActualDe(x)
              return (
                <div key={x.clave} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{nombreDeLinea(x)}</p>
                    {x.controlaStock && x.cantidad > stock && (
                      <p className="text-[11px] text-amber-600">Solo hay {stock} en stock</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    <button type="button" onClick={() => cambiar(x.clave, -1)} className="p-1 text-gray-400 hover:text-gray-700">
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={x.cantidad}
                      onChange={(e) => fijar(x.clave, e.target.value)}
                      className="w-14 text-center px-1 py-1 text-sm border border-gray-300 rounded"
                    />
                    <button type="button" onClick={() => cambiar(x.clave, 1)} className="p-1 text-gray-400 hover:text-gray-700">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => quitar(x.clave)}
                    className="p-1 text-gray-300 hover:text-red-500 flex-none"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <textarea
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Comentario (opcional)"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
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
