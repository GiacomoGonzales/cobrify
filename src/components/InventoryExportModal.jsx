import { useState, useEffect } from 'react'
import { FileSpreadsheet, Loader2, Building2, Filter } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

/**
 * Modal de opciones para exportar el inventario a Excel.
 *
 * Permite al usuario elegir:
 *  - Tipo de items (productos y/o insumos)
 *  - Almacenes a incluir (todos o específicos)
 *  - Si incluir items que no manejan stock
 *  - Formato de stock (columnas por almacén o fila por almacén)
 */
export default function InventoryExportModal({
  isOpen,
  onClose,
  warehouses = [],
  onExport,
  isExporting = false,
  hasIngredients = false,
}) {
  // Tipos de items
  const [includeProducts, setIncludeProducts] = useState(true)
  const [includeIngredients, setIncludeIngredients] = useState(true)

  // Almacenes seleccionados (vacío = todos)
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState([])
  const [allWarehouses, setAllWarehouses] = useState(true)

  // Filtros
  const [includeNoStockTracking, setIncludeNoStockTracking] = useState(false)

  // Formato
  const [format, setFormat] = useState('columns') // 'columns' | 'rows'

  // Reset cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setIncludeProducts(true)
      setIncludeIngredients(hasIngredients)
      setSelectedWarehouseIds([])
      setAllWarehouses(true)
      setIncludeNoStockTracking(false)
      setFormat('columns')
    }
  }, [isOpen, hasIngredients])

  const handleToggleAllWarehouses = (checked) => {
    setAllWarehouses(checked)
    if (checked) setSelectedWarehouseIds([])
  }

  const handleToggleWarehouse = (warehouseId, checked) => {
    setAllWarehouses(false)
    if (checked) {
      setSelectedWarehouseIds([...selectedWarehouseIds, warehouseId])
    } else {
      setSelectedWarehouseIds(selectedWarehouseIds.filter(id => id !== warehouseId))
    }
  }

  const handleExport = () => {
    // Si no hay almacenes específicos, usar todos
    const finalWarehouseIds = allWarehouses || selectedWarehouseIds.length === 0
      ? warehouses.map(w => w.id)
      : selectedWarehouseIds

    onExport({
      includeProducts,
      includeIngredients,
      warehouseIds: finalWarehouseIds,
      includeNoStockTracking,
      format,
    })
  }

  const canExport =
    (includeProducts || includeIngredients) &&
    (allWarehouses || selectedWarehouseIds.length > 0) &&
    !isExporting

  const activeWarehouses = warehouses.filter(w => w.isActive !== false)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Opciones de Exportación"
      size="lg"
    >
      <div className="space-y-6">
        {/* Tipos de items */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            ¿Qué incluir?
          </h3>
          <div className="space-y-2 pl-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={includeProducts}
                onChange={e => setIncludeProducts(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-gray-700">Productos</span>
            </label>
            {hasIngredients && (
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={includeIngredients}
                  onChange={e => setIncludeIngredients(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-gray-700">Insumos / Ingredientes</span>
              </label>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200"></div>

        {/* Almacenes */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            Almacenes a incluir
          </h3>
          <div className="space-y-2 pl-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={allWarehouses}
                onChange={e => handleToggleAllWarehouses(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-gray-700 font-medium">
                Todos los almacenes ({activeWarehouses.length})
              </span>
            </label>
            {!allWarehouses && (
              <div className="ml-6 mt-2 space-y-1.5 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-56 overflow-y-auto">
                {activeWarehouses.length === 0 ? (
                  <p className="text-xs text-gray-500">No hay almacenes disponibles</p>
                ) : (
                  activeWarehouses.map(w => (
                    <label key={w.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selectedWarehouseIds.includes(w.id)}
                        onChange={e => handleToggleWarehouse(w.id, e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <span className="text-gray-700">
                        {w.name}
                        {w.isDefault && <span className="ml-1 text-xs text-indigo-600">(Principal)</span>}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200"></div>

        {/* Filtros */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Filtros adicionales</h3>
          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={includeNoStockTracking}
              onChange={e => setIncludeNoStockTracking(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <div>
              <span className="text-gray-700">Incluir items que no manejan stock</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Servicios, combos y productos con <code>trackStock = false</code>.
              </p>
            </div>
          </label>
        </div>

        <div className="border-t border-gray-200"></div>

        {/* Formato */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Formato del stock</h3>
          <div className="space-y-2">
            <label className={`flex items-start gap-3 cursor-pointer p-3 border-2 rounded-lg transition-colors ${
              format === 'columns' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="radio"
                name="format"
                value="columns"
                checked={format === 'columns'}
                onChange={() => setFormat('columns')}
                className="mt-0.5 w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900">
                  Una columna por almacén
                </span>
                <span className="ml-2 text-xs text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                  Recomendado
                </span>
                <p className="text-xs text-gray-600 mt-1">
                  Ej: <code>Stock Principal | Stock Norte | Stock Total</code>. Un item por fila.
                </p>
              </div>
            </label>
            <label className={`flex items-start gap-3 cursor-pointer p-3 border-2 rounded-lg transition-colors ${
              format === 'rows' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="radio"
                name="format"
                value="rows"
                checked={format === 'rows'}
                onChange={() => setFormat('rows')}
                className="mt-0.5 w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900">
                  Una fila por item × almacén
                </span>
                <p className="text-xs text-gray-600 mt-1">
                  Cada item se duplica por cada almacén seleccionado. Útil para pivots y filtros.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={!canExport}>
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Descargar Excel
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
