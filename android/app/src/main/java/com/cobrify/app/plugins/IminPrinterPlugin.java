package com.cobrify.app.plugins;

import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// V1 SDK (Falcon 1, D1, etc. - Android 11 y menor)
import com.imin.printerlib.IminPrintUtils;
import com.imin.printerlib.IminPrintUtils.PrintConnectType;

// V2 SDK (Swan 2, Falcon 2, etc. - Android 13+)
import com.imin.printer.PrinterHelper;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Plugin Capacitor para impresión térmica via impresora interna de dispositivos iMin.
 * Soporta V1 SDK (Falcon 1, Android <=11) y V2 SDK (Swan 2, Android 13+).
 */
@CapacitorPlugin(name = "IminPrinter")
public class IminPrinterPlugin extends Plugin {

    private static final String TAG = "IminPrinterPlugin";
    private static final int V2_MIN_API = 32; // Android 12L / 13+

    // V1
    private IminPrintUtils printUtilsV1;
    // V2 usa PrinterHelper.getInstance() (singleton)

    private boolean isConnected = false;
    private boolean useV2 = false;
    private ExecutorService executor = Executors.newSingleThreadExecutor();

    private boolean shouldUseV2() {
        return Build.VERSION.SDK_INT >= V2_MIN_API;
    }

    /**
     * Detectar si el dispositivo actual es un dispositivo iMin
     */
    @PluginMethod
    public void isIminDevice(PluginCall call) {
        String manufacturer = Build.MANUFACTURER != null ? Build.MANUFACTURER.toLowerCase() : "";
        String brand = Build.BRAND != null ? Build.BRAND.toLowerCase() : "";
        String model = Build.MODEL != null ? Build.MODEL.toLowerCase() : "";

        boolean isImin = manufacturer.contains("imin") || brand.contains("imin") || model.contains("imin");

        Log.d(TAG, "Device check - Manufacturer: " + manufacturer + ", Brand: " + brand + ", Model: " + model + ", isImin: " + isImin + ", SDK: " + Build.VERSION.SDK_INT + ", useV2: " + shouldUseV2());

        JSObject result = new JSObject();
        result.put("isImin", isImin);
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("brand", Build.BRAND);
        result.put("model", Build.MODEL);
        result.put("sdkVersion", shouldUseV2() ? "v2" : "v1");
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
                Log.d(TAG, "Device: " + Build.MANUFACTURER + " / " + Build.MODEL + " / API " + Build.VERSION.SDK_INT);

                if (shouldUseV2()) {
                    // V2 SDK: Swan 2, Falcon 2, etc.
                    Log.d(TAG, "Using V2 SDK (PrinterHelper)...");
                    useV2 = true;

                    PrinterHelper.getInstance().initPrinterService(getContext());
                    Log.d(TAG, "initPrinterService OK");

                    // Esperar a que el servicio AIDL se vincule
                    Thread.sleep(1500);

                    PrinterHelper.getInstance().initPrinter(getContext().getPackageName(), null);
                    Log.d(TAG, "initPrinter OK");

                    isConnected = true;
                    Log.d(TAG, "V2 printer initialized successfully");

                } else {
                    // V1 SDK: Falcon 1, D1, etc.
                    Log.d(TAG, "Using V1 SDK (IminPrintUtils)...");
                    useV2 = false;

                    printUtilsV1 = IminPrintUtils.getInstance(getContext());
                    Log.d(TAG, "getInstance OK, calling initPrinter(USB)...");

                    printUtilsV1.initPrinter(PrintConnectType.USB);
                    Log.d(TAG, "initPrinter OK");

                    isConnected = true;
                    Log.d(TAG, "V1 printer initialized successfully");
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("type", "internal");
                result.put("sdkVersion", useV2 ? "v2" : "v1");
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
                if (useV2) {
                    PrinterHelper.getInstance().deInitPrinterService(getContext());
                } else if (printUtilsV1 != null) {
                    printUtilsV1.resetDevice();
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
        result.put("sdkVersion", useV2 ? "v2" : "v1");
        call.resolve(result);
    }

    /**
     * Enviar datos raw (bytes) a la impresora
     */
    @PluginMethod
    public void sendRaw(PluginCall call) {
        String base64Data = call.getString("data");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Data is required");
            return;
        }

        if (!isConnected) {
            call.reject("Not connected to printer");
            return;
        }

        executor.execute(() -> {
            try {
                byte[] data = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);

                if (useV2) {
                    PrinterHelper.getInstance().sendRAWData(data, null);
                } else if (printUtilsV1 != null) {
                    printUtilsV1.sendRAWData(data);
                } else {
                    call.reject("Printer not initialized");
                    return;
                }

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
     */
    @PluginMethod
    public void printText(PluginCall call) {
        String text = call.getString("text");

        if (text == null) {
            call.reject("Text is required");
            return;
        }

        if (!isConnected) {
            call.reject("Not connected to printer");
            return;
        }

        executor.execute(() -> {
            try {
                if (useV2) {
                    PrinterHelper.getInstance().sendRAWData(text.getBytes("UTF-8"), null);
                    PrinterHelper.getInstance().printAndFeedPaper(60);
                } else if (printUtilsV1 != null) {
                    printUtilsV1.printText(text, 0);
                    printUtilsV1.printAndFeedPaper(60);
                } else {
                    call.reject("Printer not initialized");
                    return;
                }

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
     * Método principal - recibe los mismos bytes ESC/POS que WiFi/BT
     */
    @PluginMethod
    public void print(PluginCall call) {
        String base64Data = call.getString("data");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Print data is required");
            return;
        }

        if (!isConnected) {
            call.reject("Not connected to printer");
            return;
        }

        executor.execute(() -> {
            try {
                byte[] data = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);

                if (useV2) {
                    PrinterHelper.getInstance().sendRAWData(data, null);
                } else if (printUtilsV1 != null) {
                    printUtilsV1.sendRAWData(data);
                } else {
                    call.reject("Printer not initialized");
                    return;
                }

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
        if (!isConnected) {
            call.reject("Not connected to printer");
            return;
        }

        int paperWidth = call.getInt("paperWidth", 58);

        executor.execute(() -> {
            try {
                byte[] init = new byte[]{0x1B, 0x40}; // ESC @ - Reset
                byte[] alignCenter = new byte[]{0x1B, 0x61, 0x01}; // ESC a 1
                byte[] boldOn = new byte[]{0x1B, 0x45, 0x01}; // ESC E 1
                byte[] boldOff = new byte[]{0x1B, 0x45, 0x00}; // ESC E 0
                byte[] cut = new byte[]{0x1D, 0x56, 0x00}; // GS V 0

                String separator = paperWidth == 80 ?
                    "------------------------------------------\n" :
                    "------------------------\n";

                String sdkLabel = useV2 ? "V2 (PrinterHelper)" : "V1 (IminPrintUtils)";

                if (useV2) {
                    PrinterHelper helper = PrinterHelper.getInstance();
                    helper.sendRAWData(init, null);
                    helper.sendRAWData(alignCenter, null);
                    helper.sendRAWData(boldOn, null);
                    helper.sendRAWData("PRUEBA IMP. INTERNA\n".getBytes("UTF-8"), null);
                    helper.sendRAWData(boldOff, null);
                    helper.sendRAWData(separator.getBytes("UTF-8"), null);
                    helper.sendRAWData(("\nDispositivo: " + Build.MODEL + "\n").getBytes("UTF-8"), null);
                    helper.sendRAWData(("SDK: " + sdkLabel + "\n").getBytes("UTF-8"), null);
                    helper.sendRAWData(("Ancho papel: " + paperWidth + "mm\n").getBytes("UTF-8"), null);
                    helper.sendRAWData(("\nFecha: " + new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss").format(new java.util.Date()) + "\n").getBytes("UTF-8"), null);
                    helper.sendRAWData(separator.getBytes("UTF-8"), null);
                    helper.sendRAWData("\nImpresora interna configurada\n".getBytes("UTF-8"), null);
                    helper.sendRAWData("correctamente!\n\n\n".getBytes("UTF-8"), null);
                    helper.sendRAWData(cut, null);
                } else if (printUtilsV1 != null) {
                    printUtilsV1.sendRAWData(init);
                    printUtilsV1.sendRAWData(alignCenter);
                    printUtilsV1.sendRAWData(boldOn);
                    printUtilsV1.sendRAWData("PRUEBA IMP. INTERNA\n".getBytes("UTF-8"));
                    printUtilsV1.sendRAWData(boldOff);
                    printUtilsV1.sendRAWData(separator.getBytes("UTF-8"));
                    printUtilsV1.sendRAWData(("\nDispositivo: " + Build.MODEL + "\n").getBytes("UTF-8"));
                    printUtilsV1.sendRAWData(("SDK: " + sdkLabel + "\n").getBytes("UTF-8"));
                    printUtilsV1.sendRAWData(("Ancho papel: " + paperWidth + "mm\n").getBytes("UTF-8"));
                    printUtilsV1.sendRAWData(("\nFecha: " + new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss").format(new java.util.Date()) + "\n").getBytes("UTF-8"));
                    printUtilsV1.sendRAWData(separator.getBytes("UTF-8"));
                    printUtilsV1.sendRAWData("\nImpresora interna configurada\n".getBytes("UTF-8"));
                    printUtilsV1.sendRAWData("correctamente!\n\n\n".getBytes("UTF-8"));
                    printUtilsV1.sendRAWData(cut);
                } else {
                    call.reject("Printer not initialized");
                    return;
                }

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
        try {
            if (useV2) {
                PrinterHelper.getInstance().deInitPrinterService(getContext());
            } else if (printUtilsV1 != null) {
                printUtilsV1.resetDevice();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error on destroy: " + e.getMessage());
        }
        isConnected = false;
        executor.shutdown();
        super.handleOnDestroy();
    }
}
