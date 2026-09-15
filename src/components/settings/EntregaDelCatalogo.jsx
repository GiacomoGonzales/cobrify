/**
 * ENTREGA Y ENVÍO del checkout de una tienda (Configuración > Mi Catálogo
 * Online > Entrega y envío): envío a domicilio con el nombre que el negocio
 * quiera, recojo en sus locales y envío a provincia por agencia. Qué ve el
 * comprador lo decide utils/entregaDelPedido; esto solo edita los campos del
 * negocio. Pedido de CITEX (1-set-2026), para cualquier tienda.
 *
 * @param {object} p
 * @param {{ allowDelivery: boolean, deliveryLabel: string, pickupEnabled: boolean,
 *   pickupPoints: Array<{ id: string, nombre: string, direccion: string }>,
 *   agencyEnabled: boolean, agencies: string }} p.valor  `agencies` es el texto con comas del campo.
 * @param {(campo: string, valor: any) => void} p.onCambio
 */
import { Plus, Trash2 } from 'lucide-react'

const CASILLA = 'w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 flex-shrink-0'
const CAMPO = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500'

function Opcion({ titulo, detalle, activa, onActiva, children }) {
  return (
    <div className="border border-gray-200 rounded-lg">
      <label className="flex items-center justify-between gap-3 cursor-pointer p-3">
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 block">{titulo}</span>
          <span className="text-xs text-gray-500">{detalle}</span>
        </span>
        <input type="checkbox" checked={activa} onChange={(e) => onActiva(e.target.checked)} className={CASILLA} />
      </label>
      {activa && children && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

export default function EntregaDelCatalogo({ valor, onCambio }) {
  const puntos = Array.isArray(valor.pickupPoints) ? valor.pickupPoints : []
  const cambiarPunto = (i, cambios) => onCambio('pickupPoints', puntos.map((p, j) => (j === i ? { ...p, ...cambios } : p)))
  const quitarPunto = (i) => onCambio('pickupPoints', puntos.filter((_, j) => j !== i))
  const agregarPunto = () => onCambio('pickupPoints', [...puntos, { id: `local-${Date.now()}`, nombre: '', direccion: '' }])
  const sinLocales = puntos.every((p) => !String(p.nombre || '').trim() && !String(p.direccion || '').trim())
  const todoApagado = !valor.allowDelivery && !valor.pickupEnabled && !valor.agencyEnabled

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Cómo recibe el cliente su pedido</p>

      <Opcion
        titulo="Envío a domicilio"
        detalle="El cliente escribe la dirección de entrega."
        activa={!!valor.allowDelivery}
        onActiva={(v) => onCambio('allowDelivery', v)}
      >
        <label htmlFor="entrega-nombre" className="block text-xs font-medium text-gray-600">Nombre que ve el cliente (opcional)</label>
        <input
          id="entrega-nombre"
          type="text"
          maxLength={40}
          value={valor.deliveryLabel || ''}
          onChange={(e) => onCambio('deliveryLabel', e.target.value)}
          placeholder="Envío a domicilio. Ej: Envío en Lima"
          className={CAMPO}
        />
      </Opcion>

      <Opcion
        titulo="Recojo en tienda"
        detalle="El cliente elige en cuál de tus locales lo recoge."
        activa={!!valor.pickupEnabled}
        onActiva={(v) => onCambio('pickupEnabled', v)}
      >
        {puntos.map((p, i) => (
          <div key={p.id || i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 items-center">
            <input
              type="text"
              value={p.nombre || ''}
              onChange={(e) => cambiarPunto(i, { nombre: e.target.value })}
              placeholder="Nombre del local"
              aria-label={`Nombre del local ${i + 1}`}
              className={CAMPO}
            />
            <input
              type="text"
              value={p.direccion || ''}
              onChange={(e) => cambiarPunto(i, { direccion: e.target.value })}
              placeholder="Dirección"
              aria-label={`Dirección del local ${i + 1}`}
              className={CAMPO}
            />
            <button
              type="button"
              onClick={() => quitarPunto(i)}
              className="justify-self-end p-2 text-gray-400 hover:text-red-600 rounded-lg"
              aria-label={`Quitar el local ${i + 1}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={agregarPunto}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <Plus className="w-4 h-4" />
          Agregar local
        </button>
        {sinLocales && (
          <p className="text-xs text-amber-700">Agrega al menos un local: sin locales, el recojo no aparece en el catálogo.</p>
        )}
      </Opcion>

      <Opcion
        titulo="Envío a provincia por agencia"
        detalle="El cliente elige la agencia y escribe la ciudad de destino y el DNI de quien recoge."
        activa={!!valor.agencyEnabled}
        onActiva={(v) => onCambio('agencyEnabled', v)}
      >
        <label htmlFor="entrega-agencias" className="block text-xs font-medium text-gray-600">Agencias con las que trabajas</label>
        <input
          id="entrega-agencias"
          type="text"
          value={valor.agencies || ''}
          onChange={(e) => onCambio('agencies', e.target.value)}
          placeholder="Ej: Shalom, Olva Courier, Marvisur"
          className={CAMPO}
        />
        <p className="text-xs text-gray-500">Sepáralas con comas. Si lo dejas vacío, el cliente escribe la agencia.</p>
      </Opcion>

      {todoApagado && (
        <p className="text-xs text-amber-700">Con las tres apagadas, el pedido sigue pidiendo la dirección de entrega.</p>
      )}
    </div>
  )
}
