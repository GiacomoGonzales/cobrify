import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Servicio para manejar la pantalla secundaria de cliente (iMin Swan 2)
 * Usa la Android Presentation API para renderizar en la segunda pantalla
 * En web/emulador: todo es no-op silencioso
 */

const CustomerDisplay = registerPlugin('CustomerDisplay')

let isDisplayAvailable = false
let isDisplayActive = false

/**
 * Verificar si hay segunda pantalla disponible
 */
export const checkAvailability = async () => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false
  }
  try {
    const result = await CustomerDisplay.isAvailable()
    isDisplayAvailable = result?.available || false
    return isDisplayAvailable
  } catch (e) {
    console.warn('CustomerDisplay: checkAvailability failed', e)
    return false
  }
}

/**
 * Inicializar la pantalla de cliente con configuración de branding
 * @param {Object} config - { primaryColor, accentColor, companyName, logoUrl }
 */
export const initializeDisplay = async (config) => {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const available = await checkAvailability()
    if (!available) return false

    await CustomerDisplay.show({
      primaryColor: config.primaryColor || '#1e40af',
      accentColor: config.accentColor || '#f59e0b',
      companyName: config.companyName || '',
      logoUrl: config.logoUrl || '',
    })
    isDisplayActive = true
    return true
  } catch (e) {
    console.warn('CustomerDisplay: initializeDisplay failed', e)
    return false
  }
}

/**
 * Actualizar el carrito en la pantalla de cliente
 * @param {Array} cart - Items del carrito
 * @param {Object} amounts - { subtotal, igv, discount, total }
 */
export const updateCart = async (cart, amounts) => {
  if (!isDisplayActive) return
  try {
    const items = cart.map(item => ({
      name: item.name + (item.variantName ? ` (${item.variantName})` : ''),
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity,
      imageUrl: item.imageUrl || '',
    }))

    await CustomerDisplay.sendUpdate({
      state: 'cart',
      items: JSON.stringify(items),
      subtotal: amounts.subtotal || 0,
      igv: amounts.igv || 0,
      discount: amounts.discount || 0,
      total: amounts.total || 0,
    })
  } catch (e) {
    console.warn('CustomerDisplay: updateCart failed', e)
  }
}

/**
 * Mostrar pantalla de bienvenida (idle)
 */
export const showWelcome = async () => {
  if (!isDisplayActive) return
  try {
    await CustomerDisplay.sendUpdate({
      state: 'idle',
    })
  } catch (e) {
    console.warn('CustomerDisplay: showWelcome failed', e)
  }
}

/**
 * Mostrar pantalla de venta completada
 * @param {number} total - Total de la venta
 * @param {string} invoiceNumber - Número de comprobante
 * @param {string} documentType - Tipo de documento (boleta, factura, nota_venta)
 */
export const showCompleted = async (total, invoiceNumber, documentType) => {
  if (!isDisplayActive) return
  try {
    await CustomerDisplay.sendUpdate({
      state: 'completed',
      total: total || 0,
      invoiceNumber: invoiceNumber || '',
      documentType: documentType || '',
    })
  } catch (e) {
    console.warn('CustomerDisplay: showCompleted failed', e)
  }
}

/**
 * Cerrar la pantalla de cliente
 */
export const hideDisplay = async () => {
  if (!isDisplayActive) return
  try {
    await CustomerDisplay.hide()
    isDisplayActive = false
  } catch (e) {
    console.warn('CustomerDisplay: hideDisplay failed', e)
  }
}

export const isActive = () => isDisplayActive
