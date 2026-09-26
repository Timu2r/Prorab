import { DEFAULT_SETTINGS, type Settings } from "@ks/core";
import type { Db, Queryable } from "./db";

/** Изменение настроек: вложенные группы можно присылать частично. */
export type SettingsPatch = Partial<{
  taxPercent: number;
  warrantyMonths: number;
  notifyOwnerPhones: string[];
  workHours: Partial<Settings["workHours"]>;
  clientSms: Partial<Settings["clientSms"]>;
  attention: Partial<Settings["attention"]>;
}>;

/** Настройки владельца: в базе хранится только то, что он поменял; остальное — значения по умолчанию. */
export class SettingsService {
  constructor(
    private db: Db,
    private ownerPhones: string[],
  ) {}

  /** q — текущая транзакция: встроенная база PGlite не выполняет запросы мимо открытой транзакции, а ждёт её. */
  async get(q: Queryable = this.db): Promise<Settings> {
    const rows = await q.query<{ key: string; value: unknown }>(`SELECT key, value FROM settings`);
    const s = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
    for (const r of rows) if (r.key in s) s[r.key] = r.value;
    const out = s as Settings;
    if (!out.notifyOwnerPhones.length) out.notifyOwnerPhones = [...this.ownerPhones];
    return out;
  }

  async patch(userId: string, patch: SettingsPatch): Promise<Settings> {
    const current = await this.get();
    await this.db.tx(async (q) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || !(key in current)) continue;
        const cur = (current as Record<string, unknown>)[key];
        // Вложенные настройки (часы, SMS, пороги) дополняются, а не заменяются целиком
        const merged = value && typeof value === "object" && !Array.isArray(value) ? { ...(cur as object), ...value } : value;
        await q.query(
          `INSERT INTO settings (key, value, updated_at, updated_by) VALUES ($1, $2, now(), $3)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
          [key, JSON.stringify(merged), userId],
        );
      }
    });
    return this.get();
  }
}
