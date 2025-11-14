# Guía para Generar APK de Factuya

## Opción 1: APK Rápido (Sin Firmar) - Para Testing

**Usa esto si necesitas un APK rápido para probar**

1. Ejecuta: `generar-apk.bat`
2. Espera a que termine el proceso
3. El APK estará en: `android\app\build\outputs\apk\release\app-release-unsigned.apk`
4. Copia este archivo a tu teléfono e instálalo

**Nota:** Android mostrará advertencia de "App no verificada" pero funcionará.

---

## Opción 2: APK Firmado (Recomendado) - Para Clientes

**Usa esto para distribuir a clientes de forma profesional**

### Primera vez (Solo una vez):

#### Paso 1: Crear Keystore
```bash
crear-keystore.bat
```

**IMPORTANTE:**
- Guarda la contraseña que elijas en un lugar SEGURO
- Nunca pierdas el archivo `factuya-release-key.keystore`
- Si lo pierdes, no podrás actualizar tu app en el futuro

Cuando te pida información, ingresa:
- **Alias:** `factuya-key` (puedes usar otro nombre)
- **Password:** Elige una contraseña SEGURA y GUÁRDALA
- **Nombre:** Tu nombre
- **Organización:** Nombre de tu empresa
- **Ciudad/Estado/País:** Tu ubicación

#### Paso 2: Configurar Firma en Android

Crea el archivo `android/key.properties` con este contenido:

```properties
storePassword=TU_CONTRASEÑA_AQUI
keyPassword=TU_CONTRASEÑA_AQUI
keyAlias=factuya-key
storeFile=factuya-release-key.keystore
```

**Reemplaza `TU_CONTRASEÑA_AQUI`** con la contraseña que elegiste en el Paso 1.

#### Paso 3: Modificar build.gradle

Edita `android/app/build.gradle` y agrega ANTES de `android {`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Luego DENTRO del bloque `android { }`, agrega ANTES de `buildTypes {`:

```gradle
signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
        storePassword keystoreProperties['storePassword']
    }
}
```

Y modifica `buildTypes { release {` para incluir:

```gradle
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

#### Paso 4: Agregar archivos al .gitignore

**MUY IMPORTANTE:** Agrega al archivo `.gitignore`:

```
# Android signing
android/key.properties
android/app/*.keystore
android/app/*.jks
```

### Generar APK Firmado (Cada vez que necesites):

```bash
generar-apk-firmado.bat
```

El APK firmado estará en: `android\app\build\outputs\apk\release\app-release.apk`

---

## Cómo Compartir el APK con Clientes

### Opción A: WhatsApp/Email
1. Comprime el APK en un ZIP (WhatsApp no permite APK directos)
2. Envía el ZIP
3. Cliente descomprime e instala

### Opción B: Google Drive/Dropbox
1. Sube el APK a tu Drive/Dropbox
2. Comparte el enlace con el cliente
3. Cliente descarga e instala

### Opción C: Página Web
1. Sube el APK a tu servidor web
2. Crea una página de descarga
3. Cliente descarga desde el navegador

---

## Instrucciones para el Cliente

**Envía estas instrucciones al cliente:**

1. **Permitir instalación de fuentes desconocidas:**
   - Ve a Configuración > Seguridad
   - Activa "Fuentes desconocidas" o "Instalar apps desconocidas"
   - (En Android 8+, se pedirá permiso al instalar)

2. **Instalar la app:**
   - Descarga el archivo APK
   - Abre el archivo desde Descargas
   - Toca "Instalar"
   - Si aparece advertencia, toca "Instalar de todas formas"

3. **Primera apertura:**
   - La app pedirá permisos (cámara, almacenamiento, etc.)
   - Acepta los permisos necesarios
   - ¡Listo para usar!

---

## Solución de Problemas

### Error: "JAVA_HOME not set"
```bash
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
```

### Error: "SDK location not found"
Crea `android/local.properties`:
```
sdk.dir=C:\\Users\\TU_USUARIO\\AppData\\Local\\Android\\Sdk
```

### APK muy grande
- Considera generar un AAB en lugar de APK
- Ejecuta: `gradlew.bat bundleRelease`
- El AAB estará en: `android/app/build/outputs/bundle/release/app-release.aab`

---

## Versiones de la App

Cada vez que hagas cambios, actualiza en `android/app/build.gradle`:

```gradle
versionCode 2        // Incrementa este número (2, 3, 4...)
versionName "1.1"    // Versión visible para usuarios (1.1, 1.2, 2.0...)
```

Esto es importante para que Android reconozca que es una actualización.

---

## Checklist antes de Generar APK

- [ ] `npm run build` funciona sin errores
- [ ] La app funciona correctamente en desarrollo
- [ ] Actualicé `versionCode` y `versionName`
- [ ] Probé todas las funciones principales
- [ ] Configuré Firebase correctamente
- [ ] El logo y nombre de la app son correctos

---

## Notas Finales

- **Keystore:** Es como la llave de tu app. ¡Nunca la pierdas!
- **Contraseña:** Guárdala en un gestor de contraseñas
- **Backups:** Haz backup del keystore en múltiples lugares seguros
- **Git:** Nunca subas el keystore ni las contraseñas a Git

Para subir a Google Play Store en el futuro, usarás este mismo keystore.
