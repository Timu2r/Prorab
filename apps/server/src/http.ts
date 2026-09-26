import type { Role } from "@ks/core";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import type { User } from "./auth";
import { ApiError } from "./util";

declare module "fastify" {
  interface FastifyRequest {
    user: (User & { sessionId: string }) | null;
  }
}

/** Вошедший пользователь; с ролью — только если она у него есть. */
export function need(req: FastifyRequest, role?: Role): User & { sessionId: string } {
  if (!req.user) throw new ApiError(401, "unauthorized", "Войдите в аккаунт");
  if (role && !req.user.roles.includes(role)) throw new ApiError(403, "forbidden", "Недостаточно прав");
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
