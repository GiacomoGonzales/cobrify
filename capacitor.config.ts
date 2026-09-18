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
      // Se queda hasta que la web avisa que ya pintó su primera pantalla
      // (src/utils/splashNativo.js). Los 10 s son solo el tope por si la web
      // no llegara a avisar: antes se iba solo a los 2 s, con la web a medio
      // cargar, y detrás se veían dos esperas más y un parpadeo (18-set-2026).
      // En iOS el splash es LaunchScreen.storyboard: degradado y logo al medio.
      launchShowDuration: 10000,
      launchAutoHide: true,
      // El fondo claro del login (#F4F8FF): el lienzo azul entero era muy
      // fuerte y ademas desentonaba con la pantalla de espera clara que sigue.
      // Las imagenes splash.png de android/ y iOS llevan el mismo fondo.
      backgroundColor: '#F4F8FF',
      showSpinner: false,
      launchFadeOutDuration: 250,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
