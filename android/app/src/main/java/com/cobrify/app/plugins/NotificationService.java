package com.cobrify.app.plugins;

import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

/**
 * Servicio que escucha las notificaciones del sistema Android.
 * Requiere permiso especial del usuario en Configuración > Acceso a notificaciones.
 */
public class NotificationService extends NotificationListenerService {

    private static final String TAG = "NotificationService";

    // Acciones de broadcast
    public static final String ACTION_NOTIFICATION_POSTED = "com.cobrify.app.NOTIFICATION_POSTED";
    public static final String ACTION_NOTIFICATION_REMOVED = "com.cobrify.app.NOTIFICATION_REMOVED";

    // Keys para los extras del Intent
    public static final String EXTRA_PACKAGE = "package_name";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_TEXT = "text";
    public static final String EXTRA_TIMESTAMP = "timestamp";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        Log.d(TAG, "Notificación recibida de: " + sbn.getPackageName());

        // Extraer información de la notificación
        Bundle extras = sbn.getNotification().extras;

        String packageName = sbn.getPackageName();
        String title = charSequenceToString(extras.getCharSequence("android.title"));
        String text = charSequenceToString(extras.getCharSequence("android.text"));
        long timestamp = sbn.getPostTime();

        Log.d(TAG, "Package: " + packageName);
        Log.d(TAG, "Title: " + title);
        Log.d(TAG, "Text: " + text);

        // Enviar broadcast con la información
        Intent intent = new Intent(ACTION_NOTIFICATION_POSTED);
        intent.putExtra(EXTRA_PACKAGE, packageName);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_TEXT, text);
        intent.putExtra(EXTRA_TIMESTAMP, timestamp);
        intent.setPackage(getPackageName());

        sendBroadcast(intent);
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
}
