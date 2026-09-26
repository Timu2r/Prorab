import { normalizePhone, type Role } from "@ks/core";
import type { Db } from "./db";
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

export type User = { id: string; phone: string; name: string; roles: Role[] };

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

  async verify(rawPhone: string, code: string, device: string): Promise<{ token: string; user: User }> {
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
      await q.query(
        `INSERT INTO sessions (id, user_id, token_hash, device, expires_at) VALUES ($1, $2, $3, $4, now() + interval '${SESSION_DAYS} days')`,
        [newId("ses"), user.id, sha256(token), device.slice(0, 100)],
      );
      return { token, user };
    });
  }

  async userByToken(token: string): Promise<(User & { sessionId: string }) | null> {
    const [row] = await this.db.query<User & { sessionId: string }>(
      `SELECT u.id, u.phone, u.name, u.roles, s.id AS "sessionId"
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.deleted_at IS NULL`,
      [sha256(token)],
    );
    return row ?? null;
  }

  async logout(sessionId: string) {
    await this.db.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);
  }
}
