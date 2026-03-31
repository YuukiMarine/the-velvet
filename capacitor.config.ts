import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pgt.app',
  appName: '靛蓝色房间',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
