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
