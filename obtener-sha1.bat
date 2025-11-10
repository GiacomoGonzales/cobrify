@echo off
echo.
echo ================================
echo  Obteniendo SHA-1 de Debug
echo ================================
echo.

set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo Usando Java desde: %JAVA_HOME%
echo.

cd android
call gradlew.bat signingReport > ..\sha1-output.txt 2>&1

cd ..

echo.
echo Buscando SHA-1 en el output...
echo.

findstr /i "SHA1" sha1-output.txt

echo.
echo ================================
echo El SHA-1 completo esta arriba ^^
echo ================================
echo.
echo INSTRUCCIONES:
echo 1. Copia la linea del SHA1 (ejemplo: A1:B2:C3:...)
echo 2. Ve a: https://console.firebase.google.com
echo 3. Selecciona tu proyecto
echo 4. Ve a Project Settings (engranaje arriba izquierda)
echo 5. Scroll hasta "Your apps"
echo 6. Click en Android app (o "Add app" si no existe)
echo 7. Agrega el SHA-1 en "SHA certificate fingerprints"
echo.

pause
