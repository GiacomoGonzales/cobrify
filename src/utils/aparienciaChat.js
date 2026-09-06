import { useEffect, useState } from 'react'

/**
 * El fondo de la conversación, igual que en la app del iPhone: los mismos
 * fondos, la misma foto propia y el mismo control para atenuarla.
 *
 * Vive en ESTE navegador (localStorage), no en Firestore: es gusto personal,
 * no un dato del negocio — el mismo criterio que en el teléfono, donde se
 * guarda en los ajustes del dispositivo. Por eso el fondo del iPhone y el de
 * la web se eligen por separado.
 */
const CLAVE_FONDO = 'chatFondo'
const CLAVE_BURBUJA = 'chatBurbuja'
const CLAVE_FOTO = 'chatFondoFoto'
const CLAVE_ATENUAR = 'chatFondoAtenuar'
const EVENTO = 'apariencia-chat'

/** Los mismos fondos y en el mismo orden que en el iPhone. */
export const FONDOS = [
  { id: 'foto', nombre: 'Tu foto', claros: [], oscuros: [] },
  { id: 'clasico', nombre: 'Clásico', claros: [], oscuros: [] },
  { id: 'beige', nombre: 'Beige WhatsApp', claros: ['#EFE7DD', '#E3D9CC'], oscuros: ['#0B141A', '#060E12'] },
  { id: 'verde', nombre: 'Verde suave', claros: ['#DCF3E3', '#C2E8CF'], oscuros: ['#0E241A', '#081A12'] },
  { id: 'azul', nombre: 'Cielo', claros: ['#DDEBF7', '#C3DCF0'], oscuros: ['#0D1B2A', '#091420'] },
  { id: 'morado', nombre: 'Lavanda', claros: ['#EAE2F5', '#D8CBEC'], oscuros: ['#1B1030', '#120A22'] },
  { id: 'noche', nombre: 'Noche', claros: ['#1C2733', '#10161D'], oscuros: ['#1C2733', '#10161D'] },
]

/** Los mismos colores de burbuja que en el iPhone. */
export const BURBUJAS = [
  { id: 'verde', nombre: 'Verde', hex: '#25BC6A' },
  { id: 'azul', nombre: 'Azul', hex: '#2D7FF9' },
  { id: 'morado', nombre: 'Morado', hex: '#7C3AED' },
  { id: 'naranja', nombre: 'Naranja', hex: '#EA7C1C' },
  { id: 'rosa', nombre: 'Rosa', hex: '#DB2777' },
]

/** "#25BC6A" -> [37, 188, 106]. Null si no es un color válido. */
function aRGB(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex.trim())) return null
  const v = parseInt(hex.trim().slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** El color elegido, sea uno de la paleta o uno propio ("#RRGGBB"). */
export function hexDeBurbuja(burbujaId) {
  if (aRGB(burbujaId)) return burbujaId
  return (BURBUJAS.find((b) => b.id === burbujaId) || BURBUJAS[0]).hex
}

/** Si lo guardado es un color propio y no uno de los cinco de la paleta. */
export function esColorPropio(burbujaId) {
  return Boolean(aRGB(burbujaId))
}

/** Los dos colores de texto que usa la bandeja. */
const TEXTO_OSCURO = [10, 37, 64]
const TEXTO_CLARO = [230, 237, 243]

/** Luminancia relativa (WCAG), para medir el contraste. */
function luz(c) {
  const [r, g, b] = c.map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a, b) {
  const [alto, bajo] = [luz(a), luz(b)].sort((x, y) => y - x)
  return (alto + 0.05) / (bajo + 0.05)
}

const css = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`

/**
 * El mismo color, más apagado. Para la hora y las palomitas dentro de TU
 * burbuja: WhatsApp las pone del color del texto pero atenuadas, no en un
 * gris fijo — un gris fijo se pierde sobre un fondo oscuro.
 */
/**
 * El azul de las palomitas de "leído", el mismo gesto de WhatsApp pero
 * elegido según la burbuja: el celeste clarito se ve sobre un fondo oscuro y
 * desaparece sobre uno claro (1,7 de contraste), así que ahí va un azul
 * profundo.
 */
export function azulLeido(fondoCss) {
  const n = String(fondoCss).match(/\d+/g)
  if (!n || n.length < 3) return '#53BDEB'
  return luz([+n[0], +n[1], +n[2]]) > 0.35 ? '#075E8D' : '#53BDEB'
}

export function colorTenue(colorCss, alfa = 0.7) {
  const n = String(colorCss).match(/\d+/g)
  if (!n || n.length < 3) return colorCss
  return `rgba(${n[0]}, ${n[1]}, ${n[2]}, ${alfa})`
}

/**
 * El texto que mejor se lee sobre ese fondo, y el fondo corregido si hiciera
 * falta.
 *
 * Con un color elegido a mano puede tocar cualquier tono: uno muy claro deja
 * ilegible el texto claro, y uno intermedio no se lleva bien con ninguno de
 * los dos. Se elige el texto que más contrasta y, solo si aun así no llega a
 * 4,5, se aleja el fondo un pasito a la vez. El tono no cambia; casi todos
 * los colores no se mueven nada.
 */
function legible(fondo) {
  const haciaOscuro = contraste(fondo, TEXTO_CLARO) >= contraste(fondo, TEXTO_OSCURO)
  const texto = haciaOscuro ? TEXTO_CLARO : TEXTO_OSCURO
  const destino = haciaOscuro ? [0, 0, 0] : [255, 255, 255]
  let actual = fondo
  for (let i = 0; i < 14 && contraste(actual, texto) < 4.5; i += 1) {
    actual = actual.map((x, k) => Math.round(x * 0.94 + destino[k] * 0.06))
  }
  return { fondo: actual, texto }
}

/**
 * El relleno, el borde y el color de letra de TU burbuja.
 *
 * Con uno de los cinco de la paleta se hace lo mismo que en el iPhone: pastel
 * de día, profundo de noche — que es como se ve WhatsApp.
 *
 * Con un color elegido a mano se usa TAL CUAL, en los dos temas. Antes se le
 * aplicaba la misma mezcla que a la paleta y por eso un verde oscuro salía
 * pálido: el círculo mostraba un color y la burbuja otro (reporte de
 * Giacomo). Lo que eliges es lo que se ve.
 */
export function estiloBurbuja(burbujaId, oscuro = false) {
  const hex = hexDeBurbuja(burbujaId)
  const crudo = aRGB(hex) || aRGB(BURBUJAS[0].hex)

  const base = esColorPropio(burbujaId)
    ? crudo
    : crudo.map((x, i) => {
      const b = oscuro ? [13, 20, 18] : [255, 255, 255]
      const p = oscuro ? 0.4 : 0.22
      return Math.round(x * p + b[i] * (1 - p))
    })

  const { fondo, texto } = legible(base)
  // El borde, un pelín más marcado que el relleno, para que la burbuja se
  // recorte del fondo aunque el fondo sea del mismo tono.
  const haciaOscuro = luz(fondo) > 0.4
  const borde = fondo.map((x) => Math.round(haciaOscuro ? x * 0.88 : x * 0.92 + 255 * 0.08))

  return { backgroundColor: css(fondo), borderColor: css(borde), color: css(texto) }
}

export function leerApariencia() {
  let atenuar = Number(localStorage.getItem(CLAVE_ATENUAR))
  if (!Number.isFinite(atenuar)) atenuar = 0.08
  return {
    fondoId: localStorage.getItem(CLAVE_FONDO) || 'clasico',
    burbujaId: localStorage.getItem(CLAVE_BURBUJA) || 'verde',
    foto: localStorage.getItem(CLAVE_FOTO) || '',
    atenuar: Math.min(0.6, Math.max(0, atenuar)),
  }
}

/** Guarda y avisa a quien esté mirando (la bandeja se pinta al instante). */
export function guardarApariencia(cambios) {
  if (cambios.fondoId !== undefined) localStorage.setItem(CLAVE_FONDO, cambios.fondoId)
  if (cambios.burbujaId !== undefined) localStorage.setItem(CLAVE_BURBUJA, cambios.burbujaId)
  if (cambios.atenuar !== undefined) localStorage.setItem(CLAVE_ATENUAR, String(cambios.atenuar))
  if (cambios.foto !== undefined) {
    if (cambios.foto) localStorage.setItem(CLAVE_FOTO, cambios.foto)
    else localStorage.removeItem(CLAVE_FOTO)
  }
  window.dispatchEvent(new Event(EVENTO))
}

export function useApariencia() {
  const [valor, setValor] = useState(leerApariencia)
  useEffect(() => {
    const alCambiar = () => setValor(leerApariencia())
    window.addEventListener(EVENTO, alCambiar)
    // `storage` es para las OTRAS pestañas: el navegador no lo dispara en la
    // que hizo el cambio.
    window.addEventListener('storage', alCambiar)
    return () => {
      window.removeEventListener(EVENTO, alCambiar)
      window.removeEventListener('storage', alCambiar)
    }
  }, [])
  return valor
}

/**
 * El estilo que se le pone al hilo de mensajes. Devuelve {} para el fondo
 * "Clásico": ahí manda el color de siempre.
 *
 * El velo oscuro va como un degradado plano ENCIMA de la foto, en la misma
 * propiedad: así no hace falta otra capa en el HTML. De noche siempre un
 * poco más, o los mensajes no se leen.
 */
export function estiloFondo({ fondoId, foto, atenuar }, oscuro = false) {
  if (fondoId === 'foto') {
    if (!foto) return {}
    const velo = oscuro ? Math.min(0.85, atenuar + 0.3) : atenuar
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,${velo}), rgba(0,0,0,${velo})), url(${foto})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }
  const f = FONDOS.find((x) => x.id === fondoId)
  const colores = (oscuro ? f?.oscuros : f?.claros) || []
  if (!colores.length) return {}
  return { backgroundImage: `linear-gradient(to bottom, ${colores.join(', ')})` }
}

/**
 * Deja la foto lista para guardarla: la achica y la pasa a JPEG.
 *
 * Hace falta porque el navegador solo guarda unos pocos MB por sitio y una
 * foto de cámara son varios. Si aun así sale grande, se vuelve a comprimir
 * más fuerte antes de rendirse.
 */
export function prepararFoto(file, maxLado = 1600) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onerror = () => reject(new Error('No se pudo leer la foto.'))
    lector.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Ese archivo no es una foto.'))
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight))
        const lienzo = document.createElement('canvas')
        lienzo.width = Math.round(img.naturalWidth * escala)
        lienzo.height = Math.round(img.naturalHeight * escala)
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height)
        let datos = lienzo.toDataURL('image/jpeg', 0.82)
        // ~3 MB de texto es el techo prudente para localStorage.
        if (datos.length > 3_000_000) datos = lienzo.toDataURL('image/jpeg', 0.6)
        resolve(datos)
      }
      img.src = lector.result
    }
    lector.readAsDataURL(file)
  })
}
