# 🚀 Desarrollo Móvil con Live Reload (como Expo Go)

Esta guía te muestra cómo desarrollar con **cambios instantáneos** en tu dispositivo móvil, similar a Expo Go.

---

## ⚡ Método 1: Live Reload Automático (MÁS FÁCIL)

Este método es **exactamente como Expo Go** - modificas código y se actualiza automáticamente en tu teléfono.

### Android

```bash
# 1. Conecta tu teléfono Android por USB o usa el emulador

# 2. Ejecuta este comando UNA SOLA VEZ:
npm run mobile:dev:android

# Esto hace:
# ✅ Inicia el servidor de desarrollo (Vite)
# ✅ Compila la app
# ✅ Instala en tu teléfono
# ✅ Habilita live reload

# 3. ¡Ahora edita tu código en src/ y verás cambios INSTANTÁNEOS!
```

### iOS (requiere Mac)

```bash
# 1. Conecta tu iPhone por USB o usa el simulador

# 2. Ejecuta este comando UNA SOLA VEZ:
npm run mobile:dev:ios

# 3. ¡Edita código y se actualiza automáticamente!
```

### ✨ ¿Qué pasa cuando usas estos comandos?

1. Se inicia `vite` en modo desarrollo (puerto 3000)
2. La app móvil se conecta a tu computadora por WiFi
3. Cada vez que guardas un archivo en `src/`:
   - ✅ Vite recompila automáticamente
   - ✅ La app en tu teléfono se recarga sola
   - ✅ Ves los cambios EN SEGUNDOS

**¡Es EXACTAMENTE como Expo Go!**

---

## 🔧 Método 2: Live Reload Manual (si el automático no funciona)

### Paso 1: Averigua tu IP local

**Windows:**
```bash
ipconfig
# Busca "IPv4 Address" - algo como 192.168.1.XXX
```

**Mac/Linux:**
```bash
ifconfig
# Busca "inet" - algo como 192.168.1.XXX
```

### Paso 2: Configura capacitor.config.ts

Abre `capacitor.config.ts` y **descomenta y actualiza** esta línea:

```typescript
const config: CapacitorConfig = {
  appId: 'com.factuya.app',
  appName: 'Factuya',
  webDir: 'dist',
  server: {
    // ⬇️ DESCOMENTA Y CAMBIA LA IP POR LA TUYA
    url: 'http://192.168.1.XXX:3000', // Tu IP local
    cleartext: true,
  },
};
```

**Ejemplo:** Si tu IP es `192.168.1.105`, pon:
```typescript
url: 'http://192.168.1.105:3000',
```

### Paso 3: Inicia el servidor web

```bash
# Terminal 1: Servidor de desarrollo
npm run dev:host
```

### Paso 4: Abre la app en tu teléfono

```bash
# Terminal 2: Abre Android Studio
npm run mobile:android

# O para iOS:
npm run mobile:ios

# Luego presiona RUN en el IDE
```

### Paso 5: ¡Desarrolla!

Ahora:
1. **Editas** código en `src/`
2. **Guardas** (Ctrl+S)
3. **Ves cambios** instantáneos en tu teléfono

---

## 📱 Debugging Remoto

### Android: Chrome DevTools

1. Abre Chrome en tu PC
2. Ve a: `chrome://inspect`
3. Busca tu dispositivo en la lista
4. Click en "Inspect"
5. ¡Tienes acceso a la consola y debugger!

**Captura de pantalla:**
```
chrome://inspect
├── Devices
│   └── Samsung Galaxy S21 (o tu dispositivo)
│       └── com.factuya.app
│           └── [Inspect] ← Click aquí
```

### iOS: Safari DevTools (solo Mac)

1. En iPhone: Settings → Safari → Advanced → Web Inspector (ON)
2. En Mac: Safari → Develop → [Tu iPhone] → Factuya
3. ¡Se abre DevTools con consola y debugger!

---

## 🔥 Flujo de Trabajo Recomendado

### Para cambios pequeños (UI, estilos):

```bash
# Opción A: Live reload automático (MÁS RÁPIDO)
npm run mobile:dev:android

# Edita src/ → Guarda → Ves cambios instantáneos
```

### Para cambios grandes (plugins, configuración):

```bash
# 1. Haz cambios en src/
# 2. Build y sync:
npm run mobile:sync

# 3. Abre IDE y ejecuta:
npm run mobile:android  # o mobile:ios
```

---

## 🐛 Solución de Problemas

### ❌ "No se conecta al servidor"

**Causa:** Tu teléfono no puede acceder a tu PC por WiFi.

**Solución:**
1. Verifica que tu PC y teléfono estén en **la misma red WiFi**
2. Desactiva el **firewall** temporalmente
3. Verifica la IP correcta con `ipconfig`

**Windows: Permitir acceso en Firewall:**
```
Panel de Control → Firewall → Permitir app
→ Buscar "Node.js" → Marcar "Privada y Pública"
```

### ❌ "Cambios no se reflejan"

**Solución:**
```bash
# 1. Para el servidor (Ctrl+C)
# 2. Limpia cache:
npm run build
npx cap sync

# 3. Reinicia:
npm run mobile:dev:android
```

### ❌ "Error: EADDRINUSE port 3000"

**Causa:** El puerto ya está en uso.

**Solución:**
```bash
# Windows: Mata el proceso
netstat -ano | findstr :3000
taskkill /PID [número] /F

# O cambia el puerto en vite.config.js:
server: {
  port: 3001,  // Cambiar a 3001
}
```

---

## 📊 Comparación con Expo Go

| Característica | Expo Go | Capacitor Live Reload |
|----------------|---------|----------------------|
| Hot Reload | ✅ Sí | ✅ Sí |
| Velocidad | ⚡ Muy rápido | ⚡ Muy rápido |
| Configuración inicial | ✅ Fácil | ⚙️ Un poco más config |
| Debugging | ✅ Excelente | ✅ Excelente |
| Apps nativas | ❌ No | ✅ Sí, 100% nativas |
| Plugins nativos | ⚠️ Limitados | ✅ Todos |
| Publicar en tiendas | ⚠️ Requiere Expo build | ✅ Directo |

**Resultado:** Capacitor es más completo y da control total.

---

## 💡 Tips Pro

### 1. Mantén dos terminales abiertas:

**Terminal 1: Servidor siempre corriendo**
```bash
npm run dev:host
```

**Terminal 2: Para comandos ocasionales**
```bash
npx cap sync
npx cap open android
```

### 2. Usa un alias para tu IP:

En `capacitor.config.ts`, algunas redes usan nombres:
```typescript
// En lugar de IP, usa el nombre de tu PC:
url: 'http://TU-PC-NOMBRE.local:3000',
```

### 3. Debugea con logs:

En tu código:
```javascript
console.log('🔍 Debug:', variable)
```

Luego ve los logs en:
- **Android:** Chrome → chrome://inspect
- **iOS:** Safari → Develop → iPhone

### 4. Shortcuts útiles:

**Android Emulator:**
- `Ctrl+M`: Abrir menú de desarrollo
- `R R`: Recargar app manualmente

**iOS Simulator:**
- `Cmd+D`: Abrir menú de desarrollo
- `Cmd+R`: Recargar app manualmente

---

## 🎯 Resumen Rápido

**Para desarrollo diario (como Expo Go):**
```bash
# Android:
npm run mobile:dev:android

# iOS:
npm run mobile:dev:ios
```

**Edita → Guarda → ¡Ves cambios instantáneos! 🚀**

---

## 📖 Referencias

- Capacitor Live Reload: https://capacitorjs.com/docs/guides/live-reload
- Chrome DevTools: https://developer.chrome.com/docs/devtools/remote-debugging/
- Safari Web Inspector: https://webkit.org/web-inspector/

---

**¿Preguntas?** Todo funciona exactamente como Expo Go, solo que con más control y mejores apps nativas.
