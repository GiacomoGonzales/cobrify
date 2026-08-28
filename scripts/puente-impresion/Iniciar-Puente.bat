@echo off
REM ====================================================================
REM  PUENTE DE IMPRESION - Cobrify
REM
REM  Doble clic aca y listo. Deja la ventana abierta mientras atiendas.
REM
REM  -ExecutionPolicy Bypass: Windows bloquea por defecto los scripts de
REM  PowerShell descargados. Esto lo permite SOLO para este archivo, sin
REM  cambiarle la configuracion a la computadora.
REM ====================================================================
title Puente de Impresion - Cobrify
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PuenteImpresion.ps1" %*
echo.
echo El puente se detuvo. Cierra esta ventana o vuelve a abrir el acceso directo.
pause
