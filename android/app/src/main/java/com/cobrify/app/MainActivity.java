package com.cobrify.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.cobrify.app.plugins.TcpPrinterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar plugin personalizado para impresión TCP/WiFi
        registerPlugin(TcpPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
