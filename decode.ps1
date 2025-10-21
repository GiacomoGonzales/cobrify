$base64 = Get-Content 'C:\Users\giaco\factuya\temp_invoice.zip.b64'
$bytes = [Convert]::FromBase64String($base64)
[System.IO.File]::WriteAllBytes('C:\Users\giaco\factuya\temp_invoice.zip', $bytes)
Write-Host "ZIP file created successfully"
