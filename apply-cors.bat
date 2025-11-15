@echo off
echo Aplicando configuracion CORS a Firebase Storage...
echo.
echo NOTA: Necesitas tener gcloud CLI instalado
echo Si no lo tienes, descargalo de: https://cloud.google.com/sdk/docs/install
echo.
pause

gcloud storage buckets update gs://cobrify-395fe.firebasestorage.app --cors-file=storage.cors.json

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ CORS configurado correctamente
) else (
    echo.
    echo × Error aplicando CORS
    echo Intenta con: gsutil cors set storage.cors.json gs://cobrify-395fe.firebasestorage.app
)

pause
