@echo off
echo.
echo ========================================
echo  Copiar google-services.json
echo ========================================
echo.
echo INSTRUCCIONES:
echo 1. Ve a Firebase Console: https://console.firebase.google.com
echo 2. Project Settings (engranaje arriba izquierda)
echo 3. Your apps ^> Android app
echo 4. Descarga google-services.json
echo 5. Guardalo en Descargas
echo 6. Este script lo copiara automaticamente
echo.
pause

if exist "%USERPROFILE%\Downloads\google-services.json" (
    echo.
    echo [OK] Archivo encontrado en Descargas!

    REM Check if file already exists in destination
    if exist "android\app\google-services.json" (
        echo.
        echo [!] Ya existe un google-services.json en android\app\
        echo [!] Se va a REEMPLAZAR con el nuevo archivo
        echo.
        del "android\app\google-services.json"
    )

    echo Copiando a android\app\...
    copy "%USERPROFILE%\Downloads\google-services.json" "android\app\google-services.json"

    if exist "android\app\google-services.json" (
        echo.
        echo ========================================
        echo  LISTO! google-services.json copiado
        echo ========================================
        echo.
        echo Ubicacion: android\app\google-services.json
        echo.
        echo SIGUIENTE PASO:
        echo Abre una nueva terminal y ejecuta:
        echo.
        echo   npm run mobile:sync
        echo.
        echo Luego en Android Studio:
        echo   Build ^> Clean Project
        echo   Build ^> Rebuild Project
        echo   Click en RUN (play button)
        echo.
    ) else (
        echo.
        echo [ERROR] No se pudo copiar el archivo
        echo.
    )
) else (
    echo.
    echo [ERROR] No se encontro google-services.json en Descargas
    echo.
    echo Por favor:
    echo 1. Ve a Firebase Console: https://console.firebase.google.com
    echo 2. Project Settings ^> Your apps ^> Android
    echo 3. Descarga google-services.json
    echo 4. Ejecuta este script de nuevo
    echo.
    echo Si ya descargaste el archivo, verifica que este en:
    echo   %USERPROFILE%\Downloads\google-services.json
    echo.
)

pause
