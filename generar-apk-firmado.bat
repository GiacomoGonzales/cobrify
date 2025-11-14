@echo off
echo ========================================
echo Generando APK Firmado de Factuya
echo ========================================
echo.

echo Paso 1: Construyendo la aplicacion web...
call npm run build
if %errorlevel% neq 0 (
    echo Error al construir la aplicacion web
    pause
    exit /b %errorlevel%
)

echo.
echo Paso 2: Sincronizando con Capacitor...
call npx cap sync android
if %errorlevel% neq 0 (
    echo Error al sincronizar con Capacitor
    pause
    exit /b %errorlevel%
)

echo.
echo Paso 3: Generando APK firmado...
cd android
call gradlew.bat assembleRelease
if %errorlevel% neq 0 (
    echo Error al generar APK
    cd ..
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo ========================================
echo APK firmado generado exitosamente!
echo ========================================
echo.
echo Ubicacion del APK:
echo android\app\build\outputs\apk\release\app-release.apk
echo.
echo Este APK esta firmado y listo para distribuir.
echo Los usuarios podran instalarlo sin advertencias graves.
echo.
echo Para instalar:
echo 1. Copia app-release.apk a tu telefono
echo 2. Activa "Instalar desde fuentes desconocidas" en Configuracion
echo 3. Abre el APK y sigue las instrucciones
echo.
pause
