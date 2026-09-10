import { useState } from 'react'
import { PLANES_VENDIBLES, ORDEN_DE_VENTA } from '@/data/planes'
import { Modal, Campo, Entrada, Selector, Boton, Aviso } from '@/components/admin/ui'

/**
 * PASAR UNA PRUEBA A CUENTA REAL.
 *
 * Es la misma cuenta: el cliente se queda con sus productos, sus clientes y
 * sus ventas de la prueba. Solo cambia el plan, y con eso se le desbloquea el
 * envío a SUNAT sin tocar nada más.
 *
 * Pide lo mínimo —qué plan contrató, cuánto pagó y cómo— porque todo lo demás
 * ya está en la cuenta. El monto se rellena con el precio del plan, pero se
 * puede pisar: hay clientes con precios pactados, y ese monto es el que queda
 * congelado como su renovación.
 */

/** Los mismos que usa Admin > Pagos, para que el listado no mezcle etiquetas. */
const METODOS = { yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia', efectivo: 'Efectivo', tarjeta: 'Tarjeta', otro: 'Otro' }

export default function ConvertirPruebaModal({ cuenta, onClose, onConvertir, procesando }) {
  const [planId, setPlanId] = useState('')
  const [monto, setMonto] = useState('')
  const [montoTocado, setMontoTocado] = useState(false)
  const [metodo, setMetodo] = useState('yape')

  const plan = PLANES_VENDIBLES[planId]

  const elegirPlan = (id) => {
    setPlanId(id)
    if (!montoTocado) setMonto(PLANES_VENDIBLES[id] ? String(PLANES_VENDIBLES[id].totalPrice) : '')
  }

  return (
    <Modal
      titulo="Convertir en cuenta real"
      subtitulo={cuenta?.businessName}
      onClose={onClose}
      ancho="sm"
      pie={
        <>
          <Boton onClick={onClose} disabled={procesando}>Cancelar</Boton>
          <Boton
            variante="primario"
            disabled={procesando || !planId || !monto}
            onClick={() => onConvertir(planId, Number(monto), METODOS[metodo] || metodo)}
          >
            {procesando ? 'Convirtiendo…' : 'Convertir'}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Aviso tono="neutro" titulo="Se queda con todo lo que cargó">
          Es la misma cuenta: sus productos, sus clientes y sus ventas de la prueba siguen
          ahí. Al convertirla se le desbloquea el envío a SUNAT. Los comprobantes que emitió
          durante la prueba conservan su marca de sin validez, porque nunca la tuvieron.
        </Aviso>

        <Campo etiqueta="Plan que contrató">
          <Selector value={planId} onChange={(e) => elegirPlan(e.target.value)}>
            <option value="">Elige el plan…</option>
            {ORDEN_DE_VENTA.map((id) => (
              <option key={id} value={id}>
                {PLANES_VENDIBLES[id].name} — S/ {PLANES_VENDIBLES[id].totalPrice.toFixed(2)}
              </option>
            ))}
          </Selector>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Monto que pagó (S/)">
            <Entrada
              type="number" step="0.01" inputMode="decimal"
              value={monto}
              onChange={(e) => { setMonto(e.target.value); setMontoTocado(true) }}
              placeholder="0.00"
            />
          </Campo>
          <Campo etiqueta="Cómo pagó">
            <Selector value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {Object.entries(METODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Selector>
          </Campo>
        </div>

        {/* El IGV no se calcula acá: se escribe el monto que de verdad entró.
            Si pidió factura pagó el precio con IGV, y ese es el que se congela
            como su renovación. Ponerlo nosotros sería adivinar. */}
        {plan && (
          <p className="-mt-1 text-[11.5px] text-gray-500">
            Sin factura son S/ {plan.totalPrice.toFixed(2)}; con factura, S/ {plan.precioConIgv?.toFixed(2)}.
            El monto que escribas queda congelado como su precio de renovación.
          </p>
        )}
      </div>
    </Modal>
  )
}
