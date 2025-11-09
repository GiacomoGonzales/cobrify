# 📱 Guía de Desarrollo Móvil - Factuya

Este documento explica cómo desarrollar, compilar y publicar las apps móviles de Factuya para Android e iOS.

## 🚀 Inicio Rápido

### Comandos Disponibles

```bash
# Desarrollo web normal (no cambia)
npm run dev

# Build web normal (no cambia)
npm run build

# Sincronizar código web con apps móviles
npm run mobile:sync

# Abrir proyecto Android en Android Studio
npm run mobile:android

# Abrir proyecto iOS en Xcode (requiere Mac)
npm run mobile:ios

# Solo copiar archivos web a plataformas móviles
npm run mobile:build
```

## 📋 Requisitos Previos

### Para Android:
- ✅ **Android Studio** instalado
- ✅ **JDK 17** o superior
- ✅ SDK de Android (API 33+)
- ✅ Dispositivo Android o Emulador configurado

### Para iOS:
- ✅ **Mac** con macOS
- ✅ **Xcode 15** o superior
- ✅ **CocoaPods** instalado (`sudo gem install cocoapods`)
- ✅ Cuenta de Apple Developer ($99/año para publicar)

## 🛠️ Flujo de Trabajo

### 1️⃣ Desarrollo Normal
```bash
# Trabajas en tu código React normalmente
npm run dev

# Haces cambios en src/
# Todo funciona igual que antes
```

### 2️⃣ Cuando quieres probar en móvil
```bash
# Opción A: Abrir Android Studio
npm run mobile:android
# Luego presiona "Run" en Android Studio

# Opción B: Abrir Xcode (solo Mac)
npm run mobile:ios
# Luego presiona "Play" en Xcode
```

### 3️⃣ Cuando haces cambios en el código
```bash
# Siempre que modifiques src/, ejecuta:
npm run mobile:sync

# Esto hace:
# 1. npm run build (compila React)
# 2. npx cap sync (copia a Android/iOS)
```

## 📂 Estructura del Proyecto

```
factuya/
├── src/                    # Código React (mismo de siempre)
├── public/                 # Assets web
├── dist/                   # Build de producción
├── android/                # Proyecto Android nativo (NO TOCAR)
├── ios/                    # Proyecto iOS nativo (NO TOCAR)
├── capacitor.config.json   # Configuración de Capacitor
└── vite.config.js          # Actualizado para móvil
```

## ⚙️ Configuración

### capacitor.config.json
```json
{
  "appId": "com.factuya.app",
  "appName": "Factuya",
  "webDir": "dist"
}
```

### App ID Explicado
- **com.factuya.app** = Identificador único
- Se usa en Google Play y App Store
- NO se puede cambiar después de publicar

## 🔧 Debugging

### Ver logs en Android:
```bash
# En Android Studio:
# View -> Tool Windows -> Logcat
```

### Ver logs en iOS:
```bash
# En Xcode:
# View -> Debug Area -> Activate Console
```

### Debugging remoto:
```bash
# Android (Chrome DevTools)
chrome://inspect

# iOS (Safari DevTools - solo Mac)
# Safari -> Develop -> [Tu iPhone] -> [Factuya]
```

## 📦 Plugins Instalados

Actualmente solo tiene los plugins base. Para agregar funcionalidades nativas:

```bash
# Ejemplos de plugins útiles:

# Compartir archivos (PDFs, imágenes)
npm install @capacitor/share @capacitor/filesystem

# Notificaciones push
npm install @capacitor/push-notifications

# Cámara y fotos
npm install @capacitor/camera

# Geolocalización (para delivery)
npm install @capacitor/geolocation

# Scanner de códigos de barras
npm install @capacitor/barcode-scanner
```

Después de instalar cualquier plugin:
```bash
npm run mobile:sync
```

## 🚀 Publicación

### Android (Google Play)

1. **Generar APK de prueba:**
```bash
cd android
./gradlew assembleDebug
# APK en: android/app/build/outputs/apk/debug/
```

2. **Generar APK firmado (producción):**
```bash
# Crear keystore (solo una vez)
keytool -genkey -v -keystore factuya-release.keystore -alias factuya -keyalg RSA -keysize 2048 -validity 10000

# Compilar release
./gradlew bundleRelease
# AAB en: android/app/build/outputs/bundle/release/
```

3. **Subir a Google Play Console**
- Costo: $25 (pago único)
- URL: https://play.google.com/console

### iOS (App Store)

1. **Configurar en Xcode:**
```bash
npm run mobile:ios
# En Xcode:
# - Configurar Signing & Capabilities
# - Seleccionar tu equipo de desarrollo
```

2. **Archivar para App Store:**
```
Product -> Archive
Window -> Organizer -> Distribute App
```

3. **Subir a App Store Connect**
- Costo: $99/año
- URL: https://appstoreconnect.apple.com

## ⚠️ Problemas Comunes

### Android Studio no detecta dispositivo
```bash
# Windows: Habilitar USB Debugging en el teléfono
# Settings -> Developer Options -> USB Debugging

# Verificar conexión:
adb devices
```

### iOS: "No provisioning profiles found"
```
# En Xcode:
# Signing & Capabilities -> Team -> Selecciona tu equipo
```

### Cambios no se reflejan en móvil
```bash
# Siempre ejecuta después de cambios:
npm run mobile:sync
```

### Error: "base path not found"
```bash
# Verifica que vite.config.js tenga:
base: './'
```

## 🌐 App Web vs App Móvil

### ✅ La app WEB sigue funcionando IGUAL
- Firebase Hosting: https://tu-dominio.web.app
- Sin cambios en deployment
- Sin cambios en funcionalidad

### 📱 Las apps MÓVILES son independientes
- Se compilan por separado
- Se publican en tiendas
- Usan el mismo código React

## 📞 Soporte

- **Documentación Capacitor:** https://capacitorjs.com/docs
- **Android Studio:** https://developer.android.com/studio
- **Xcode:** https://developer.apple.com/xcode

## 🎯 Próximos Pasos Sugeridos

1. ✅ Probar la app en Android Studio
2. ✅ Probar la app en un dispositivo real
3. ⬜ Agregar icono y splash screen personalizados
4. ⬜ Configurar notificaciones push
5. ⬜ Optimizar para diferentes tamaños de pantalla
6. ⬜ Publicar versión beta en Google Play
7. ⬜ Publicar versión beta en TestFlight (iOS)

---

**¿Preguntas?** Revisa la documentación de Capacitor o contacta al equipo de desarrollo.
