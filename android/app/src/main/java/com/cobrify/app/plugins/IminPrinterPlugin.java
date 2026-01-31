package com.cobrify.app.plugins;

import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.imin.printerlib.IminPrintUtils;
import com.imin.printerlib.IminPrintUtils.PrintConnectType;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Plugin Capacitor para impresión térmica via impresora interna de dispositivos iMin
 * Compatible con iMin Falcon 1 y otros dispositivos iMin con impresora integrada
 */
@CapacitorPlugin(name = "IminPrinter")
public class IminPrinterPlugin extends Plugin {

    private static final String TAG = "IminPrinterPlugin";

    private IminPrintUtils printUtils;
    private boolean isConnected = false;
    private ExecutorService executor = Executors.newSingleThreadExecutor();

    /**
     * Detectar si el dispositivo actual es un dispositivo iMin
     */
    @PluginMethod
    public void isIminDevice(PluginCall call) {
        String manufacturer = Build.MANUFACTURER != null ? Build.MANUFACTURER.toLowerCase() : "";
        String brand = Build.BRAND != null ? Build.BRAND.toLowerCase() : "";
        String model = Build.MODEL != null ? Build.MODEL.toLowerCase() : "";

        boolean isImin = manufacturer.contains("imin") || brand.contains("imin") || model.contains("imin");

        Log.d(TAG, "Device check - Manufacturer: " + manufacturer + ", Brand: " + brand + ", Model: " + model + ", isImin: " + isImin);

        JSObject result = new JSObject();
        result.put("isImin", isImin);
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("brand", Build.BRAND);
        result.put("model", Build.MODEL);
        call.resolve(result);
    }

    /**
     * Conectar a la impresora interna del dispositivo iMin
     */
    @PluginMethod
    public void connect(PluginCall call) {
        executor.execute(() -> {
            try {
                Log.d(TAG, "Initializing iMin internal printer...");
                Log.d(TAG, "Device: " + android.os.Build.MANUFACTURER + " / " + android.os.Build.MODEL);

                printUtils = IminPrintUtils.getInstance(getContext());
                Log.d(TAG, "getInstance OK, calling initPrinter(USB)...");

                printUtils.initPrinter(PrintConnectType.USB);
                Log.d(TAG, "initPrinter OK");

                isConnected = true;

                Log.d(TAG, "iMin printer initialized successfully");

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("type", "internal");
                call.resolve(result);

            } catch (NoClassDefFoundError e) {
                String msg = "SDK iMin no disponible: " + e.getMessage();
                Log.e(TAG, msg, e);
                isConnected = false;
                call.reject(msg);
            } catch (UnsatisfiedLinkError e) {
                String msg = "Libreria nativa iMin no compatible con este dispositivo: " + e.getMessage();
                Log.e(TAG, msg, e);
                isConnected = false;
                call.reject(msg);
            } catch (IllegalStateException e) {
                String msg = "Impresora no disponible (no es dispositivo iMin?): " + e.getMessage();
                Log.e(TAG, msg, e);
                isConnected = false;
                call.reject(msg);
            } catch (Exception e) {
                String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
                Log.e(TAG, "Failed to initialize iMin printer: " + msg, e);
                isConnected = false;
                call.reject("Error al conectar: " + msg);
            }
        });
    }

    /**
     * Desconectar la impresora interna
     */
    @PluginMethod
    public void disconnect(PluginCall call) {
        executor.execute(() -> {
            try {
                if (printUtils != null) {
                    printUtils.resetDevice();
                }
                isConnected = false;

                Log.d(TAG, "iMin printer disconnected");

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Error disconnecting: " + e.getMessage());
                isConnected = false;
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            }
        });
    }

    /**
     * Verificar si la impresora está conectada
     */
    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", isConnected);
        result.put("type", "internal");
        call.resolve(result);
    }

    /**
     * Enviar datos raw (bytes) a la impresora via sendRAWData
     * @param call - Parámetros: data (String base64 encoded)
     */
    @PluginMethod
    public void sendRaw(PluginCall call) {
        String base64Data = call.getString("data");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Data is required");
            return;
        }

        if (!isConnected || printUtils == null) {
            call.reject("Not connected to printer");
            return;
        }

        executor.execute(() -> {
            try {
                byte[] data = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                printUtils.sendRAWData(data);

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("bytesWritten", data.length);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "Error sending raw data: " + e.getMessage());
                call.reject("Failed to send data: " + e.getMessage());
            }
        });
    }

    /**
     * Imprimir texto directamente
     * @param call - Parámetros: text (String)
     */
    @PluginMethod
    public void printText(PluginCall call) {
        String text = call.getString("text");

        if (text == null) {
            call.reject("Text is required");
            return;
        }

        if (!isConnected || printUtils == null) {
            call.reject("Not connected to printer");
            return;
        }

        executor.execute(() -> {
            try {
                printUtils.printText(text, 0);
                printUtils.printAndFeedPaper(60);

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "Error printing text: " + e.getMessage());
                call.reject("Failed to print text: " + e.getMessage());
            }
        });
    }

    /**
     * Imprimir con comandos ESC/POS completos (base64)
     * Este es el método principal - recibe los mismos bytes ESC/POS que WiFi/BT
     * @param call - Parámetros: data (String base64 encoded)
     */
    @PluginMethod
    public void print(PluginCall call) {
        String base64Data = call.getString("data");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Print data is required");
            return;
        }

        if (!isConnected || printUtils == null) {
            call.reject("Not connected to printer");
            return;
        }

        executor.execute(() -> {
            try {
                byte[] data = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                printUtils.sendRAWData(data);

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("bytesWritten", data.length);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "Error printing: " + e.getMessage());
                call.reject("Failed to print: " + e.getMessage());
            }
        });
    }

    /**
     * Imprimir ticket de prueba
     */
    @PluginMethod
    public void printTest(PluginCall call) {
        if (!isConnected || printUtils == null) {
            call.reject("Not connected to printer");
            return;
        }

        int paperWidth = call.getInt("paperWidth", 58);

        executor.execute(() -> {
            try {
                // Construir ticket de prueba usando comandos ESC/POS raw
                byte[] init = new byte[]{0x1B, 0x40}; // ESC @ - Reset
                byte[] alignCenter = new byte[]{0x1B, 0x61, 0x01}; // ESC a 1
                byte[] boldOn = new byte[]{0x1B, 0x45, 0x01}; // ESC E 1
                byte[] boldOff = new byte[]{0x1B, 0x45, 0x00}; // ESC E 0
                byte[] cut = new byte[]{0x1D, 0x56, 0x00}; // GS V 0

                String separator = paperWidth == 80 ?
                    "------------------------------------------\n" :
                    "------------------------\n";

                printUtils.sendRAWData(init);
                printUtils.sendRAWData(alignCenter);
                printUtils.sendRAWData(boldOn);
                printUtils.sendRAWData("PRUEBA IMP. INTERNA\n".getBytes("UTF-8"));
                printUtils.sendRAWData(boldOff);
                printUtils.sendRAWData(separator.getBytes("UTF-8"));
                printUtils.sendRAWData(("\nDispositivo: " + Build.MODEL + "\n").getBytes("UTF-8"));
                printUtils.sendRAWData(("Ancho papel: " + paperWidth + "mm\n").getBytes("UTF-8"));
                printUtils.sendRAWData(("\nFecha: " + new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss").format(new java.util.Date()) + "\n").getBytes("UTF-8"));
                printUtils.sendRAWData(separator.getBytes("UTF-8"));
                printUtils.sendRAWData("\nImpresora interna configurada\n".getBytes("UTF-8"));
                printUtils.sendRAWData("correctamente!\n\n\n".getBytes("UTF-8"));
                printUtils.sendRAWData(cut);

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "Error printing test: " + e.getMessage());
                call.reject("Failed to print test: " + e.getMessage());
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (printUtils != null) {
            try {
                printUtils.resetDevice();
            } catch (Exception e) {
                Log.e(TAG, "Error on destroy: " + e.getMessage());
            }
        }
        isConnected = false;
        executor.shutdown();
        super.handleOnDestroy();
    }
}
