import type { Role } from "@ks/core";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { storage } from "./storage";

export const TOKEN_KEY = "ks_token";

/**
 * Адрес API. На боевом сервере — EXPO_PUBLIC_API_URL (https://api.<домен>). В разработке: в браузере — тот же
 * компьютер, на телефоне — IP компьютера, с которого Expo раздаёт приложение (телефон в той же сети Wi-Fi).
 */
export function apiBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === "web") {
    const loc = (globalThis as { location?: { protocol: string; hostname: string } }).location;
    return `${loc?.protocol ?? "http:"}//${loc?.hostname ?? "localhost"}:4100`;
  }
  const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
  return `http://${host}:4100`;
}

/** Сайт — для ссылок на политику обработки данных и условия работ. */
export function siteUrl(path = ""): string {
  return (process.env.EXPO_PUBLIC_SITE_URL ?? apiBase().replace(":4100", ":5190")) + path;
}

/** Фото приходят с сервера относительными подписанными ссылками (/files/…). */
export const fileUrl = (path: string) => apiBase() + path;

export type Me = {
  id: string;
  phone: string;
  name: string;
  roles: Role[];
  isLead: boolean;
  /** Принимает ли мастер заказы; null — не мастер. */
  available: boolean | null;
  consentAt: string | null;
  profile: { type: "person" | "company"; companyName: string; inn: string; kpp: string };
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: object): Promise<T> {
  const token = await storage.get(TOKEN_KEY);
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline", "Нет связи с сервером. Проверьте интернет");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "unknown", data.error?.message ?? "Ошибка сервера");
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Что-то пошло не так");
