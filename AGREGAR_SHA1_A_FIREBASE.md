# 🔥 Agregar SHA-1 a Firebase Console

## Tu SHA-1:
```
B9:24:ED:70:7E:0B:4F:48:A1:E0:9A:67:13:03:E0:11:57:56:1D:D4
```

**COPIA ESTO ^^ (Ctrl+C)**

---

## 🚀 PASOS RÁPIDOS:

### 1. Abrir Firebase Console
- Ve a: https://console.firebase.google.com
- Inicia sesión con tu cuenta de Google
- Selecciona tu proyecto de Factuya

### 2. Ir a Project Settings
- Busca el ícono de **engranaje ⚙️** en la parte superior izquierda
- Click en **"Project settings"**

### 3. Scroll hasta "Your apps"
- Baja hasta la sección **"Your apps"**
- Mira qué plataformas tienes agregadas

### 4. Dos opciones según lo que veas:

#### OPCIÓN A: Ya tienes app Android (ícono robot verde 🤖)
1. Click en tu **app Android**
2. Scroll down hasta **"SHA certificate fingerprints"**
3. Click en **"Add fingerprint"**
4. **Pega** el SHA-1: `B9:24:ED:70:7E:0B:4F:48:A1:E0:9A:67:13:03:E0:11:57:56:1D:D4`
5. Click en **"Save"**
6. ✅ **¡LISTO! Salta al Paso 5**

#### OPCIÓN B: NO tienes app Android
1. Click en **"Add app"** o en el ícono de Android
2. Llena el formulario:
   - **Android package name:** `com.factuya.app`
   - **App nickname (opcional):** `Factuya`
   - **Debug signing certificate SHA-1:** `B9:24:ED:70:7E:0B:4F:48:A1:E0:9A:67:13:03:E0:11:57:56:1D:D4`
3. Click en **"Register app"**
4. **IMPORTANTE:** Click en **"Download google-services.json"** (botón azul)
   - El archivo se descargará a tu carpeta **Descargas**
5. Click **"Next"** → **"Next"** → **"Continue to console"**

---

### 5. Descargar google-services.json

#### Si ya tenías app Android (Opción A):
1. En la misma pantalla de Project Settings
2. Scroll hasta tu app Android
3. Busca el botón **"google-services.json"**
4. Click para **descargar**

#### Si acabas de crear la app (Opción B):
- Ya lo descargaste en el paso 4 ✅

---

### 6. Copiar google-services.json a tu proyecto

**Opción Automática:**
1. Verifica que `google-services.json` esté en tu carpeta **Descargas**
2. Haz doble click en: **`copiar-google-services.bat`**
3. Sigue las instrucciones

**Opción Manual:**
1. Ve a tu carpeta **Descargas**
2. Encuentra `google-services.json`
3. Cópialo
4. Pégalo en: `C:\Users\giaco\factuya\android\app\`
5. Reemplaza el archivo si ya existe

---

### 7. Rebuild la App

Abre una **nueva terminal** (PowerShell o CMD) y ejecuta:

```bash
npm run mobile:sync
```

Espera a que termine (30-60 segundos).

Luego en **Android Studio**:
1. **Build** → **Clean Project**
2. **Build** → **Rebuild Project**
3. Click en **RUN (▶️)**

---

### 8. Probar Autenticación

1. La app se abre en tu teléfono
2. Deberías ver la pantalla de **Login**
3. Intenta iniciar sesión con:
   - **Email y contraseña** (si tienes cuenta)
   - **Google Sign-In**

**¡Debería funcionar ahora! 🎉**

---

## ⚠️ Si sigue sin funcionar

### Error "12500" al autenticar con Google
**Causa:** Firebase aún no ha procesado el SHA-1 (tarda unos minutos)

**Solución:**
1. Espera **5-10 minutos**
2. **Desinstala** la app del teléfono
3. Vuelve a **instalar** (RUN desde Android Studio)

### Error "API key not valid"
**Causa:** El `google-services.json` no está en el lugar correcto

**Solución:**
1. Verifica que está en: `android/app/google-services.json`
2. Ejecuta: `npm run mobile:sync`
3. **Clean Project** en Android Studio
4. **Rebuild Project**

---

## 📞 Resumen del Proceso

```
✅ 1. Obtener SHA-1 (YA LO TIENES)
   → B9:24:ED:70:7E:0B:4F:48:A1:E0:9A:67:13:03:E0:11:57:56:1D:D4

📝 2. Agregar SHA-1 a Firebase Console
   → Project Settings → Your apps → Android → Add fingerprint

📥 3. Descargar google-services.json
   → Se descarga a Descargas/

📁 4. Copiar a android/app/
   → Usa copiar-google-services.bat

🔨 5. Rebuild
   → npm run mobile:sync
   → Android Studio: Clean → Rebuild → RUN

✅ 6. Probar autenticación
   → Login con Email o Google
```

---

**¡Ahora ve a Firebase Console y sigue los pasos!**

Si necesitas ayuda, dime en qué paso estás y te guío más detalladamente.
