# Verificación de Preview de WhatsApp

## Meta Tags Configurados ✅

Los siguientes meta tags han sido configurados para que WhatsApp muestre correctamente la imagen de preview:

### Open Graph (usado por WhatsApp, Facebook, LinkedIn)
```html
<meta property="og:type" content="website" />
<meta property="og:url" content="https://cobrifyperu.com/" />
<meta property="og:title" content="Cobrify - Sistema de Facturación..." />
<meta property="og:description" content="..." />
<meta property="og:image" content="https://cobrifyperu.com/socialmedia.png" />
<meta property="og:image:url" content="https://cobrifyperu.com/socialmedia.png" />
<meta property="og:image:secure_url" content="https://cobrifyperu.com/socialmedia.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="..." />
```

## Requerimientos de WhatsApp ✅

- ✅ Imagen en formato PNG (también soporta JPG, WebP)
- ✅ Tamaño: 1200x630px (ratio 1.91:1 - óptimo)
- ✅ URL HTTPS
- ✅ Meta tags OG correctamente configurados
- ✅ Imagen accesible públicamente (sin autenticación)
- ✅ robots.txt permite rastreo de imágenes

## Cómo Verificar el Preview

### 1. Facebook Debugger (También válido para WhatsApp)
Visita: https://developers.facebook.com/tools/debug/
- Ingresa la URL: https://cobrifyperu.com/
- Click en "Debug"
- Verifica que la imagen se muestre correctamente
- Si hay problemas, click en "Scrape Again" para refrescar el caché

### 2. WhatsApp Web
- Abre WhatsApp Web
- Pega el link: https://cobrifyperu.com/
- Verifica que aparezca la imagen de preview

### 3. LinkedIn Post Inspector
Visita: https://www.linkedin.com/post-inspector/
- Útil para verificar que los meta tags funcionan en otras plataformas

### 4. Twitter Card Validator
Visita: https://cards-dev.twitter.com/validator
- Verifica que la imagen se muestre correctamente en Twitter

## Limpieza de Caché

Si WhatsApp no muestra la imagen inmediatamente:

### Método 1: Facebook Debugger
1. Ir a https://developers.facebook.com/tools/debug/
2. Ingresar URL: https://cobrifyperu.com/
3. Click en "Scrape Again" varias veces
4. Esto fuerza a Facebook/WhatsApp a recargar los meta tags

### Método 2: Agregar parámetro a URL
- Temporalmente compartir: https://cobrifyperu.com/?v=1
- Incrementar el número cada vez que cambies la imagen
- Esto evita el caché de WhatsApp

### Método 3: Esperar
- WhatsApp cachea las previews por ~7 días
- Después de ese tiempo, recargará automáticamente

## Ubicación de la Imagen

**Archivo:** `public/socialmedia.png`
**URL pública:** `https://cobrifyperu.com/socialmedia.png`

## Especificaciones Recomendadas para la Imagen

Para mejores resultados:
- **Dimensiones:** 1200x630px (mínimo: 600x315px)
- **Ratio:** 1.91:1
- **Formato:** PNG o JPG (PNG preferido para texto nítido)
- **Tamaño archivo:** Menos de 5MB
- **Contenido:**
  - Logo/marca visible
  - Texto grande y legible
  - Colores contrastantes
  - Evitar texto muy cerca de los bordes

## Notas Importantes

1. **Primera vez:** Cuando compartas el link por primera vez, WhatsApp puede tardar unos segundos en cargar la imagen

2. **Caché persistente:** WhatsApp cachea agresivamente las previews. Si cambias la imagen, usa el Facebook Debugger para forzar la recarga

3. **HTTPS obligatorio:** WhatsApp solo muestra previews de URLs HTTPS

4. **Sin autenticación:** La imagen debe ser accesible sin login

5. **robots.txt:** Asegurado que las imágenes estén permitidas para rastreadores

## Troubleshooting

### Problema: La imagen no aparece
**Soluciones:**
1. Verificar que socialmedia.png exista en `/public/`
2. Verificar que la URL sea accesible: https://cobrifyperu.com/socialmedia.png
3. Usar Facebook Debugger para ver errores específicos
4. Verificar que el archivo no supere 5MB

### Problema: Aparece imagen antigua
**Soluciones:**
1. Usar Facebook Debugger y hacer "Scrape Again"
2. Cambiar nombre del archivo y actualizar meta tags
3. Agregar parámetro de versión: socialmedia.png?v=2

### Problema: Imagen cortada o distorsionada
**Soluciones:**
1. Verificar que el ratio sea exactamente 1.91:1 (1200x630)
2. Dejar margen de seguridad en los bordes (60px aproximadamente)
3. Evitar contenido importante en las esquinas
