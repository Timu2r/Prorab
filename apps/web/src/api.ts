import type { Role } from "@ks/core";

const BASE = import.meta.env.VITE_API_URL ?? `http://${location.hostname}:4100`;
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

export const token = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // приватный режим браузера: вход продержится до закрытия вкладки
    }
  },
};

export async function api<T>(method: "GET" | "POST" | "PATCH", path: string, body?: object): Promise<T> {
  const t = token.get();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
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
