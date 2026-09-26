import type { Role } from "@ks/core";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/**
 * Адрес сервера. В разработке берём IP компьютера, с которого Expo раздаёт приложение:
 * телефон в той же сети Wi-Fi достучится до сервера на порту 4100.
 */
function baseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
  return `http://${host}:4100`;
}

const TOKEN_KEY = "ks_token";

export type User = { id: string; phone: string; name: string; roles: Role[] };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (t: string | null) => (t ? SecureStore.setItemAsync(TOKEN_KEY, t) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

export async function api<T>(method: "GET" | "POST" | "PATCH", path: string, body?: object): Promise<T> {
  const t = await tokenStore.get();
  let res: Response;
  try {
    res = await fetch(baseUrl() + path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline", "Нет связи с сервером. Проверьте интернет");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "unknown", data.error?.message ?? "Ошибка сервера");
  return data as T;
}
