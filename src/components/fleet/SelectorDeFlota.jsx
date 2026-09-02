import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { getDrivers, getVehicles } from '@/services/fleetService'
import { nombreDeConductor, nombreDeVehiculo, avisoDeVencimiento } from '@/utils/fleet'

/**
 * Elegir un conductor o un vehículo GUARDADO y llenar los campos de la guía.
 *
 * Existe porque JMC escribía los mismos datos en cada guía —placa,
 * autorización MTC, TUCE, documento, nombres, licencia— y siempre son los
 * mismos tres o cuatro. Se cargan en Equipo > Conductores y vehículos y acá se
 * eligen de una lista.
 *
 * NO reemplaza la carga a mano: para el flete de una sola vez con un tercero,
 * los campos siguen ahí abajo y se escriben como siempre. Este selector solo
 * los rellena.
 *
 * Si no hay nada guardado no se muestra nada: un desplegable vacío arriba de
 * un formulario que ya funciona es ruido.
 */

/** Trae la lista una sola vez y la comparte con quien la pida. */
export function useFlota(businessId, activo = true) {
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])

  useEffect(() => {
    if (!activo || !businessId) return
    let cancelado = false
    Promise.all([getDrivers(businessId), getVehicles(businessId)]).then(([d, v]) => {
      if (cancelado) return
      if (d.success) setDrivers(d.data.filter(x => x.status !== 'inactive'))
      if (v.success) setVehicles(v.data.filter(x => x.status !== 'inactive'))
    })
    return () => { cancelado = true }
  }, [businessId, activo])

  return { drivers, vehicles }
}

/** El guardado que viene marcado como "el de siempre", si hay alguno. */
export const elDeSiempre = (lista = []) => lista.find(x => x.isDefault) || null

export default function SelectorDeFlota({ tipo, lista = [], onElegir, className = '' }) {
  if (!lista.length) return null

  const esConductor = tipo === 'driver'
  const nombre = esConductor ? nombreDeConductor : nombreDeVehiculo
  const elegido = null // el selector no recuerda: solo rellena y vuelve a su lugar

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <select
          value={elegido || ''}
          onChange={(e) => {
            const r = lista.find(x => x.id === e.target.value)
            if (r) onElegir(r)
            e.target.value = ''
          }}
          className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">
            {esConductor ? 'Elegir un conductor guardado…' : 'Elegir un vehículo guardado…'}
          </option>
          {lista.map((r) => {
            const aviso = avisoDeVencimiento(
              esConductor ? r.licenseExpiry : r.tuceExpiry,
              { que: esConductor ? 'Licencia' : 'TUCE' },
            )
            return (
              <option key={r.id} value={r.id}>
                {r.isDefault ? '★ ' : ''}{nombre(r)}
                {esConductor && r.documentNumber ? ` · ${r.documentNumber}` : ''}
                {aviso ? ` (${aviso.texto.toLowerCase()})` : ''}
              </option>
            )
          })}
        </select>
        {elDeSiempre(lista) && (
          <span title="El marcado con estrella viene preseleccionado">
            <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          </span>
        )}
      </div>
    </div>
  )
}
