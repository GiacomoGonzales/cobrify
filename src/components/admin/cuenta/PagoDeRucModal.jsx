import { useState } from 'react'
import { PLANES_VENDIBLES, ORDEN_DE_VENTA } from '@/data/planes'
import { METODOS_DE_PAGO } from '@/utils/metodoDePago'
import { venceDelRucTrasPagar } from '@/utils/cobroPorRuc'
import { Modal, Campo, Entrada, Selector, Boton, Aviso } from '@/components/admin/ui'

/**
 * EL PAGO DE UN RUC ADICIONAL.
 *
 * Con "Cobrar cada RUC aparte", cada RUC paga su propia mensualidad. Este
 * cuadro registra ese pago y renueva SOLO ese RUC: no toca el plan ni el
 * vencimiento de la cuenta. El plan arranca en el que ya tenía el RUC, o en el
 * de la cuenta la primera vez (KARSOL: Plan Mensual, S/ 29.90 cada RUC), y el
 * monto se puede pisar para los precios pactados.
 */

// "Recarga" es de los resellers: un cliente no paga su RUC con eso.
const METODOS = Object.entries(METODOS_DE_PAGO).filter(([clave]) => clave !== 'recarga')

const fecha = (d) => d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

export default function PagoDeRucModal({ cuenta, emisor, cobro, onClose, onRegistrar, procesando }) {
  const inicial = PLANES_VENDIBLES[cobro?.plan]
    ? cobro.plan
    : PLANES_VENDIBLES[cuenta?.plan] ? cuenta.plan : 'mensual'
  const [planId, setPlanId] = useState(inicial)
  const [monto, setMonto] = useState(String(cobro?.precio ?? PLANES_VENDIBLES[inicial]?.totalPrice ?? ''))
  // Un precio ya pactado para este RUC no se pisa al cambiar de plan.
  const [montoTocado, setMontoTocado] = useState(cobro?.precio != null)
  const [metodo, setMetodo] = useState('yape')

  const plan = PLANES_VENDIBLES[planId]
  const venceActual = cobro?.vence?.toDate ? cobro.vence.toDate() : null
  const sigueAlDia = Boolean(venceActual && venceActual > new Date())
  const nuevoVence = plan ? venceDelRucTrasPagar(venceActual, plan.months) : null

  const elegirPlan = (id) => {
    setPlanId(id)
    if (!montoTocado) setMonto(PLANES_VENDIBLES[id] ? String(PLANES_VENDIBLES[id].totalPrice) : '')
  }

  return (
    <Modal
      titulo="Registrar pago del RUC"
      subtitulo={`${emisor.businessName || 'RUC adicional'} · RUC ${emisor.ruc || '—'}`}
      onClose={onClose}
      ancho="sm"
      pie={
        <>
          <Boton onClick={onClose} disabled={procesando}>Cancelar</Boton>
          <Boton
            variante="primario"
            disabled={procesando || !plan || !(Number(monto) > 0)}
            onClick={() => onRegistrar({ planId, monto: Number(monto), metodo })}
          >
            {procesando ? 'Registrando…' : 'Registrar pago'}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Aviso tono="neutro" titulo="Solo este RUC">
          El pago renueva este RUC y sale en Pagos con su nombre. No cambia el plan ni el
          vencimiento de la cuenta.
        </Aviso>

        <Campo etiqueta="Plan del RUC">
          <Selector value={planId} onChange={(e) => elegirPlan(e.target.value)}>
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
              {METODOS.map(([clave, nombre]) => <option key={clave} value={clave}>{nombre}</option>)}
            </Selector>
          </Campo>
        </div>

        {nuevoVence && (
          <p className="text-[12px] text-gray-500">
            {sigueAlDia ? 'Se suma a lo que le quedaba' : 'Cuenta desde hoy'}: el RUC queda al día hasta el{' '}
            <span className="font-medium text-gray-700">{fecha(nuevoVence)}</span>.
          </p>
        )}
      </div>
    </Modal>
  )
}
