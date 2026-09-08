/**
 * Editor de NOMBRES COMERCIALES ADICIONALES de un cliente.
 *
 * El "Nombre" de la ficha de un cliente con RUC ya es su nombre comercial
 * principal. Una empresa con varias tiendas o marcas (Bambú Picota, Bambú
 * Tarapoto) necesita los demás: al vender, el POS pregunta a cuál, y ese sale
 * en el comprobante como "Nombre comercial" con su dirección. A SUNAT sigue
 * yendo la razón social.
 *
 * Forma guardada en el cliente (campo `tradeNames`, ver utils/nombresComerciales):
 *   { id, name, address, phone }
 *
 * Se gestionan solo acá, no desde el POS: una venta apurada no es el lugar
 * para inventar nombres que después quedan para siempre en la ficha.
 */
import { Store, Plus, X } from 'lucide-react'
import Input from '@/components/ui/Input'
import { crearNombreComercialVacio } from '@/utils/nombresComerciales'

export default function NombresComercialesEditor({ value = [], onChange }) {
  const lista = Array.isArray(value) ? value : []

  const agregar = () => onChange([...lista, crearNombreComercialVacio()])
  const actualizar = (index, cambios) => onChange(lista.map((t, i) => (i === index ? { ...t, ...cambios } : t)))
  const eliminar = (index) => onChange(lista.filter((_, i) => i !== index))

  return (
    <div className="border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Store className="w-4 h-4 text-gray-500" />
          Nombres comerciales adicionales
        </h4>
        <button
          type="button"
          onClick={agregar}
          className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Otras tiendas o marcas del mismo RUC. Al vender, el punto de venta pregunta a cuál, y ese
        nombre sale en el comprobante con su dirección. Opcional.
      </p>

      {lista.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Sin nombres adicionales. Se usará el nombre de la ficha.
        </p>
      ) : (
        <div className="space-y-3">
          {lista.map((t, index) => (
            <div key={t.id || index} className="border border-gray-200 rounded-lg p-3 bg-gray-50 relative">
              <button
                type="button"
                onClick={() => eliminar(index)}
                className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                title="Quitar nombre comercial"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  label="Nombre comercial"
                  placeholder="Ej: Bambú Picota"
                  value={t.name || ''}
                  onChange={(e) => actualizar(index, { name: e.target.value })}
                />
                <Input
                  label="Dirección"
                  placeholder="Jr. Lima 100, Picota"
                  value={t.address || ''}
                  onChange={(e) => actualizar(index, { address: e.target.value })}
                />
                <Input
                  label="Teléfono"
                  placeholder="999 111 222"
                  value={t.phone || ''}
                  onChange={(e) => actualizar(index, { phone: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
