package com.cobrify.app.plugins;

import android.content.ComponentName;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin de Capacitor para escuchar notificaciones del sistema Android.
 * Útil para detectar notificaciones de Yape, Plin, etc.
 */
@CapacitorPlugin(name = "NotificationListener")
public class NotificationListenerPlugin extends Plugin {

    private static final String TAG = "NotificationListener";
    private boolean isListening = false;
    private Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "🔌 NotificationListenerPlugin CARGADO");
    }

    /**
     * Inicia la escucha de notificaciones
     */
    @PluginMethod
    public void startListening(PluginCall call) {
        Log.d(TAG, "📢 startListening llamado, isListening=" + isListening);

        if (isListening) {
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("alreadyListening", true);
            call.resolve(result);
            return;
        }

        try {
            // Registrar callback directo con NotificationService
            // NOTA: Ya no usamos LocalBroadcastManager porque causaba duplicados
            NotificationService.setCallback(new NotificationService.NotificationCallback() {
                @Override
                public void onYapeNotification(String packageName, String title, String text, long timestamp) {
                    Log.d(TAG, "🎯 Callback recibido! Paquete: " + packageName);
                    // Ejecutar en el hilo principal
                    mainHandler.post(() -> {
                        sendNotificationToJS(packageName, title, text, timestamp);
                    });
                }
            });
            Log.d(TAG, "✅ Callback directo registrado");

            isListening = true;
            Log.d(TAG, "🎧 Escucha de notificaciones INICIADA");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "❌ Error al iniciar escucha: " + e.getMessage(), e);
            call.reject("Error al iniciar escucha de notificaciones", e);
        }
    }

    /**
     * Envía la notificación a JavaScript
     */
    private void sendNotificationToJS(String packageName, String title, String text, long timestamp) {
        JSObject notification = new JSObject();
        notification.put("packageName", packageName);
        notification.put("title", title);
        notification.put("text", text);
        notification.put("timestamp", timestamp);

        // Detectar si es una notificación de Yape
        boolean isYape = packageName != null && packageName.contains("yape");
        notification.put("isYape", isYape);

        Log.d(TAG, "📨 Enviando a JS: " + packageName + " - " + title);

        // Enviar evento a JavaScript
        notifyListeners("notificationReceived", notification);
    }

    /**
     * Detiene la escucha de notificaciones
     */
    @PluginMethod
    public void stopListening(PluginCall call) {
        Log.d(TAG, "🛑 stopListening llamado");

        if (!isListening) {
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
            return;
        }

        try {
            // Remover callback
            NotificationService.setCallback(null);

            isListening = false;
            Log.d(TAG, "🛑 Escucha de notificaciones DETENIDA");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "❌ Error al detener escucha: " + e.getMessage(), e);
            call.reject("Error al detener escucha de notificaciones", e);
        }
    }

    /**
     * Verifica si la app tiene permiso para escuchar notificaciones
     */
    @PluginMethod
    public void isPermissionGranted(PluginCall call) {
        boolean granted = isNotificationServiceEnabled();
        Log.d(TAG, "Permiso de notificaciones: " + granted);

        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /**
     * Abre la configuración para que el usuario otorgue el permiso
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error al abrir configuración: " + e.getMessage());
            call.reject("Error al abrir configuración de permisos", e);
        }
    }

    /**
     * Verifica si el servicio de notificaciones está habilitado
     */
    private boolean isNotificationServiceEnabled() {
        String pkgName = getContext().getPackageName();
        final String flat = Settings.Secure.getString(
            getContext().getContentResolver(),
            "enabled_notification_listeners"
        );

        if (!TextUtils.isEmpty(flat)) {
            final String[] names = flat.split(":");
            for (String name : names) {
                final ComponentName cn = ComponentName.unflattenFromString(name);
                if (cn != null && TextUtils.equals(pkgName, cn.getPackageName())) {
                    return true;
                }
            }
        }
        return false;
    }

    @Override
    protected void handleOnDestroy() {
        Log.d(TAG, "💀 Plugin siendo destruido");
        if (isListening) {
            NotificationService.setCallback(null);
        }
        super.handleOnDestroy();
    }
}
