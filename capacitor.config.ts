import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.factuya.app',
  appName: 'Factuya',
  webDir: 'dist',
  server: {
    // Configuración para Live Reload
    // Cambia esta IP por la IP de tu PC en la red local
    // Averigua tu IP con: ipconfig (Windows) o ifconfig (Mac/Linux)
    // url: 'http://192.168.1.XXX:3000', // Descomentar y poner tu IP
    cleartext: true,
  },
};

export default config;
