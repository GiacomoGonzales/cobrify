# 🔐 Configurar Firebase Authentication

Ya tienes el SHA-1 configurado y el google-services.json. Ahora falta **habilitar los métodos de autenticación**.

---

## 🚀 PASOS RÁPIDOS:

### 1. Abrir Firebase Console
- Ve a: https://console.firebase.google.com
- Selecciona tu proyecto (Cobrify)

### 2. Ir a Authentication
```
En el menú lateral izquierdo:
┌────────────────────────────────┐
│ 🏠 Project Overview            │
│ 🔥 Firestore Database          │
│ 🔐 Authentication  ← CLICK AQUÍ│
│ 📦 Storage                     │
│ ⚡ Functions                    │
└────────────────────────────────┘
```

### 3. Get Started (si es la primera vez)
- Si ves un botón **"Get started"**, haz click
- Si ya está iniciado, verás las pestañas: Users, Sign-in method, Templates, Usage

### 4. Habilitar Email/Password
1. Click en la pestaña **"Sign-in method"**
2. Verás una lista de proveedores:
   ```
   Provider                  Status
   ─────────────────────────────────
   Email/Password            Disabled
   Google                    Disabled
   Phone                     Disabled
   Anonymous                 Disabled
   ...
   ```
3. Click en **"Email/Password"**
4. Se abre un modal:
   - ✅ **Enable** (primer toggle)
   - ❌ **Email link (passwordless sign-in)** (déjalo deshabilitado por ahora)
5. Click en **"Save"**
6. Ahora debería decir **"Enabled"** ✅

### 5. Habilitar Google Sign-In
1. En la misma pestaña **"Sign-in method"**
2. Click en **"Google"**
3. Se abre un modal:
   - ✅ **Enable** (toggle arriba)
   - **Project support email:** Selecciona tu email de la lista desplegable
   - **Project public-facing name:** Déjalo como está o escribe "Factuya"
4. Click en **"Save"**
5. Ahora debería decir **"Enabled"** ✅

---

## ✅ Verificación

Deberías ver algo así en "Sign-in method":

```
Provider                  Status
─────────────────────────────────────
Email/Password            ✅ Enabled
Google                    ✅ Enabled
Phone                     Disabled
Anonymous                 Disabled
```

---

## 🧪 PROBAR EN LA APP

### 1. Crear un usuario de prueba (Opción A):

Si quieres usar **Email/Password**:

1. En Firebase Console → **Authentication** → pestaña **"Users"**
2. Click en **"Add user"**
3. Ingresa:
   - **Email:** tu-email@gmail.com
   - **Password:** una contraseña segura (mínimo 6 caracteres)
4. Click en **"Add user"**

Ahora puedes iniciar sesión en la app con ese email y contraseña.

### 2. Usar Google Sign-In (Opción B):

1. Abre la app en tu teléfono
2. Click en el botón de **"Iniciar sesión con Google"**
3. Selecciona tu cuenta de Google
4. Autoriza los permisos
5. Debería iniciar sesión automáticamente

---

## ⚠️ Si TODAVÍA no funciona

### Error: "12500" al autenticar con Google

**Causa:** Firebase aún está procesando el SHA-1 (tarda unos minutos)

**Solución:**
1. Espera 5-10 minutos
2. **Desinstala** la app del teléfono completamente
3. En Android Studio, click en **RUN (▶️)** de nuevo
4. Prueba iniciar sesión otra vez

### Error: "The email address is already in use"

- Este email ya existe en Firebase
- Usa otro email o inicia sesión con ese email

### Error: "There is no user record corresponding to this identifier"

- El usuario no existe
- Crea el usuario en Firebase Console (paso 1 arriba)
- O regístrate desde la app si tienes pantalla de registro

### Error: "The password is invalid"

- Verifica que la contraseña sea correcta
- Las contraseñas en Firebase deben tener mínimo 6 caracteres

---

## 🔍 Debug: Ver qué está pasando

Si quieres ver los errores específicos:

1. Abre **Android Studio**
2. Ve a la pestaña **"Logcat"** (parte inferior)
3. En el filtro, escribe: `auth` o `firebase`
4. Intenta iniciar sesión en la app
5. Mira qué errores aparecen en Logcat

Copia el error y me lo pasas si necesitas ayuda.

---

## 📋 Checklist Final

- [ ] Authentication habilitado en Firebase Console
- [ ] Email/Password habilitado (si lo usas)
- [ ] Google Sign-In habilitado (si lo usas)
- [ ] Email de soporte configurado para Google Sign-In
- [ ] Usuario de prueba creado (o usas Google)
- [ ] SHA-1 agregado (ya lo hiciste ✅)
- [ ] google-services.json en android/app/ (ya lo hiciste ✅)
- [ ] App rebuildeada (ya lo hiciste ✅)
- [ ] Esperaste 5-10 minutos si usas Google Sign-In

---

## 🎯 Resumen

1. **Firebase Console** → **Authentication** → **Sign-in method**
2. Habilita **Email/Password** (toggle ON + Save)
3. Habilita **Google** (toggle ON + selecciona email + Save)
4. Crea un usuario de prueba en la pestaña **Users**
5. Abre la app y prueba iniciar sesión

**¡Ahora sí debería funcionar! 🎉**

---

**Dime qué método quieres usar (Email/Password o Google) y te ayudo si tienes algún problema.**
