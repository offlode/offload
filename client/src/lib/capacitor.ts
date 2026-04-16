// Capacitor.js utility helpers
// These provide native functionality when running inside Capacitor,
// with graceful web fallbacks for browser usage.

/**
 * Detect if running in a Capacitor native shell (iOS/Android)
 */
export const isNative = (): boolean => {
  return typeof (window as any).Capacitor !== "undefined";
};

/**
 * Get the current platform
 */
export const getPlatform = (): "ios" | "android" | "web" => {
  if (!isNative()) return "web";
  const cap = (window as any).Capacitor;
  return cap?.getPlatform?.() || "web";
};

/**
 * Capture a photo using native camera if available, fallback to file input
 */
export const capturePhoto = async (): Promise<string | null> => {
  if (isNative()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        quality: 80,
        width: 1024,
        correctOrientation: true,
      });
      return photo.base64String ? `data:image/jpeg;base64,${photo.base64String}` : null;
    } catch {
      // Fall through to web fallback
    }
  }

  // Web fallback: use file input
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } else {
        resolve(null);
      }
    };
    input.click();
  });
};

/**
 * Get current geolocation
 */
export const getCurrentPosition = async (): Promise<{ lat: number; lng: number } | null> => {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      // Fall through to web fallback
    }
  }

  // Web fallback
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
};

/**
 * Request push notification permissions and get token
 */
export const registerPushNotifications = async (): Promise<string | null> => {
  if (!isNative()) return null;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") return null;

    await PushNotifications.register();

    return new Promise((resolve) => {
      PushNotifications.addListener("registration", (token) => {
        resolve(token.value);
      });
      PushNotifications.addListener("registrationError", () => {
        resolve(null);
      });
      // Timeout after 5s
      setTimeout(() => resolve(null), 5000);
    });
  } catch {
    return null;
  }
};

/**
 * Trigger haptic feedback (native only)
 */
export const hapticFeedback = async (style: "light" | "medium" | "heavy" = "medium"): Promise<void> => {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const styleMap = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    await Haptics.impact({ style: styleMap[style] });
  } catch {
    // Haptics not available
  }
};
