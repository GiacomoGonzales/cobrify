# 🔥 Firebase: Guía Paso a Paso (CON CAPTURAS)

Esta guía te lleva de la mano para configurar Firebase Auth en tu app móvil.

---

## ✅ ANTES DE EMPEZAR

### Necesitas:
1. [ ] Java instalado (para obtener SHA-1)
2. [ ] Cuenta de Google (la que usaste para crear el proyecto Firebase)
3. [ ] 10 minutos

---

## 📋 PASO 1: Instalar Java

### ¿Ya tienes Java?

Abre PowerShell y ejecuta:
```powershell
java -version
```

**Si ves algo como:**
```
openjdk version "17.0.X"
```
✅ **Ya tienes Java, salta al Paso 2**

**Si ves:**
```
'java' is not recognized...
```
❌ **Necesitas instalar Java:**

### Instalar Java (Opción 1 - Recomendada):

1. Ve a: https://adoptium.net/
2. Click en **"Download"** (botón azul grande)
3. Descarga e instala el archivo `.msi`
4. **IMPORTANTE:** Durante la instalación, marca ✅ "Set JAVA_HOME variable"
5. Finish
6. **Cierra y abre PowerShell de nuevo**
7. Verifica: `java -version`

### O usa el Java de Android Studio (Opción 2):

```powershell
# En PowerShell:
setx JAVA_HOME "C:\Program Files\Android\Android Studio\jbr"

# Cierra y abre PowerShell de nuevo
```

---

## 🔐 PASO 2: Obtener SHA-1

### En la carpeta del proyecto:

1. Haz doble click en: **`get-sha1.bat`**
2. Espera 10-20 segundos
3. Verás algo como:

```
Variant: debug
Config: debug
Store: C:\Users\giaco\.android\debug.keystore
Alias: AndroidDebugKey
MD5: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
SHA1: A1:B2:C3:D4:E5:F6:G7:H8:I9:J0:K1:L2:M3:N4:O5:P6:Q7:R8:S9:T0
       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       COPIA ESTA LÍNEA COMPLETA
SHA-256: ...
```

4. **Selecciona y copia** la línea completa del SHA1 (con los dos puntos incluidos)
5. Pégala en un Notepad temporalmente

---

## 🔥 PASO 3: Abrir Firebase Console

1. Ve a: https://console.firebase.google.com
2. Inicia sesión con tu cuenta de Google
3. Deberías ver tu proyecto (algo como "factuya-XXXXX")
4. **Click en el proyecto**

---

## ⚙️ PASO 4: Ir a Project Settings

**En la consola de Firebase:**

```
┌────────────────────────────────────────┐
│ ⚙️ Project Settings  ← CLICK AQUÍ     │
│    Users and permissions               │
│    Integrations                        │
└────────────────────────────────────────┘
```

1. En el menú lateral izquierdo, arriba
2. Click en el ícono de **engranaje ⚙️**
3. Click en **"Project settings"**

---

## 📱 PASO 5: Agregar App Android

**Scroll down** en Project Settings hasta la sección **"Your apps"**

### ¿Qué ves?

#### Caso A: Solo ves Web (ícono </>)
```
Your apps:
┌─────┐
│ </> │  Web app
└─────┘
```

**HAZ ESTO:**
1. Más abajo verás: **"Add app"** o iconos de plataformas
2. Click en el ícono de **Android** (robot verde)
3. Salta a **"Formulario de Registro"** abajo ⬇️

#### Caso B: Ya ves Android (ícono robot)
```
Your apps:
┌─────┐  ┌─────┐
│ </> │  │ 🤖  │  Android app
└─────┘  └─────┘
```

**HAZ ESTO:**
1. Click en la **app Android** (el robot)
2. Scroll down hasta **"SHA certificate fingerprints"**
3. Click en **"Add fingerprint"**
4. Pega el SHA-1 que copiaste
5. Click **"Save"**
6. ✅ **¡LISTO! Salta al Paso 6**

---

## 📝 Formulario de Registro (si NO tenías app Android)

Te mostrará un formulario:

```
┌──────────────────────────────────────────────┐
│ Add Firebase to your Android app            │
├──────────────────────────────────────────────┤
│                                              │
│ Android package name *                       │
│ ┌──────────────────────────────────────────┐ │
│ │ com.factuya.app                          │ │  ← ESCRIBE ESTO
│ └──────────────────────────────────────────┘ │
│                                              │
│ App nickname (optional)                      │
│ ┌──────────────────────────────────────────┐ │
│ │ Factuya                                  │ │  ← ESCRIBE ESTO
│ └──────────────────────────────────────────┘ │
│                                              │
│ Debug signing certificate SHA-1 (optional)   │
│ ┌──────────────────────────────────────────┐ │
│ │ A1:B2:C3:D4:E5:...                       │ │  ← PEGA EL SHA-1
│ └──────────────────────────────────────────┘ │
│                                              │
│         [Register app]                       │  ← CLICK AQUÍ
└──────────────────────────────────────────────┘
```

**Llena:**
1. **Android package name:** `com.factuya.app` (exactamente así)
2. **App nickname:** `Factuya` (o el nombre que quieras)
3. **Debug signing certificate SHA-1:** Pega el SHA-1 que copiaste

**Click en "Register app"**

---

## 📥 PASO 6: Descargar google-services.json

Después de registrar, te muestra:

```
┌──────────────────────────────────────────────┐
│ Download and then add config file            │
├──────────────────────────────────────────────┤
│                                              │
│ Download google-services.json and place it  │
│ in your app/ directory                       │
│                                              │
│    [Download google-services.json]           │  ← CLICK AQUÍ
│                                              │
│         [Next]                               │
└──────────────────────────────────────────────┘
```

1. **Click en "Download google-services.json"**
2. Se descargará a tu carpeta **Descargas**
3. **Click en "Next"** → **"Next"** → **"Continue to console"**

---

## 📁 PASO 7: Copiar el Archivo

**Opción A (automático):**

1. Haz doble click en: **`copiar-google-services.bat`**
2. Sigue las instrucciones

**Opción B (manual):**

1. Ve a tu carpeta **Descargas**
2. Busca el archivo **`google-services.json`**
3. Cópialo
4. Pégalo en: `C:\Users\giaco\factuya\android\app\`

---

## 🔨 PASO 8: Rebuild la App

En la terminal de VS Code:

```bash
npm run mobile:sync
```

Espera a que termine (30-60 segundos).

Luego en **Android Studio**:

```
Build → Clean Project
Build → Rebuild Project
```

Finalmente, presiona **RUN (▶️)**

---

## ✅ PASO 9: Probar

1. La app se abre en tu teléfono
2. Ahora verás la pantalla de **Login** (no landing)
3. Intenta iniciar sesión con:
   - Email y contraseña
   - O Google Sign-In

**Debería funcionar ahora! 🎉**

---

## 🐛 Si NO funciona

### Error: "12500" al autenticar con Google

**Causa:** Firebase aún no ha actualizado el SHA-1

**Solución:**
1. Espera 5-10 minutos
2. Desinstala la app del teléfono
3. Vuelve a instalar (RUN desde Android Studio)

### Error: "API key not valid"

**Causa:** El google-services.json no está en el lugar correcto

**Solución:**
1. Verifica que está en: `android/app/google-services.json`
2. Rebuild: `npm run mobile:sync`
3. Clean Project en Android Studio

---

## 📞 Ayuda Adicional

**¿Dónde estás atorado?**

1. ¿No puedes obtener el SHA-1? → Revisa que Java esté instalado
2. ¿No encuentras Project Settings? → Busca el ícono ⚙️ arriba a la izquierda
3. ¿No sabes si ya tienes app Android? → Mándame screenshot de "Your apps"
4. ¿Otra cosa? → Dime en qué paso estás

---

## 🎯 Checklist Final

- [ ] Java instalado
- [ ] SHA-1 obtenido y copiado
- [ ] App Android agregada en Firebase Console
- [ ] SHA-1 agregado a Firebase
- [ ] google-services.json descargado
- [ ] google-services.json copiado a android/app/
- [ ] npm run mobile:sync ejecutado
- [ ] App rebuildeada en Android Studio
- [ ] App probada en teléfono
- [ ] ✅ Autenticación funciona!

---

**¡Sigamos paso a paso!** Dime en qué paso estás o si necesitas ayuda con algo específico.
