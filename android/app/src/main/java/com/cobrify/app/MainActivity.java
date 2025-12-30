package com.cobrify.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.cobrify.app.plugins.TcpPrinterPlugin;
import com.cobrify.app.plugins.NotificationListenerPlugin;
import com.cobrify.app.plugins.BusinessStoragePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar plugins personalizados
        registerPlugin(TcpPrinterPlugin.class);
        registerPlugin(NotificationListenerPlugin.class);
        registerPlugin(BusinessStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
