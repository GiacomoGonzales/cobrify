/**
 * REGISTRO PÚBLICO DE FIDELIZACIÓN — la página del QR de mesa (18-ago-2026).
 *
 * El negocio imprime un QR ("Regístrate y gana") que apunta a
 * /registro/{idNegocio|slug}. El cliente llena sus datos desde SU celular,
 * sin sesión, y recibe al toque su tarjeta de sellos para Google/Apple
 * Wallet — el mismo link corto cbrfy.link que entrega el cajero.
 *
 * TODO pasa por la Cloud Function registerLoyaltyCustomer: esta página no
 * escribe Firestore. Las defensas anti-bot viven allá (honeypot + tiempo de
 * llenado + tope diario); acá solo se recolectan esas señales.
 */
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Stamp, Search, Loader2, CheckCircle, PartyPopper, Wallet,
  AlertCircle, CalendarX, Gift,
} from 'lucide-react'
import { consultarDNI } from '@/services/documentLookupService'

const FN_URL = 'https://us-central1-cobrify-395fe.cloudfunctions.net/registerLoyaltyCustomer'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** Contraste simple: texto blanco o navy según el color de marca. */
const textoSobre = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 160 ? '#1e293b' : '#ffffff'
}

export default function RegistroFidelidad() {
  const { negocio } = useParams()

  // info = respuesta del GET (marca del negocio). null mientras carga.
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [form, setForm] = useState({
    documentNumber: '', name: '', phone: '',
    birthdayDay: '', birthdayMonth: '', birthdayYear: '', email: '',
  })
  const [consent, setConsent] = useState(false)
  const [buscandoDni, setBuscandoDni] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [formError, setFormError] = useState('')
  const [resultado, setResultado] = useState(null) // respuesta del POST

  // Señales anti-bot: el honeypot es un input invisible que un humano nunca
  // llena, y montadoEn mide cuánto tardó en llenar el formulario.
  const [honeypot, setHoneypot] = useState('')
  const montadoEn = useRef(Date.now())

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      try {
        const r = await fetch(`${FN_URL}?negocio=${encodeURIComponent(negocio || '')}`)
        const data = await r.json()
        if (!vivo) return
        if (!r.ok) { setLoadError(data.error || 'No se pudo cargar la página'); return }
        setInfo(data)
      } catch {
        if (vivo) setLoadError('No se pudo cargar la página. Revisa tu conexión.')
      }
    }
    cargar()
    return () => { vivo = false }
  }, [negocio])

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  const buscarDni = async () => {
    const dni = form.documentNumber.trim()
    if (!/^\d{8}$/.test(dni)) { setFormError('El DNI debe tener 8 dígitos'); return }
    setFormError('')
    setBuscandoDni(true)
    try {
      const r = await consultarDNI(dni)
      if (r.success && r.data?.nombreCompleto) {
        setForm((f) => ({ ...f, name: r.data.nombreCompleto }))
      } else {
        setFormError('No encontramos ese DNI. Escribe tu nombre manualmente.')
      }
    } finally {
      setBuscandoDni(false)
    }
  }

  const enviar = async (e) => {
    e.preventDefault()
    setFormError('')
    const celular = form.phone.replace(/\D/g, '')
    if (form.name.trim().length < 2) { setFormError('Escribe tu nombre'); return }
    if (!/^9\d{8}$/.test(celular)) { setFormError('El celular debe tener 9 dígitos y empezar con 9'); return }
    if (!consent) { setFormError('Debes aceptar el uso de tus datos para continuar'); return }
    if ((form.birthdayDay && !form.birthdayMonth) || (!form.birthdayDay && form.birthdayMonth)) {
      setFormError('Completa el día y el mes de tu cumpleaños, o deja ambos vacíos'); return
    }

    setEnviando(true)
    try {
      const r = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: info.businessId,
          documentType: 'DNI',
          documentNumber: form.documentNumber.trim(),
          name: form.name.trim(),
          phone: celular,
          birthdayDay: form.birthdayDay || null,
          birthdayMonth: form.birthdayMonth || null,
          birthdayYear: form.birthdayYear || null,
          email: form.email.trim(),
          website: honeypot,
          fillMs: Date.now() - montadoEn.current,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setFormError(data.error || 'No se pudo completar el registro'); return }
      setResultado(data)
      window.scrollTo(0, 0)
    } catch {
      setFormError('No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  // ── Estados de página completa ──
  if (loadError) {
    return (
      <PantallaCentrada icono={<AlertCircle className="w-10 h-10 text-red-500" />}
        titulo="Algo salió mal" texto={loadError} />
    )
  }
  if (!info) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    )
  }
  if (!info.enabled) {
    return (
      <PantallaCentrada icono={<Stamp className="w-10 h-10 text-slate-400" />}
        titulo={info.nombre} texto="Este negocio todavía no tiene activo su programa de sellos." />
    )
  }
  if (!info.vigente) {
    return (
      <PantallaCentrada icono={<CalendarX className="w-10 h-10 text-slate-400" />}
        titulo={info.nombre} texto="El programa de sellos de este negocio ya terminó. Gracias por tu interés." />
    )
  }

  const color = info.color || '#1e3a8a'
  const sobreColor = textoSobre(color)

  // ── Éxito ──
  if (resultado) {
    return (
      <div className="min-h-screen bg-slate-100 font-sans">
        <Cabecera info={info} color={color} sobreColor={sobreColor} />
        <div className="max-w-md mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
              {resultado.alreadyRegistered
                ? <CheckCircle className="w-9 h-9 text-green-600" />
                : <PartyPopper className="w-9 h-9 text-green-600" />}
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {resultado.alreadyRegistered
                ? `Hola de nuevo, ${resultado.nombre || ''}`.trim()
                : `Listo, ${resultado.nombre || ''}`.trim()}
            </h2>
            <p className="text-slate-600 mt-2">
              {resultado.alreadyRegistered
                ? 'Ya estabas registrado. Tu tarjeta de sellos sigue activa.'
                : 'Ya eres parte del programa de sellos.'}
            </p>

            {!resultado.alreadyRegistered && resultado.incentivo && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm font-medium">
                <Gift className="w-4 h-4 shrink-0" />
                <span>{resultado.incentivo}</span>
              </div>
            )}

            <Progreso stamps={resultado.stamps} goal={resultado.goal} color={color} />
            {info.premio && (
              <p className="text-sm text-slate-500 mt-2">
                Junta {resultado.goal} sellos y gana: <span className="font-medium text-slate-700">{info.premio}</span>
              </p>
            )}

            {resultado.shortUrl && (
              <a href={resultado.shortUrl}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-semibold shadow-sm"
                style={{ backgroundColor: color, color: sobreColor }}>
                <Wallet className="w-5 h-5" />
                Agregar mi tarjeta al celular
              </a>
            )}
            <p className="text-xs text-slate-400 mt-3">
              Tu tarjeta se guarda en Google Wallet o Apple Wallet y se actualiza sola con cada compra.
            </p>
          </div>
        </div>
        <PiePagina />
      </div>
    )
  }

  // ── Formulario ──
  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <Cabecera info={info} color={color} sobreColor={sobreColor} />

      <div className="max-w-md mx-auto px-4 py-6 pb-10">
        {(info.welcomeStamps > 0 || info.incentivo) && (
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-white border border-slate-200 shadow-sm px-4 py-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${color}1a` }}>
              <Gift className="w-5 h-5" style={{ color }} />
            </div>
            <p className="text-sm text-slate-700 font-medium">
              {info.incentivo
                || (info.welcomeStamps === 1
                  ? 'Regístrate y recibe 1 sello de regalo'
                  : `Regístrate y recibe ${info.welcomeStamps} sellos de regalo`)}
            </p>
          </div>
        )}

        <form onSubmit={enviar} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          {/* Honeypot: invisible para humanos, irresistible para bots */}
          <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
            name="website" tabIndex="-1" autoComplete="off" aria-hidden="true"
            className="absolute opacity-0 h-0 w-0 pointer-events-none" />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">DNI (opcional)</label>
            <div className="flex gap-2">
              <input inputMode="numeric" maxLength={8} value={form.documentNumber}
                onChange={(e) => setForm((f) => ({ ...f, documentNumber: e.target.value.replace(/\D/g, '') }))}
                placeholder="8 dígitos"
                className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': color }} />
              <button type="button" onClick={buscarDni} disabled={buscandoDni}
                className="rounded-xl px-3.5 border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Buscar mi nombre por DNI">
                {buscandoDni ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo</label>
            <input value={form.name} onChange={set('name')} maxLength={80}
              placeholder="Tu nombre y apellidos" autoComplete="name"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': color }} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Celular</label>
            <input inputMode="numeric" maxLength={9} value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
              placeholder="9XXXXXXXX" autoComplete="tel"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': color }} />
            <p className="text-xs text-slate-400 mt-1">Tu tarjeta de sellos se identifica con este número.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cumpleaños (opcional)</label>
            <div className="grid grid-cols-3 gap-2">
              <select value={form.birthdayDay} onChange={set('birthdayDay')}
                className="rounded-xl border border-slate-300 px-2 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': color }}>
                <option value="">Día</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
              <select value={form.birthdayMonth} onChange={set('birthdayMonth')}
                className="rounded-xl border border-slate-300 px-2 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': color }}>
                <option value="">Mes</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <input inputMode="numeric" maxLength={4} value={form.birthdayYear}
                onChange={(e) => setForm((f) => ({ ...f, birthdayYear: e.target.value.replace(/\D/g, '') }))}
                placeholder="Año (opc.)"
                className="rounded-xl border border-slate-300 px-2 py-2.5 text-base focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': color }} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Correo (opcional)</label>
            <input type="email" value={form.email} onChange={set('email')} maxLength={100}
              placeholder="tucorreo@ejemplo.com" autoComplete="email"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': color }} />
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 shrink-0" style={{ accentColor: color }} />
            <span>
              Autorizo a <span className="font-medium text-slate-700">{info.nombre}</span> a usar mis
              datos para su programa de fidelización y para enviarme promociones,
              conforme a la Ley N.° 29733 de Protección de Datos Personales.
              Puedo pedir su eliminación cuando quiera en el propio local.
            </span>
          </label>

          {formError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <button type="submit" disabled={enviando}
            className="w-full rounded-xl px-4 py-3.5 font-semibold shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: color, color: sobreColor }}>
            {enviando && <Loader2 className="w-5 h-5 animate-spin" />}
            {enviando ? 'Registrando...' : 'Registrarme'}
          </button>
        </form>
      </div>
      <PiePagina />
    </div>
  )
}

function Cabecera({ info, color, sobreColor }) {
  return (
    <div style={{ backgroundColor: color, color: sobreColor }}>
      <div className="max-w-md mx-auto px-4 pt-8 pb-6 text-center">
        {info.logoUrl ? (
          <img src={info.logoUrl} alt={info.nombre}
            className="w-16 h-16 mx-auto rounded-2xl object-cover bg-white/90 p-1 shadow" />
        ) : (
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/15 flex items-center justify-center">
            <Stamp className="w-8 h-8" />
          </div>
        )}
        <h1 className="text-2xl font-bold mt-3">{info.nombre}</h1>
        <p className="text-sm mt-1 opacity-80">
          Programa de sellos: junta {info.goal} y gana{info.premio ? ` ${info.premio}` : ' tu premio'}
        </p>
      </div>
    </div>
  )
}

function Progreso({ stamps, goal, color }) {
  const meta = Math.max(1, Number(goal) || 10)
  const llenos = Math.min(Number(stamps) || 0, meta)
  return (
    <div className="mt-5">
      <div className="flex flex-wrap justify-center gap-1.5">
        {Array.from({ length: meta }, (_, i) => (
          <div key={i}
            className="w-7 h-7 rounded-full border-2 flex items-center justify-center"
            style={i < llenos
              ? { backgroundColor: color, borderColor: color }
              : { borderColor: '#cbd5e1' }}>
            {i < llenos && <CheckCircle className="w-4 h-4 text-white" />}
          </div>
        ))}
      </div>
      <p className="text-sm font-medium text-slate-700 mt-2">
        Llevas {llenos} de {meta} sellos
      </p>
    </div>
  )
}

function PantallaCentrada({ icono, titulo, texto }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 font-sans">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
          {icono}
        </div>
        <h1 className="text-lg font-bold text-slate-900">{titulo}</h1>
        <p className="text-sm text-slate-500 mt-2">{texto}</p>
      </div>
    </div>
  )
}

function PiePagina() {
  return (
    <p className="text-center text-xs text-slate-400 pb-6">
      Tarjeta de sellos digital
    </p>
  )
}
