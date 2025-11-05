# 🚨 INSTRUCCIONES URGENTES DE SEGURIDAD

Tu clave de API de Firebase ha sido expuesta públicamente en GitHub. **Debes actuar inmediatamente** para proteger tu proyecto.

## ⚠️ ¿Qué pasó?

Los archivos `setup-admin-simple.js` y otros scripts contenían tu clave de API hardcodeada y fueron subidos a GitHub (repositorio público). Esto significa que cualquiera puede:
- Acceder a tu base de datos Firebase
- Consumir tu cuota de Firebase
- Potencialmente manipular datos

## ✅ Lo que ya hice

1. ✅ Eliminé los archivos sensibles del repositorio
2. ✅ Actualicé `.gitignore` para prevenir futuros problemas
3. ✅ Hice commit y push de los cambios

## 🔐 Lo que TÚ debes hacer AHORA (URGENTE)

### Paso 1: Regenerar la Clave de API de Firebase

1. **Ve a Google Cloud Console:**
   - Abre: https://console.cloud.google.com/
   - Inicia sesión con tu cuenta de Google

2. **Selecciona tu proyecto:**
   - En la parte superior, selecciona el proyecto "Cobrify (cobrify-395fe)"

3. **Ve a Credenciales:**
   - En el menú lateral, ve a: **APIs & Services > Credentials**
   - O accede directamente: https://console.cloud.google.com/apis/credentials?project=cobrify-395fe

4. **Encuentra la clave expuesta:**
   - Busca la clave: `AIzaSyBKRnXbahmNyYs7-KNQnHOxDAbo90veto4`
   - Haz clic en el icono de lápiz (editar) junto a ella

5. **Elimina o regenera la clave:**
   - **OPCIÓN A (Recomendada):** Haz clic en "DELETE KEY" para eliminarla completamente
   - **OPCIÓN B:** Si necesitas mantenerla, haz clic en "REGENERATE KEY"

### Paso 2: Crear una Nueva Clave de API (si la eliminaste)

1. En la página de Credenciales, haz clic en **"+ CREATE CREDENTIALS"**
2. Selecciona **"API key"**
3. Se creará una nueva clave - **cópiala inmediatamente**

### Paso 3: Agregar Restricciones a la Nueva Clave (MUY IMPORTANTE)

⚠️ **NUNCA uses una clave de API sin restricciones**

1. Después de crear/regenerar la clave, haz clic en **"RESTRICT KEY"**

2. **Application restrictions:**
   - Selecciona: **"HTTP referrers (web sites)"**
   - Añade estos referrers (URLs permitidas):
     ```
     localhost:*
     https://tu-dominio.com/*
     https://*.tu-dominio.com/*
     ```

3. **API restrictions:**
   - Selecciona: **"Restrict key"**
   - Marca solo las APIs que uses:
     - ✅ Firebase Realtime Database API
     - ✅ Cloud Firestore API
     - ✅ Identity Toolkit API (Firebase Auth)
     - ✅ Firebase Storage API

4. Haz clic en **"SAVE"**

### Paso 4: Actualizar tu Aplicación con la Nueva Clave

1. Abre tu archivo `.env.local` en tu proyecto local

2. Actualiza la clave de API:
   ```env
   VITE_FIREBASE_API_KEY=TU_NUEVA_CLAVE_AQUI
   ```

3. **NO COMPARTAS** esta clave en:
   - ❌ Repositorios públicos de GitHub
   - ❌ Capturas de pantalla
   - ❌ Chats públicos
   - ❌ Documentación pública

### Paso 5: Verificar que la Aplicación Funciona

1. Reinicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

2. Prueba que puedas:
   - Iniciar sesión
   - Ver tus productos
   - Acceder a la base de datos

### Paso 6: Revisar la Actividad Reciente

1. Ve a Firebase Console: https://console.firebase.google.com/
2. Selecciona tu proyecto "Cobrify"
3. Revisa:
   - **Authentication > Users**: Verifica que no haya usuarios extraños
   - **Firestore Database**: Verifica que los datos estén intactos
   - **Usage and billing**: Verifica que no haya uso anormal

## 🛡️ Mejores Prácticas para el Futuro

1. **NUNCA hardcodees credenciales en el código**
   - ✅ Usa archivos `.env` o `.env.local`
   - ✅ Añade `.env*` al `.gitignore`

2. **Siempre agrega restricciones a las API keys**
   - Limita por dominio (HTTP referrers)
   - Limita por APIs específicas

3. **Revisa tu `.gitignore` antes de hacer commit**
   - Asegúrate de que archivos sensibles no se suban

4. **Usa secretos de GitHub para CI/CD**
   - No expongas variables de entorno en actions

## 📞 ¿Necesitas Ayuda?

Si tienes problemas con alguno de estos pasos, avísame y te ayudaré.

## ✅ Checklist Final

- [ ] Eliminé/regeneré la clave expuesta en Google Cloud Console
- [ ] Creé una nueva clave de API (si fue necesario)
- [ ] Agregué restricciones a la nueva clave (HTTP referrers + API restrictions)
- [ ] Actualicé `.env.local` con la nueva clave
- [ ] Reinicié el servidor y verifiqué que funciona
- [ ] Revisé la actividad reciente en Firebase Console
- [ ] Verifiqué que no hay usuarios o datos extraños

---

**⏰ HAZLO AHORA - No pospongas esta tarea**

Mientras la clave expuesta esté activa, tu proyecto está en riesgo.
