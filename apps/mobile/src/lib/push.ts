import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushResult = "registered" | "denied" | "unsupported" | "not_configured";

/**
 * Ask for permission and register this device's Expo push token with the
 * server. Called only after the user saves a prediction (contextual prompt),
 * never on first launch.
 */
export async function registerForPush(): Promise<PushResult> {
  if (Platform.OS === "web" || !Device.isDevice) return "unsupported";
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) return "not_configured"; // run `npx eas-cli init` to create one

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Match updates", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return "denied";

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api("/me/push-tokens", { method: "POST", body: { token, platform: Platform.OS } });
  return "registered";
}
