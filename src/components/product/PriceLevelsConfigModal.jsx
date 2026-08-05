import { useState, useEffect } from 'react'
import { Loader2, Layers } from 'lucide-react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useToast } from '@/contexts/ToastContext'

/**
 * Configuración de los NIVELES DE PRECIO del negocio.
 *
 * Vivía en Configuración > Ventas, lejos de la pantalla donde realmente se
 * usan los precios. Ahora se abre desde "Actualizar precios" (Productos), que
 * es donde el usuario ya está viendo las columnas que estos nombres titulan y
 * los importes que estos porcentajes calculan.
 *
 * Escribe en el documento del negocio con merge, así que solo toca estos
 * campos: el resto de Configuración se guarda por su lado sin pisarse.
 * El POS y el formulario de producto leen los mismos campos — mover la
 * edición no cambia quién los consume.
 */

const NIVELES = ['price1', 'price2', 'price3', 'price4']

const PLACEHOLDERS = {
  price1: 'Público',
  price2: 'Mayorista',
  price3: 'VIP',
  price4: 'Especial',
}

const PCT_VACIO = { enabled: false, discount: 0 }

export default function PriceLevelsConfigModal({
  isOpen,
  onClose,
  businessId,
  businessSettings = {},
  onSaved,
}) {
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const [multiOn, setMultiOn] = useState(false)
  const [labels, setLabels] = useState({})
  const [base, setBase] = useState('public')
  const [formula, setFormula] = useState('markup')
  const [pcts, setPcts] = useState({})

  // Recargar desde los ajustes cada vez que se abre: si el usuario cancela,
  // los cambios a medias no deben quedar pegados para la próxima.
  useEffect(() => {
    if (!isOpen) return
    setMultiOn(!!businessSettings?.multiplePricesEnabled)
    setLabels({
      price1: businessSettings?.priceLabels?.price1 || 'Público',
      price2: businessSettings?.priceLabels?.price2 || 'Mayorista',
      price3: businessSettings?.priceLabels?.price3 || 'VIP',
      price4: businessSettings?.priceLabels?.price4 || 'Especial',
    })
    setBase(businessSettings?.priceCalculationBase || 'public')
    setFormula(businessSettings?.marginFormula === 'margin' ? 'margin' : 'markup')
    setPcts({
      price1: businessSettings?.pricePercentages?.price1 || { ...PCT_VACIO },
      price2: businessSettings?.pricePercentages?.price2 || { ...PCT_VACIO },
      price3: businessSettings?.pricePercentages?.price3 || { ...PCT_VACIO },
      price4: businessSettings?.pricePercentages?.price4 || { ...PCT_VACIO },
    })
  }, [isOpen, businessSettings])

  const handleSave = async () => {
    if (!businessId) return
    setIsSaving(true)
    try {
      await setDoc(doc(db, 'businesses', businessId), {
        multiplePricesEnabled: multiOn,
        priceLabels: labels,
        priceCalculationBase: base,
        marginFormula: formula,
        pricePercentages: pcts,
      }, { merge: true })

      toast.success('Niveles de precio guardados')
      if (onSaved) await onSaved()
      onClose()
    } catch (error) {
      console.error('Error al guardar niveles de precio:', error)
      toast.error('No se pudieron guardar los niveles de precio')
    } finally {
      setIsSaving(false)
    }
  }

  // Aplicar % al Precio 1 solo tiene sentido calculándolo desde el costo: con
  // base "público", el Precio 1 ES la base y descontarse de sí mismo no aplica.
  const nivelesConPct = base === 'cost' ? NIVELES : ['price2', 'price3', 'price4']

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Niveles de precio" size="2xl">
      <div className="space-y-5">
        {/* Activar multi-precios */}
        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={multiOn}
            onChange={e => setMultiOn(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span>
            <span className="text-sm font-medium text-gray-900">Usar varios precios por producto</span>
            <span className="block text-xs text-gray-600 mt-0.5">
              Además del precio principal, cada producto puede tener hasta 3 precios más
              (mayorista, cliente frecuente…). El cajero los elige al vender.
            </span>
          </span>
        </label>

        {multiOn && (
          <>
            {/* Nombres */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">Nombres de cada nivel</p>
              <p className="text-xs text-gray-600 mb-3">
                Es como los verás en el punto de venta, en esta tabla y en el formulario del producto.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {NIVELES.map((key, i) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Precio {i + 1}</label>
                    <input
                      type="text"
                      value={labels[key] || ''}
                      onChange={e => setLabels(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder={PLACEHOLDERS[key]}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Cálculo automático */}
            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-medium text-gray-900 mb-1">Cálculo automático (opcional)</p>
              <p className="text-xs text-gray-600 mb-3">
                Si lo activas, los productos que no tengan ese precio escrito a mano lo calculan solos.
                Un precio escrito a mano siempre manda sobre el porcentaje.
              </p>

              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 mb-2">¿Sobre qué se calcula?</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded border border-gray-200 hover:border-primary-300">
                    <input
                      type="radio"
                      name="plc-base"
                      value="public"
                      checked={base === 'public'}
                      onChange={e => setBase(e.target.value)}
                      className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-xs text-gray-700">
                      <strong>Precio principal</strong> — el % se descuenta de él
                      <span className="block text-gray-500">Precio N = Principal × (1 − %)</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded border border-gray-200 hover:border-primary-300">
                    <input
                      type="radio"
                      name="plc-base"
                      value="cost"
                      checked={base === 'cost'}
                      onChange={e => setBase(e.target.value)}
                      className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-xs text-gray-700">
                      <strong>Costo</strong> — el % se aplica sobre el costo
                      <span className="block text-gray-500">Los productos sin costo no calculan</span>
                    </span>
                  </label>
                </div>
              </div>

              {base === 'cost' && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">Fórmula del margen</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded border border-gray-200 hover:border-primary-300">
                      <input
                        type="radio"
                        name="plc-formula"
                        value="markup"
                        checked={formula === 'markup'}
                        onChange={e => setFormula(e.target.value)}
                        className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                      />
                      <span className="text-xs text-gray-700">
                        <strong>Recargo sobre el costo</strong>
                        <span className="block font-mono text-[11px]">Precio = Costo × (1 + %)</span>
                        <span className="block text-gray-500 text-[11px]">Costo 10, 30% → 13.00</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded border border-gray-200 hover:border-primary-300">
                      <input
                        type="radio"
                        name="plc-formula"
                        value="margin"
                        checked={formula === 'margin'}
                        onChange={e => setFormula(e.target.value)}
                        className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                      />
                      <span className="text-xs text-gray-700">
                        <strong>Margen sobre la venta</strong>
                        <span className="block font-mono text-[11px]">Precio = Costo ÷ (1 − %)</span>
                        <span className="block text-gray-500 text-[11px]">Costo 10, 30% → 14.29</span>
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {nivelesConPct.map(key => (
                  <div key={key} className="flex items-center gap-2 sm:gap-3 p-2.5 border border-gray-200 rounded-lg flex-wrap">
                    <input
                      type="checkbox"
                      checked={pcts[key]?.enabled || false}
                      onChange={e => setPcts(prev => ({
                        ...prev,
                        [key]: { ...(prev[key] || PCT_VACIO), enabled: e.target.checked },
                      }))}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 flex-1 min-w-0 sm:flex-initial sm:min-w-[90px] truncate" title={labels[key]}>
                      {labels[key] || `Precio ${NIVELES.indexOf(key) + 1}`}
                    </span>
                    <span className="text-xs text-gray-500">{base === 'cost' ? '+' : '−'}</span>
                    <input
                      type="number"
                      min="0"
                      max={base === 'cost' ? 1000 : 100}
                      step="1"
                      value={pcts[key]?.discount ?? ''}
                      onChange={e => setPcts(prev => ({
                        ...prev,
                        [key]: { ...(prev[key] || PCT_VACIO), discount: parseFloat(e.target.value) || 0 },
                      }))}
                      disabled={!pcts[key]?.enabled}
                      placeholder="0"
                      className="w-20 px-2 py-1.5 text-sm text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    <span className="text-xs text-gray-500 w-full sm:w-auto">
                      {base === 'cost' ? '% sobre el costo' : `% menos que ${labels.price1 || 'el principal'}`}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-500 mt-3">
                Esto define cómo se calculan los precios <strong>de aquí en adelante</strong>. Para
                cambiar los precios que ya tienen tus productos, usa <strong>Ajuste masivo</strong>,
                que te deja revisar antes de guardar.
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Layers className="w-4 h-4 mr-2" />
                Guardar niveles
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
