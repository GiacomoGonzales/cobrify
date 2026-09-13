/**
 * Texto de un mensaje con el formato de WhatsApp.
 *
 * WhatsApp marca el formato con caracteres: *negrita*, _cursiva_, ~tachado~ y
 * ```monoespaciado```. El cliente los escribe así y su app se los muestra
 * formateados; si la bandeja no los interpreta, el admin ve los asteriscos
 * pelados. Además vuelve clicables los enlaces, los correos (mailto: el clic
 * derecho del navegador ofrece "Copiar dirección de correo") y los teléfonos
 * (con `alTocarTelefono`, el clic se lo pasa a la pantalla, que lo copia).
 *
 * Sin dependencias ni HTML inyectado: el texto se parte en pedazos y cada
 * pedazo se renderiza como elemento de React. Lo que no coincide con nada
 * queda como texto plano tal cual.
 */

const CORREO = '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'

// Un celular peruano (nueve cifras que empiezan en 9, pegadas o de a tres, con
// o sin +51) o cualquier número con + y código de país.
const TELEFONO =
  '(?:\\+?51[ -]?)?9[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{3}' +
  '|\\+[0-9]{1,3}(?:[ -]?\\([0-9]{1,4}\\))?[ -]?[0-9]{1,4}(?:[ -]?[0-9]{2,4}){1,5}'

// Mismo orden que la app del iPhone (TextoWhatsapp.swift): el enlace primero y
// el correo enseguida, para que un `_` de juan_perez@gmail.com no sea cursiva.
// El teléfono después del correo: 987654321@gmail.com es un correo.
const PATRON = new RegExp(
  [
    'https?:\\/\\/[^\\s<>"]+',      // enlaces
    CORREO,                         // correos
    TELEFONO,                       // teléfonos
    '\\*[^*\\n]+\\*',               // *negrita*
    '_[^_\\n]+_',                   // _cursiva_
    '~[^~\\n]+~',                   // ~tachado~
    '```[^`]+```',                  // ```mono```
  ].join('|'),
  'g',
)

/** El tramo ES un correo, y no una _cursiva_ que lo contiene. */
const CORREO_ENTERO = new RegExp(`^${CORREO}$`)
const TELEFONO_ENTERO = new RegExp(`^(?:${TELEFONO})$`)

// Letra o cifra de cualquier alfabeto: lo mismo que CharacterSet.alphanumerics
// en el iPhone.
const LETRA_O_CIFRA = /[\p{L}\p{M}\p{N}]/u
const letraOCifra = (c) => c !== undefined && LETRA_O_CIFRA.test(c)

/**
 * El número limpio, para copiarlo y para llamar: 987654321, +51987654321,
 * +13055551234. Null si no da para teléfono: menos de 8 cifras o más de 15.
 */
function limpiarTelefono(t) {
  const cifras = t.replace(/[^0-9]/g, '')
  if (cifras.length < 8 || cifras.length > 15) return null
  // Con código de país, siempre con +: 51987654321 pelado no se puede marcar
  // desde un celular peruano.
  return t.startsWith('+') || cifras.length === 11 ? `+${cifras}` : cifras
}

export default function TextoWhatsapp({ texto, claseEnlace, alTocarTelefono }) {
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
    } else if (CORREO_ENTERO.test(t)) {
      partes.push(
        <a key={clave++} href={`mailto:${t}`} className={claseEnlace || 'underline break-all'}>
          {t}
        </a>,
      )
    } else if (TELEFONO_ENTERO.test(t)) {
      // Pegado a letras o a más cifras no es un teléfono: es parte de un RUC,
      // una cuenta o un código, y se queda como texto.
      const pegado = letraOCifra(texto[m.index - 1]) || letraOCifra(texto[m.index + t.length])
      const limpio = pegado ? null : limpiarTelefono(t)
      // Sin cortes a mitad del número (whitespace-nowrap): "987 654" arriba y
      // "321" abajo parecen dos.
      partes.push(
        limpio ? (
          <a
            key={clave++}
            href={`tel:${limpio}`}
            title={alTocarTelefono ? 'Copiar número' : undefined}
            onClick={alTocarTelefono ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              alTocarTelefono(limpio)
            } : undefined}
            className={`${claseEnlace || 'underline'} whitespace-nowrap`}
          >
            {t}
          </a>
        ) : t,
      )
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

  // El cuerpo del mensaje se queda en 14: es lo que mas se lee de la pantalla.
  return <p className="text-[14px] leading-snug whitespace-pre-wrap break-words">{partes}</p>
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
        mio ? 'bg-white/70' : 'bg-gray-100'
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
        <p className={`text-[13px] font-semibold leading-snug line-clamp-2 ${'text-gray-900'}`}>
          {vista.titulo}
        </p>
        {vista.descripcion && (
          <p className={`text-[11.5px] mt-0.5 line-clamp-2 ${'text-gray-500'}`}>
            {vista.descripcion}
          </p>
        )}
        <p className={`text-[11px] mt-1 ${'text-gray-400'}`}>
          {vista.sitio}
        </p>
      </div>
    </a>
  )
}
