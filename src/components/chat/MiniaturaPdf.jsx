import { useState, useEffect, useRef } from 'react'

/**
 * Miniatura de la primera página de un PDF, como la muestra WhatsApp.
 *
 * Se dibuja EN EL NAVEGADOR con pdfjs: el PDF ya está en nuestro
 * almacenamiento (R2, con CORS abierto), así que no hace falta ningún
 * servidor. Funciona igual para los enviados y los recibidos.
 *
 * pdfjs se carga por import dinámico SOLO cuando hay un PDF a la vista:
 * quien nunca recibe documentos no descarga la librería.
 *
 * Cache en memoria por URL: la lista re-renderiza seguido y el trabajo de
 * rasterizar se hace una sola vez por documento.
 */
const cache = new Map()

async function renderizar(url) {
  if (cache.has(url)) return cache.get(url)

  const promesa = (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default

    // Se baja el archivo una vez: los bytes dan el tamaño exacto y pdfjs
    // trabaja sobre ellos sin una segunda descarga.
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const bytes = await res.arrayBuffer()
    const tamano = bytes.byteLength

    const doc = await pdfjs.getDocument({ data: bytes }).promise
    const pagina = await doc.getPage(1)

    // Ancho fijo de miniatura: suficiente para la tarjeta, liviano en memoria.
    const escala = 480 / pagina.getViewport({ scale: 1 }).width
    const viewport = pagina.getViewport({ scale: escala })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

    const resultado = {
      imagen: canvas.toDataURL('image/jpeg', 0.8),
      paginas: doc.numPages,
      tamano,
    }
    doc.destroy()
    return resultado
  })()

  cache.set(url, promesa)
  promesa.catch(() => cache.delete(url))
  return promesa
}

export function formatoKB(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function MiniaturaPdf({ url, onDatos }) {
  const [datos, setDatos] = useState(null)
  const contenedor = useRef(null)
  const [visible, setVisible] = useState(false)

  // Solo se dibuja cuando el documento está por entrar en pantalla. Antes se
  // rasterizaban TODOS los PDF del hilo al abrir la conversación: cada uno se
  // descarga entero para poder dibujar su primera página, así que una
  // conversación con varios documentos se volvía lentísima al abrirla.
  useEffect(() => {
    const nodo = contenedor.current
    if (!nodo || visible) return undefined
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        setVisible(true)
        obs.disconnect()
      }
    }, { rootMargin: '300px' })
    obs.observe(nodo)
    return () => obs.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return undefined
    let vivo = true
    renderizar(url)
      .then((d) => {
        if (!vivo) return
        setDatos(d)
        onDatos?.(d)
      })
      .catch(() => { /* sin miniatura: la tarjeta simple sigue funcionando */ })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, visible])

  // El div vacío es el que el observador vigila: sin él no habría nada en el
  // DOM que avisara que el documento entró en pantalla.
  if (!datos) return <div ref={contenedor} className="h-px" />

  return (
    <img
      ref={contenedor}
      src={datos.imagen}
      alt="Primera página del documento"
      loading="lazy"
      className="w-full max-h-44 object-cover object-top bg-white"
    />
  )
}
