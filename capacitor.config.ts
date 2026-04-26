import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.offloadusa.app',
  appName: 'Offload',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    // Production: app loads local web assets, API calls go to api.offloadusa.com
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Geolocation: {
      // High accuracy for driver tracking
    },
    Camera: {
      // Photo capture settings for proof of pickup/delivery
    },
    BluetoothLe: {
      // BLE scale settings for weight measurement
    },
  },
  // iOS specific configuration
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0a0a0b',
  },
  // Android specific configuration
  android: {
    backgroundColor: '#0a0a0b',
  },
};

export default config;
