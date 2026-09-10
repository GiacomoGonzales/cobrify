import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import { ref as refStorage, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, updateDoc } from 'firebase/firestore'
import { auth, db, storage } from '@/lib/firebase'
import { consultarRUC, consultarDNI } from '@/services/documentLookupService'
import { RUBROS, RUBROS_ALFABETICOS, sugerirRubroDeCuenta } from '@/data/rubros'
import { Boton, Campo, Entrada, Aviso } from '@/components/admin/ui'
import { LogoAppStore, LogoPlayStore, LogoNavegador } from '@/components/LogosTienda'
import { URL_APP_STORE, URL_PLAY_STORE, NOMBRE_DE_TIENDA, aparato } from '@/utils/tiendaDeLaApp'

const FN = 'https://us-central1-cobrify-395fe.cloudfunctions.net'

/** Las tiendas. La detección elige cuál va primero. */
const TIENDAS = {
  ios: {
    etiqueta: 'Descargar para iPhone',
    pie: NOMBRE_DE_TIENDA.ios,
    url: URL_APP_STORE,
    Logo: LogoAppStore,
  },
  android: {
    etiqueta: 'Descargar para Android',
    pie: NOMBRE_DE_TIENDA.android,
    url: URL_PLAY_STORE,
    Logo: LogoPlayStore,
  },
  web: {
    etiqueta: 'Entrar desde la computadora',
    pie: 'Ir directo a iniciar sesión',
    // Al login, no a la portada: acaba de crear su cuenta, lo que quiere es
    // entrar, no leerse la web de nuevo.
    url: 'https://cobrifyperu.com/login',
    Logo: LogoNavegador,
  },
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
  /** { texto, yaUsada } — que el enlace ya se haya usado NO es un error: la
      cuenta existe y lo que toca ofrecerle es entrar. */
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
  /** El logo se ELIGE aquí pero se sube después: mientras llena el formulario
      todavía no hay cuenta ni sesión, y Storage solo deja escribir al dueño. */
  const [logo, setLogo] = useState(null)
  const [logoPrevia, setLogoPrevia] = useState(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch(`${FN}/verAltaPendiente?codigo=${encodeURIComponent(codigo || '')}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return
        if (!d.success) {
          setErrorCarga({ texto: d.error || 'Este enlace no sirve', yaUsada: !!d.yaUsada })
          return
        }
        setAlta(d.alta)
        setF((p) => ({ ...p, displayName: d.alta.nombre || '', contactPhone: d.alta.whatsapp || '' }))
      })
      .catch(() => vivo && setErrorCarga({ texto: 'No se pudo abrir el enlace. Revisa tu conexión.' }))
    return () => { vivo = false }
  }, [codigo])

  /**
   * El rubro que adivina el clasificador con el nombre del negocio.
   *
   * OJO con el campo: el clasificador lee `nombre`, no `businessName`. Pasarle
   * el que no era devolvia null siempre y la sugerencia no aparecia nunca.
   * Se le da el nombre comercial si lo hay —suele decir mas— y si no la razon
   * social.
   */
  const sugerido = useMemo(() => {
    const nombre = f.tradeName?.trim() || f.businessName?.trim()
    if (!nombre) return null
    return sugerirRubroDeCuenta({ nombre })?.rubro || null
  }, [f.tradeName, f.businessName])

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
      // qué escribirla otra vez. Si el pase no vino, la cuenta está igual de
      // creada — solo tendrá que entrar por el login como cualquier otro día.
      if (d.pase) {
        try {
          await signInWithCustomToken(auth, d.pase)
          // Y con la sesión abierta ya se puede subir el logo, que es lo que
          // no se podía antes: Storage exige ser el dueño de la cuenta.
          if (logo) await subirLogo(d.uid)
        } catch (e) {
          console.error('No se pudo iniciar sesión tras crear la cuenta:', e)
        }
      }
    } catch {
      setError('No se pudo crear la cuenta. Revisa tu conexión.')
    } finally {
      setEnviando(false)
    }
  }

  /** Sube el logo y lo apunta en el negocio. Si falla, la cuenta no se toca:
      lo podrá poner después desde Configuración. */
  async function subirLogo(uid) {
    setSubiendoLogo(true)
    try {
      const destino = refStorage(storage, `businesses/${uid}/logo`)
      await uploadBytes(destino, logo)
      const url = await getDownloadURL(destino)
      await updateDoc(doc(db, 'businesses', uid), { logoUrl: url })
    } catch (e) {
      console.error('No se pudo subir el logo:', e)
    } finally {
      setSubiendoLogo(false)
    }
  }

  if (errorCarga) return <Marco><SinEnlace error={errorCarga} /></Marco>
  if (!alta) return (
    <Marco>
      <div className="py-6 text-center">
        <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-primary-600" />
        <p className="mt-3 text-[13px] text-gray-500">Un momento…</p>
      </div>
    </Marco>
  )
  if (listo) return <Marco><Final listo={listo} alta={alta} correo={f.email.trim()} /></Marco>

  const puedeSeguir =
    paso === 0 ? f.businessName.trim().length > 2
    : paso === 1 ? !!f.rubro
    : f.displayName.trim() && f.email.trim().includes('@') && f.password.length >= 8

  // El nombre viene del alta que se creó desde el chat, así que casi siempre
  // está. Solo el de pila: "Bienvenido, Rosa Quispe Huamán" suena a carta del
  // banco, "Bienvenido, Rosa" suena a persona.
  const primerNombre = (alta?.nombre || '').trim().split(' ')[0]

  // Una prueba y una cuenta contratada no se saludan igual. El que viene a
  // probar tiene que SABER que está probando desde la primera línea: si se
  // entera al séptimo día, cuando se le vence, se siente engañado.
  const esPrueba = alta?.plan === 'trial'
  const saludo = `Bienvenido${primerNombre ? `, ${primerNombre}` : ''}. `
    + (esPrueba ? 'Vamos a activar tu periodo de prueba.' : 'Vamos a crear tu cuenta.')

  return (
    <Marco bajada={saludo}>
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

          <CampoLogo
            previa={logoPrevia}
            onElegir={(archivo) => {
              setLogo(archivo)
              setLogoPrevia(archivo ? URL.createObjectURL(archivo) : null)
            }}
          />
        </>
      )}

      {paso === 1 && (
        <>
          <Titulo texto="¿A qué se dedica?" ayuda="Esto decide qué ves al entrar. Se puede cambiar después." />
          <SelectorRubro valor={f.rubro} onElegir={(id) => set('rubro', id)} sugerido={sugerido} />
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
          disabled={!puedeSeguir || enviando || subiendoLogo}
          onClick={() => (paso === 2 ? terminar() : setPaso(paso + 1))}
        >
          {paso === 2
            ? (subiendoLogo ? 'Subiendo tu logo…' : enviando ? 'Creando tu cuenta…' : 'Crear mi cuenta')
            : 'Continuar'}
        </Boton>
      </div>
    </Marco>
  )
}

// ---------- piezas ----------

/**
 * El marco de todas las pantallas.
 *
 * Centrado en vertical y no pegado arriba: en una computadora la tarjeta
 * quedaba flotando en medio de un vacío enorme y parecía a medio cargar.
 */
/**
 * El rubro, en un desplegable con buscador.
 *
 * Son 51 y en tarjetas era un muro de scroll: nadie lee 51 opciones, y la que
 * busca está siempre a media pantalla de distancia. Cerrado ocupa una línea;
 * abierto se escribe y se filtra.
 *
 * Cuando el clasificador acierta —8 de cada 10 veces— ni se abre: ya viene
 * puesto y solo hay que confirmarlo.
 */
function SelectorRubro({ valor, onElegir, sugerido }) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')

  const elegido = RUBROS.find((r) => r.id === valor)
  const normal = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const filtrados = q.trim()
    ? RUBROS_ALFABETICOS.filter((r) => normal(r.nombre).includes(normal(q.trim())))
    : RUBROS_ALFABETICOS

  if (!abierto) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => { setAbierto(true); setQ('') }}
          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
            elegido ? 'border-primary-600 bg-primary-50' : 'border-gray-300 bg-white hover:border-gray-400'
          }`}
        >
          <span className="min-w-0">
            <span className={`block text-[14px] ${elegido ? 'font-medium text-primary-900' : 'text-gray-400'}`}>
              {elegido ? elegido.nombre : 'Elige a qué se dedica tu negocio'}
            </span>
            {elegido && valor === sugerido && (
              <span className="mt-0.5 block text-[11.5px] text-primary-700">
                Lo dedujimos por el nombre. Tócalo si no es.
              </span>
            )}
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300">
      <div className="border-b border-gray-200 p-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Busca tu rubro…"
          className="w-full rounded-md bg-gray-100 px-3 py-2 text-[14px] outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div className="max-h-72 overflow-y-auto">
        {filtrados.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-[13px] text-gray-500">
            Nada con “{q}”. Prueba con otra palabra.
          </p>
        ) : (
          filtrados.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { onElegir(r.id); setAbierto(false) }}
              className={`block w-full border-b border-gray-100 px-3.5 py-2.5 text-left text-[13.5px] last:border-b-0 hover:bg-gray-50 ${
                r.id === valor ? 'bg-primary-50 font-medium text-primary-900' : 'text-gray-700'
              }`}
            >
              {r.nombre}
              {r.id === sugerido && r.id !== valor && (
                <span className="ml-2 text-[11px] text-gray-400">sugerido</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * El logo del negocio. Opcional a propósito: es lo primero que sale en sus
 * comprobantes, pero no vale frenar un alta por una imagen que no tiene a mano.
 */
function CampoLogo({ previa, onElegir }) {
  return (
    <div>
      <span className="mb-1 block text-[12px] font-medium text-gray-700">
        Tu logo <span className="font-normal text-gray-400">— opcional</span>
      </span>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {previa ? (
            <img src={previa} alt="Tu logo" className="h-full w-full object-contain" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50">
            {previa ? 'Cambiar' : 'Subir imagen'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onElegir(e.target.files?.[0] || null)}
            />
          </label>
          {previa && (
            <button
              type="button"
              onClick={() => onElegir(null)}
              className="ml-2 text-[12.5px] text-gray-500 hover:text-gray-700"
            >
              Quitar
            </button>
          )}
          <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
            Sale en tus facturas y boletas. Lo puedes poner después.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * El marco de las cuatro pantallas del alta.
 *
 * `bajada` solo la manda el formulario. Encima de "Este enlace no sirve" o de
 * "Tu cuenta está lista" no pinta nada un "vamos a crear tu cuenta": ahí la
 * pantalla ya dice lo suyo y una línea de más solo estorba.
 */
function Marco({ children, bajada }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-center text-[15px] font-semibold tracking-tight text-gray-900">Cobrify</p>
        {bajada && (
          <p className="mt-1.5 text-center text-[13.5px] leading-snug text-gray-500">{bajada}</p>
        )}
        <div className="mb-4" />
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">{children}</div>
        <p className="mt-4 text-center text-[11.5px] text-gray-400">
          Sistema de facturación electrónica · cobrifyperu.com
        </p>
      </div>
    </div>
  )
}

/**
 * Cuando el enlace no sirve. Se separan los dos motivos porque piden cosas
 * distintas: si la cuenta YA se activó no hay nada roto —solo tiene que
 * entrar—, y si el enlace no existe hay que escribirle a quien se lo mandó.
 */
function SinEnlace({ error }) {
  if (error.yaUsada) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-[18px] font-semibold text-gray-900">Esta cuenta ya está activada</h1>
        <p className="mx-auto mt-1.5 max-w-[30ch] text-[13px] leading-relaxed text-gray-500">
          El enlace sirve una sola vez. Entra con el correo y la contraseña que creaste.
        </p>
        <a
          href="https://cobrifyperu.com/login"
          className="mt-5 flex items-center justify-center rounded-lg bg-primary-600 px-4 py-3 text-[14px] font-medium text-white hover:bg-primary-700"
        >
          Iniciar sesión
        </a>
      </div>
    )
  }
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <h1 className="text-[18px] font-semibold text-gray-900">Este enlace no sirve</h1>
      <p className="mx-auto mt-1.5 max-w-[32ch] text-[13px] leading-relaxed text-gray-500">{error.texto}</p>
      <p className="mt-4 text-[12.5px] text-gray-500">
        Escríbele a quien te lo mandó y te envía uno nuevo.
      </p>
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
  const vence = listo.hasta
    ? new Date(listo.hasta).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <>
      {/* El momento importante: que sepa que ya está, y que su cuenta tiene
          fecha. Nada de adornos alrededor. */}
      <div className="pt-1 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-600">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-[19px] font-semibold text-gray-900">
          {alta.plan === 'trial' ? 'Tu prueba está lista' : 'Tu cuenta está lista'}
          {alta.nombre ? `, ${alta.nombre.split(' ')[0]}` : ''}
        </h1>
        {vence && (
          <p className="mt-1 text-[13px] text-gray-500">
            {alta.plan === 'trial'
              // En la prueba la fecha es LO que hay que ver: es lo que se acaba.
              ? `Puedes probarlo hasta el ${vence}`
              : `${alta.planNombre ? `${alta.planNombre} · a` : 'A'}ctiva hasta el ${vence}`}
          </p>
        )}
      </div>

      {/* Con qué entra. La contraseña NO se imprime: la acaba de escribir él, y
          enseñarla solo deja una captura con su clave dando vueltas. */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Tus datos para entrar</p>
        <p className="mt-1 break-all text-[14px] font-medium text-gray-900">{correo}</p>
        <p className="mt-0.5 text-[12.5px] text-gray-500">Con la contraseña que acabas de crear.</p>
      </div>

      {/* La descarga: primero la de su aparato, grande; las otras debajo y
          pequeñas. Mostrar las tres iguales es lo que confunde. */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Empieza a usarlo</p>
        <Tienda k={suyo} destacada />
        {resto.map((k) => <Tienda key={k} k={k} />)}
      </div>

      <p className="border-t border-gray-100 pt-3 text-center text-[11.5px] leading-relaxed text-gray-500">
        Guarda este enlace: puedes volver a abrirlo cuando quieras para tener estos datos a mano.
      </p>
    </>
  )
}

/** Una opción para empezar a usarlo, con la marca de su tienda. */
function Tienda({ k, destacada = false }) {
  const t = TIENDAS[k]
  const Logo = t.Logo
  return (
    <a
      href={t.url}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-3 rounded-lg border px-4 transition-colors ${
        destacada
          ? 'border-primary-600 bg-primary-600 py-3.5 text-white hover:bg-primary-700'
          : 'border-gray-200 py-2.5 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <Logo className={destacada ? 'h-6 w-6 flex-none' : 'h-5 w-5 flex-none'} />
      <span className="min-w-0">
        <span className={`block font-medium ${destacada ? 'text-[14px]' : 'text-[13px]'}`}>{t.etiqueta}</span>
        <span className={`block text-[11.5px] ${destacada ? 'text-white/75' : 'text-gray-400'}`}>{t.pie}</span>
      </span>
      <svg viewBox="0 0 24 24" className={`ml-auto h-4 w-4 flex-none ${destacada ? 'text-white/70' : 'text-gray-300'}`}
           fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </a>
  )
}
