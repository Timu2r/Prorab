import { normalizePhone, type Role } from "@ks/core";
import type { Db, Queryable } from "./db";
import { ApiError, newCode, newId, newToken, sha256 } from "./util";

/** Куда отправить код. Сейчас — в лог сервера; на запуске — провайдер кода звонком. */
export interface CodeSender {
  send(phone: string, code: string): Promise<void>;
}

export const logSender: CodeSender = {
  async send(phone, code) {
    console.log(`[код входа] ${phone}: ${code}`);
  },
};

export type AuthConfig = {
  ownerPhones: string[];
  devCodes: boolean;
  codeSecret: string;
};

const CODE_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_SEC = 60;
const MAX_CODES_PER_PHONE_HOUR = 5;
const MAX_CODES_PER_IP_HOUR = 20;
const SESSION_DAYS = 90;
/** Ключ браузера после заявки с сайта живёт дольше: клиент возвращается посмотреть заказ через месяцы. */
const DEVICE_SESSION_DAYS = 180;

export type User = { id: string; phone: string; name: string; roles: Role[] };

/**
 * full — вход по коду. device — ключ, который браузер получил вместе с заявкой (docs/TZ.md, 16.4): без кода он
 * открывает только заявки, отправленные с этого браузера, и только на просмотр. Роли у такого ключа пустые,
 * даже если в заявке указан номер владельца или мастера.
 */
export type SessionScope = "full" | "device";
export type SessionUser = User & { sessionId: string; scope: SessionScope };

export class AuthService {
  constructor(
    private db: Db,
    private sender: CodeSender,
    private cfg: AuthConfig,
  ) {}

  private hashCode(phone: string, code: string) {
    return sha256(`${this.cfg.codeSecret}:${phone}:${code}`);
  }

  async requestCode(rawPhone: string, ip: string): Promise<{ phone: string; resendAfter: number; devCode?: string }> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new ApiError(400, "bad_phone", "Введите мобильный номер России, например +7 999 123-45-67");

    const [last] = await this.db.query<{ age: number }>(
      `SELECT extract(epoch FROM now() - created_at)::int AS age FROM login_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`,
      [phone],
    );
    if (last && last.age < RESEND_AFTER_SEC)
      throw new ApiError(429, "too_soon", `Новый код можно запросить через ${RESEND_AFTER_SEC - last.age} с`);

    const [{ n: perPhone }] = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM login_codes WHERE phone = $1 AND created_at > now() - interval '1 hour'`,
      [phone],
    );
    const [{ n: perIp }] = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM login_codes WHERE ip = $1 AND created_at > now() - interval '1 hour'`,
      [ip],
    );
    if (perPhone >= MAX_CODES_PER_PHONE_HOUR || perIp >= MAX_CODES_PER_IP_HOUR)
      throw new ApiError(429, "too_many", "Слишком много попыток. Попробуйте через час");

    const code = newCode();
    await this.db.query(
      `INSERT INTO login_codes (id, phone, code_hash, ip, expires_at) VALUES ($1, $2, $3, $4, now() + interval '${CODE_TTL_MIN} minutes')`,
      [newId("code"), phone, this.hashCode(phone, code), ip],
    );
    await this.sender.send(phone, code);
    return { phone, resendAfter: RESEND_AFTER_SEC, ...(this.cfg.devCodes ? { devCode: code } : {}) };
  }

  /**
   * Вход по коду. Если браузер пришёл с ключом заявки (fromDevice), заявки, отправленные с него, остаются видны
   * и после входа — даже оформленные на другой номер (например, заявка для родителей), а сам ключ закрывается.
   */
  async verify(rawPhone: string, code: string, device: string, fromDevice: string | null = null): Promise<{ token: string; user: User }> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new ApiError(400, "bad_phone", "Неверный номер");

    const [row] = await this.db.query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM login_codes
       WHERE phone = $1 AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [phone],
    );
    if (!row) throw new ApiError(400, "code_expired", "Код устарел. Запросите новый");
    if (row.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "code_locked", "Слишком много неверных попыток. Запросите новый код");
    if (row.code_hash !== this.hashCode(phone, code.trim())) {
      await this.db.query(`UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
      throw new ApiError(400, "code_wrong", "Неверный код");
    }

    return this.db.tx(async (q) => {
      await q.query(`UPDATE login_codes SET used_at = now() WHERE id = $1`, [row.id]);
      let [user] = await q.query<User>(`SELECT id, phone, name, roles FROM users WHERE phone = $1 AND deleted_at IS NULL`, [phone]);
      if (!user) {
        [user] = await q.query<User>(`INSERT INTO users (id, phone) VALUES ($1, $2) RETURNING id, phone, name, roles`, [newId("usr"), phone]);
      }
      if (this.cfg.ownerPhones.includes(phone) && !user.roles.includes("owner")) {
        [user] = await q.query<User>(
          `UPDATE users SET roles = array_append(roles, 'owner') WHERE id = $1 RETURNING id, phone, name, roles`,
          [user.id],
        );
      }
      const token = newToken();
      const sessionId = newId("ses");
      await q.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, expires_at) VALUES ($1, $2, $3, $4, now() + interval '${SESSION_DAYS} days')`,
        [sessionId, user.id, sha256(token), device.slice(0, 100)],
      );
      if (fromDevice) {
        await q.query(
          `INSERT INTO session_requests (session_id, request_id)
           SELECT $1, sr.request_id FROM session_requests sr JOIN sessions s ON s.id = sr.session_id
           WHERE s.id = $2 AND s.scope = 'device'
           ON CONFLICT DO NOTHING`,
          [sessionId, fromDevice],
        );
        await q.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND scope = 'device' AND revoked_at IS NULL`, [fromDevice]);
      }
      return { token, user };
    });
  }

  async userByToken(token: string): Promise<SessionUser | null> {
    const [row] = await this.db.query<SessionUser & { fresh: boolean }>(
      `SELECT u.id, u.phone, u.name, u.roles, s.id AS "sessionId", s.scope,
              (s.last_used_at IS NOT NULL AND s.last_used_at > now() - interval '5 minutes') AS fresh
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.deleted_at IS NULL`,
      [sha256(token)],
    );
    if (!row) return null;
    // Отметка активности — не чаще раза в 5 минут, чтобы не писать в базу на каждый запрос
    if (!row.fresh) {
      await this.db.query(`UPDATE sessions SET last_used_at = now() WHERE id = $1`, [row.sessionId]);
      if (row.scope === "full") await this.db.query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [row.id]);
    }
    const { fresh: _fresh, ...user } = row;
    // Ключ без кода не несёт ролей: номер владельца в заявке не открывает панель владельца
    return user.scope === "device" ? { ...user, roles: [] } : user;
  }

  /**
   * Удаление аккаунта (требование магазинов приложений): имя и телефон обезличиваются, сессии закрываются,
   * заказы и деньги остаются для учёта. Владельца и мастера с незакрытыми заданиями удалить нельзя.
   */
  async deleteAccount(user: User): Promise<void> {
    if (user.roles.includes("owner")) throw new ApiError(409, "owner", "Аккаунт владельца удалить нельзя");
    await this.db.tx(async (q) => {
      const [{ n }] = await q.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM requests WHERE master_id = $1 AND status IN ('assigned', 'accepted', 'en_route', 'on_site', 'done')`,
        [user.id],
      );
      if (n) throw new ApiError(409, "active_jobs", "Сначала завершите или передайте свои задания");
      await q.query(`UPDATE users SET name = '', phone = $2, deleted_at = now() WHERE id = $1`, [user.id, `deleted:${user.id}`]);
      await q.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [user.id]);
      await q.query(`DELETE FROM client_profiles WHERE user_id = $1`, [user.id]);
      await q.query(`UPDATE masters SET active = false WHERE user_id = $1`, [user.id]);
      await q.query(`DELETE FROM push_tokens WHERE user_id = $1`, [user.id]);
    });
  }

  async logout(sessionId: string) {
    await this.db.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);
  }
}

/**
 * Заявка с сайта попадает в «Мои заказы» этого браузера. Пришёл с ключом — заявка добавляется к нему (null в ответе:
 * новый ключ не нужен); без ключа — выдаётся новый на клиента из заявки.
 */
export async function linkLead(q: Queryable, requestId: string, clientId: string, session: SessionUser | null): Promise<string | null> {
  if (session) {
    await q.query(`INSERT INTO session_requests (session_id, request_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [session.sessionId, requestId]);
    if (session.scope === "device")
      await q.query(`UPDATE sessions SET expires_at = GREATEST(expires_at, now() + interval '${DEVICE_SESSION_DAYS} days') WHERE id = $1`, [session.sessionId]);
    return null;
  }
  const token = newToken();
  const sessionId = newId("ses");
  await q.query(
    `INSERT INTO sessions (id, user_id, token_hash, device, scope, expires_at)
     VALUES ($1, $2, $3, 'web', 'device', now() + interval '${DEVICE_SESSION_DAYS} days')`,
    [sessionId, clientId, sha256(token)],
  );
  await q.query(`INSERT INTO session_requests (session_id, request_id) VALUES ($1, $2)`, [sessionId, requestId]);
  return token;
}
