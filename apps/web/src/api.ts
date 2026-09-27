import type { Role } from "@ks/core";

const BASE = import.meta.env.VITE_API_URL ?? `http://${location.hostname}:4100`;
const TOKEN_KEY = "ks_token";

/** Полный адрес для относительных ссылок сервера — фото приходят как /files/…?exp&sig. */
export const apiUrl = (path: string) => BASE + path;

/** scope device — ключ браузера после заявки: без кода видны только заявки с этого браузера (docs/TZ.md, 16.4). */
export type User = { id: string; phone: string; name: string; roles: Role[]; scope?: "full" | "device" };

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

/** Фото на сервер как есть, без multipart: тело запроса — сама картинка. */
export async function uploadImage(path: string, blob: Blob): Promise<void> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { method: "POST", headers: { "content-type": blob.type || "image/jpeg" }, body: blob });
  } catch {
    throw new ApiError(0, "offline", "Нет связи с сервером");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error?.code ?? "unknown", data.error?.message ?? "Не удалось загрузить фото");
  }
}

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
