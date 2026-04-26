import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useIOSPushRegistration(user: User | null) {
  useEffect(() => {
    if (!user) return;
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;

    let cancelled = false;
    let registrationHandle: { remove: () => Promise<void> } | undefined;
    let errorHandle: { remove: () => Promise<void> } | undefined;

    async function registerForPush() {
      try {
        registrationHandle = await PushNotifications.addListener("registration", async token => {
          if (cancelled || !token.value) return;
          await apiRequest("/api/push/register-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value, platform: "ios" }),
          });
        });

        errorHandle = await PushNotifications.addListener("registrationError", error => {
          console.error("[Push] Registration failed", error);
        });

        const permission = await PushNotifications.requestPermissions();
        if (permission.receive === "granted") {
          await PushNotifications.register();
        }
      } catch (err) {
        console.error("[Push] Unable to register for notifications", err);
      }
    }

    registerForPush();

    return () => {
      cancelled = true;
      void registrationHandle?.remove();
      void errorHandle?.remove();
    };
  }, [user?.id]);
}
