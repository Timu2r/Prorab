import type { FastifyInstance } from "fastify";
import type { Services } from "../app";
import { upsertProfile } from "../clients";
import { body, need } from "../http";
import { schemas } from "../schemas";

/** Вход и профиль (docs/TZ.md, 8.1). */
export function authRoutes(app: FastifyInstance, s: Services) {
  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/code", async (req) => s.auth.requestCode(body(schemas.code, req).phone, req.ip));
  app.post("/auth/verify", async (req) => {
    const b = body(schemas.verify, req);
    return s.auth.verify(b.phone, b.code, b.device);
  });
  app.post("/auth/logout", async (req) => {
    await s.auth.logout(need(req).sessionId);
    return { ok: true };
  });

  const me = async (userId: string) => {
    const [u] = await s.db.query<{ id: string; phone: string; name: string; roles: string[] }>(`SELECT id, phone, name, roles FROM users WHERE id = $1`, [userId]);
    const [p] = await s.db.query<{ type: string; company_name: string; inn: string; kpp: string }>(
      `SELECT type, company_name, inn, kpp FROM client_profiles WHERE user_id = $1`,
      [userId],
    );
    const [m] = await s.db.query<{ is_lead: boolean }>(`SELECT is_lead FROM masters WHERE user_id = $1 AND active`, [userId]);
    return {
      ...u!,
      isLead: m?.is_lead ?? false,
      profile: { type: p?.type ?? "person", companyName: p?.company_name ?? "", inn: p?.inn ?? "", kpp: p?.kpp ?? "" },
    };
  };

  app.get("/me", async (req) => ({ user: await me(need(req).id) }));
  app.patch("/me", async (req) => {
    const u = need(req);
    const { name, ...profile } = body(schemas.me, req);
    if (name !== undefined) await s.db.query(`UPDATE users SET name = $1 WHERE id = $2`, [name, u.id]);
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
