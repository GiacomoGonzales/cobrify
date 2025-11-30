package com.cobrify.app.plugins;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.Charset;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Plugin Capacitor para impresión térmica via TCP/IP (WiFi/LAN)
 * Las impresoras térmicas generalmente escuchan en el puerto 9100
 */
@CapacitorPlugin(name = "TcpPrinter")
public class TcpPrinterPlugin extends Plugin {

    private static final String TAG = "TcpPrinterPlugin";
    private static final int DEFAULT_PORT = 9100;
    private static final int CONNECTION_TIMEOUT = 5000; // 5 segundos
    private static final int SOCKET_TIMEOUT = 10000; // 10 segundos

    private Socket socket;
    private OutputStream outputStream;
    private String connectedIp;
    private int connectedPort;
    private ExecutorService executor = Executors.newSingleThreadExecutor();

    /**
     * Conectar a impresora por IP
     * @param call - Parámetros: ip (String), port (int, opcional, default 9100)
     */
    @PluginMethod
    public void connect(PluginCall call) {
        String ip = call.getString("ip");
        int port = call.getInt("port", DEFAULT_PORT);

        if (ip == null || ip.isEmpty()) {
            call.reject("IP address is required");
            return;
        }

        executor.execute(() -> {
            try {
                // Cerrar conexión anterior si existe
                disconnect();

                Log.d(TAG, "Connecting to printer at " + ip + ":" + port);

                socket = new Socket();
                socket.connect(new InetSocketAddress(ip, port), CONNECTION_TIMEOUT);
                socket.setSoTimeout(SOCKET_TIMEOUT);
                outputStream = socket.getOutputStream();

                connectedIp = ip;
                connectedPort = port;

                Log.d(TAG, "Connected successfully to " + ip + ":" + port);

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("ip", ip);
                result.put("port", port);
                call.resolve(result);

            } catch (IOException e) {
                Log.e(TAG, "Connection failed: " + e.getMessage());
                call.reject("Failed to connect: " + e.getMessage());
            }
        });
    }

    /**
     * Desconectar de la impresora
     */
    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnect();

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    private void disconnect() {
        try {
            if (outputStream != null) {
                outputStream.close();
                outputStream = null;
            }
            if (socket != null) {
                socket.close();
                socket = null;
            }
            connectedIp = null;
            connectedPort = 0;
            Log.d(TAG, "Disconnected from printer");
        } catch (IOException e) {
            Log.e(TAG, "Error disconnecting: " + e.getMessage());
        }
    }

    /**
     * Verificar si está conectado
     */
    @PluginMethod
    public void isConnected(PluginCall call) {
        boolean connected = socket != null && socket.isConnected() && !socket.isClosed();

        JSObject result = new JSObject();
        result.put("connected", connected);
        result.put("ip", connectedIp);
        result.put("port", connectedPort);
        call.resolve(result);
    }

    /**
     * Enviar datos raw a la impresora (bytes)
     * @param call - Parámetros: data (String base64 encoded)
     */
    @PluginMethod
    public void sendRaw(PluginCall call) {
        String base64Data = call.getString("data");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Data is required");
            return;
        }

        if (outputStream == null) {
            call.reject("Not connected to printer");
            return;
        }

        executor.execute(() -> {
            try {
                byte[] data = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                outputStream.write(data);
                outputStream.flush();

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("bytesWritten", data.length);
                call.resolve(result);

            } catch (IOException e) {
                Log.e(TAG, "Error sending data: " + e.getMessage());
                call.reject("Failed to send data: " + e.getMessage());
            }
        });
    }

    /**
     * Enviar texto a la impresora
     * @param call - Parámetros: text (String), charset (String, opcional, default "UTF-8")
     */
    @PluginMethod
    public void sendText(PluginCall call) {
        String text = call.getString("text");
        String charsetName = call.getString("charset", "UTF-8");

        if (text == null) {
            call.reject("Text is required");
            return;
        }

        if (outputStream == null) {
            call.reject("Not connected to printer");
            return;
        }

        executor.execute(() -> {
            try {
                Charset charset = Charset.forName(charsetName);
                byte[] data = text.getBytes(charset);
                outputStream.write(data);
                outputStream.flush();

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("bytesWritten", data.length);
                call.resolve(result);

            } catch (IOException e) {
                Log.e(TAG, "Error sending text: " + e.getMessage());
                call.reject("Failed to send text: " + e.getMessage());
            }
        });
    }

    /**
     * Enviar comandos ESC/POS comunes
     */
    @PluginMethod
    public void sendCommand(PluginCall call) {
        String command = call.getString("command");

        if (command == null || command.isEmpty()) {
            call.reject("Command is required");
            return;
        }

        if (outputStream == null) {
            call.reject("Not connected to printer");
            return;
        }

        executor.execute(() -> {
            try {
                byte[] data = getEscPosCommand(command);
                if (data == null) {
                    call.reject("Unknown command: " + command);
                    return;
                }

                outputStream.write(data);
                outputStream.flush();

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);

            } catch (IOException e) {
                Log.e(TAG, "Error sending command: " + e.getMessage());
                call.reject("Failed to send command: " + e.getMessage());
            }
        });
    }

    /**
     * Imprimir ticket de prueba
     */
    @PluginMethod
    public void printTest(PluginCall call) {
        if (outputStream == null) {
            call.reject("Not connected to printer");
            return;
        }

        int paperWidth = call.getInt("paperWidth", 58);

        executor.execute(() -> {
            try {
                // Reset
                outputStream.write(new byte[]{0x1B, 0x40});

                // Center align
                outputStream.write(new byte[]{0x1B, 0x61, 0x01});

                // Bold on
                outputStream.write(new byte[]{0x1B, 0x45, 0x01});

                outputStream.write("PRUEBA WIFI/LAN\n".getBytes("UTF-8"));

                // Bold off
                outputStream.write(new byte[]{0x1B, 0x45, 0x00});

                String separator = paperWidth == 80 ?
                    "------------------------------------------\n" :
                    "------------------------\n";
                outputStream.write(separator.getBytes("UTF-8"));

                outputStream.write(("\nConectado a: " + connectedIp + ":" + connectedPort + "\n").getBytes("UTF-8"));
                outputStream.write(("Ancho papel: " + paperWidth + "mm\n").getBytes("UTF-8"));
                outputStream.write(("\nFecha: " + new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss").format(new java.util.Date()) + "\n").getBytes("UTF-8"));

                outputStream.write(separator.getBytes("UTF-8"));

                outputStream.write("\nImpresora WiFi configurada\n".getBytes("UTF-8"));
                outputStream.write("correctamente!\n\n\n".getBytes("UTF-8"));

                // Cut paper
                outputStream.write(new byte[]{0x1D, 0x56, 0x00});

                outputStream.flush();

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);

            } catch (IOException e) {
                Log.e(TAG, "Error printing test: " + e.getMessage());
                call.reject("Failed to print test: " + e.getMessage());
            }
        });
    }

    /**
     * Imprimir con comandos ESC/POS completos
     * @param call - Parámetros: commands (Array de comandos)
     */
    @PluginMethod
    public void print(PluginCall call) {
        if (outputStream == null) {
            call.reject("Not connected to printer");
            return;
        }

        String base64Commands = call.getString("data");
        if (base64Commands == null || base64Commands.isEmpty()) {
            call.reject("Print data is required");
            return;
        }

        executor.execute(() -> {
            try {
                byte[] data = android.util.Base64.decode(base64Commands, android.util.Base64.DEFAULT);
                outputStream.write(data);
                outputStream.flush();

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("bytesWritten", data.length);
                call.resolve(result);

            } catch (IOException e) {
                Log.e(TAG, "Error printing: " + e.getMessage());
                call.reject("Failed to print: " + e.getMessage());
            }
        });
    }

    /**
     * Obtener bytes de comando ESC/POS
     */
    private byte[] getEscPosCommand(String command) {
        switch (command) {
            case "INIT":
            case "RESET":
                return new byte[]{0x1B, 0x40}; // ESC @
            case "CUT":
            case "CUT_PAPER":
                return new byte[]{0x1D, 0x56, 0x00}; // GS V 0
            case "CUT_PARTIAL":
                return new byte[]{0x1D, 0x56, 0x01}; // GS V 1
            case "ALIGN_LEFT":
                return new byte[]{0x1B, 0x61, 0x00}; // ESC a 0
            case "ALIGN_CENTER":
                return new byte[]{0x1B, 0x61, 0x01}; // ESC a 1
            case "ALIGN_RIGHT":
                return new byte[]{0x1B, 0x61, 0x02}; // ESC a 2
            case "BOLD_ON":
                return new byte[]{0x1B, 0x45, 0x01}; // ESC E 1
            case "BOLD_OFF":
                return new byte[]{0x1B, 0x45, 0x00}; // ESC E 0
            case "UNDERLINE_ON":
                return new byte[]{0x1B, 0x2D, 0x01}; // ESC - 1
            case "UNDERLINE_OFF":
                return new byte[]{0x1B, 0x2D, 0x00}; // ESC - 0
            case "DOUBLE_WIDTH_ON":
                return new byte[]{0x1B, 0x21, 0x20}; // ESC ! 32
            case "DOUBLE_WIDTH_OFF":
                return new byte[]{0x1B, 0x21, 0x00}; // ESC ! 0
            case "DOUBLE_HEIGHT_ON":
                return new byte[]{0x1B, 0x21, 0x10}; // ESC ! 16
            case "DOUBLE_HEIGHT_OFF":
                return new byte[]{0x1B, 0x21, 0x00}; // ESC ! 0
            case "FEED_LINE":
                return new byte[]{0x0A}; // LF
            case "FEED_3_LINES":
                return new byte[]{0x1B, 0x64, 0x03}; // ESC d 3
            default:
                return null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        disconnect();
        executor.shutdown();
        super.handleOnDestroy();
    }
}
