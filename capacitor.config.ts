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
      backgroundColor: '#FFFFFF',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#2563EB',
      launchFadeOutDuration: 300,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
