@echo off
echo ========================================
echo Crear Keystore para Firmar APK
echo ========================================
echo.
echo IMPORTANTE: Guarda esta clave de forma segura!
echo Si la pierdes, no podras actualizar tu app en el futuro.
echo.
echo Ingresa la siguiente informacion cuando se te solicite:
echo - Alias: factuya-key (o el que prefieras)
echo - Password: [Elige una contrasena segura y GUARDALA]
echo - Nombre y apellido: Tu nombre
echo - Organizacion: Nombre de tu empresa
echo - Ciudad, Estado, Pais: Tu ubicacion
echo.
pause

cd android\app

keytool -genkeypair -v -storetype PKCS12 -keystore factuya-release-key.keystore -alias factuya-key -keyalg RSA -keysize 2048 -validity 10000

echo.
echo ========================================
echo Keystore creado exitosamente!
echo ========================================
echo.
echo Ubicacion: android\app\factuya-release-key.keystore
echo.
echo IMPORTANTE:
echo 1. GUARDA este archivo en un lugar seguro (nunca lo subas a Git)
echo 2. ANOTA el alias y la contrasena que usaste
echo 3. Ahora ejecuta: configurar-firma.bat
echo.
pause
