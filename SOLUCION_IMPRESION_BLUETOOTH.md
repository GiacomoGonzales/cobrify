# Solución: Problemas de Impresión Bluetooth en Ticketeras

## Problemas Identificados

1. **El logo no aparece** en la impresión Bluetooth
2. **La salida es idéntica** en 58mm y 80mm (no respeta ancho configurado)
3. **Diferencias entre impresión web y Bluetooth**

## Causa Raíz

### 1. Logo no aparece
- **Problema**: El plugin `capacitor-thermal-printer` puede tener problemas cargando imágenes directamente desde URLs en dispositivos móviles (CORS, timeouts, etc.)
- **Solución**: Convertir el logo a base64 antes de enviar a la impresora

### 2. Ancho de papel no se respeta
- **Problema**: El ancho de papel se configura en Firestore pero podría no estar siendo leído correctamente
- **Verificación necesaria**: Asegurarse que `printerConfig.paperWidth` está guardado en la base de datos

## Solución Implementada

### Archivos Creados/Modificados

#### 1. **NUEVO: `src/services/imageProcessingService.js`**
Servicio que maneja la conversión de imágenes para impresión térmica:

- ✅ Convierte URLs a base64
- ✅ Aplica dithering Floyd-Steinberg (mejora calidad en blanco y negro)
- ✅ Optimiza tamaño según ancho de papel (58mm = 120px, 80mm = 200px)
- ✅ Sistema de caché para evitar reconversiones
- ✅ Manejo de errores y timeouts

**Especificaciones de logo por ancho:**
```javascript
58mm: 120px width (máx 384px)
80mm: 200px width (máx 576px)
```

#### 2. **MODIFICADO: `src/services/thermalPrinterService.js`**

**Cambios principales:**

a) **Importar servicio de procesamiento de imágenes:**
```javascript
import { prepareLogoForPrinting } from './imageProcessingService';
```

b) **Nueva lógica de impresión de logo** (líneas 426-449):
```javascript
if (business.logoUrl) {
  const logoConfig = await prepareLogoForPrinting(business.logoUrl, paperWidth);

  if (logoConfig.ready && logoConfig.base64) {
    // Usar base64 con data URL
    const dataUrl = `data:image/png;base64,${logoConfig.base64}`;
    printer = printer.image(dataUrl, logoConfig.width);
  } else if (logoConfig.ready && logoConfig.url) {
    // Fallback a URL directa
    printer = printer.image(logoConfig.url, logoConfig.width);
  }
}
```

c) **Logging mejorado:**
```javascript
console.log('🖨️ Imprimiendo con ancho de papel:', paperWidth, 'mm');
console.log('📷 Preparando logo del negocio...');
console.log('✅ Logo listo (base64). Ancho:', logoConfig.width, 'px');
```

d) **Nueva función de prueba con logo:**
```javascript
export const testPrinterWithLogo = async (logoUrl, paperWidth = 58)
```

e) **Prueba de impresora mejorada:**
- Ahora muestra visualmente el ancho configurado (58MM ESTRECHO vs 80MM ANCHO)
- Muestra cuántos caracteres por línea según ancho

## Cómo Usar la Solución

### Paso 1: Verificar Configuración de Ancho de Papel

1. Ve a **Configuración** → **Impresora Térmica**
2. Asegúrate de seleccionar el ancho correcto:
   - **58mm** para ticketeras pequeñas
   - **80mm** para ticketeras estándar
3. Guarda la configuración

**Importante**: La configuración se guarda en Firestore como:
```javascript
businesses/{businessId}/printerConfig/paperWidth: 58 | 80
```

### Paso 2: Probar Impresión

#### Opción A: Prueba Simple (Sin Logo)
En la app, ve a Configuración → Impresora → **Probar Impresora**

El ticket mostrará:
```
PRUEBA DE IMPRESORA
----------------------------
58MM (ESTRECHO)
32 caracteres por linea
----------------------------
...o...
80MM (ANCHO)
48 caracteres por linea
----------------------------
```

Esto te confirmará qué ancho está usando.

#### Opción B: Prueba con Logo
Desde la consola del navegador (depuración USB):

```javascript
import { testPrinterWithLogo } from '@/services/thermalPrinterService';

// Usar logo de tu negocio
const logoUrl = 'https://firebasestorage.googleapis.com/...'; // Tu logo
testPrinterWithLogo(logoUrl, 58); // o 80
```

### Paso 3: Imprimir Comprobante Real

Cuando imprimas un comprobante desde el POS:

1. La app leerá automáticamente el `paperWidth` configurado
2. Convertirá el logo a base64 optimizado
3. Imprimirá con el ancho correcto

**Logs en consola para verificar:**
```
🖨️ Imprimiendo con ancho de papel: 58 mm
📷 Preparando logo del negocio...
🔄 Convirtiendo logo a base64...
✅ Logo convertido exitosamente. Tamaño: 12543 chars
✅ Logo listo (base64). Ancho: 120 px
```

## Diferencias 58mm vs 80mm

### Impresión 58mm
- **Ancho de logo**: 120 píxeles
- **Caracteres por línea**: 32
- **Separador**: 28 guiones
- **Items**: Formato compacto (columnas ajustadas)

### Impresión 80mm
- **Ancho de logo**: 200 píxeles
- **Caracteres por línea**: 48
- **Separador**: 44 guiones
- **Items**: Formato expandido:
  ```
  Nombre del producto completo
  1 X S/ 10.00                  S/ 10.00
  Codigo: ABC123
  ```

## Solución de Problemas

### Logo No Aparece

#### Verificar en Consola:
```
📷 Preparando logo del negocio...
❌ Error al cargar logo: Timeout al cargar imagen
```

**Causas posibles:**
1. URL del logo no accesible desde el dispositivo móvil
2. Problema de CORS
3. Logo muy grande (>2MB)

**Soluciones:**
1. Verificar que el logo esté en Firebase Storage con permisos públicos
2. Reducir tamaño del logo (máximo 1MB recomendado)
3. Usar logo con fondo transparente o blanco (mejor calidad)

### Ancho Siempre en 80mm

#### Verificar configuración en Firestore:
```javascript
// En Firebase Console
businesses/{tuBusinessId}/printerConfig
{
  paperWidth: 58,  // ¿Está configurado?
  address: "...",
  enabled: true
}
```

#### Verificar en código:
```javascript
// En POS.jsx línea 1322
const result = await printInvoiceTicket(
  lastInvoiceData,
  companySettings,
  printerConfigResult.config.paperWidth || 80  // Default 80
)
```

Si siempre cae en el default (80), significa que `printerConfigResult.config.paperWidth` es `null` o `undefined`.

### Logo Sale Distorsionado

**Problema**: El algoritmo de dithering puede crear patrones extraños en algunas imágenes

**Solución**: Usar logo ya optimizado para impresión térmica:
- Blanco y negro puro (sin grises)
- Fondo blanco o transparente
- Alto contraste
- Formato PNG

**Desactivar dithering** (opcional):
```javascript
// En imageProcessingService.js línea 13
const base64 = await urlToBase64(logoUrl, specs.maxWidth, false); // false = sin dithering
```

## Mejores Prácticas para Logos

### Especificaciones Recomendadas

#### Para 58mm:
- **Tamaño**: 120x120 píxeles (máximo 384px width)
- **Formato**: PNG con transparencia
- **Colores**: Blanco y negro puro
- **Peso**: < 500KB

#### Para 80mm:
- **Tamaño**: 200x200 píxeles (máximo 576px width)
- **Formato**: PNG con transparencia
- **Colores**: Blanco y negro puro
- **Peso**: < 500KB

### Cómo Optimizar Logo Existente

1. **Abre en editor de imágenes** (Photoshop, GIMP, etc.)
2. **Redimensiona**:
   - Ancho: 200px (80mm) o 120px (58mm)
   - Mantener aspecto
3. **Convierte a blanco y negro**:
   - Image → Mode → Grayscale
   - Image → Mode → Bitmap → Diffusion Dither
4. **Exporta como PNG**:
   - Sin compresión excesiva
   - Fondo transparente o blanco

## Código de Depuración

### Ver qué está pasando durante la impresión:

```javascript
// Abrir Chrome DevTools conectado al dispositivo Android
// Ir a chrome://inspect

// Filtrar solo logs de impresión
console.log('Iniciando impresión...');

// Deberías ver:
🖨️ Imprimiendo con ancho de papel: 58 mm
📷 Preparando logo del negocio...
📐 Especificaciones: { maxWidth: 384, maxHeight: 200, recommendedWidth: 120 }
🔄 Convirtiendo logo a base64...
✅ Logo convertido exitosamente
✅ Logo listo (base64). Ancho: 120 px
```

### Verificar caché de logos:

```javascript
import { getCacheStats, clearLogoCache } from '@/services/imageProcessingService';

// Ver estadísticas
console.log(getCacheStats());
// Output: { size: 2, keys: ['https://.../logo.png_58', 'https://.../logo.png_80'] }

// Limpiar caché
clearLogoCache();
```

## Próximos Pasos

1. **Rebuild la app**:
   ```bash
   npm run build
   npx cap sync
   cd android && ./gradlew assembleRelease
   ```

2. **Instalar nueva versión** en dispositivo

3. **Probar**:
   - Conectar a impresora Bluetooth
   - Ir a Configuración → Impresora
   - Seleccionar ancho de papel correcto (58mm o 80mm)
   - Probar impresión
   - Imprimir comprobante real

4. **Verificar logs** en Chrome DevTools (adb)

## Resumen de Cambios

### ✅ Archivos Nuevos
- `src/services/imageProcessingService.js` - Procesamiento de imágenes

### ✅ Archivos Modificados
- `src/services/thermalPrinterService.js` - Lógica de impresión mejorada

### ✅ Nuevas Funcionalidades
- Conversión automática de logo a base64
- Optimización de tamaño según ancho de papel
- Dithering Floyd-Steinberg para mejor calidad
- Caché de logos procesados
- Logs detallados para depuración
- Función de prueba con logo (`testPrinterWithLogo`)
- Prueba de impresora mejorada (muestra ancho configurado)

### ✅ Problemas Resueltos
- Logo no aparece → Ahora se convierte a base64
- Ancho no se respeta → Logs para verificar configuración
- Calidad de imagen → Dithering optimizado

## Soporte Técnico

Si el logo sigue sin aparecer después de estos cambios:

1. **Captura los logs** de consola durante la impresión
2. **Verifica** que el logo esté en Firebase Storage con permisos de lectura
3. **Prueba** con un logo diferente (ej: logo de prueba simple)
4. **Confirma** que la impresora soporta impresión de imágenes (algunas no lo hacen)

## Referencia Técnica

### Plugin Usado
- **capacitor-thermal-printer** v0.2.5
- SDK: RTPrinter (Rongta Technology)
- Soporta: Android + iOS

### Comandos ESC/POS
- Imágenes: `GS v 0` (formato raster)
- Ancho de papel: Se configura por software, no por comando
- Logo: Data URL con base64

### Algoritmo de Dithering
- **Floyd-Steinberg**: Distribuye error a píxeles vecinos
- Mejor calidad para impresoras térmicas que simple threshold
- Se aplica automáticamente durante conversión a base64
