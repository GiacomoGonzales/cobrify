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

/** Mezcla dos colores. `proporcion` es cuánto sobrevive del primero. */
function mezclar(hex, base, proporcion) {
  const v = parseInt(hex.replace('#', ''), 16)
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  const r = c.map((x, i) => Math.round(x * proporcion + base[i] * (1 - proporcion)))
  return `rgb(${r[0]}, ${r[1]}, ${r[2]})`
}

/**
 * El relleno y el borde de TU burbuja: pastel de día, profundo de noche.
 *
 * Las proporciones son las mismas que usa la app del iPhone
 * (`Apariencia.fondoBurbuja`), para que el mismo color se vea igual en las
 * dos pantallas.
 */
export function estiloBurbuja(burbujaId, oscuro = false) {
  const hex = (BURBUJAS.find((b) => b.id === burbujaId) || BURBUJAS[0]).hex
  const base = oscuro ? [13, 20, 18] : [255, 255, 255]
  return {
    backgroundColor: mezclar(hex, base, oscuro ? 0.4 : 0.22),
    borderColor: mezclar(hex, base, oscuro ? 0.55 : 0.38),
  }
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
