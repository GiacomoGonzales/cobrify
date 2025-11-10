@echo off
echo.
echo ========================================
echo  Configurar Java desde Android Studio
echo ========================================
echo.

REM Buscar Java en Android Studio
set "AS_JDK=C:\Program Files\Android\Android Studio\jbr"

if exist "%AS_JDK%\bin\java.exe" (
    echo [OK] Java encontrado en Android Studio!
    echo Ruta: %AS_JDK%
    echo.
    echo Configurando JAVA_HOME...
    setx JAVA_HOME "%AS_JDK%"
    echo.
    echo ========================================
    echo  LISTO! Java configurado
    echo ========================================
    echo.
    echo IMPORTANTE: Cierra esta ventana y abre una NUEVA PowerShell
    echo Luego ejecuta: get-sha1.bat
    echo.
) else (
    echo [ERROR] No se encontro Java en Android Studio
    echo.
    echo Buscando en otras ubicaciones comunes...
    echo.

    if exist "C:\Program Files\Android\Android Studio\jre\bin\java.exe" (
        echo [OK] Java encontrado en: C:\Program Files\Android\Android Studio\jre
        setx JAVA_HOME "C:\Program Files\Android\Android Studio\jre"
        echo.
        echo IMPORTANTE: Cierra esta ventana y abre una NUEVA PowerShell
        echo Luego ejecuta: get-sha1.bat
    ) else (
        echo.
        echo No se encontro Java en Android Studio.
        echo.
        echo Opciones:
        echo 1. Instala Java desde: https://adoptium.net/
        echo 2. O busca manualmente donde esta instalado Android Studio
        echo.
    )
)

pause
