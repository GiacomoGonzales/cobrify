/**
 * Texto de un mensaje con el formato de WhatsApp.
 *
 * WhatsApp marca el formato con caracteres: *negrita*, _cursiva_, ~tachado~ y
 * ```monoespaciado```. El cliente los escribe así y su app se los muestra
 * formateados; si la bandeja no los interpreta, el admin ve los asteriscos
 * pelados. Además vuelve clicables los enlaces, que era lo más visible que
 * faltaba.
 *
 * Sin dependencias ni HTML inyectado: el texto se parte en pedazos y cada
 * pedazo se renderiza como elemento de React. Lo que no coincide con nada
 * queda como texto plano tal cual.
 */

const PATRON = new RegExp(
  [
    'https?:\\/\\/[^\\s<>"]+',      // enlaces
    '\\*[^*\\n]+\\*',               // *negrita*
    '_[^_\\n]+_',                   // _cursiva_
    '~[^~\\n]+~',                   // ~tachado~
    '```[^`]+```',                  // ```mono```
  ].join('|'),
  'g',
)

export default function TextoWhatsapp({ texto, claseEnlace }) {
  if (!texto) return null

  const partes = []
  let cursor = 0
  let clave = 0

  for (const m of String(texto).matchAll(PATRON)) {
    if (m.index > cursor) partes.push(texto.slice(cursor, m.index))
    const t = m[0]

    if (t.startsWith('http')) {
      // El punto o coma final suele ser puntuación de la frase, no del enlace.
      const limpio = t.replace(/[).,;!?]+$/, '')
      const resto = t.slice(limpio.length)
      partes.push(
        <a
          key={clave++}
          href={limpio}
          target="_blank"
          rel="noopener noreferrer"
          className={claseEnlace || 'underline break-all'}
        >
          {limpio}
        </a>,
      )
      if (resto) partes.push(resto)
    } else if (t.startsWith('```')) {
      partes.push(
        <code key={clave++} className="font-mono text-[13px] bg-black/10 rounded px-1">
          {t.slice(3, -3)}
        </code>,
      )
    } else if (t.startsWith('*')) {
      partes.push(<strong key={clave++}>{t.slice(1, -1)}</strong>)
    } else if (t.startsWith('_')) {
      partes.push(<em key={clave++}>{t.slice(1, -1)}</em>)
    } else if (t.startsWith('~')) {
      partes.push(<s key={clave++}>{t.slice(1, -1)}</s>)
    }
    cursor = m.index + t.length
  }
  if (cursor < texto.length) partes.push(texto.slice(cursor))

  return <p className="text-sm whitespace-pre-wrap break-words">{partes}</p>
}

/** Tarjeta de vista previa de un enlace, como la muestra WhatsApp. */
export function TarjetaEnlace({ vista, mio }) {
  if (!vista) return null
  return (
    <a
      href={vista.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-lg overflow-hidden mb-1 ${
        mio ? 'bg-green-700/50' : 'bg-gray-100'
      }`}
    >
      {vista.imagen && (
        <img
          src={vista.imagen}
          alt=""
          loading="lazy"
          className="w-full max-h-40 object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}
      <div className="px-3 py-2">
        <p className={`text-sm font-semibold leading-snug line-clamp-2 ${mio ? 'text-white' : 'text-gray-900'}`}>
          {vista.titulo}
        </p>
        {vista.descripcion && (
          <p className={`text-xs mt-0.5 line-clamp-2 ${mio ? 'text-green-100' : 'text-gray-500'}`}>
            {vista.descripcion}
          </p>
        )}
        <p className={`text-[11px] mt-1 ${mio ? 'text-green-200' : 'text-gray-400'}`}>
          {vista.sitio}
        </p>
      </div>
    </a>
  )
}
