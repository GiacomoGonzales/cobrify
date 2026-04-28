import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

// Descarga un data URL (p.ej. el de QRCode.toDataURL) en web o nativo.
// En Android/iOS escribe el archivo en Cache y abre el diálogo de compartir
// para que el usuario lo guarde/envíe. En web dispara la descarga normal.
export async function downloadDataUrl(dataUrl, filename, shareOptions = {}) {
  if (!dataUrl) throw new Error('dataUrl vacío')

  if (Capacitor.isNativePlatform()) {
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
    const saved = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache
    })
    await Share.share({
      title: shareOptions.title || filename,
      url: saved.uri,
      dialogTitle: shareOptions.dialogTitle || 'Guardar o compartir'
    })
    return
  }

  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Descarga un archivo desde una URL remota (ej. Firebase Storage) y lo guarda
 * en el dispositivo. En native usa Filesystem + Share. En web crea un blob URL
 * y dispara la descarga del navegador (mismo comportamiento de antes).
 *
 * Reemplaza al patrón clásico:
 *   const blob = await fetch(url).then(r => r.blob())
 *   const blobUrl = URL.createObjectURL(blob)
 *   const a = document.createElement('a'); a.href = blobUrl; a.download = filename; a.click()
 *
 * que NO funciona dentro del WebView de Capacitor.
 */
export async function downloadFromUrl(url, filename, shareOptions = {}) {
  if (!url) throw new Error('URL vacía')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const blob = await response.blob()
  return downloadBlob(blob, filename, shareOptions)
}

/**
 * Descarga un Blob ya cargado en memoria (ej. resultado de generar un XML
 * en cliente). Native usa Filesystem + Share, web usa createObjectURL + <a>.
 */
export async function downloadBlob(blob, filename, shareOptions = {}) {
  if (!blob) throw new Error('Blob vacío')

  if (Capacitor.isNativePlatform()) {
    // Convertir blob a base64 para Filesystem.writeFile
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result
        const base64 = typeof result === 'string' && result.includes(',')
          ? result.split(',')[1]
          : result
        resolve(base64)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })

    const saved = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    })

    await Share.share({
      title: shareOptions.title || filename,
      url: saved.uri,
      dialogTitle: shareOptions.dialogTitle || 'Guardar o compartir',
    })
    return
  }

  // Web: descarga clásica
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

// Guarda múltiples archivos. En nativo los escribe a Directory.Documents
// (persistentes, accesibles desde el administrador de archivos) y NO abre
// N diálogos de compartir. En web dispara una descarga por cada uno.
// files: Array<{ dataUrl: string, filename: string }>
// Returns: { nativeFolder: string | null, count: number }
export async function saveFilesToDevice(files) {
  if (!files?.length) return { nativeFolder: null, count: 0 }

  if (Capacitor.isNativePlatform()) {
    for (const { dataUrl, filename } of files) {
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
      await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents
      })
    }
    return { nativeFolder: 'Documents', count: files.length }
  }

  files.forEach(({ dataUrl, filename }, index) => {
    setTimeout(() => {
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }, index * 200)
  })
  return { nativeFolder: null, count: files.length }
}
