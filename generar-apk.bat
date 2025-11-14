@echo off
echo ========================================
echo Generando APK de Factuya
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
echo Paso 3: Generando APK de release...
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
echo APK generado exitosamente!
echo ========================================
echo.
echo Ubicacion del APK:
echo android\app\build\outputs\apk\release\app-release-unsigned.apk
echo.
echo NOTA: Este APK no esta firmado. Android mostrara una advertencia
echo al instalarlo, pero funcionara correctamente.
echo.
echo Para compartir con clientes, copia este archivo a tu telefono
echo y permitele instalar aplicaciones de fuentes desconocidas.
echo.
pause
