@echo off
echo.
echo ================================
echo  Obteniendo SHA-1 de Debug
echo ================================
echo.

cd android
call gradlew.bat signingReport

echo.
echo ================================
echo  Busca "SHA1" arriba ^^
echo  Copialo y agregalo a Firebase
echo ================================
echo.
pause
