package com.cobrify.app.plugins;

import android.app.Presentation;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.os.Bundle;
import android.util.Log;
import android.view.Display;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * Plugin Capacitor para mostrar información al cliente en la segunda pantalla
 * del iMin Swan 2 usando la Android Presentation API.
 */
@CapacitorPlugin(name = "CustomerDisplay")
public class CustomerDisplayPlugin extends Plugin {

    private static final String TAG = "CustomerDisplayPlugin";
    private CustomerPresentation presentation;
    private Display secondaryDisplay;

    /**
     * Detectar si hay una segunda pantalla disponible
     */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        try {
            DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
            Display[] displays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);

            boolean available = displays.length > 0;
            if (available) {
                secondaryDisplay = displays[0];
                Log.d(TAG, "Secondary display found: " + secondaryDisplay.getName() +
                        " (" + secondaryDisplay.getWidth() + "x" + secondaryDisplay.getHeight() + ")");
            } else {
                Log.d(TAG, "No secondary display found");
            }

            JSObject result = new JSObject();
            result.put("available", available);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error checking display availability", e);
            JSObject result = new JSObject();
            result.put("available", false);
            call.resolve(result);
        }
    }

    /**
     * Mostrar la pantalla de cliente en el display secundario
     */
    @PluginMethod
    public void show(PluginCall call) {
        if (secondaryDisplay == null) {
            DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
            Display[] displays = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
            if (displays.length == 0) {
                call.reject("No secondary display available");
                return;
            }
            secondaryDisplay = displays[0];
        }

        String primaryColor = call.getString("primaryColor", "#1e40af");
        String accentColor = call.getString("accentColor", "#f59e0b");
        String companyName = call.getString("companyName", "");
        String logoUrl = call.getString("logoUrl", "");

        getActivity().runOnUiThread(() -> {
            try {
                if (presentation != null) {
                    presentation.dismiss();
                }

                presentation = new CustomerPresentation(getContext(), secondaryDisplay);
                presentation.getWindow().setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY);
                presentation.show();

                // Send initial config after WebView loads
                presentation.setOnReadyListener(() -> {
                    String configJson = new JSONObject()
                            .toString();
                    try {
                        JSONObject config = new JSONObject();
                        config.put("primaryColor", primaryColor);
                        config.put("accentColor", accentColor);
                        config.put("companyName", companyName);
                        config.put("logoUrl", logoUrl);
                        presentation.sendConfig(config.toString());
                    } catch (Exception e) {
                        Log.e(TAG, "Error sending config", e);
                    }
                });

                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Error showing presentation", e);
                call.reject("Error showing presentation: " + e.getMessage());
            }
        });
    }

    /**
     * Enviar actualización de datos al display
     */
    @PluginMethod
    public void sendUpdate(PluginCall call) {
        if (presentation == null) {
            call.resolve(); // Silent no-op
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                JSONObject data = new JSONObject();
                data.put("state", call.getString("state", "idle"));

                String state = call.getString("state", "idle");

                if ("cart".equals(state)) {
                    data.put("items", call.getString("items", "[]"));
                    data.put("subtotal", call.getDouble("subtotal", 0.0));
                    data.put("igv", call.getDouble("igv", 0.0));
                    data.put("discount", call.getDouble("discount", 0.0));
                    data.put("total", call.getDouble("total", 0.0));
                } else if ("completed".equals(state)) {
                    data.put("total", call.getDouble("total", 0.0));
                    data.put("invoiceNumber", call.getString("invoiceNumber", ""));
                    data.put("documentType", call.getString("documentType", ""));
                }

                presentation.sendUpdate(data.toString());
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Error sending update", e);
                call.resolve(); // Silent fail
            }
        });
    }

    /**
     * Cerrar la pantalla de cliente
     */
    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (presentation != null) {
                    presentation.dismiss();
                    presentation = null;
                }
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Error hiding presentation", e);
                call.resolve();
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (presentation != null) {
            presentation.dismiss();
            presentation = null;
        }
        super.handleOnDestroy();
    }

    /**
     * Presentation que muestra un WebView a pantalla completa en el display secundario
     */
    static class CustomerPresentation extends Presentation {
        private static final String TAG = "CustomerPresentation";
        private WebView webView;
        private boolean isReady = false;
        private OnReadyListener onReadyListener;
        private String pendingConfig;

        interface OnReadyListener {
            void onReady();
        }

        public CustomerPresentation(Context context, Display display) {
            super(context, display);
        }

        public void setOnReadyListener(OnReadyListener listener) {
            this.onReadyListener = listener;
            if (isReady && listener != null) {
                listener.onReady();
            }
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);

            webView = new WebView(getContext());
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
            );
            webView.setLayoutParams(params);

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setAllowFileAccess(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    isReady = true;
                    if (onReadyListener != null) {
                        onReadyListener.onReady();
                    }
                    if (pendingConfig != null) {
                        sendConfig(pendingConfig);
                        pendingConfig = null;
                    }
                }
            });

            webView.setWebChromeClient(new WebChromeClient());

            setContentView(webView);
            webView.loadUrl("file:///android_asset/public/customer-display.html");
        }

        public void sendConfig(String json) {
            if (!isReady) {
                pendingConfig = json;
                return;
            }
            String escaped = json.replace("\\", "\\\\").replace("'", "\\'");
            webView.evaluateJavascript("window.initDisplay('" + escaped + "')", null);
        }

        public void sendUpdate(String json) {
            if (!isReady) return;
            String escaped = json.replace("\\", "\\\\").replace("'", "\\'");
            webView.evaluateJavascript("window.updateDisplay('" + escaped + "')", null);
        }
    }
}
