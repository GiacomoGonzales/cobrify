# =====================================================================
#  PUENTE DE IMPRESION  -  Cobrify
# =====================================================================
#
#  Convierte una impresora USB de esta computadora en una impresora de
#  RED, para que el celular o la tablet le manden los tickets.
#
#  Por que hace falta: el USB es punto a punto — solo existe para la
#  maquina donde esta enchufada la impresora. Este puente escucha en el
#  puerto 9100 (el mismo que hablan las ticketeras de red) y le pasa a
#  la impresora, tal cual, lo que llega.
#
#  En el sistema no se cambia nada: la app ya manda ESC/POS crudo por
#  TCP al puerto 9100. Para ella esta computadora es una ticketera de
#  red mas.
#
#  USO
#    1. Doble clic en Iniciar-Puente.bat
#    2. En el celular: Configuracion > Impresora de Documentos
#       IP = la que muestra esta ventana, Puerto = 9100
#
#  No necesita instalar nada: PowerShell ya viene con Windows.
# =====================================================================

param(
    # Nombre exacto de la impresora en Windows. Vacio = la predeterminada.
    [string]$Impresora = "",
    [int]$Puerto = 9100,
    # Recibe pero NO imprime. Sirve para comprobar que el celular llega hasta
    # esta computadora sin gastar papel.
    [switch]$SoloProbar
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------
# Envio RAW al spooler de Windows.
#
# Se usa la API del spooler con tipo de datos "RAW" en vez de imprimir un
# archivo: asi los bytes llegan a la impresora SIN que el driver los
# reinterprete. Los comandos ESC/POS (negrita, corte de papel, tamano de
# letra) son bytes de control; si el driver los "dibuja" como si fueran
# texto, sale un ticket lleno de simbolos raros y sin cortar.
# ---------------------------------------------------------------------
$codigoRaw = @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class ImpresoraRaw
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void Enviar(string impresora, byte[] datos)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(impresora, out hPrinter, IntPtr.Zero))
            throw new Exception("No se pudo abrir la impresora: " + impresora +
                                " (error " + Marshal.GetLastWin32Error() + ")");
        try
        {
            DOCINFO di = new DOCINFO();
            di.pDocName = "Ticket Cobrify";
            di.pDataType = "RAW";

            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Exception("StartDocPrinter fallo (error " + Marshal.GetLastWin32Error() + ")");
            try
            {
                if (!StartPagePrinter(hPrinter))
                    throw new Exception("StartPagePrinter fallo (error " + Marshal.GetLastWin32Error() + ")");
                try
                {
                    IntPtr buffer = Marshal.AllocCoTaskMem(datos.Length);
                    try
                    {
                        Marshal.Copy(datos, 0, buffer, datos.Length);
                        int escritos;
                        if (!WritePrinter(hPrinter, buffer, datos.Length, out escritos))
                            throw new Exception("WritePrinter fallo (error " + Marshal.GetLastWin32Error() + ")");
                    }
                    finally { Marshal.FreeCoTaskMem(buffer); }
                }
                finally { EndPagePrinter(hPrinter); }
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally { ClosePrinter(hPrinter); }
    }
}
'@

Add-Type -TypeDefinition $codigoRaw -Language CSharp

# ---------------------------------------------------------------------
# Impresora a usar
# ---------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Impresora)) {
    $pred = Get-CimInstance -ClassName Win32_Printer -Filter "Default = TRUE" -ErrorAction SilentlyContinue
    if ($null -eq $pred) {
        Write-Host "No hay impresora predeterminada en Windows." -ForegroundColor Red
        Write-Host "Elegi una asi:  .\PuenteImpresion.ps1 -Impresora ""NOMBRE"""
        Write-Host ""
        Write-Host "Impresoras instaladas:"
        Get-CimInstance -ClassName Win32_Printer | ForEach-Object { Write-Host "   $($_.Name)" }
        Read-Host "`nEnter para cerrar"
        exit 1
    }
    $Impresora = $pred.Name
}

# ---------------------------------------------------------------------
# IPs de esta computadora, para dictarselas al celular
# ---------------------------------------------------------------------
$ips = @()
try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
           Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
           Select-Object -ExpandProperty IPAddress
} catch {
    $ips = @()
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  PUENTE DE IMPRESION - Cobrify" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Impresora : $Impresora"
Write-Host "  Puerto    : $Puerto"
if ($ips.Count -gt 0) {
    Write-Host ""
    Write-Host "  En el celular, pone esta IP:" -ForegroundColor Yellow
    foreach ($ip in $ips) { Write-Host "     $ip" -ForegroundColor Yellow }
}
Write-Host ""
Write-Host "  Configuracion > Impresora de Documentos"
Write-Host "  IP = la de arriba   Puerto = $Puerto"
Write-Host ""
if ($SoloProbar) {
    Write-Host "  MODO PRUEBA: recibe y avisa, pero NO imprime." -ForegroundColor Cyan
    Write-Host ""
}
Write-Host "  Dejar esta ventana ABIERTA. Para cerrar: Ctrl+C"
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------
# El servidor
#
# La app abre el socket, escribe los bytes y CIERRA. No espera respuesta
# (asi funciona el protocolo RAW de las ticketeras de red), por eso se
# lee hasta que el otro lado cierra y recien ahi se manda a imprimir.
# ---------------------------------------------------------------------
try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Puerto)
    $listener.Start()
} catch {
    Write-Host "No se pudo abrir el puerto $Puerto." -ForegroundColor Red
    Write-Host "Suele ser que ya hay otro programa usandolo." -ForegroundColor Red
    Write-Host $_.Exception.Message
    Read-Host "`nEnter para cerrar"
    exit 1
}

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Esperando trabajos de impresion..." -ForegroundColor Green

while ($true) {
    $cliente = $null
    try {
        $cliente = $listener.AcceptTcpClient()
        $origen = $cliente.Client.RemoteEndPoint.Address.ToString()
        $flujo = $cliente.GetStream()
        $flujo.ReadTimeout = 15000

        $memoria = New-Object System.IO.MemoryStream
        $trozo = New-Object byte[] 8192
        while ($true) {
            try { $leidos = $flujo.Read($trozo, 0, $trozo.Length) }
            catch { break }          # timeout: el emisor ya no manda mas
            if ($leidos -le 0) { break }
            $memoria.Write($trozo, 0, $leidos)
        }
        $datos = $memoria.ToArray()
        $memoria.Dispose()

        if ($datos.Length -gt 0) {
            if ($SoloProbar) {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $($datos.Length) bytes desde $origen -> RECIBIDO (modo prueba, no se imprime)" -ForegroundColor Cyan
                $cliente.Close(); $cliente = $null
                continue
            }
            try {
                [ImpresoraRaw]::Enviar($Impresora, $datos)
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $($datos.Length) bytes desde $origen -> impreso" -ForegroundColor Green
            } catch {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ERROR al imprimir: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Conexion perdida: $($_.Exception.Message)" -ForegroundColor DarkYellow
    } finally {
        if ($null -ne $cliente) { $cliente.Close() }
    }
}
