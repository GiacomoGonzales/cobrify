import { useState, useEffect } from 'react'

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

  useEffect(() => {
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
  }, [url])

  if (!datos) return null

  return (
    <img
      src={datos.imagen}
      alt="Primera página del documento"
      className="w-full max-h-44 object-cover object-top bg-white"
    />
  )
}
