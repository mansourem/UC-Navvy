import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ucnavvy.mobile',
  appName: 'UCNavvy',
  webDir: 'dist',
  android: {
    path: 'mobile/android'
  }
};

export default config;