/**
 * Servicio de procesamiento de imágenes para impresión térmica
 * Maneja conversión de URLs a base64, optimización y caché
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

const logoCache = new Map();

export const LOGO_SPECS = {
  58: {
    maxWidth: 384,
    maxHeight: 200,
    recommendedWidth: 120
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
  // Si estamos en plataforma nativa, usar Capacitor HTTP para evitar CORS
  if (Capacitor.isNativePlatform()) {
    console.log('📱 Plataforma nativa detectada, usando Capacitor HTTP para evitar CORS');
    try {
      // Descargar imagen con Capacitor HTTP (bypasses CORS)
      const response = await CapacitorHttp.get({
        url: url,
        responseType: 'blob'
      });

      console.log('✅ Imagen descargada con Capacitor HTTP');

      // Convertir blob a base64
      const blob = response.data;
      const base64Data = await blobToBase64(blob);

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

    img.src = url;
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
export async function prepareLogoForPrinting(logoUrl, paperWidth = 58) {
  if (!logoUrl) {
    console.log('📷 No hay logo configurado');
    return { url: null, base64: null, width: 0, ready: false };
  }

  // Verificar caché
  const cacheKey = `${logoUrl}_${paperWidth}`;
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

    // Intentar convertir a base64
    console.log('🔄 Convirtiendo logo a base64...');
    const base64 = await urlToBase64(logoUrl, specs.maxWidth, true);
    console.log('✅ Logo convertido exitosamente. Tamaño:', base64.length, 'chars');

    const result = {
      url: logoUrl,
      base64: base64,
      width: specs.recommendedWidth,
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
