/**
 * Servicio de procesamiento de imágenes para impresión térmica
 * Maneja conversión de URLs a base64, optimización y caché
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

const logoCache = new Map();

/**
 * Valida si una URL es válida para hacer peticiones HTTP
 */
const isValidHttpUrl = (string) => {
  if (!string || typeof string !== 'string' || string.trim() === '') return false
  try {
    const url = new URL(string)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export const LOGO_SPECS = {
  58: {
    // Reducido a la mitad (antes 384x200) — feedback de usuarios: en papel
    // de 58mm vía Bluetooth el logo salía demasiado grande.
    maxWidth: 192,
    maxHeight: 100,
    recommendedWidth: 60
  },
  80: {
    maxWidth: 576,
    maxHeight: 280,
    recommendedWidth: 200
  }
};

/**
 * Convertir URL de imagen a base64 optimizado para impresión térmica
 * @param {string} url - URL de la imagen
 * @param {number} maxWidth - Ancho máximo en píxeles
 * @param {boolean} applyDithering - Aplicar dithering Floyd-Steinberg
 * @returns {Promise<string>} Base64 string (sin esquema data:image)
 */
export async function urlToBase64(url, maxWidth = 384, applyDithering = true) {
  // Cache-busting: fuerza una descarga FRESCA del logo para no reusar una copia
  // vieja cacheada sin permiso CORS (mismo problema que se arregló en los PDF tras
  // migrar a Cloudflare R2, que manda Cache-Control: immutable). Solo http(s).
  const freshUrl = /^https?:\/\//i.test(url)
    ? `${url}${url.includes('?') ? '&' : '?'}_cb=${Date.now()}`
    : url

  // Si estamos en plataforma nativa, usar Capacitor HTTP para evitar CORS
  if (Capacitor.isNativePlatform()) {
    console.log('📱 Plataforma nativa detectada, usando Capacitor HTTP para evitar CORS');

    // Validar URL antes de llamar a CapacitorHttp (evita crash en iOS)
    if (!isValidHttpUrl(url)) {
      console.warn('⚠️ URL inválida para CapacitorHttp:', url);
      throw new Error('URL inválida');
    }

    try {
      // Descargar imagen con Capacitor HTTP (bypasses CORS)
      const response = await CapacitorHttp.get({
        url: freshUrl,
        responseType: 'blob'
      });

      console.log('✅ Imagen descargada con Capacitor HTTP');

      // CapacitorHttp.get() con responseType 'blob' retorna base64 string en response.data
      // No es un Blob real, es ya un base64 string
      let base64Data = response.data;

      // Si no tiene el prefijo data:image, agregarlo
      if (!base64Data.startsWith('data:')) {
        // Detectar tipo de imagen (por defecto png)
        base64Data = `data:image/png;base64,${base64Data}`;
      }

      console.log('🔄 Procesando imagen descargada...');

      // Procesar imagen (resize + dithering)
      const processedBase64 = await processImageData(base64Data, maxWidth, applyDithering);

      return processedBase64;
    } catch (error) {
      console.error('❌ Error con Capacitor HTTP, intentando método fallback:', error);
      // Continuar con método Image() como fallback
    }
  }

  // Método original con Image() (para web o como fallback)
  console.log('🌐 Usando método Image() estándar');
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout al cargar imagen'));
    }, 10000); // 10 segundos timeout

    img.onload = function() {
      clearTimeout(timeoutId);

      try {
        // Crear canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calcular dimensiones manteniendo aspect ratio
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);

        // Dibujar imagen
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Aplicar dithering si está habilitado
        if (applyDithering) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          applyFloydSteinbergDithering(imageData);
          ctx.putImageData(imageData, 0, 0);
        }

        // Convertir a base64 sin el esquema data:image/png;base64,
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];

        resolve(base64);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Error al cargar imagen desde URL'));
    };

    img.src = freshUrl;
  });
}

/**
 * Convertir Blob a base64
 * @param {Blob} blob - Blob de la imagen
 * @returns {Promise<string>} Base64 con esquema data:image
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Procesar imagen base64 (resize + dithering)
 * @param {string} base64DataUrl - Base64 data URL (data:image/...)
 * @param {number} maxWidth - Ancho máximo
 * @param {boolean} applyDithering - Aplicar dithering
 * @returns {Promise<string>} Base64 procesado (sin esquema)
 */
function processImageData(base64DataUrl, maxWidth, applyDithering) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = function() {
      try {
        // Crear canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calcular dimensiones manteniendo aspect ratio
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);

        // Dibujar imagen
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Aplicar dithering si está habilitado
        if (applyDithering) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          applyFloydSteinbergDithering(imageData);
          ctx.putImageData(imageData, 0, 0);
        }

        // Convertir a base64 sin el esquema data:image/png;base64,
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];

        resolve(base64);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Error al procesar imagen'));
    };

    img.src = base64DataUrl;
  });
}

/**
 * Aplicar algoritmo Floyd-Steinberg para dithering
 * Convierte imagen a blanco y negro con mejor calidad para impresoras térmicas
 */
function applyFloydSteinbergDithering(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Convertir a escala de grises
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;

      // Aplicar umbral
      const newColor = gray < 128 ? 0 : 255;
      const error = gray - newColor;

      // Establecer píxel a blanco o negro
      data[idx] = data[idx + 1] = data[idx + 2] = newColor;

      // Distribuir error a píxeles vecinos (Floyd-Steinberg)
      if (x + 1 < width) {
        data[idx + 4] += error * 7 / 16;
      }
      if (y + 1 < height) {
        if (x > 0) data[idx + width * 4 - 4] += error * 3 / 16;
        data[idx + width * 4] += error * 5 / 16;
        if (x + 1 < width) data[idx + width * 4 + 4] += error * 1 / 16;
      }
    }
  }
}

/**
 * Preparar logo para impresión térmica con caché y manejo de errores
 * @param {string} logoUrl - URL del logo
 * @param {number} paperWidth - Ancho de papel (58 o 80)
 * @returns {Promise<Object>} { url, base64, width, ready }
 */
export async function prepareLogoForPrinting(logoUrl, paperWidth = 58, scale = 100) {
  if (!logoUrl) {
    console.log('📷 No hay logo configurado');
    return { url: null, base64: null, width: 0, ready: false };
  }

  // Escala configurable del logo (porcentaje, 100 = tamaño base). Acotada para no
  // exceder el ancho de papel ni quedar invisible.
  const pct = Math.max(30, Math.min(150, Number(scale) || 100)) / 100;

  // Verificar caché (incluye la escala para no reusar un tamaño distinto)
  const cacheKey = `${logoUrl}_${paperWidth}_${Math.round(pct * 100)}`;
  if (logoCache.has(cacheKey)) {
    const cached = logoCache.get(cacheKey);
    // Invalidar entradas antiguas sin base64 (fallback de errores CORS previos)
    if (cached.base64 === null) {
      console.log('🗑️ Caché inválido detectado (sin base64), eliminando y re-procesando...');
      logoCache.delete(cacheKey);
      // Continuar con el procesamiento normal
    } else {
      console.log('📷 Logo recuperado del caché');
      return cached;
    }
  }

  console.log('📷 Procesando logo desde URL:', logoUrl);
  console.log('📏 Ancho de papel:', paperWidth, 'mm');

  try {
    const specs = LOGO_SPECS[paperWidth] || LOGO_SPECS[58];
    console.log('📐 Especificaciones:', specs);

    // Ancho objetivo escalado, sin pasar el máximo imprimible del papel.
    const paperMaxDots = paperWidth === 58 ? 384 : 576;
    const targetWidth = Math.max(32, Math.min(paperMaxDots, Math.round(specs.maxWidth * pct)));

    // Intentar convertir a base64
    console.log('🔄 Convirtiendo logo a base64... ancho objetivo:', targetWidth, 'px');
    const base64 = await urlToBase64(logoUrl, targetWidth, true);
    console.log('✅ Logo convertido exitosamente. Tamaño:', base64.length, 'chars');

    const result = {
      url: logoUrl,
      base64: base64,
      width: targetWidth,
      ready: true
    };

    // Guardar en caché
    logoCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error('❌ Error al preparar logo:', error.message);

    // Intentar usar URL directamente como fallback
    console.log('⚠️ Intentando usar URL directamente...');
    const specs = LOGO_SPECS[paperWidth] || LOGO_SPECS[58];
    const fallbackResult = {
      url: logoUrl,
      base64: null,
      width: specs.recommendedWidth,
      ready: true // Intentar de todos modos
    };

    logoCache.set(cacheKey, fallbackResult);
    return fallbackResult;
  }
}

/**
 * Preparar el logo como RASTER crudo para ESC/POS (GS v 0).
 *
 * La ruta Bluetooth Clásico imprime el logo con .image() del plugin, pero la
 * ruta WiFi/TCP manda bytes ESC/POS puros y el plugin TCP no sabe de imágenes:
 * hay que empaquetar el bitmap a mano, 1 bit por píxel, MSB primero.
 * (Reporte 14-ago-2026: el logo no salía en impresión WiFi — solo existía en
 * las rutas Bluetooth/BLE.)
 *
 * Reusa prepareLogoForPrinting (mismo caché, mismo dithering, misma escala) y
 * convierte su PNG a filas de bits. Si solo hay URL sin base64 (fallback CORS)
 * no se puede rasterizar: devuelve ready:false y el ticket sale sin logo.
 *
 * @returns {Promise<Object>} { ready, width, height, widthBytes, data: Uint8Array }
 */
export async function prepareLogoRasterForEscPos(logoUrl, paperWidth = 58, scale = 100) {
  const noLogo = { ready: false, width: 0, height: 0, widthBytes: 0, data: null };
  if (!logoUrl) return noLogo;

  const prepared = await prepareLogoForPrinting(logoUrl, paperWidth, scale);
  if (!prepared.ready || !prepared.base64) return noLogo;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.width;
        const h = img.height;
        // Un logo desproporcionadamente alto atascaría el ticket; mismo espíritu
        // que el tope de ancho por papel.
        if (!w || !h || h > 800) return resolve(noLogo);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // Fondo blanco: los PNG con transparencia deben imprimir blanco, no negro.
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, w, h);

        const widthBytes = Math.ceil(w / 8);
        const bits = new Uint8Array(widthBytes * h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            // El PNG ya viene dithered a blanco/negro puros; el umbral solo
            // decide los bordes re-muestreados. Bit 1 = punto NEGRO.
            if (data[i + 3] > 127 && gray < 128) {
              bits[y * widthBytes + (x >> 3)] |= (0x80 >> (x & 7));
            }
          }
        }
        resolve({ ready: true, width: w, height: h, widthBytes, data: bits });
      } catch (e) {
        console.error('Error rasterizando logo para ESC/POS:', e);
        resolve(noLogo);
      }
    };
    img.onerror = () => resolve(noLogo);
    img.src = `data:image/png;base64,${prepared.base64}`;
  });
}

/**
 * Validar que una URL de imagen sea accesible
 * @param {string} url - URL a validar
 * @param {number} timeout - Timeout en ms
 * @returns {Promise<boolean>}
 */
export function validateImageUrl(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error('Timeout al validar imagen'));
    }, timeout);

    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };

    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('No se pudo cargar la imagen'));
    };

    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

/**
 * Limpiar caché de logos
 * @param {string} logoUrl - URL específica a limpiar, o null para limpiar todo
 */
export function clearLogoCache(logoUrl = null) {
  if (logoUrl) {
    for (const key of logoCache.keys()) {
      if (key.startsWith(logoUrl)) {
        logoCache.delete(key);
        console.log('🗑️ Logo eliminado del caché:', key);
      }
    }
  } else {
    const size = logoCache.size;
    logoCache.clear();
    console.log('🗑️ Caché de logos limpiado:', size, 'items');
  }
}

/**
 * Obtener estadísticas del caché
 */
export function getCacheStats() {
  return {
    size: logoCache.size,
    keys: Array.from(logoCache.keys())
  };
}
