/**
 * La firma del paciente al usar una sesión de su paquete.
 *
 * Pedido de Adara (9-set-2026): "que quede en evidencia que ha firmado para
 * su primera sesión; solamente que firme". No es un consentimiento con texto
 * legal: es el registro de que se atendió ESA sesión. Por eso la pantalla dice
 * solo "Sesión 2 de 5: firma del paciente" y el lienzo.
 *
 * La firma viaja dentro del uso (`uses[]` del paquete), como PNG en base64,
 * igual que el consentimiento guarda la suya. Antes de guardarla se reduce:
 * el lienzo dibuja a la densidad de la pantalla y un celular moderno produce
 * un PNG de más de 1000 px de ancho; diez firmas así en un mismo paquete
 * pesan de más para un solo documento.
 */
import { firmaValida } from './consentimiento'

/** La sesión que se está por usar: la siguiente a las ya usadas. */
export function numeroDeSesion(paquete) {
  return (Number(paquete?.sessionsUsed) || 0) + 1
}

/** Lo único que lee el paciente antes de firmar. */
export function tituloDeFirma(paquete) {
  const n = numeroDeSesion(paquete)
  const total = Number(paquete?.sessionsTotal) || 0
  return total > 0 ? `Sesión ${n} de ${total}: firma del paciente` : `Sesión ${n}: firma del paciente`
}

/** ¿Este uso quedó con la firma del paciente? */
export function usoFirmado(uso) {
  return firmaValida(uso?.firma)
}

/**
 * Reduce la firma a un ancho manejable antes de guardarla. Si algo falla
 * (no hay canvas, la imagen no carga) devuelve la original: mejor una firma
 * pesada que ninguna.
 */
export function reducirFirma(dataUrl, anchoMax = 600) {
  return new Promise((resolve) => {
    if (!firmaValida(dataUrl) || typeof document === 'undefined') return resolve(dataUrl)
    const img = new Image()
    img.onload = () => {
      try {
        if (img.width <= anchoMax) return resolve(dataUrl)
        const escala = anchoMax / img.width
        const canvas = document.createElement('canvas')
        canvas.width = anchoMax
        canvas.height = Math.round(img.height * escala)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      } catch (e) {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
