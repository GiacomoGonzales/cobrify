import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { BedDouble, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { usePublicPageChrome } from '@/hooks/usePublicPageChrome'
import FormularioRegistroHuespedes from '@/components/hotel/FormularioRegistroHuespedes'
import { registroParaFormulario, normalizarRegistro, fechaCorta } from '@/utils/registroDeHuespedes'

/**
 * REGISTRO DE HUÉSPEDES — página pública, sin cuenta y sin login.
 *
 * El huésped llega con el enlace que le mandó el hotel desde la reserva
 * (pedido de San Ignacio Bamboo Lodge, que usaba un formulario de Google). El
 * secreto es el token de la URL, el mismo de "Mi reserva". Todo va contra las
 * Cloud Functions públicas (functions/booking/publicRegistro.js): esta página
 * no toca Firestore y solo ve su propia reserva.
 */
const FN_BASE = 'https://us-central1-cobrify-395fe.cloudfunctions.net'

export default function RegistroHuespedes() {
  // Página pública: sin banner de instalar Cobrify (ver el hook)
  usePublicPageChrome(null)

  const { businessId, token } = useParams()
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [datos, setDatos] = useState(null)
  const [valor, setValor] = useState(null)
  const [editando, setEditando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [problema, setProblema] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const r = await fetch(`${FN_BASE}/getPublicGuestRegistry?businessId=${encodeURIComponent(businessId)}&token=${encodeURIComponent(token)}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'No se pudo abrir el registro')
      setDatos(data)
      setValor(registroParaFormulario(data.registro, data.reserva?.huespedes))
      setEditando(!data.registro)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [businessId, token])

  useEffect(() => { cargar() }, [cargar])

  const enviar = async (e) => {
    e.preventDefault()
    const { problema: falta, registro } = normalizarRegistro(valor)
    if (falta) { setProblema(falta); return }
    setEnviando(true)
    setProblema('')
    try {
      const r = await fetch(`${FN_BASE}/savePublicGuestRegistry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, token, registro }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'No se pudo guardar el registro')
      setDatos((d) => ({ ...d, registro }))
      setValor(registroParaFormulario(registro))
      setEditando(false)
      window.scrollTo(0, 0)
    } catch (err) {
      setProblema(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const negocio = datos?.negocio || {}
  const reserva = datos?.reserva || {}
  const registrados = datos?.registro?.huespedes || []

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="w-full max-w-2xl mx-auto space-y-4">
        {cargando ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" /> Abriendo tu registro...
          </div>
        ) : error && !datos ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
            <p className="text-gray-700">{error}</p>
          </div>
        ) : datos && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                {negocio.logo ? (
                  <img src={negocio.logo} alt="" className="w-12 h-12 rounded-full object-cover border border-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <BedDouble className="w-6 h-6 text-gray-600" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm text-gray-500">Registro de huéspedes</p>
                  <h1 className="text-lg font-bold text-gray-900 truncate">{negocio.nombre || 'Tu hospedaje'}</h1>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Habitación</dt>
                <dd className="text-gray-900 font-medium text-right">{reserva.habitacion || '-'}</dd>
                <dt className="text-gray-500">Fechas</dt>
                <dd className="text-gray-900 text-right">
                  {fechaCorta(reserva.checkIn)} al {fechaCorta(reserva.checkOut)}
                  {reserva.noches > 0 && ` (${reserva.noches} noche${reserva.noches === 1 ? '' : 's'})`}
                </dd>
                <dt className="text-gray-500">Personas</dt>
                <dd className="text-gray-900 text-right">{reserva.huespedes}</dd>
                {reserva.tarifaPorNoche > 0 && (
                  <>
                    <dt className="text-gray-500">Tarifa por noche</dt>
                    <dd className="text-gray-900 text-right">S/ {Number(reserva.tarifaPorNoche).toFixed(2)}</dd>
                  </>
                )}
              </dl>
            </div>

            {!editando ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Tu registro está guardado</p>
                    <p className="text-sm text-gray-600">Gracias. Te esperamos{datos.registro?.horaLlegada ? ` a las ${datos.registro.horaLlegada}` : ''}.</p>
                  </div>
                </div>
                <ul className="text-sm text-gray-700 space-y-1">
                  {registrados.map((h, i) => (
                    <li key={i}>
                      {i === 0 ? 'Titular' : `Huésped ${i + 1}`}: {h.nombres} {h.apellidos} · {h.tipoDocumento} {h.documento}
                    </li>
                  ))}
                </ul>
                {datos.puedeEditar && (
                  <button
                    type="button"
                    onClick={() => setEditando(true)}
                    className="w-full py-2.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Corregir datos
                  </button>
                )}
              </div>
            ) : !datos.puedeEditar ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-600">
                Esta reserva ya no admite cambios en el registro. Si necesitas algo, escríbele al hospedaje.
              </div>
            ) : (
              <form onSubmit={enviar} className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Datos de la estadía y de los huéspedes</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Registra a las personas que se hospedan en esta habitación. Tus datos solo se usan para el registro de tu estadía.
                  </p>
                </div>
                <FormularioRegistroHuespedes valor={valor} onCambio={(v) => { setValor(v); setProblema('') }} deshabilitado={enviando} />
                {problema && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{problema}</p>
                )}
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Enviar registro
                </button>
              </form>
            )}
          </>
        )}
        <p className="text-center text-[11px] text-gray-400">
          Este enlace es solo para tu reserva. No lo compartas.
        </p>
      </div>
    </div>
  )
}
