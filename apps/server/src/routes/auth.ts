import type { FastifyInstance } from "fastify";
import type { Services } from "../app";
import { upsertProfile } from "../clients";
import { body, need, session } from "../http";
import { schemas } from "../schemas";

/** Вход и профиль (docs/TZ.md, 8.1). */
export function authRoutes(app: FastifyInstance, s: Services) {
  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/code", async (req) => s.auth.requestCode(body(schemas.code, req).phone, req.ip));
  app.post("/auth/verify", async (req) => {
    const b = body(schemas.verify, req);
    // Браузер с ключом заявки: заявки с него переходят во вход по коду
    return s.auth.verify(b.phone, b.code, b.device, req.user?.scope === "device" ? req.user.sessionId : null);
  });
  app.post("/auth/logout", async (req) => {
    await s.auth.logout(session(req).sessionId);
    return { ok: true };
  });

  const me = async (userId: string) => {
    const [u] = await s.db.query<{ id: string; phone: string; name: string; roles: string[]; consentAt: Date | null }>(
      `SELECT id, phone, name, roles, consent_at AS "consentAt" FROM users WHERE id = $1`,
      [userId],
    );
    const [p] = await s.db.query<{ type: string; company_name: string; inn: string; kpp: string }>(
      `SELECT type, company_name, inn, kpp FROM client_profiles WHERE user_id = $1`,
      [userId],
    );
    const [m] = await s.db.query<{ is_lead: boolean; available: boolean }>(`SELECT is_lead, available FROM masters WHERE user_id = $1 AND active`, [userId]);
    return {
      ...u!,
      isLead: m?.is_lead ?? false,
      /** Принимает ли мастер заказы; null — не мастер. */
      available: m ? m.available : null,
      profile: { type: p?.type ?? "person", companyName: p?.company_name ?? "", inn: p?.inn ?? "", kpp: p?.kpp ?? "" },
    };
  };

  app.get("/me", async (req) => {
    const u = session(req);
    // Ключ без кода: только номер из заявки — имя в базе могло быть записано владельцем номера, а не этим браузером
    if (u.scope === "device") return { user: { id: u.id, phone: u.phone, name: "", roles: [], scope: u.scope } };
    return { user: { ...(await me(u.id)), scope: u.scope } };
  });
  app.patch("/me", async (req) => {
    const u = need(req);
    const { name, consent, ...profile } = body(schemas.me, req);
    if (name !== undefined) await s.db.query(`UPDATE users SET name = $1 WHERE id = $2`, [name, u.id]);
    if (consent) await s.db.query(`UPDATE users SET consent_at = COALESCE(consent_at, now()) WHERE id = $1`, [u.id]);
    if (Object.keys(profile).length) await upsertProfile(s.db, u.id, profile);
    return { user: await me(u.id) };
  });
  app.delete("/me", async (req) => {
    const u = need(req);
    body(schemas.deleteMe, req);
    await s.auth.deleteAccount(u);
    return { ok: true };
  });
}
