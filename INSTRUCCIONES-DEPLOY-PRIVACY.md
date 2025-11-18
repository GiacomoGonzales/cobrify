# Instrucciones para Desplegar la Política de Privacidad

## ✅ Archivo Creado

**Ubicación:** `public/privacy-policy.html`
**Tamaño:** 34 KB
**Versión:** 1.0
**Fecha:** Noviembre 2025

---

## 🌐 Opciones para Publicar la Política

### Opción 1: Desplegar con tu Sitio Web Actual (RECOMENDADO)

Si ya tienes el sitio `cobrifyperu.com` alojado:

1. **Sube el archivo al hosting:**
   - Copia `public/privacy-policy.html` a la raíz de tu sitio web
   - Asegúrate de que sea accesible en: `https://cobrifyperu.com/privacy-policy.html`

2. **Verifica que funcione:**
   ```bash
   curl -I https://cobrifyperu.com/privacy-policy.html
   # Debe devolver: HTTP/1.1 200 OK
   ```

3. **Prueba en navegador:**
   - Abre: https://cobrifyperu.com/privacy-policy.html
   - Verifica que se vea correctamente
   - Comprueba que funcione en móvil

---

### Opción 2: Firebase Hosting (Si usas Firebase)

Si tu sitio está en Firebase Hosting:

1. **Asegúrate de que el archivo esté en `public/`:**
   ```
   ✓ public/privacy-policy.html
   ```

2. **Despliega a Firebase:**
   ```bash
   firebase deploy --only hosting
   ```

3. **Verifica:**
   ```bash
   # Si tu dominio es cobrifyperu.com
   https://cobrifyperu.com/privacy-policy.html

   # O tu dominio de Firebase
   https://tu-proyecto.web.app/privacy-policy.html
   ```

---

### Opción 3: GitHub Pages (GRATIS y RÁPIDO)

Si no tienes hosting, puedes usar GitHub Pages gratuitamente:

1. **Crea un repositorio público:**
   - Nombre: `cobrify-privacy` (o el que prefieras)
   - Público: ✓

2. **Sube el archivo:**
   ```bash
   cd /ruta/temporal
   git clone https://github.com/TU_USUARIO/cobrify-privacy.git
   cd cobrify-privacy
   cp /ruta/a/factuya/public/privacy-policy.html index.html
   git add index.html
   git commit -m "Add privacy policy"
   git push
   ```

3. **Activa GitHub Pages:**
   - Ve a: Settings > Pages
   - Source: Deploy from a branch
   - Branch: main / (root)
   - Save

4. **Tu URL será:**
   ```
   https://TU_USUARIO.github.io/cobrify-privacy/
   ```

---

### Opción 4: Netlify (GRATIS, drag & drop)

1. **Ve a:** https://app.netlify.com/drop

2. **Arrastra la carpeta con el archivo:**
   - Crea una carpeta llamada `privacy`
   - Copia `privacy-policy.html` dentro
   - Renómbrala a `index.html`
   - Arrastra la carpeta a Netlify

3. **Tu sitio estará en:**
   ```
   https://random-name-123.netlify.app/
   ```

4. **Opcional - Dominio personalizado:**
   - Site settings > Domain management
   - Add custom domain: `privacy.cobrifyperu.com`
   - Configura el CNAME en tu DNS

---

### Opción 5: Vercel (GRATIS, muy rápido)

1. **Instala Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Crea una carpeta y despliega:**
   ```bash
   mkdir cobrify-privacy
   cd cobrify-privacy
   cp /ruta/a/factuya/public/privacy-policy.html index.html
   vercel --prod
   ```

3. **Sigue las instrucciones en pantalla**

4. **Tu URL será:**
   ```
   https://cobrify-privacy.vercel.app/
   ```

---

## 📋 Para Google Play Store

Una vez que hayas desplegado el archivo:

### 1. Verifica que la URL funcione:
```bash
# Reemplaza con tu URL real
curl https://cobrifyperu.com/privacy-policy.html
```

### 2. URL a usar en Play Console:

**Opción recomendada:**
```
https://cobrifyperu.com/privacy-policy.html
```

**Alternativas válidas:**
```
https://tu-proyecto.web.app/privacy-policy.html
https://tu-usuario.github.io/cobrify-privacy/
https://random-name.netlify.app/
https://cobrify-privacy.vercel.app/
```

### 3. Cómo ingresarla en Play Console:

1. Ve a tu app en Play Console
2. Menú lateral > **Configuración de la app**
3. Sección: **Política de privacidad**
4. Pega tu URL
5. Guarda

---

## ✅ Verificación antes de Enviar a Play Store

### Checklist:

- [ ] La URL es accesible públicamente (sin login)
- [ ] La página carga correctamente en navegador
- [ ] Se ve bien en dispositivos móviles
- [ ] No hay errores de SSL (debe ser HTTPS)
- [ ] El contenido es el correcto (Cobrify, soporte@cobrifyperu.com)
- [ ] La URL no tiene redirecciones extrañas

### Prueba la URL:

1. **Accesibilidad:**
   ```bash
   curl -I https://TU-URL/privacy-policy.html
   # Debe devolver: 200 OK
   ```

2. **HTTPS:**
   - La URL DEBE empezar con `https://`
   - Google Play rechaza URLs `http://`

3. **Responsive:**
   - Abre en Chrome DevTools
   - Prueba en diferentes tamaños de pantalla
   - Verifica que se lea bien en móvil

---

## 🔄 Actualizaciones Futuras

Si necesitas actualizar la política:

1. **Edita el archivo:**
   ```
   public/privacy-policy.html
   ```

2. **Actualiza la fecha:**
   ```html
   <strong>Fecha de última actualización:</strong> Mes Año
   ```

3. **Redespliega:**
   - Sube el archivo actualizado a tu hosting
   - O ejecuta `firebase deploy` / `vercel --prod`

4. **NO es necesario actualizar en Play Store:**
   - La URL sigue siendo la misma
   - Google leerá el contenido actualizado

---

## 🆘 Solución de Problemas

### Error: "URL not accessible"
- Verifica que la URL sea pública
- Comprueba que no requiera autenticación
- Asegúrate de que sea HTTPS

### Error: "Invalid URL"
- La URL debe empezar con `https://`
- No puede tener espacios ni caracteres especiales
- Debe terminar en `.html` o ser una ruta válida

### Error: "Privacy policy too short"
- El archivo tiene 34KB, es suficiente ✓
- Si ves este error, verifica que la URL esté correcta

### Error 404 - Página no encontrada
- Verifica que el archivo esté en la ubicación correcta
- En Firebase: debe estar en `public/`
- En web normal: debe estar en la raíz o carpeta pública

---

## 📞 URLs de Contacto en la Política

Asegúrate de que estos contactos estén activos:

- **Email:** soporte@cobrifyperu.com
- **Sitio web:** https://cobrifyperu.com

Si estos no están activos aún, actualiza el archivo antes de desplegar:

```html
<!-- Busca y reemplaza en privacy-policy.html: -->
soporte@cobrifyperu.com  →  tu-email-real@dominio.com
https://cobrifyperu.com  →  tu-sitio-web-real.com
```

---

## 🎯 Resumen Rápido

1. ✅ Archivo creado: `public/privacy-policy.html`
2. 📤 Súbelo a tu hosting web
3. 🔗 Obtén la URL pública
4. ✅ Verifica que funcione
5. 📝 Ingresa la URL en Play Console
6. 🚀 Continúa con la publicación

---

## 💡 Recomendación Final

**La forma más sencilla:**

Si ya tienes `cobrifyperu.com` funcionando:
1. Sube `privacy-policy.html` a tu hosting
2. Accede a `https://cobrifyperu.com/privacy-policy.html`
3. Usa esa URL en Play Store
4. ✓ Listo!

Si NO tienes hosting:
1. Usa GitHub Pages (gratis, 5 minutos)
2. O Netlify drag & drop (gratis, 2 minutos)
3. ✓ Listo!

---

**¿Necesitas ayuda?** Revisa la sección de contacto de la política de privacidad.

**Fecha de creación:** Noviembre 2025
**Versión de la guía:** 1.0
