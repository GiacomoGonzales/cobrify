import { useState, useRef, useEffect, useMemo } from 'react'
import { auth } from '@/lib/firebase'
import { suscribirAutomaticos, guardarAutomaticos } from '@/services/whatsappChatService'
import { Pagina, Seccion, Boton, Aviso, Campo, Entrada, Casilla, useTituloAdmin } from '@/components/admin/ui'

/**
 * BANCO DE PRUEBAS DEL ASISTENTE DE VENTAS.
 *
 * Giacomo hace de cliente y ve qué le contesta. NO está conectado a WhatsApp:
 * acá no hay ningún cliente de verdad al otro lado, así que se puede probar lo
 * que sea sin miedo — incluido ponerse pesado a propósito, que es justamente
 * la prueba que más falta hace.
 *
 * Al costado de cada respuesta se ve lo que no se ve en un chat normal: si el
 * asistente quiso pasarle la conversación a Giacomo y por qué, y cuánto costó
 * el mensaje. Sin eso solo se ven respuestas bonitas y no se sabe dónde falla.
 *
 * El asistente también manda las RESPUESTAS RÁPIDAS de la bandeja, tal cual y
 * con su archivo: acá se ven como le llegarían al cliente, y abajo se elige
 * cuáles puede usar y, si hace falta, cuándo.
 */

const FN = 'https://us-central1-cobrify-395fe.cloudfunctions.net/asistenteVentas'

/** Lo que dice cada motivo de escalada, en cristiano. */
const MOTIVOS = {
  quiere_comprar: 'Quiere comprar',
  pregunta_sunat: 'Preguntó por SUNAT',
  pide_descuento: 'Pidió descuento',
  pide_persona: 'Pidió hablar con una persona',
  molesto: 'Se puso molesto',
  no_se: 'No supo qué contestar',
}

/** Arranques típicos, para no tener que pensar qué escribir cada vez. */
const ATAJOS = [
  'Hola, información',
  'Buenas, tengo una bodega. ¿Cuánto cuesta?',
  'Tengo un restaurante con 2 locales, ¿me sirve?',
  '¿Están autorizados por SUNAT?',
  'Está caro, ¿me haces un descuento?',
  '¿Cómo hago un producto con varias presentaciones?',
]

/** El tipo de archivo, en cristiano. */
const TIPOS = { image: 'Imagen', video: 'Video', audio: 'Audio', document: 'Documento' }

/**
 * Lo que ve el modelo de una respuesta rápida ya mandada: sin esto, en el
 * mensaje siguiente no sabría que ya salió y la volvería a mandar.
 */
const paraElHistorial = (m) => {
  if (!m.rapida) return m.texto
  const archivo = m.rapida.media ? `, con ${String(TIPOS[m.rapida.media.tipo] || 'un archivo').toLowerCase()}` : ''
  return `[Mandé la respuesta rápida «${m.rapida.atajo}»${archivo}] ${m.rapida.texto || ''}`.trim()
}

/** El archivo de una respuesta rápida, como se vería en el WhatsApp. */
function ArchivoDeRapida({ media }) {
  if (!media?.url) return null
  if (media.tipo === 'image') {
    return <img src={media.thumbUrl || media.url} alt="" className="rounded-lg max-h-56 w-auto object-contain bg-white" />
  }
  if (media.tipo === 'video') {
    return <video src={media.url} controls preload="metadata" className="rounded-lg max-h-56 w-full bg-black" />
  }
  if (media.tipo === 'audio') {
    return <audio src={media.url} controls className="w-full" />
  }
  return (
    <a href={media.url} target="_blank" rel="noopener noreferrer"
      className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-primary-700 hover:bg-gray-50 truncate">
      Documento · {media.filename || 'archivo'}
    </a>
  )
}

export default function AdminAsistente() {
  useTituloAdmin('Asistente de ventas')
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState(null)
  const [automaticos, setAutomaticos] = useState(null)
  const [notas, setNotas] = useState({})
  const finRef = useRef(null)

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, pensando])
  useEffect(() => suscribirAutomaticos(setAutomaticos), [])

  // Las respuestas rápidas de la bandeja, una por atajo y solo las que dicen
  // algo: las mismas que el servidor le ofrece a la IA.
  const rapidas = useMemo(() => {
    const vistas = new Set()
    return (automaticos?.respuestasRapidas || []).filter((r) => {
      const atajo = String(r?.atajo || '').trim()
      if (!atajo || vistas.has(atajo) || (!String(r?.texto || '').trim() && !r?.media?.url)) return false
      vistas.add(atajo)
      return true
    })
  }, [automaticos])
  const ajustes = automaticos?.respuestasIA || {}
  const usables = rapidas.filter((r) => ajustes[String(r.atajo).trim()]?.usar !== false).length

  const guardarAjuste = async (atajo, cambio) => {
    try {
      setError(null)
      // Con merge se mezclan los mapas: solo cambia esta respuesta.
      await guardarAutomaticos({ respuestasIA: { [atajo]: { ...ajustes[atajo], ...cambio } } })
    } catch (e) {
      console.error('No se pudo guardar el ajuste de la IA:', e)
      setError('No se pudo guardar. Vuelve a intentarlo.')
    }
  }

  const enviar = async (loQueDigo) => {
    const dicho = String(loQueDigo ?? texto).trim()
    if (!dicho || pensando) return
    setError(null)
    setTexto('')

    // El eco optimista: el mensaje propio aparece al instante, como en
    // cualquier chat. Y el historial que se manda es ESTE, no el del estado,
    // que todavía no se ha actualizado cuando llega acá.
    const hilo = [...mensajes, { rol: 'cliente', texto: dicho }]
    setMensajes(hilo)
    setPensando(true)

    try {
      const idToken = await auth.currentUser?.getIdToken()
      if (!idToken) throw new Error('Se cerró la sesión: vuelve a entrar')
      const r = await fetch(FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ mensajes: hilo.map((m) => ({ rol: m.rol, texto: paraElHistorial(m) })) }),
      })
      const data = await r.json()
      if (!data.success) throw new Error(data.error || 'No se pudo responder')
      // Giacomo manda dos o tres mensajes seguidos en vez de uno largo, y el
      // asistente los separa con una línea de ---. Se parten acá para que en
      // pantalla se vean como llegarían al WhatsApp del cliente: en burbujas
      // sueltas. Verlo todo junto engaña sobre el ritmo real. Las respuestas
      // rápidas van después, cada una en su burbuja con su archivo.
      const trozos = String(data.texto || '')
        .split(/\n\s*-{3,}\s*\n/)
        .map((t) => t.trim())
        .filter(Boolean)
      const burbujas = [
        ...trozos.map((t) => ({ rol: 'asistente', texto: t })),
        ...(data.respuestas || []).map((rr) => ({ rol: 'asistente', texto: rr.texto || '', rapida: rr })),
      ]
      if (!burbujas.length) burbujas.push({ rol: 'asistente', texto: '(no dijo nada, solo quiso pasártela)' })

      setMensajes([...hilo, ...burbujas.map((b, i) => ({
        ...b,
        // El aviso de escalada y el costo van una sola vez, en la última.
        escalada: i === burbujas.length - 1 ? data.escalada : null,
        uso: i === burbujas.length - 1 ? data.uso : null,
      }))])
    } catch (e) {
      setError(e.message)
      setMensajes(hilo)
    } finally {
      setPensando(false)
    }
  }

  const costoAproximado = mensajes.reduce((t, m) => {
    if (!m.uso) return t
    // Precios de Sonnet por millón de tokens; lo leído de caché cuesta una
    // décima parte, que es justo lo que hace viable un guion de 20 KB.
    return t + (m.uso.entrada * 3 + m.uso.cacheEscrito * 3.75 + m.uso.cacheLeido * 0.3 + m.uso.salida * 15) / 1e6
  }, 0)

  return (
    <Pagina
      resumen={mensajes.length
        ? `${mensajes.filter((m) => m.rol === 'cliente').length} mensajes tuyos · USD ${costoAproximado.toFixed(4)} en total`
        : 'Escribe como si fueras un cliente que acaba de llegar por el anuncio'}
      acciones={mensajes.length > 0 && (
        <Boton variante="secundario" onClick={() => { setMensajes([]); setError(null) }}>
          Empezar de nuevo
        </Boton>
      )}
    >
      <Aviso tono="info">
        Esto no está conectado a WhatsApp. No hay ningún cliente al otro lado, así que
        prueba lo que quieras — incluido ponerte pesado, pedir descuentos o preguntar
        cosas raras. Ahí es donde se ve si sirve.
      </Aviso>

      <Seccion titulo="La conversación">
        <div className="flex flex-col gap-3 min-h-[280px] max-h-[52vh] overflow-y-auto px-1 py-2">
          {mensajes.length === 0 && !pensando && (
            <p className="text-[13px] text-gray-400 text-center py-10">
              Todavía no has escrito nada.
            </p>
          )}

          {mensajes.map((m, i) => (
            <div key={i} className={`flex ${m.rol === 'cliente' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[78%] flex flex-col gap-1.5">
                {m.rapida ? (
                  <div className="rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2.5 flex flex-col gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Respuesta rápida · {m.rapida.atajo}
                    </p>
                    <ArchivoDeRapida media={m.rapida.media} />
                    {m.rapida.texto && (
                      <p className="text-[14px] text-gray-900 whitespace-pre-wrap break-words">{m.rapida.texto}</p>
                    )}
                  </div>
                ) : (
                  <div className={`rounded-2xl px-3.5 py-2.5 text-[14px] whitespace-pre-wrap break-words ${
                    m.rol === 'cliente'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-900 rounded-bl-md'
                  }`}>
                    {m.texto}
                  </div>
                )}

                {m.escalada && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                      Te la quiso pasar — {MOTIVOS[m.escalada.motivo] || m.escalada.motivo}
                    </p>
                    <p className="text-[13px] text-amber-700 mt-0.5">{m.escalada.resumen}</p>
                  </div>
                )}

                {m.uso && (
                  <p className="text-[11px] text-gray-400 tabular-nums">
                    {m.uso.cacheLeido > 0 ? `${m.uso.cacheLeido} de caché · ` : ''}
                    {m.uso.salida} de respuesta
                  </p>
                )}
              </div>
            </div>
          ))}

          {pensando && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-gray-100 px-3.5 py-2.5 text-[14px] text-gray-400">
                escribiendo…
              </div>
            </div>
          )}
          <div ref={finRef} />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
            placeholder="Escribe como si fueras el cliente…"
            disabled={pensando}
            className="flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 disabled:bg-gray-50"
          />
          <Boton onClick={() => enviar()} disabled={pensando || !texto.trim()}>Enviar</Boton>
        </div>

        {mensajes.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {ATAJOS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => enviar(a)}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] text-gray-600 hover:bg-gray-50"
              >
                {a}
              </button>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Respuestas rápidas que puede usar"
        descripcion={automaticos === null
          ? 'Cargando…'
          : rapidas.length
            ? `Usa ${usables} de ${rapidas.length}. Las manda tal cual, con su archivo, cuando calzan con lo que pide el cliente.`
            : 'Todavía no tienes respuestas rápidas. Se crean en el chat, en la configuración de respuestas rápidas.'}
      >
        {rapidas.length > 0 && (
          <div className="divide-y divide-gray-100">
            {rapidas.map((r) => {
              const atajo = String(r.atajo).trim()
              const ajuste = ajustes[atajo] || {}
              const nota = notas[atajo] ?? ajuste.cuando ?? ''
              return (
                <div key={atajo} className="py-3 flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">
                      {atajo}
                      {r.media?.url && (
                        <span className="ml-2 text-[11px] font-normal text-gray-500">
                          {TIPOS[r.media.tipo] || 'Archivo'}
                        </span>
                      )}
                    </p>
                    <Casilla
                      etiqueta="La IA puede usarla"
                      checked={ajuste.usar !== false}
                      onChange={(e) => guardarAjuste(atajo, { usar: e.target.checked })}
                    />
                  </div>
                  {r.texto && (
                    <p className="text-[12.5px] text-gray-600 line-clamp-2 whitespace-pre-wrap">{r.texto}</p>
                  )}
                  <Campo etiqueta="Cuándo usarla (opcional)">
                    <Entrada
                      value={nota}
                      onChange={(e) => setNotas((n) => ({ ...n, [atajo]: e.target.value }))}
                      onBlur={() => {
                        if (nota.trim() !== String(ajuste.cuando || '').trim()) guardarAjuste(atajo, { cuando: nota.trim() })
                      }}
                      placeholder="Por ejemplo: cuando pregunten precios"
                      disabled={ajuste.usar === false}
                    />
                  </Campo>
                </div>
              )
            })}
          </div>
        )}
      </Seccion>
    </Pagina>
  )
}
