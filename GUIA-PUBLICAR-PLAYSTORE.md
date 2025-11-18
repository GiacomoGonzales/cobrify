# Guía Completa para Publicar en Google Play Store

## ✅ Requisitos Previos (Ya completados)
- [x] Cuenta de desarrollador de Google Play ($25 USD pagados)
- [x] Identidad verificada
- [x] App funcionando correctamente

---

## 📋 PASO 1: Preparar la Información de la App

Antes de empezar, necesitas tener listo:

### Textos requeridos:
- **Nombre de la app:** Factuya (o el que prefieras, máx 50 caracteres)
- **Descripción corta:** 80 caracteres
  ```
  Sistema de facturación electrónica para Perú con SUNAT integrado
  ```
- **Descripción completa:** Hasta 4000 caracteres
  ```
  Factuya es tu solución completa de facturación electrónica para Perú.

  🧾 FACTURACIÓN ELECTRÓNICA
  • Facturas, Boletas y Notas de Venta
  • Envío automático a SUNAT
  • Notas de Crédito y Débito
  • Guías de Remisión

  💼 PUNTO DE VENTA (POS)
  • Interfaz rápida e intuitiva
  • Impresión en ticketeras térmicas (58mm y 80mm)
  • Múltiples métodos de pago
  • Control de inventario en tiempo real

  📊 GESTIÓN DE NEGOCIO
  • Control de inventario y almacenes
  • Gestión de clientes y proveedores
  • Reportes y estadísticas
  • Caja registradora

  📱 CARACTERÍSTICAS
  • 100% compatible con SUNAT
  • Genera PDFs de comprobantes
  • Compartir por WhatsApp
  • Múltiples usuarios y permisos
  • Sincronización en la nube

  Ideal para negocios en Perú que necesitan facturación electrónica confiable.
  ```

### Recursos gráficos requeridos:

1. **Ícono de la app:**
   - 512x512 px, PNG de 32 bits, transparente
   - Ubicación actual: `public/logo.png`

2. **Gráfico destacado (Feature Graphic):**
   - 1024x500 px, PNG o JPEG

3. **Capturas de pantalla del teléfono:**
   - Mínimo 2, máximo 8
   - JPEG o PNG de 24 bits
   - Dimensiones: 320px - 3840px
   - Aspecto mínimo: 2:1

4. **Capturas de pantalla de tablet (opcional):**
   - 7 pulgadas y 10 pulgadas

### Información adicional:
- **Categoría:** Negocios
- **Clasificación de contenido:** Para todas las edades
- **Política de privacidad:** URL de tu política
- **Correo de contacto:** Tu email de soporte

---

## 🔐 PASO 2: Crear Keystore (Si no lo has hecho)

### 2.1. Verificar si ya tienes keystore:

```bash
dir android\app\*.keystore
dir android\*.keystore
```

Si no existe, créalo:

### 2.2. Crear keystore:

```bash
crear-keystore.bat
```

O manualmente:
```bash
keytool -genkey -v -keystore factuya-release-key.keystore -alias factuya-key -keyalg RSA -keysize 2048 -validity 10000
```

**IMPORTANTE:**
- Guarda la contraseña en un lugar SEGURO (gestor de contraseñas)
- Haz múltiples backups del archivo `.keystore`
- Si pierdes esto, NUNCA podrás actualizar tu app en Play Store

### 2.3. Crear archivo `android/key.properties`:

```properties
storePassword=TU_CONTRASEÑA_AQUI
keyPassword=TU_CONTRASEÑA_AQUI
keyAlias=factuya-key
storeFile=../factuya-release-key.keystore
```

**Nota:** El archivo debe estar en `android/key.properties`

### 2.4. Actualizar `.gitignore`:

Asegúrate de que `.gitignore` incluya:
```
# Android signing
android/key.properties
*.keystore
*.jks
```

---

## 📦 PASO 3: Generar Android App Bundle (AAB)

Google Play Store requiere AAB, no APK.

### 3.1. Verificar versión en `android/app/build.gradle`:

```gradle
defaultConfig {
    applicationId "pe.factuya.app"  // Verifica que sea único
    versionCode 1                   // Incrementa para cada actualización
    versionName "1.0"               // Versión visible para usuarios
}
```

### 3.2. Compilar el proyecto:

```bash
npm run build
```

### 3.3. Sincronizar con Capacitor:

```bash
npx cap sync
```

### 3.4. Generar el AAB firmado:

```bash
cd android
gradlew.bat bundleRelease
```

Si funciona, el AAB estará en:
```
android\app\build\outputs\bundle\release\app-release.aab
```

### 3.5. Verificar el AAB:

El archivo debe tener varios MB de tamaño. Si es muy pequeño, algo falló.

---

## 🚀 PASO 4: Subir a Google Play Console

### 4.1. Acceder a Play Console:

1. Ve a: https://play.google.com/console
2. Inicia sesión con tu cuenta de desarrollador

### 4.2. Crear nueva aplicación:

1. Click en **"Crear aplicación"**
2. Completa:
   - **Nombre de la app:** Factuya
   - **Idioma predeterminado:** Español (España) o Español (Latinoamérica)
   - **Aplicación o juego:** Aplicación
   - **Gratis o de pago:** Gratis (o de pago si cobrarás)
3. Acepta las declaraciones
4. Click en **"Crear aplicación"**

### 4.3. Completar la configuración de la app:

#### A) Panel de control:
En la página principal verás tareas pendientes. Completa cada una:

#### B) Configuración de la app:
- **Categoría de la app:** Negocios
- **Correo electrónico de contacto:** tu@email.com
- **¿Tiene anuncios?:** No (o Sí si usas AdMob)

#### C) Clasificación de contenido:
1. Click en **"Iniciar cuestionario"**
2. Completa las preguntas (generalmente todo "No")
3. Guarda y continúa

#### D) Política de privacidad:
- Necesitas una URL pública con tu política de privacidad
- Ejemplo: `https://factuya.com/privacy-policy`

#### E) Público objetivo y contenido:
1. **Grupo de edad objetivo:** Adultos (18+)
2. **¿Los niños pueden encontrarla?:** No
3. Completa el resto según tu app

### 4.4. Configurar la ficha de Play Store:

#### A) Descripción principal:
- **Nombre de la app:** Factuya
- **Descripción breve:** (usa el texto del PASO 1)
- **Descripción completa:** (usa el texto del PASO 1)

#### B) Recursos gráficos:
1. **Ícono de la app:** Sube `public/logo.png` (debe ser 512x512)
2. **Gráfico destacado:** Crea una imagen 1024x500
3. **Capturas de pantalla:** Mínimo 2 imágenes

**Tip para capturas:** Usa el emulador de Android Studio o tu teléfono:
- Abre la app
- Toma screenshots de las pantallas principales (POS, Productos, Facturas, etc.)
- Redimensiona si es necesario

#### C) Categoría:
- **Aplicación:** Negocios
- **Etiquetas:** Facturación, SUNAT, Ventas, Inventario

### 4.5. Crear una versión:

1. En el menú lateral, ve a **"Producción"** (bajo "Versión")
2. Click en **"Crear nueva versión"**
3. Sube el archivo **app-release.aab**
4. Ingresa las **Notas de la versión** (qué hay de nuevo):
   ```
   Primera versión de Factuya:
   - Sistema de facturación electrónica compatible con SUNAT
   - Punto de Venta (POS)
   - Gestión de inventario
   - Reportes y estadísticas
   - Impresión térmica
   ```
5. Click en **"Guardar"**

### 4.6. Configurar países:

1. Ve a **"Países/regiones"**
2. Selecciona los países donde quieres publicar (Perú al menos)
3. Guarda

### 4.7. Revisar y publicar:

1. Revisa que todas las tareas estén completas (checkmark verde)
2. Si todo está bien, verás el botón **"Enviar para revisión"**
3. Click en **"Enviar para revisión"**

---

## ⏱️ PASO 5: Esperar Aprobación

- **Tiempo de revisión:** 1-7 días (usualmente 1-3 días)
- **Notificaciones:** Recibirás email en cada etapa
- **Estados:**
  - 🟡 En revisión
  - 🟢 Aprobada
  - 🔴 Rechazada (te dirán por qué y podrás corregir)

### Si es rechazada:
- Lee el motivo del rechazo
- Corrige lo que piden
- Genera nuevo AAB con `versionCode` incrementado
- Vuelve a enviar

---

## 🔄 PASO 6: Actualizaciones Futuras

Para cada actualización:

### 6.1. Actualizar versión:

En `android/app/build.gradle`:
```gradle
versionCode 2        // Incrementa: 2, 3, 4, 5...
versionName "1.1"    // Versión visible: 1.1, 1.2, 2.0...
```

### 6.2. Generar nuevo AAB:

```bash
npm run build
npx cap sync
cd android
gradlew.bat bundleRelease
```

### 6.3. Subir a Play Console:

1. Ve a **"Producción"** > **"Crear nueva versión"**
2. Sube el nuevo AAB
3. Escribe las notas de la versión (qué cambió)
4. Enviar para revisión

---

## 🛠️ Comandos Útiles

### Limpiar proyecto antes de compilar:
```bash
cd android
gradlew.bat clean
cd ..
npm run build
npx cap sync
cd android
gradlew.bat bundleRelease
```

### Verificar firma del AAB:
```bash
jarsigner -verify -verbose -certs android\app\build\outputs\bundle\release\app-release.aab
```

### Ver información del keystore:
```bash
keytool -list -v -keystore factuya-release-key.keystore -alias factuya-key
```

---

## 📝 Checklist Final Antes de Publicar

- [ ] App funciona correctamente (sin crashes)
- [ ] Probaste todas las funciones principales
- [ ] Íconos y logos correctos
- [ ] Nombre de la app correcto
- [ ] `versionCode` y `versionName` actualizados
- [ ] Keystore guardado en lugar seguro (múltiples backups)
- [ ] Contraseña guardada en gestor de contraseñas
- [ ] AAB generado exitosamente
- [ ] Política de privacidad publicada
- [ ] Capturas de pantalla listas
- [ ] Descripción de la app completa
- [ ] Clasificación de contenido completada

---

## ❌ Errores Comunes

### "Upload failed: Version code X has already been used"
- Incrementa `versionCode` en `build.gradle`

### "APK signature not verified"
- Verifica que `key.properties` tenga las contraseñas correctas
- Asegúrate de que el keystore exista

### "You uploaded a debuggable APK"
- Estás usando APK debug en lugar de release
- Usa: `gradlew.bat bundleRelease`

### "The package name already exists"
- Alguien más usa ese `applicationId`
- Cámbialo en `build.gradle`: `applicationId "pe.tuempresa.factuya"`

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs de compilación
2. Verifica que todos los archivos estén configurados
3. Consulta la consola de errores de Play Console
4. Revisa la documentación oficial: https://developer.android.com/studio/publish

---

## 🎉 ¡Listo!

Una vez aprobada, tu app estará disponible en Google Play Store para que cualquier persona la descargue.

**Recuerda:**
- Mantén el keystore seguro
- Actualiza regularmente
- Responde a reseñas de usuarios
- Monitorea crashes en Play Console
