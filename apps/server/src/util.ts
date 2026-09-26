import { createHash, randomBytes, randomInt } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** 4 цифры: столько обычно даёт код звонком (последние цифры входящего номера). */
export function newCode(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

/** Ошибка, которую сервер показывает пользователю как есть: код HTTP, машинный код и текст по-русски. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
