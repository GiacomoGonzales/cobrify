package com.cobrify.app.plugins;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ComponentName;
import android.os.Build;
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
    private NotificationReceiver receiver;
    private boolean isListening = false;

    /**
     * Inicia la escucha de notificaciones
     */
    @PluginMethod
    public void startListening(PluginCall call) {
        if (isListening) {
            call.resolve();
            return;
        }

        try {
            receiver = new NotificationReceiver();
            IntentFilter filter = new IntentFilter();
            filter.addAction(NotificationService.ACTION_NOTIFICATION_POSTED);
            filter.addAction(NotificationService.ACTION_NOTIFICATION_REMOVED);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(receiver, filter);
            }

            isListening = true;
            Log.d(TAG, "Escucha de notificaciones iniciada");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error al iniciar escucha: " + e.getMessage());
            call.reject("Error al iniciar escucha de notificaciones", e);
        }
    }

    /**
     * Detiene la escucha de notificaciones
     */
    @PluginMethod
    public void stopListening(PluginCall call) {
        if (!isListening || receiver == null) {
            call.resolve();
            return;
        }

        try {
            getContext().unregisterReceiver(receiver);
            receiver = null;
            isListening = false;
            Log.d(TAG, "Escucha de notificaciones detenida");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error al detener escucha: " + e.getMessage());
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

    /**
     * Receiver interno para recibir los broadcasts del NotificationService
     */
    private class NotificationReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (action == null) return;

            Log.d(TAG, "Broadcast recibido: " + action);

            if (NotificationService.ACTION_NOTIFICATION_POSTED.equals(action)) {
                String packageName = intent.getStringExtra(NotificationService.EXTRA_PACKAGE);
                String title = intent.getStringExtra(NotificationService.EXTRA_TITLE);
                String text = intent.getStringExtra(NotificationService.EXTRA_TEXT);
                long timestamp = intent.getLongExtra(NotificationService.EXTRA_TIMESTAMP, 0);

                JSObject notification = new JSObject();
                notification.put("packageName", packageName);
                notification.put("title", title);
                notification.put("text", text);
                notification.put("timestamp", timestamp);

                // Detectar si es una notificación de Yape
                boolean isYape = packageName != null && packageName.contains("yape");
                notification.put("isYape", isYape);

                Log.d(TAG, "Notificación: " + packageName + " - " + title + " - " + text);

                // Enviar evento a JavaScript
                notifyListeners("notificationReceived", notification);
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (isListening && receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {}
        }
        super.handleOnDestroy();
    }
}
