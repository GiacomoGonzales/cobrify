import { useState, useRef, useEffect } from 'react'
import { auth } from '@/lib/firebase'
import { Pagina, Seccion, Boton, Aviso, useTituloAdmin } from '@/components/admin/ui'

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

export default function AdminAsistente() {
  useTituloAdmin('Asistente de ventas')
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState(null)
  const finRef = useRef(null)

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, pensando])

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
        body: JSON.stringify({ mensajes: hilo.map(({ rol, texto: t }) => ({ rol, texto: t })) }),
      })
      const data = await r.json()
      if (!data.success) throw new Error(data.error || 'No se pudo responder')
      // Giacomo manda dos o tres mensajes seguidos en vez de uno largo, y el
      // asistente los separa con una línea de ---. Se parten acá para que en
      // pantalla se vean como llegarían al WhatsApp del cliente: en burbujas
      // sueltas. Verlo todo junto engaña sobre el ritmo real.
      const trozos = String(data.texto || '')
        .split(/\n\s*-{3,}\s*\n/)
        .map((t) => t.trim())
        .filter(Boolean)
      const burbujas = trozos.length ? trozos : ['(no dijo nada, solo quiso pasártela)']

      setMensajes([...hilo, ...burbujas.map((t, i) => ({
        rol: 'asistente',
        texto: t,
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
                <div className={`rounded-2xl px-3.5 py-2.5 text-[14px] whitespace-pre-wrap break-words ${
                  m.rol === 'cliente'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-900 rounded-bl-md'
                }`}>
                  {m.texto}
                </div>

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
    </Pagina>
  )
}
