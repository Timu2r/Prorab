import type { Role } from "@ks/core";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import type { SessionUser } from "./auth";
import { ApiError } from "./util";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

/**
 * Вошедший по коду пользователь; с ролью — только если она у него есть. Ключ браузера без кода (scope device)
 * сюда не проходит: всё, что меняет данные, требует подтвердить номер.
 */
export function need(req: FastifyRequest, role?: Role): SessionUser {
  const u = session(req);
  if (u.scope !== "full") throw new ApiError(403, "confirm_phone", "Подтвердите номер телефона кодом из звонка");
  if (role && !u.roles.includes(role)) throw new ApiError(403, "forbidden", "Недостаточно прав");
  return u;
}

/** Любой ключ, в том числе браузерный без кода, — только для просмотра своих заявок. */
export function session(req: FastifyRequest): SessionUser {
  if (!req.user) throw new ApiError(401, "unauthorized", "Войдите в аккаунт");
  return req.user;
}

export const body = <T extends z.ZodType>(s: T, req: FastifyRequest): z.infer<T> => s.parse(req.body ?? {});
export const query = <T extends z.ZodType>(s: T, req: FastifyRequest): z.infer<T> => s.parse(req.query ?? {});
export const param = (req: FastifyRequest, k: string): string => (req.params as Record<string, string>)[k] ?? "";

/** Тело запроса с фото: приложение отправляет JPEG или PNG как есть, без multipart. */
export function image(req: FastifyRequest): { mime: string; data: Buffer } {
  const mime = (req.headers["content-type"] ?? "").split(";")[0]!.trim();
  if (!Buffer.isBuffer(req.body)) throw new ApiError(415, "bad_type", "Отправьте фото JPEG или PNG");
  return { mime, data: req.body };
}
