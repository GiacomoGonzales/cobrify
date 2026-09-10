import { useState } from 'react'
import { auth } from '@/lib/firebase'
import { PLANS, SELLABLE_PLAN_IDS } from '@/services/subscriptionService'
import { useToast } from '@/contexts/ToastContext'
import { Modal, Campo, Entrada, Selector, Boton, Aviso } from '@/components/admin/ui'
import { mesesDeRegalo, mesesTotales } from '@/data/referidos'
import { DIAS_DE_PRUEBA } from '@/data/prueba'

const URL_ALTA = 'https://us-central1-cobrify-395fe.cloudfunctions.net/crearAltaPendiente'

const PLANES = SELLABLE_PLAN_IDS.filter((id) => !PLANS[id]?.isAddon)

/** Lo que se lleva el referido en cada plan, para poder decírselo sin calcular. */
const REGALO = Object.fromEntries(
  PLANES.filter((id) => mesesDeRegalo(id)).map((id) => {
    const paga = PLANS[id]?.months || 1
    return [id, { paga, total: mesesTotales(id, paga) }]
  }),
)

/** Los mismos que usa Admin > Pagos, para que el listado no mezcle etiquetas. */
const METODOS = { yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia', efectivo: 'Efectivo', tarjeta: 'Tarjeta', otro: 'Otro' }

/**
 * Manda el formulario de alta a un lead que acaba de pagar.
 *
 * El enlace lleva un código que solo existe porque se generó desde aquí: eso
 * es lo que hace que no haga falta una página de registro abierta. El plan, los
 * meses y el monto se congelan en el enlace, así la cuenta nace con su
 * vencimiento correcto sin que el cliente escriba nada de eso.
 *
 * El mensaje NO se manda solo: cae en el cuadro de escribir para que se lea
 * antes de salir. Un mensaje automático a un cliente que acaba de pagar es
 * justo donde no conviene ir a ciegas.
 */
export default function EnviarAltaModal({ conversacion, onClose, onPonerEnElCompositor }) {
  const toast = useToast()
  const [plan, setPlan] = useState('')
  const [monto, setMonto] = useState('')
  const [montoTocado, setMontoTocado] = useState(false)
  const [metodo, setMetodo] = useState('yape')
  const [referidoPor, setReferidoPor] = useState('')
  const [nombre, setNombre] = useState(conversacion?.nombre || '')
  const [creando, setCreando] = useState(false)
  const [hecho, setHecho] = useState(null)

  // La prueba no es un plan más: no hay monto, no hay método de pago y no
  // hay referido que premiar. Se trata aparte en todo el formulario.
  const esPrueba = plan === 'trial'

  const elegirPlan = (id) => {
    setPlan(id)
    if (id === 'trial') { setMonto(''); setMontoTocado(false); return }
    if (!montoTocado) setMonto(id && PLANS[id] ? String(PLANS[id].totalPrice) : '')
  }

  async function crear() {
    if (!plan) { toast.error('Elige el plan que contrató'); return }
    setCreando(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const r = await fetch(URL_ALTA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          conversationId: conversacion?.id || null,
          waId: conversacion?.waId || null,
          nombre: nombre.trim(),
          plan,
          planNombre: esPrueba ? `Prueba de ${DIAS_DE_PRUEBA} días` : (PLANS[plan]?.name || ''),
          // En la prueba los días mandan sobre los meses: el servidor la crea
          // con `diasDePrueba` y no con un mes que no se pagó.
          meses: esPrueba ? 0 : (PLANS[plan]?.months || 1),
          diasDePrueba: esPrueba ? DIAS_DE_PRUEBA : null,
          precio: esPrueba ? null : (monto ? Number(monto) : null),
          metodo: esPrueba ? null : metodo,
          referidoPor: esPrueba ? null : (referidoPor.trim() || null),
          limites: PLANS[plan]?.limits || null,
        }),
      })
      const d = await r.json()
      if (!d.success) { toast.error(d.error || 'No se pudo crear el enlace'); return }
      setHecho(d)
    } catch (e) {
      console.error('Error creando el alta:', e)
      toast.error('No se pudo crear el enlace')
    } finally {
      setCreando(false)
    }
  }

  return (
    <Modal
      titulo="Enviar formulario de alta"
      subtitulo={conversacion?.nombre || conversacion?.waId}
      onClose={onClose}
      ancho="sm"
      pie={
        <>
          <Boton onClick={onClose} disabled={creando}>{hecho ? 'Cerrar' : 'Cancelar'}</Boton>
          {!hecho ? (
            <Boton variante="primario" onClick={crear} disabled={creando || !plan}>
              {creando ? 'Creando…' : 'Crear enlace'}
            </Boton>
          ) : (
            <Boton
              variante="primario"
              onClick={() => { onPonerEnElCompositor?.(hecho.mensaje); onClose() }}
            >
              Poner en el mensaje
            </Boton>
          )}
        </>
      }
    >
      {!hecho ? (
        <div className="space-y-3">
          <p className="text-[12.5px] text-gray-700">
            Llena sus datos él mismo y su cuenta queda activa al terminar. El enlace es la
            prueba de que pagó, así que solo funciona una vez.
          </p>
          <Campo etiqueta="Nombre del cliente" ayuda="Solo para saludarlo en el mensaje.">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Rosa Quispe" />
          </Campo>
          <Campo etiqueta="Plan que contrató">
            <Selector value={plan} onChange={(e) => elegirPlan(e.target.value)}>
              <option value="">Elige el plan…</option>
              {/* La prueba va PRIMERA y no al final: es el camino que más se va
                  a usar cuando el asistente empiece a atender, y al final de la
                  lista queda escondida detrás de seis planes. */}
              <option value="trial">Prueba gratuita — {DIAS_DE_PRUEBA} días, sin pago</option>
              {PLANES.map((id) => (
                <option key={id} value={id}>{PLANS[id].name} — S/ {PLANS[id].totalPrice}</option>
              ))}
            </Selector>
          </Campo>
          {esPrueba ? (
            <Aviso tono="neutro" titulo={`Prueba de ${DIAS_DE_PRUEBA} días`}>
              No se cobra nada y sus comprobantes NO se envían a SUNAT: salen marcados
              como sin validez. Al vencer se suspende sola. Si paga, la conviertes en
              cuenta real desde su ficha y se queda con todo lo que cargó.
            </Aviso>
          ) : (
          <>
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
          <p className="-mt-1 text-[11.5px] text-gray-500">
            El monto queda congelado como su precio de renovación, y el pago aparece en Pagos.
          </p>
          </>
          )}
          {/* Quién lo trajo. El código se comprueba al crear el enlace: si está
              mal escrito, el error sale ahora, que es cuando se puede arreglar.
              Dejarlo pasar sería que el cliente que refirió nunca cobre su mes
              y nadie se entere. */}
          {!esPrueba && (
          <Campo
            etiqueta="¿Lo refirió un cliente? (opcional)"
            ayuda={REGALO[plan]
              ? `Con este plan, el referido usa ${REGALO[plan].total} meses pagando ${REGALO[plan].paga}, y quien lo trajo gana 1 mes.`
              : plan
                ? 'Este plan no entra al programa de referidos.'
                : 'El código de cliente de quien lo refirió (el que sale en Usuarios).'}
          >
            <Entrada
              value={referidoPor}
              onChange={(e) => setReferidoPor(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              placeholder="1000042"
            />
          </Campo>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Aviso tono="neutro" titulo="Enlace creado">
            Sirve una sola vez. Si se pierde, crea otro desde aquí.
          </Aviso>
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="break-all font-mono text-[11.5px] text-gray-700">{hecho.enlace}</p>
          </div>
          <Campo etiqueta="El mensaje que va a salir">
            <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-700">
              {hecho.mensaje}
            </div>
          </Campo>
          <p className="text-[11.5px] text-gray-500">
            Cae en el cuadro de escribir para que lo revises antes de mandarlo.
          </p>
        </div>
      )}
    </Modal>
  )
}
