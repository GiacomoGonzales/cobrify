/**
 * Texto "ransom note": cada letra con otra tipografía, girada y desplazada,
 * como recortada de una revista y pegada con goma. Es la firma del tema Zine.
 *
 * Las variaciones son DETERMINISTAS (salen del índice de la letra, no de
 * Math.random): así el nombre de la tienda se ve igual en cada carga y en cada
 * dispositivo. Un nombre que baila distinto en cada visita parece un error de
 * render, no un estilo.
 */

// Las mismas seis voces del original: máquina de escribir, palo seco
// condensado, monoespaciada, cómic, serif y titular.
const FUENTES = [
  "'Special Elite', monospace",
  "'Bebas Neue', sans-serif",
  "'Anonymous Pro', monospace",
  "'Bangers', sans-serif",
  'Georgia, serif',
  'Impact, sans-serif',
]

export default function RansomText({
  text = '',
  tamano = 'clamp(2.25rem, 8vw, 5rem)',
  colorFondo = '#0A0A0A',
  colorTexto = '#EFEDE6',
  colorNormal = '#0A0A0A',
}) {
  const letras = String(text || '').split('')

  return (
    <span className="inline-flex flex-wrap items-baseline justify-center" style={{ lineHeight: 1 }}>
      {letras.map((char, i) => {
        // El espacio no se pinta: solo separa, y si llevara recuadro se vería
        // un bloque negro suelto en medio del nombre.
        if (char === ' ') return <span key={i} style={{ width: '0.4em' }} />

        const giro = ((i * 37) % 14) - 7        // -7° a +6°
        const salto = ((i * 23) % 8) - 4        // -4px a +3px
        const resaltada = i % 4 === 0           // una de cada cuatro, en negativo

        return (
          <span
            key={i}
            style={{
              fontFamily: FUENTES[(i * 5) % FUENTES.length],
              transform: `rotate(${giro}deg) translateY(${salto}px)`,
              display: 'inline-block',
              padding: '0 0.04em',
              backgroundColor: resaltada ? colorFondo : 'transparent',
              color: resaltada ? colorTexto : colorNormal,
              fontSize: tamano,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {char}
          </span>
        )
      })}
    </span>
  )
}
