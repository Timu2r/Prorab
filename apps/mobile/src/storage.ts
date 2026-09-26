import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type WebStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const web = () => (globalThis as { localStorage?: WebStorage }).localStorage;

/** Токен входа и выбранная роль: на телефоне — в защищённом хранилище, в браузере — в localStorage. */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS !== "web") return SecureStore.getItemAsync(key);
    try {
      return web()?.getItem(key) ?? null;
    } catch {
      return null; // приватный режим браузера
    }
  },
  async set(key: string, value: string | null): Promise<void> {
    if (Platform.OS !== "web") {
      if (value === null) await SecureStore.deleteItemAsync(key);
      else await SecureStore.setItemAsync(key, value);
      return;
    }
    try {
      if (value === null) web()?.removeItem(key);
      else web()?.setItem(key, value);
    } catch {
      // приватный режим браузера: вход продержится до закрытия вкладки
    }
  },
};
