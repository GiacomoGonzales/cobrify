import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { consultarRUC, consultarDNI } from '@/services/documentLookupService'
import { RUBROS, RUBROS_ALFABETICOS, sugerirRubroDeCuenta } from '@/data/rubros'
import { Boton, Campo, Entrada, Aviso } from '@/components/admin/ui'

const FN = 'https://us-central1-cobrify-395fe.cloudfunctions.net'

/** Las tiendas. La detección elige cuál va primero. */
const TIENDAS = {
  ios: { etiqueta: 'Descargar para iPhone', pie: 'App Store', url: 'https://apps.apple.com/pe/app/cobrify-peru/id6756195760' },
  android: { etiqueta: 'Descargar para Android', pie: 'Play Store', url: 'https://play.google.com/store/apps/details?id=com.factuya.cobrify' },
  web: { etiqueta: 'Entrar desde la computadora', pie: 'cobrifyperu.com', url: 'https://cobrifyperu.com/login' },
}

/** Desde qué aparato entró, para enseñarle solo lo que le sirve. */
function aparato() {
  const ua = navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios'
  return 'web'
}

const PASOS = ['Tu negocio', 'Tu rubro', 'Tus datos']

/**
 * El formulario que activa la cuenta de un cliente que acaba de pagar.
 *
 * Se entra por un enlace con un código —`registro.cobrifyperu.com/<codigo>`—
 * que solo existe porque alguien del equipo lo generó desde la conversación.
 * No hay registro abierto: el código ES la prueba del pago.
 *
 * Tres pantallas y una de despedida. Todo lo que no hace falta para que la
 * cuenta funcione (impresora, productos, SUNAT) se ve después por WhatsApp:
 * preguntarlo aquí solo consigue que abandonen justo después de pagar.
 */
export default function Activar() {
  const { codigo } = useParams()
  const [alta, setAlta] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [paso, setPaso] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [listo, setListo] = useState(null)

  const [f, setF] = useState({
    documento: '', businessName: '', tradeName: '', phone: '',
    address: '', district: '', province: '', department: '', ubigeo: '',
    rubro: '', displayName: '', contactPhone: '', email: '', password: '',
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const [buscando, setBuscando] = useState(false)
  const [datosSunat, setDatosSunat] = useState(null)

  useEffect(() => {
    let vivo = true
    fetch(`${FN}/verAltaPendiente?codigo=${encodeURIComponent(codigo || '')}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return
        if (!d.success) { setErrorCarga(d.error || 'Este enlace no sirve'); return }
        setAlta(d.alta)
        setF((p) => ({ ...p, displayName: d.alta.nombre || '', contactPhone: d.alta.whatsapp || '' }))
      })
      .catch(() => vivo && setErrorCarga('No se pudo abrir el enlace. Revisa tu conexión.'))
    return () => { vivo = false }
  }, [codigo])

  /** El rubro que adivina el clasificador con el nombre del negocio. */
  const sugerido = useMemo(() => {
    if (!f.businessName) return null
    return sugerirRubroDeCuenta({ businessName: f.businessName })?.rubro || null
  }, [f.businessName])

  useEffect(() => {
    if (sugerido && !f.rubro) set('rubro', sugerido)
  }, [sugerido]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Con el documento se llena casi todo. Seis campos menos que escribir. */
  async function buscarDocumento() {
    const d = f.documento.replace(/\D/g, '')
    if (d.length !== 11 && d.length !== 8) return
    setBuscando(true); setError(null)
    try {
      const r = d.length === 11 ? await consultarRUC(d) : await consultarDNI(d)
      if (!r.success) { setError(r.error || 'No encontramos ese número'); setDatosSunat(null); return }
      const x = r.data
      setDatosSunat(x)
      setF((p) => ({
        ...p,
        businessName: x.razonSocial || x.nombreCompleto || p.businessName,
        address: x.direccion || p.address,
        district: x.distrito || p.district,
        province: x.provincia || p.province,
        department: x.departamento || p.department,
        ubigeo: x.ubigeo || p.ubigeo,
      }))
    } catch {
      setError('No pudimos consultar el número. Puedes escribir los datos a mano.')
    } finally {
      setBuscando(false)
    }
  }

  async function terminar() {
    setEnviando(true); setError(null)
    try {
      const r = await fetch(`${FN}/completarAlta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo,
          email: f.email.trim(),
          password: f.password,
          datos: {
            ruc: f.documento.replace(/\D/g, ''),
            businessName: f.businessName,
            tradeName: f.tradeName,
            phone: f.phone,
            contactPhone: f.contactPhone,
            address: f.address,
            district: f.district,
            province: f.province,
            department: f.department,
            ubigeo: f.ubigeo,
            rubro: f.rubro,
            displayName: f.displayName,
          },
        }),
      })
      const d = await r.json()
      if (!d.success) { setError(d.error || 'No se pudo crear la cuenta'); return }
      setListo(d)
      // Queda con la sesión abierta: acaba de escribir su clave, no tiene por
      // qué escribirla otra vez para entrar.
      signInWithCustomToken(auth, d.pase).catch(() => {})
    } catch {
      setError('No se pudo crear la cuenta. Revisa tu conexión.')
    } finally {
      setEnviando(false)
    }
  }

  if (errorCarga) return <Marco><Aviso tono="rojo" titulo="No pudimos abrir este enlace">{errorCarga}</Aviso></Marco>
  if (!alta) return <Marco><p className="text-[13px] text-gray-500">Un momento…</p></Marco>
  if (listo) return <Marco ancho><Final listo={listo} alta={alta} correo={f.email.trim()} /></Marco>

  const puedeSeguir =
    paso === 0 ? f.businessName.trim().length > 2
    : paso === 1 ? !!f.rubro
    : f.displayName.trim() && f.email.trim().includes('@') && f.password.length >= 8

  return (
    <Marco>
      <Pasos actual={paso} />

      {paso === 0 && (
        <>
          <Titulo texto="Empecemos por tu negocio" ayuda="Con tu RUC traemos todo lo demás." />
          <Campo etiqueta="RUC o DNI" ayuda={buscando ? 'Buscando…' : 'RUC de 11 dígitos, o DNI de 8 si eres persona natural.'}>
            <Entrada
              value={f.documento}
              onChange={(e) => set('documento', e.target.value.replace(/\D/g, '').slice(0, 11))}
              onBlur={buscarDocumento}
              inputMode="numeric"
              placeholder="20601234567"
            />
          </Campo>

          {datosSunat && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Datos de SUNAT</p>
              <Par etiqueta="Razón social" valor={f.businessName} />
              {f.address && <Par etiqueta="Dirección" valor={f.address} />}
              {f.district && <Par etiqueta="Distrito" valor={f.district} />}
              {datosSunat.estado && <Par etiqueta="Estado" valor={`${datosSunat.estado} · ${datosSunat.condicion || ''}`} />}
            </div>
          )}

          <Campo etiqueta="Razón social">
            <Entrada value={f.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="MI EMPRESA S.A.C." />
          </Campo>
          <Campo etiqueta="Nombre comercial" ayuda="El que ve tu cliente. Si lo dejas vacío usamos la razón social.">
            <Entrada value={f.tradeName} onChange={(e) => set('tradeName', e.target.value)} placeholder="Mi Empresa" />
          </Campo>
          <Campo etiqueta="Teléfono del local" ayuda="Es el que sale impreso en el ticket.">
            <Entrada value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="01 445 6677" />
          </Campo>
        </>
      )}

      {paso === 1 && (
        <>
          <Titulo texto="¿A qué se dedica?" ayuda="Esto decide qué ves al entrar. Se puede cambiar después." />
          {sugerido && (
            <p className="text-[12px] text-gray-500">
              Por el nombre parece <b className="text-gray-900">{RUBROS.find((r) => r.id === sugerido)?.nombre}</b>. Cámbialo si no es.
            </p>
          )}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {RUBROS_ALFABETICOS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => set('rubro', r.id)}
                className={`rounded-md border px-3 py-2 text-left text-[13px] transition-colors ${
                  f.rubro === r.id
                    ? 'border-primary-600 bg-primary-50 font-medium text-primary-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                {r.nombre}
              </button>
            ))}
          </div>
        </>
      )}

      {paso === 2 && (
        <>
          <Titulo texto="¿Quién va a manejar la cuenta?" ayuda="Estos serán tus datos para entrar." />
          <Campo etiqueta="Tu nombre">
            <Entrada value={f.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Rosa Quispe" />
          </Campo>
          <Campo etiqueta="Tu WhatsApp" ayuda="Para escribirte si necesitas algo.">
            <Entrada value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} placeholder="+51 987 654 321" />
          </Campo>
          <Campo etiqueta="Correo" ayuda="Con este correo entras a Cobrify.">
            <Entrada type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="tu@correo.com" autoComplete="username" />
          </Campo>
          <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres. Solo la sabes tú.">
            <Entrada type="password" value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
          </Campo>
        </>
      )}

      {error && <Aviso tono="rojo">{error}</Aviso>}

      <div className="flex items-center justify-between gap-3 pt-1">
        {paso > 0 ? (
          <Boton onClick={() => { setError(null); setPaso(paso - 1) }} disabled={enviando}>Atrás</Boton>
        ) : <span />}
        <Boton
          variante="primario"
          disabled={!puedeSeguir || enviando}
          onClick={() => (paso === 2 ? terminar() : setPaso(paso + 1))}
        >
          {paso === 2 ? (enviando ? 'Creando tu cuenta…' : 'Crear mi cuenta') : 'Continuar'}
        </Boton>
      </div>
    </Marco>
  )
}

// ---------- piezas ----------

function Marco({ children, ancho = false }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className={`mx-auto ${ancho ? 'max-w-md' : 'max-w-md'}`}>
        <p className="mb-4 text-center text-[13px] font-semibold text-gray-900">Cobrify</p>
        <div className="space-y-3.5 rounded-lg border border-gray-200 bg-white p-5">{children}</div>
      </div>
    </div>
  )
}

function Pasos({ actual }) {
  return (
    <div className="flex items-center gap-1.5 pb-1">
      {PASOS.map((p, i) => (
        <div key={p} className="flex-1">
          <div className={`h-[3px] rounded-full ${i <= actual ? 'bg-primary-600' : 'bg-gray-200'}`} />
          <span className={`mt-1 block text-[10.5px] ${i === actual ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{p}</span>
        </div>
      ))}
    </div>
  )
}

function Titulo({ texto, ayuda }) {
  return (
    <div>
      <h1 className="text-[17px] font-semibold text-gray-900">{texto}</h1>
      {ayuda && <p className="mt-0.5 text-[12.5px] text-gray-500">{ayuda}</p>}
    </div>
  )
}

function Par({ etiqueta, valor }) {
  return (
    <div className="flex justify-between gap-4 py-0.5 text-[12px]">
      <span className="flex-none text-gray-500">{etiqueta}</span>
      <span className="text-right font-medium text-gray-900">{valor}</span>
    </div>
  )
}

/** La despedida: su usuario y dónde bajar la app, empezando por su aparato. */
function Final({ listo, alta, correo }) {
  const suyo = aparato()
  const resto = Object.keys(TIENDAS).filter((k) => k !== suyo)
  const vence = listo.hasta ? new Date(listo.hasta).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return (
    <>
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-[18px] font-bold text-primary-700">✓</div>
        <h1 className="text-[17px] font-semibold text-gray-900">Listo{alta.nombre ? `, ${alta.nombre.split(' ')[0]}` : ''}</h1>
        {vence && <p className="mt-0.5 text-[12.5px] text-gray-500">Tu cuenta está activa hasta el {vence}.</p>}
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Par etiqueta="Entras con" valor={correo} />
        <Par etiqueta="Contraseña" valor="La que acabas de crear" />
        {alta.planNombre && <Par etiqueta="Plan" valor={alta.planNombre} />}
      </div>

      <div className="space-y-1.5">
        <a href={TIENDAS[suyo].url} target="_blank" rel="noreferrer"
           className="block rounded-md border border-primary-600 bg-primary-50 px-3 py-2.5 text-[13px] font-medium text-primary-900 hover:bg-primary-100">
          {TIENDAS[suyo].etiqueta}
          <span className="block text-[11px] font-normal text-primary-700">{TIENDAS[suyo].pie}</span>
        </a>
        {resto.map((k) => (
          <a key={k} href={TIENDAS[k].url} target="_blank" rel="noreferrer"
             className="block rounded-md border border-gray-200 px-3 py-2 text-[12.5px] text-gray-700 hover:border-gray-300">
            {TIENDAS[k].etiqueta}
            <span className="block text-[11px] text-gray-400">{TIENDAS[k].pie}</span>
          </a>
        ))}
      </div>

      <p className="text-center text-[11.5px] text-gray-500">
        Guarda esta página: puedes volver a abrirla desde el mismo enlace.
      </p>
    </>
  )
}
