package com.cobrify.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.cobrify.app.plugins.TcpPrinterPlugin;
import com.cobrify.app.plugins.NotificationListenerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar plugins personalizados
        registerPlugin(TcpPrinterPlugin.class);
        registerPlugin(NotificationListenerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
