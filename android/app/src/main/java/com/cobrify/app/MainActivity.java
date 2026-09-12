package com.cobrify.app;

import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.cobrify.app.plugins.TcpPrinterPlugin;
import com.cobrify.app.plugins.IminPrinterPlugin;
import com.cobrify.app.plugins.NotificationListenerPlugin;
import com.cobrify.app.plugins.BusinessStoragePlugin;
import com.cobrify.app.plugins.CustomerDisplayPlugin;
import java.io.File;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "Cobrify";
    private static final String MARCA = "web-sin-sw-";

    // Una sola vez por proceso, y antes de que exista el WebView.
    private static boolean webRevisada = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (!webRevisada) {
            webRevisada = true;
            borrarCopiaViejaDeLaWeb();
        }
        // Registrar plugins personalizados
        registerPlugin(TcpPrinterPlugin.class);
        registerPlugin(IminPrinterPlugin.class);
        registerPlugin(NotificationListenerPlugin.class);
        registerPlugin(BusinessStoragePlugin.class);
        registerPlugin(CustomerDisplayPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * LA APP ABRÍA UNA COPIA VIEJA DE LA WEB DESPUÉS DE ACTUALIZAR.
     *
     * Hasta el 7-set-2026 la web registraba un service worker también dentro de
     * la app, y ese service worker guarda su propia copia de todas las pantallas.
     * Al actualizar desde Play se abría esa copia vieja antes que la nueva, y el
     * código nuevo que la borra (ActualizacionContext) nunca llegaba a correr.
     * Reinstalar tampoco servía: con allowBackup, Android restaura los datos de la
     * app desde el respaldo de Google al instalar, con la copia vieja adentro
     * (visto el 12-set-2026 en el celular de Giacomo: tres instalaciones, tres
     * restauraciones, siempre el menú viejo).
     *
     * Por eso se borra acá, antes de crear el WebView, la primera vez que se abre
     * cada versión instalada. La marca va en no_backup, que Android nunca respalda
     * ni restaura, así que una reinstalación también limpia. Solo se borra la
     * carpeta del service worker: la sesión (IndexedDB) y la configuración de la
     * impresora (Local Storage) quedan como estaban.
     */
    @SuppressWarnings("deprecation")
    private void borrarCopiaViejaDeLaWeb() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            long version = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            File marca = new File(getNoBackupFilesDir(), MARCA + version);
            if (marca.exists()) return;

            // Según la versión del WebView, la carpeta está en app_webview/ o en
            // app_webview/Default/: se revisan las dos.
            File webview = new File(getApplicationInfo().dataDir, "app_webview");
            borrarServiceWorker(webview);
            File[] perfiles = webview.listFiles();
            if (perfiles != null) {
                for (File perfil : perfiles) {
                    if (perfil.isDirectory()) borrarServiceWorker(perfil);
                }
            }

            File[] marcas = getNoBackupFilesDir().listFiles();
            if (marcas != null) {
                for (File vieja : marcas) {
                    if (vieja.getName().startsWith(MARCA)) vieja.delete();
                }
            }
            marca.createNewFile();
        } catch (Exception e) {
            Log.w(TAG, "No se pudo revisar la copia guardada de la web", e);
        }
    }

    private static void borrarServiceWorker(File carpeta) {
        File sw = new File(carpeta, "Service Worker");
        if (!sw.exists()) return;
        borrar(sw);
        Log.i(TAG, "Copia vieja de la web borrada: " + sw.getAbsolutePath());
    }

    private static void borrar(File archivo) {
        File[] hijos = archivo.listFiles();
        if (hijos != null) {
            for (File hijo : hijos) borrar(hijo);
        }
        archivo.delete();
    }
}
