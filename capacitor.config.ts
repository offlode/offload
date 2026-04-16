import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.offloadusa.app',
  appName: 'Offload',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
    // For development, uncomment the line below and set to your dev server URL:
    // url: 'http://localhost:5000',
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
