# 📱 Guía Rápida: Desarrollo Móvil (SIMPLE)

Esta es la guía MÁS SIMPLE para trabajar con la app móvil.

---

## 🚀 Primera Vez - Configuración Inicial

### Opción A: Con Teléfono Real (Recomendado)

**1. Activa USB Debugging en tu teléfono:**
```
Android:
Settings → About Phone → Tap "Build Number" 7 times
Settings → System → Developer Options → Enable "USB Debugging"
```

**2. Conecta el teléfono al PC con cable USB**

**3. Acepta el mensaje en el teléfono:** "Allow USB debugging?"

### Opción B: Con Emulador (Sin teléfono)

**1. Abre Android Studio**

**2. Crea un emulador:**
```
Tools → Device Manager → Create Device
→ Pixel 6 → Next → Android 13 → Finish
```

**3. Inicia el emulador** (presiona ▶️ al lado del dispositivo)

---

## 🏃 Flujo de Trabajo Diario

### MÉTODO 1: SIN Live Reload (Para cambios grandes)

**Cuando hagas cambios y quieras verlos en el teléfono:**

```bash
# 1. En la terminal:
npm run mobile:android

# 2. Espera que Android Studio abra

# 3. Presiona el botón verde ▶️ RUN en Android Studio
#    (o Shift + F10)

# 4. Espera 30-60 segundos

# 5. ¡App actualizada en tu teléfono!
```

**Repite cada vez que hagas cambios importantes.**

---

### MÉTODO 2: CON Live Reload (Para cambios rápidos de UI)

**Configuración inicial (solo una vez):**

**Paso 1:** Averigua tu IP local
```bash
# En la terminal (Windows):
ipconfig

# Busca "IPv4 Address" en "Adaptador de LAN inalámbrica Wi-Fi:"
# Ejemplo: 192.168.1.105
```

**Paso 2:** Abre `capacitor.config.ts` y cámbialo así:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.factuya.app',
  appName: 'Factuya',
  webDir: 'dist',
  server: {
    url: 'http://192.168.1.105:3000',  // ← TU IP AQUÍ
    cleartext: true,
  },
};

export default config;
```

**Paso 3:** Guarda el archivo

**Uso diario:**

**Terminal 1 (déjala corriendo):**
```bash
npm run dev:host
```

**Terminal 2 (solo cuando quieras reinstalar la app):**
```bash
npm run mobile:android
# Luego presiona RUN en Android Studio
```

**Ahora:**
- Editas código en `src/`
- Guardas (Ctrl+S)
- ¡Cambios instantáneos en tu teléfono! ⚡

**Para desactivar Live Reload:**
- Vuelve a poner el archivo `capacitor.config.ts` como estaba (sin la sección `server`)

---

## 🎯 ¿Cuál Método Usar?

| Situación | Método |
|-----------|--------|
| Cambio pequeño (color, texto, estilos) | Método 2 (Live Reload) |
| Cambio grande (nueva función, Firebase) | Método 1 (Sin Live Reload) |
| Primera instalación del día | Método 1 |
| Debugging rápido | Método 2 |

---

## 🐛 Ver Logs y Errores

**En Android Studio:**
```
View → Tool Windows → Logcat

Filtra por: "chromium"
Verás todos los console.log() de tu código
```

**En Chrome (para debugging avanzado):**
```
1. Abre Chrome
2. Ve a: chrome://inspect
3. Click en "inspect" bajo tu dispositivo
4. ¡Tienes DevTools completo!
```

---

## ⚠️ Problemas Comunes

### "Android Studio no abre"

**Solución:**
```bash
# Abre Android Studio manualmente:
1. Busca Android Studio en el menú de Windows
2. File → Open → C:\Users\giaco\factuya\android
3. Presiona RUN (▶️)
```

### "No device found"

**Solución:**
1. Verifica que el teléfono está conectado por USB
2. Acepta "Allow USB debugging" en el teléfono
3. En Android Studio, arriba verás un dropdown
4. Selecciona tu dispositivo de la lista

### "Cambios no se reflejan"

**Solución (Método 1):**
```bash
# Ejecuta de nuevo:
npm run mobile:android
# Presiona RUN en Android Studio
```

**Solución (Método 2):**
```bash
# Verifica que npm run dev:host está corriendo
# Verifica la IP en capacitor.config.ts
# Reinstala la app (Método 1 una vez)
```

### "Error al compilar"

**Solución:**
```bash
# Limpia todo y vuelve a empezar:
npm run build
npx cap sync
npm run mobile:android
```

---

## 📝 Comandos Útiles

```bash
# Compilar app web
npm run build

# Sincronizar con plataformas móviles
npx cap sync

# Abrir Android Studio
npm run mobile:android

# Iniciar servidor con live reload
npm run dev:host

# Ver versión instalada en Android
# (En Android Studio, aparece al lado del botón RUN)
```

---

## 🎨 Tips Pro

### 1. Usa dos monitores:
- Monitor 1: VS Code editando código
- Monitor 2: Teléfono/Emulador viendo cambios

### 2. Atajos de teclado útiles:
- `Ctrl + S`: Guardar (dispara live reload)
- `Shift + F10`: Ejecutar app en Android Studio
- `Ctrl + Shift + F`: Buscar en todo el proyecto

### 3. Chrome DevTools para móvil:
```
chrome://inspect
→ Tienes todos los tabs de DevTools:
  - Console (logs)
  - Network (llamadas Firebase)
  - Elements (inspeccionar HTML)
  - Sources (debugger con breakpoints)
```

### 4. Recarga manual en el dispositivo:
```
Si el live reload no funciona:
- Presiona Home en el teléfono
- Cierra la app
- Vuelve a abrirla
```

---

## 🎯 Workflow Recomendado

**Para el día a día:**

```bash
# 1. Abrir VS Code en factuya/
# 2. Terminal 1:
npm run dev:host

# 3. Terminal 2 (solo primera vez del día):
npm run mobile:android
# Presionar RUN en Android Studio

# 4. Editar código en src/
# 5. Guardar (Ctrl+S)
# 6. Ver cambios en el teléfono (2-3 segundos)

# Al terminar:
# Ctrl+C en ambas terminales
```

---

## ✅ Checklist Rápido

Antes de empezar:
- [ ] Android Studio instalado
- [ ] Teléfono conectado (o emulador corriendo)
- [ ] USB Debugging activado (si es teléfono real)
- [ ] Teléfono y PC en la misma WiFi (para live reload)

Para trabajar:
- [ ] Terminal 1: `npm run dev:host` corriendo
- [ ] App instalada en dispositivo
- [ ] Editando en VS Code
- [ ] Viendo cambios en tiempo real

---

**¿Dudas?** Empieza con el Método 1 (sin live reload) hasta que te acostumbres, luego prueba el Método 2.
