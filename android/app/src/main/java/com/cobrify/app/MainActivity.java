package com.cobrify.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.cobrify.app.plugins.TcpPrinterPlugin;
import com.cobrify.app.plugins.IminPrinterPlugin;
import com.cobrify.app.plugins.NotificationListenerPlugin;
import com.cobrify.app.plugins.BusinessStoragePlugin;
import com.cobrify.app.plugins.CustomerDisplayPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar plugins personalizados
        registerPlugin(TcpPrinterPlugin.class);
        registerPlugin(IminPrinterPlugin.class);
        registerPlugin(NotificationListenerPlugin.class);
        registerPlugin(BusinessStoragePlugin.class);
        registerPlugin(CustomerDisplayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
