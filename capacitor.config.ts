import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pgt.app',
  appName: '天鹅绒房间',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
