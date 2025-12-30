package com.cobrify.app.plugins;

import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Servicio que escucha las notificaciones del sistema Android.
 * Requiere permiso especial del usuario en Configuración > Acceso a notificaciones.
 *
 * IMPORTANTE: Este servicio ahora envía las notificaciones de Yape directamente
 * a Firebase via HTTP, sin depender de JavaScript/WebView.
 */
public class NotificationService extends NotificationListenerService {

    private static final String TAG = "NotificationService";

    // URL de la Cloud Function
    private static final String CLOUD_FUNCTION_URL =
            "https://us-central1-cobrify-395fe.cloudfunctions.net/saveYapePaymentNative";

    // Acciones de broadcast
    public static final String ACTION_NOTIFICATION_POSTED = "com.cobrify.app.NOTIFICATION_POSTED";
    public static final String ACTION_NOTIFICATION_REMOVED = "com.cobrify.app.NOTIFICATION_REMOVED";

    // Keys para los extras del Intent
    public static final String EXTRA_PACKAGE = "package_name";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_TEXT = "text";
    public static final String EXTRA_TIMESTAMP = "timestamp";

    // Package name de Yape
    private static final String YAPE_PACKAGE = "com.bcp.innovacxion.yapeapp";

    // Executor para llamadas HTTP en background
    private ExecutorService executor;

    // Instancia estática para comunicación directa con el plugin
    private static NotificationService instance;
    private static NotificationCallback callback;

    public interface NotificationCallback {
        void onYapeNotification(String packageName, String title, String text, long timestamp);
    }

    public static void setCallback(NotificationCallback cb) {
        callback = cb;
        Log.d(TAG, "📱 Callback registrado: " + (cb != null));
    }

    public static NotificationService getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        executor = Executors.newSingleThreadExecutor();
        Log.d(TAG, "🚀 NotificationService CREADO");
    }

    @Override
    public void onDestroy() {
        instance = null;
        if (executor != null) {
            executor.shutdown();
        }
        Log.d(TAG, "💀 NotificationService DESTRUIDO");
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();

        Log.d(TAG, "📬 Notificación recibida de: " + packageName);

        // Solo procesar notificaciones de Yape
        if (!YAPE_PACKAGE.equals(packageName)) {
            return; // Ignorar otras apps
        }

        Log.d(TAG, "🟢 ¡NOTIFICACIÓN DE YAPE DETECTADA!");

        // Extraer información de la notificación
        Bundle extras = sbn.getNotification().extras;

        String title = charSequenceToString(extras.getCharSequence("android.title"));
        String text = charSequenceToString(extras.getCharSequence("android.text"));
        long timestamp = sbn.getPostTime();

        Log.d(TAG, "📝 Title: " + title);
        Log.d(TAG, "📝 Text: " + text);

        // ==================== ENVIAR DIRECTAMENTE A FIREBASE ====================
        // Esto funciona incluso cuando la app está en background
        sendToFirebaseDirectly(title, text, timestamp);

        // ==================== TAMBIÉN NOTIFICAR A JS (SI ESTÁ ACTIVO) ====================
        // Método 1: Callback directo (más confiable cuando la app está activa)
        if (callback != null) {
            Log.d(TAG, "📤 Enviando via callback directo");
            callback.onYapeNotification(packageName, title, text, timestamp);
        } else {
            Log.w(TAG, "⚠️ No hay callback registrado (app probablemente en background)");
        }

        // Método 2: LocalBroadcastManager (backup)
        Intent intent = new Intent(ACTION_NOTIFICATION_POSTED);
        intent.putExtra(EXTRA_PACKAGE, packageName);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_TEXT, text);
        intent.putExtra(EXTRA_TIMESTAMP, timestamp);

        LocalBroadcastManager.getInstance(this).sendBroadcast(intent);
        Log.d(TAG, "📤 Broadcast local enviado");
    }

    /**
     * Envía los datos de la notificación de Yape directamente a Firebase
     * via una Cloud Function HTTP. Esto funciona en background.
     */
    private void sendToFirebaseDirectly(String title, String text, long timestamp) {
        // Obtener businessId de SharedPreferences
        String businessId = BusinessStoragePlugin.getStoredBusinessId(this);
        String userId = BusinessStoragePlugin.getStoredUserId(this);

        if (businessId == null || businessId.isEmpty()) {
            Log.w(TAG, "⚠️ No hay businessId guardado, no se puede enviar a Firebase");
            Log.w(TAG, "⚠️ El usuario debe iniciar sesión primero en la app");
            return;
        }

        // Parsear la notificación
        YapePaymentData paymentData = parseYapeNotification(title, text);
        if (paymentData == null) {
            Log.w(TAG, "⚠️ No se pudo parsear la notificación de Yape");
            return;
        }

        Log.d(TAG, "💰 Pago parseado - Monto: S/ " + paymentData.amount + ", De: " + paymentData.senderName);

        // Enviar a Firebase en un thread separado
        executor.execute(() -> {
            try {
                JSONObject json = new JSONObject();
                json.put("businessId", businessId);
                json.put("userId", userId);
                json.put("amount", paymentData.amount);
                json.put("senderName", paymentData.senderName);
                json.put("originalText", text);
                json.put("originalTitle", title);
                json.put("timestamp", timestamp);

                Log.d(TAG, "🌐 Enviando a Cloud Function: " + json.toString());

                URL url = new URL(CLOUD_FUNCTION_URL);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = json.toString().getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }

                int responseCode = conn.getResponseCode();
                Log.d(TAG, "📡 Response code: " + responseCode);

                if (responseCode == 200) {
                    Log.d(TAG, "✅ Pago de Yape enviado exitosamente a Firebase");
                } else {
                    Log.e(TAG, "❌ Error al enviar a Firebase. Response code: " + responseCode);
                }

                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "❌ Error al enviar a Firebase: " + e.getMessage(), e);
            }
        });
    }

    /**
     * Parsea una notificación de Yape para extraer monto y remitente
     */
    private YapePaymentData parseYapeNotification(String title, String text) {
        // Patrones comunes de notificaciones de Yape:
        // "Yape! QUANTIO SOLUTIONS E.I.R.L. te envió un pago por S/ 1.00"
        // "Recibiste S/ 50.00 de Juan Pérez"
        // "Te yaperon S/ 100.00"

        String fullText = text;
        if (title != null && !title.isEmpty()) {
            fullText = title + " " + text;
        }

        // Buscar monto: S/ XX.XX o S/XX.XX
        Pattern amountPattern = Pattern.compile("S/\\s*(\\d+(?:\\.\\d{2})?)");
        Matcher amountMatcher = amountPattern.matcher(fullText);

        if (!amountMatcher.find()) {
            Log.d(TAG, "No se encontró monto en: " + fullText);
            return null;
        }

        double amount;
        try {
            amount = Double.parseDouble(amountMatcher.group(1));
        } catch (NumberFormatException e) {
            Log.d(TAG, "Error parseando monto: " + amountMatcher.group(1));
            return null;
        }

        // Buscar nombre del remitente
        // Patrón: "de Juan Pérez" o "NOMBRE te envió"
        String senderName = "Desconocido";

        // Patrón 1: "te envió un pago" precedido por el nombre
        Pattern senderPattern1 = Pattern.compile("Yape!\\s+(.+?)\\s+te\\s+envi[óo]", Pattern.CASE_INSENSITIVE);
        Matcher senderMatcher1 = senderPattern1.matcher(fullText);
        if (senderMatcher1.find()) {
            senderName = senderMatcher1.group(1).trim();
        } else {
            // Patrón 2: "de NOMBRE"
            Pattern senderPattern2 = Pattern.compile("de\\s+([A-Za-záéíóúñÁÉÍÓÚÑ\\s.]+)", Pattern.CASE_INSENSITIVE);
            Matcher senderMatcher2 = senderPattern2.matcher(fullText);
            if (senderMatcher2.find()) {
                senderName = senderMatcher2.group(1).trim();
            }
        }

        return new YapePaymentData(amount, senderName);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        Log.d(TAG, "Notificación removida de: " + sbn.getPackageName());

        Intent intent = new Intent(ACTION_NOTIFICATION_REMOVED);
        intent.putExtra(EXTRA_PACKAGE, sbn.getPackageName());
        intent.setPackage(getPackageName());

        sendBroadcast(intent);
    }

    @Override
    public void onListenerConnected() {
        Log.d(TAG, "NotificationListenerService conectado");
    }

    @Override
    public void onListenerDisconnected() {
        Log.d(TAG, "NotificationListenerService desconectado");
    }

    /**
     * Convierte CharSequence a String de forma segura
     */
    private String charSequenceToString(CharSequence cs) {
        return cs != null ? cs.toString() : "";
    }

    /**
     * Clase interna para almacenar datos del pago parseado
     */
    private static class YapePaymentData {
        double amount;
        String senderName;

        YapePaymentData(double amount, String senderName) {
            this.amount = amount;
            this.senderName = senderName;
        }
    }
}
