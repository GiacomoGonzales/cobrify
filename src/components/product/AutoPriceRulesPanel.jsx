import { useState, useEffect } from 'react'
import { Loader2, Save } from 'lucide-react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Button from '@/components/ui/Button'
import { useToast } from '@/contexts/ToastContext'

/**
 * Regla de CÁLCULO AUTOMÁTICO de precios.
 *
 * Va junto al ajuste masivo, en el mismo modal, porque las dos responden a la
 * misma pregunta —de dónde sale el número de un precio— y antes estaban en
 * pantallas distintas:
 *   · Ajuste masivo   → cambia AHORA los precios que ya existen (uno a uno,
 *                       revisables antes de guardar).
 *   · Cálculo automático → regla permanente para los productos que NO tienen
 *                       ese precio escrito a mano.
 *
 * Los NOMBRES de los niveles y el interruptor de multi-precios NO están acá:
 * eso es configuración del negocio y vive en Configuración > Ventas.
 *
 * Escribe con merge, así que solo toca estos tres campos.
 */

const NIVELES = ['price1', 'price2', 'price3', 'price4']
const PCT_VACIO = { enabled: false, discount: 0 }

export default function AutoPriceRulesPanel({
  businessId,
  businessSettings = {},
  labelOf,
  onSaved,
  onClose,
}) {
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [base, setBase] = useState('public')
  const [formula, setFormula] = useState('markup')
  const [pcts, setPcts] = useState({})

  useEffect(() => {
    setBase(businessSettings?.priceCalculationBase || 'public')
    setFormula(businessSettings?.marginFormula === 'margin' ? 'margin' : 'markup')
    setPcts({
      price1: businessSettings?.pricePercentages?.price1 || { ...PCT_VACIO },
      price2: businessSettings?.pricePercentages?.price2 || { ...PCT_VACIO },
      price3: businessSettings?.pricePercentages?.price3 || { ...PCT_VACIO },
      price4: businessSettings?.pricePercentages?.price4 || { ...PCT_VACIO },
    })
  }, [businessSettings])

  const handleSave = async () => {
    if (!businessId) return
    setIsSaving(true)
    try {
      await setDoc(doc(db, 'businesses', businessId), {
        priceCalculationBase: base,
        marginFormula: formula,
        pricePercentages: pcts,
      }, { merge: true })
      toast.success('Regla de cálculo guardada')
      if (onSaved) await onSaved()
      onClose?.()
    } catch (error) {
      console.error('Error al guardar la regla de cálculo:', error)
      toast.error('No se pudo guardar la regla de cálculo')
    } finally {
      setIsSaving(false)
    }
  }

  // Aplicar % al Precio 1 solo tiene sentido calculándolo desde el costo: con
  // base "principal", el Precio 1 ES la base y descontarse de sí mismo no aplica.
  const nivelesConPct = base === 'cost' ? NIVELES : ['price2', 'price3', 'price4']

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
        Esto no cambia los precios que ya tienes: es la regla para los productos que
        <strong> no tengan ese precio escrito a mano</strong>. Un precio escrito manda
        siempre sobre el porcentaje.
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">¿Sobre qué se calcula?</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded-lg border border-gray-200 hover:border-primary-300">
            <input
              type="radio"
              name="apr-base"
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
          <label className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded-lg border border-gray-200 hover:border-primary-300">
            <input
              type="radio"
              name="apr-base"
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
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Fórmula del margen</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded-lg border border-gray-200 hover:border-primary-300">
              <input
                type="radio"
                name="apr-formula"
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
            <label className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded-lg border border-gray-200 hover:border-primary-300">
              <input
                type="radio"
                name="apr-formula"
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
          <p className="text-xs text-gray-500 mt-1.5">
            También es la fórmula que usa <strong>Margen objetivo</strong> en el ajuste masivo.
          </p>
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
            <span className="text-sm text-gray-700 flex-1 min-w-0 sm:flex-initial sm:min-w-[90px] truncate">
              {labelOf ? labelOf(key) : key}
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
              {base === 'cost' ? '% sobre el costo' : `% menos que ${labelOf ? labelOf('price1') : 'el principal'}`}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        Los nombres de cada nivel se cambian en <strong>Configuración → Ventas</strong>.
      </p>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
        <Button variant="outline" onClick={onClose} disabled={isSaving}>Cerrar</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando…</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Guardar regla</>
          )}
        </Button>
      </div>
    </div>
  )
}
