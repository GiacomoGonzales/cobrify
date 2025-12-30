package com.cobrify.app.plugins;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin para almacenar el businessId y userId en SharedPreferences.
 * Permite que el código nativo (NotificationService) acceda a esta info.
 */
@CapacitorPlugin(name = "BusinessStorage")
public class BusinessStoragePlugin extends Plugin {

    private static final String TAG = "BusinessStorage";
    private static final String PREFS_NAME = "CobrifyBusinessPrefs";
    private static final String KEY_BUSINESS_ID = "businessId";
    private static final String KEY_USER_ID = "userId";
    private static final String KEY_BUSINESS_NAME = "businessName";

    /**
     * Guarda el businessId y userId
     */
    @PluginMethod
    public void setBusinessInfo(PluginCall call) {
        String businessId = call.getString("businessId");
        String userId = call.getString("userId");
        String businessName = call.getString("businessName", "");

        if (businessId == null || businessId.isEmpty()) {
            call.reject("businessId es requerido");
            return;
        }

        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.putString(KEY_BUSINESS_ID, businessId);
            if (userId != null) {
                editor.putString(KEY_USER_ID, userId);
            }
            if (businessName != null) {
                editor.putString(KEY_BUSINESS_NAME, businessName);
            }
            editor.apply();

            Log.d(TAG, "✅ BusinessInfo guardado: " + businessId);

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "❌ Error guardando BusinessInfo: " + e.getMessage());
            call.reject("Error guardando BusinessInfo", e);
        }
    }

    /**
     * Obtiene el businessId guardado
     */
    @PluginMethod
    public void getBusinessInfo(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String businessId = prefs.getString(KEY_BUSINESS_ID, null);
            String userId = prefs.getString(KEY_USER_ID, null);
            String businessName = prefs.getString(KEY_BUSINESS_NAME, null);

            JSObject result = new JSObject();
            result.put("businessId", businessId);
            result.put("userId", userId);
            result.put("businessName", businessName);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "❌ Error obteniendo BusinessInfo: " + e.getMessage());
            call.reject("Error obteniendo BusinessInfo", e);
        }
    }

    /**
     * Limpia la info guardada (logout)
     */
    @PluginMethod
    public void clearBusinessInfo(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().clear().apply();

            Log.d(TAG, "🧹 BusinessInfo limpiado");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Error limpiando BusinessInfo", e);
        }
    }

    // ==================== MÉTODOS ESTÁTICOS PARA USO NATIVO ====================

    /**
     * Obtiene el businessId desde cualquier parte del código nativo
     */
    public static String getStoredBusinessId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_BUSINESS_ID, null);
    }

    /**
     * Obtiene el userId desde cualquier parte del código nativo
     */
    public static String getStoredUserId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_USER_ID, null);
    }

    /**
     * Obtiene el businessName desde cualquier parte del código nativo
     */
    public static String getStoredBusinessName(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_BUSINESS_NAME, null);
    }
}
