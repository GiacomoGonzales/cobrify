import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cobrify.app',
  appName: 'Cobrify',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
      iconColor: '#2563EB',
      sound: 'default'
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      // El fondo claro del login (#F4F8FF): el lienzo azul entero era muy
      // fuerte y ademas desentonaba con la pantalla de espera clara que sigue.
      // Las imagenes splash.png de android/ y iOS llevan el mismo fondo.
      backgroundColor: '#F4F8FF',
      showSpinner: false,
      launchFadeOutDuration: 300,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
