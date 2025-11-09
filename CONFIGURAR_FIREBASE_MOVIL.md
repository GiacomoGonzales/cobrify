# 🔐 Configurar Firebase Auth para App Móvil

Firebase necesita que registres tu app Android para que funcione la autenticación.

---

## 📋 Paso 1: Obtener el SHA-1 de tu app

### En Windows (PowerShell):

```powershell
# Abre PowerShell en la carpeta del proyecto
cd C:\Users\giaco\factuya

# Ejecuta este comando:
cd android
./gradlew signingReport
```

### O también puedes usar (más fácil):

```powershell
# Desde la carpeta raíz del proyecto:
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**Copia el SHA-1** que aparece. Se ve algo así:
```
SHA1: A1:B2:C3:D4:E5:F6:G7:H8:I9:J0:K1:L2:M3:N4:O5:P6:Q7:R8:S9:T0
```

---

## 📋 Paso 2: Agregar SHA-1 a Firebase Console

1. Ve a: https://console.firebase.google.com
2. Selecciona tu proyecto (el de Factuya)
3. Click en el ícono de **Android** (o "Add app" si no has agregado Android)
4. Si ya existe la app Android:
   - Ve a **Project Settings** (⚙️ arriba a la izquierda)
   - Scroll down hasta "Your apps"
   - Click en tu app Android
   - Scroll hasta "SHA certificate fingerprints"
   - Click en "Add fingerprint"
   - Pega el SHA-1 que copiaste
   - Click en "Save"

5. Si NO existe la app Android aún:
   - Click en "Add app" → Android (ícono de Android)
   - **Android package name**: `com.factuya.app`
   - **App nickname**: `Factuya`
   - **Debug signing certificate SHA-1**: Pega el SHA-1
   - Click en "Register app"
   - **Descarga el archivo `google-services.json`**
   - Click en "Next" → "Next" → "Continue to console"

---

## 📋 Paso 3: Actualizar google-services.json

Si descargaste un nuevo `google-services.json`:

1. Copia el archivo descargado
2. Pégalo en: `C:\Users\giaco\factuya\android\app\`
3. **Reemplaza** el archivo existente

---

## 📋 Paso 4: Rebuild la app

```bash
# En la terminal de VS Code:
npm run mobile:sync

# Luego en Android Studio:
# Build → Clean Project
# Build → Rebuild Project

# Finalmente, presiona RUN (▶️)
```

---

## 🎯 Verificar que funciona

1. Abre la app en tu teléfono
2. Ve a la pantalla de Login
3. Intenta iniciar sesión con Google o Email
4. Debería funcionar ahora ✅

---

## ⚠️ Problema Común: "12500 error"

Si ves un error **12500** al intentar autenticarte con Google:

**Solución:**
1. Verifica que el SHA-1 esté correcto en Firebase Console
2. Espera 5-10 minutos (Firebase tarda en actualizar)
3. Desinstala la app del teléfono
4. Vuelve a instalar con RUN desde Android Studio

---

## 🔐 Para Producción (cuando publiques en Play Store)

Necesitarás también el **SHA-1 de release**:

```powershell
keytool -list -v -keystore factuya-release.keystore -alias factuya
```

Y agregarlo también a Firebase Console en "SHA certificate fingerprints".

---

## 📖 Documentación Oficial

- Firebase Android Setup: https://firebase.google.com/docs/android/setup
- SHA-1 Guide: https://developers.google.com/android/guides/client-auth

---

**¿Dudas?** El proceso es:
1. Obtén SHA-1 → 2. Agrégalo a Firebase → 3. Descarga google-services.json → 4. Rebuild
