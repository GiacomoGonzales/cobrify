import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cobrify.app',
  appName: 'Cobrify',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
