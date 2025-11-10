# Set Java Home to Android Studio's JDK
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host ""
Write-Host "================================"
Write-Host " Obteniendo SHA-1 de Debug"
Write-Host "================================"
Write-Host ""
Write-Host "Usando Java desde: $env:JAVA_HOME"
Write-Host ""

# Change to android directory and run gradlew
Set-Location android
$output = & .\gradlew.bat signingReport 2>&1 | Out-String
Set-Location ..

# Find SHA1 lines
$sha1Lines = $output -split "`n" | Where-Object { $_ -match "SHA1|SHA-1" }

Write-Host ""
Write-Host "================================"
Write-Host " SHA-1 Encontrado:"
Write-Host "================================"
Write-Host ""

foreach ($line in $sha1Lines) {
    Write-Host $line.Trim()
}

Write-Host ""
Write-Host "================================"
Write-Host " COPIA el SHA-1 de arriba ^^"
Write-Host "================================"
Write-Host ""
Write-Host "SIGUIENTE PASO:"
Write-Host "1. Copia la linea completa del SHA1"
Write-Host "2. Ve a: https://console.firebase.google.com"
Write-Host "3. Abre tu proyecto de Factuya"
Write-Host "4. Sigue los pasos de FIREBASE_PASO_A_PASO.md"
Write-Host ""

# Save full output to file for debugging
$output | Out-File -FilePath "sha1-full-output.txt"
Write-Host "Output completo guardado en: sha1-full-output.txt"
Write-Host ""

Read-Host "Presiona Enter para cerrar"
