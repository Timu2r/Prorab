import {
  canAssign,
  canReassign,
  canTransition,
  canUnassign,
  formatRequestNumber,
  masterSeesContacts,
  normalizePhone,
  requestResult,
  unassignTarget,
  type RequestStatus,
} from "@ks/core";
import { isFinal, loadFor, loadRequest, masterInfo, mustBe, num, REQUEST_SELECT, type Actor, type RequestRow } from "./access";
import type { User } from "./auth";
import type { Db, Queryable } from "./db";
import { approvedEstimate, clientEstimate, loadEstimates } from "./estimates";
import { MAX_FILES_PER_REQUEST, type FileService } from "./files";
import { logEvent, moveStatus, syncStatus, type By } from "./flow";
import { clientInvoices, loadInvoices } from "./invoices";
import { accruePayout, payForecast, type PayoutService } from "./payouts";
import type { SettingsService } from "./settings";
import { addMonths, moscowDate } from "./time";
import { ApiError, newId } from "./util";

/** Через сколько дней после закрытия мастер перестаёт видеть адрес и телефон клиента (правило 2). */
const CONTACTS_DAYS_AFTER_CLOSE = 30;
const WORKING: RequestStatus[] = ["accepted", "en_route", "on_site", "done"];
const RESULT_VISIBLE: RequestStatus[] = ["done", "act_signed", "paid", "closed"];

function contactsOpen(r: RequestRow): boolean {
  if (!masterSeesContacts(r.status)) return false;
  if (r.status === "closed" && r.closed_at && Date.now() - new Date(r.closed_at).getTime() > CONTACTS_DAYS_AFTER_CLOSE * 86_400_000) return false;
  return true;
}

function base(r: RequestRow) {
  return {
    id: r.id,
    number: formatRequestNumber(r.number),
    status: r.status,
    category: r.category,
    serviceIds: r.service_ids,
    description: r.description,
    district: r.district,
    wantedDate: r.wanted_date,
    wantedSlot: r.wanted_slot,
    visitAt: r.visit_at,
    visitUntil: r.visit_until,
    createdAt: r.created_at,
  };
}

const address = (r: RequestRow) => ({ address: r.address, apartment: r.apartment, entrance: r.entrance, floor: r.floor, intercom: r.intercom });

/** Строка списка для владельца: всё. */
function ownerItem(r: RequestRow) {
  return {
    ...base(r),
    ...address(r),
    source: r.source,
    client: { id: r.client_id, name: r.client_name, phone: r.client_phone },
    master: r.master_id ? { id: r.master_id, name: r.master_name ?? "", phone: r.master_phone ?? "" } : null,
    priceWork: num(r.price_work),
    priceGoods: num(r.price_goods),
    prepaid: r.prepaid_at !== null,
    refundRequired: r.refund_required,
    cancelReason: r.cancel_reason,
    warrantyUntil: r.warranty_until,
    updatedAt: r.updated_at,
  };
}

/** Строка списка для клиента: его суммы и имя мастера. */
function clientItem(r: RequestRow) {
  return {
    ...base(r),
    ...address(r),
    priceWork: num(r.price_work),
    priceGoods: num(r.price_goods),
    master: r.master_id ? { name: r.master_name ?? "" } : null,
    cancelReason: r.cancel_reason,
    warrantyUntil: r.warranty_until,
    rating: r.rating,
  };
}

/** Строка списка для мастера и бригадира: никаких цен клиента (правило 1), контакты — после «Принять» (правило 2). */
function masterItem(r: RequestRow, me: string, pay: number | null) {
  const open = contactsOpen(r);
  return {
    ...base(r),
    ...(open ? address(r) : { address: null, apartment: null, entrance: null, floor: null, intercom: null }),
    client: open ? { name: r.client_name, phone: r.client_phone } : null,
    pay,
    mine: r.master_id === me,
    assignedTo: r.master_id ? { id: r.master_id, name: r.master_name ?? "" } : null,
  };
}

export type NewRequest = {
  category: string;
  serviceIds: string[];
  description: string;
  address: string;
  apartment: string;
  entrance: string;
  floor: string;
  intercom: string;
  district: string;
  wantedDate: string | null;
  wantedSlot: string;
  source?: string;
  clientPhone?: string;
  clientName?: string;
};

export type ListFilter = { status?: string[]; category?: string; masterId?: string; source?: string; from?: string; to?: string; q?: string };

export type RequestPatch = Partial<{
  category: string;
  description: string;
  address: string;
  apartment: string;
  entrance: string;
  floor: string;
  intercom: string;
  district: string;
  wantedDate: string | null;
  wantedSlot: string;
  visitAt: string | null;
  visitUntil: string | null;
  serviceIds: string[];
  ownerNote: string;
}>;

const PATCH_COLUMNS: Record<string, string> = {
  category: "category",
  description: "description",
  address: "address",
  apartment: "apartment",
  entrance: "entrance",
  floor: "floor",
  intercom: "intercom",
  district: "district",
  wantedDate: "wanted_date",
  wantedSlot: "wanted_slot",
  visitAt: "visit_at",
  visitUntil: "visit_until",
  serviceIds: "service_ids",
  ownerNote: "owner_note",
};

export class RequestService {
  constructor(
    private db: Db,
    private files: FileService,
    private payouts: PayoutService,
    private settings: SettingsService,
  ) {}

  // ---------- создание ----------

  async create(user: User, input: NewRequest) {
    const isOwner = user.roles.includes("owner");
    const id = await this.db.tx(async (q) => {
      let clientId = user.id;
      let source = "app";
      if (isOwner && input.clientPhone) {
        const phone = normalizePhone(input.clientPhone);
        if (!phone) throw new ApiError(400, "bad_phone", "Неверный телефон клиента");
        clientId = await upsertClient(q, phone, input.clientName ?? "");
        source = input.source ?? "call";
      }
      const id = newId("req");
      await q.query(
        `INSERT INTO requests (id, client_id, category, service_ids, description, address, apartment, entrance, floor, intercom, district, wanted_date, wanted_slot, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          id,
          clientId,
          input.category,
          input.serviceIds,
          input.description,
          input.address,
          input.apartment,
          input.entrance,
          input.floor,
          input.intercom,
          input.district,
          input.wantedDate,
          input.wantedSlot,
          source,
        ],
      );
      await logEvent(q, id, { userId: user.id, role: isOwner ? "owner" : "client" }, "created", { source });
      return id;
    });
    return this.get(user, id);
  }

  /**
   * Заявка с сайта без входа: имя, телефон, направление, комментарий и согласие на обработку данных.
   * Адрес и детали владелец уточняет по телефону. Клиент заводится по номеру; войти в кабинет
   * он сможет позже по коду на этот же номер и увидит там свою заявку.
   */
  async createLead(input: { name: string; phone: string; category: string; comment: string; utm?: Record<string, string> }) {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new ApiError(400, "bad_phone", "Введите мобильный номер, например +7 999 123-45-67");
    return this.db.tx(async (q) => {
      const [{ n }] = await q.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM requests r JOIN users u ON u.id = r.client_id
         WHERE u.phone = $1 AND r.source = 'site' AND r.created_at > now() - interval '1 day'`,
        [phone],
      );
      if (n >= 3) throw new ApiError(429, "too_many", "Вы уже оставили заявку. Мы перезвоним");
      const clientId = await upsertClient(q, phone, input.name);
      const id = newId("req");
      const utm = input.utm && Object.keys(input.utm).length ? JSON.stringify(input.utm) : null;
      const [{ number }] = await q.query<{ number: number }>(
        `INSERT INTO requests (id, client_id, category, description, source, consent_at, utm) VALUES ($1, $2, $3, $4, 'site', now(), $5) RETURNING number`,
        [id, clientId, input.category, input.comment, utm],
      );
      await logEvent(q, id, { userId: clientId, role: "client" }, "created", { source: "site" });
      return { number: formatRequestNumber(number) };
    });
  }

  // ---------- списки ----------

  /** Владелец — все с фильтрами; бригадир — задания команды; мастер — свои задания; клиент — свои заявки. */
  async list(user: User, f: ListFilter = {}) {
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, ...values: unknown[]) => {
      for (const v of values) params.push(v);
      where.push(sql.replace(/\$(\d+)/g, (_, i) => `$${params.length - values.length + Number(i)}`));
    };
    let as: Actor;
    const mi = await masterInfo(this.db, user);
    if (user.roles.includes("owner")) as = "owner";
    else if (mi) {
      as = "master";
      add(`r.master_id = ANY($1::text[])`, mi.team);
    } else {
      as = "client";
      add(`r.client_id = $1`, user.id);
    }
    if (f.status?.length) add(`r.status = ANY($1::text[])`, f.status);
    if (as === "owner") {
      if (f.category) add(`r.category = $1`, f.category);
      if (f.masterId) add(`r.master_id = $1`, f.masterId);
      if (f.source) add(`r.source = $1`, f.source);
      if (f.from) add(`r.created_at >= $1::date`, f.from);
      if (f.to) add(`r.created_at < ($1::date + 1)`, f.to);
      const text = f.q?.trim();
      if (text) {
        const digits = text.replace(/\D/g, "");
        if (digits) add(`(c.name ILIKE $1 OR r.address ILIKE $1 OR c.phone LIKE $2 OR r.number = $3)`, `%${text}%`, `%${digits}%`, Number(digits.slice(-9)));
        else add(`(c.name ILIKE $1 OR r.address ILIKE $1)`, `%${text}%`);
      }
    }
    const order = as === "master" ? `r.visit_at ASC NULLS LAST, r.created_at DESC` : `r.created_at DESC`;
    const rows = await this.db.query<RequestRow>(`${REQUEST_SELECT}${where.map((w) => ` AND ${w}`).join("")} ORDER BY ${order} LIMIT 300`, params);
    if (as === "owner") return rows.map(ownerItem);
    if (as === "client") return rows.map(clientItem);
    return this.masterItems(this.db, user, rows);
  }

  private async masterItems(q: Queryable, user: User, rows: RequestRow[]) {
    const pay = new Map<string, number | null>();
    const byMaster = new Map<string, string[]>();
    for (const r of rows) if (r.master_id) byMaster.set(r.master_id, [...(byMaster.get(r.master_id) ?? []), r.id]);
    for (const [masterId, ids] of byMaster) for (const [id, v] of await payForecast(q, masterId, ids)) pay.set(id, v);
    return rows.map((r) => masterItem(r, user.id, pay.get(r.id) ?? null));
  }

  /** Мастер, который сам заказывал как клиент, видит свои заказы отдельно от заданий. */
  async listAsClient(user: User) {
    const rows = await this.db.query<RequestRow>(`${REQUEST_SELECT} AND r.client_id = $1 ORDER BY r.created_at DESC LIMIT 300`, [user.id]);
    return rows.map(clientItem);
  }

  // ---------- карточка ----------

  async get(user: User, id: string) {
    return this.detail(this.db, user, id);
  }

  private fileViews = async (q: Queryable, requestId: string, kinds?: string[]) => {
    const rows = await q.query<{ id: string; kind: string; uploaded_by: string; mime: string; created_at: Date }>(
      `SELECT id, kind, uploaded_by, mime, created_at FROM files WHERE request_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
      [requestId],
    );
    return rows
      .filter((f) => !kinds || kinds.includes(f.kind))
      .map((f) => ({ id: f.id, kind: f.kind, url: this.files.url(f.id), uploadedBy: f.uploaded_by, createdAt: f.created_at }));
  };

  private async acts(q: Queryable, requestId: string) {
    const rows = await q.query<{ accepted: boolean; remarks: string; method: string; file_id: string | null; signed_at: Date; signed_by: string }>(
      `SELECT accepted, remarks, method, file_id, signed_at, signed_by FROM acts WHERE request_id = $1 ORDER BY signed_at`,
      [requestId],
    );
    return rows.map((a) => ({
      accepted: a.accepted,
      remarks: a.remarks,
      method: a.method,
      fileUrl: a.file_id ? this.files.url(a.file_id) : null,
      signedAt: a.signed_at,
    }));
  }

  private async extraWork(q: Queryable, requestId: string) {
    const rows = await q.query<{ at: Date; payload: { text: string; fileIds: string[] } }>(
      `SELECT at, payload FROM request_events WHERE request_id = $1 AND kind = 'extra_work' ORDER BY at`,
      [requestId],
    );
    return rows.map((e) => ({ at: e.at, text: e.payload.text, files: (e.payload.fileIds ?? []).map((f) => ({ id: f, url: this.files.url(f) })) }));
  }

  private async detail(q: Queryable, user: User, id: string) {
    const { r, as } = await loadFor(q, user, id);
    if (as === "owner") {
      const [estimates, invoices, files, acts, payouts, settings] = [
        await loadEstimates(q, id),
        await loadInvoices(q, id),
        await this.fileViews(q, id),
        await this.acts(q, id),
        await this.payouts.forRequest(q, id),
        await this.settings.get(q),
      ];
      const events = await q.query(
        `SELECT e.at, e.actor_role AS "actorRole", u.name AS "actorName", e.kind, e.payload
         FROM request_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.request_id = $1 ORDER BY e.at`,
        [id],
      );
      const approved = estimates.find((e) => e.status === "approved");
      const revenue = invoices.reduce((s, i) => s + (i.status === "paid" ? i.amount : 0), 0);
      const paid = payouts.filter((p) => p.status !== "cancelled").reduce((s, p) => s + p.amount, 0);
      const forecast = r.master_id ? (await payForecast(q, r.master_id, [id])).get(id) ?? null : null;
      return {
        ...ownerItem(r),
        utm: r.utm,
        ownerNote: r.owner_note,
        rating: r.rating,
        review: r.review,
        doneAt: r.done_at,
        closedAt: r.closed_at,
        estimates,
        invoices,
        files,
        acts,
        extraWork: await this.extraWork(q, id),
        payouts,
        payForecast: forecast,
        money: requestResult({ revenue, goodsCost: approved?.totals.cost ?? 0, payouts: paid }, settings.taxPercent),
        events,
      };
    }
    if (as === "client") {
      const showResult = RESULT_VISIBLE.includes(r.status);
      return {
        ...clientItem(r),
        review: r.review,
        estimates: (await loadEstimates(q, id)).filter((e) => e.status !== "draft").map(clientEstimate),
        invoices: clientInvoices(await loadInvoices(q, id)),
        files: await this.fileViews(q, id, showResult ? ["client_photo", "before", "after", "act_paper"] : ["client_photo"]),
        acts: await this.acts(q, id),
      };
    }
    // Мастер и бригадир: работы и материалы без цен, своя сумма
    const est = await approvedEstimate(q, id);
    const [item] = await this.masterItems(q, user, [r]);
    return {
      ...item,
      works: (est?.items ?? []).filter((i) => i.kind === "work").map((i) => ({ name: i.name, unit: i.unit, qty: i.qty })),
      materials: (est?.items ?? []).filter((i) => i.kind !== "work").map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty, usedQty: i.usedQty })),
      files: await this.fileViews(q, id),
      extraWork: await this.extraWork(q, id),
      acts: await this.acts(q, id),
      role: as,
    };
  }

  // ---------- изменения владельцем ----------

  async update(user: User, id: string, patch: RequestPatch) {
    await this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, id);
      mustBe(as, "owner");
      if (isFinal(r)) throw new ApiError(409, "final", "Заявка уже закрыта");
      if (patch.category !== undefined && patch.category !== r.category && !["new", "agreed"].includes(r.status))
        throw new ApiError(409, "category_locked", "Направление меняется только до назначения мастера");
      const visitAt = patch.visitAt !== undefined ? patch.visitAt : r.visit_at;
      const visitUntil = patch.visitUntil !== undefined ? patch.visitUntil : r.visit_until;
      if (visitAt && visitUntil && new Date(visitUntil) <= new Date(visitAt)) throw new ApiError(400, "bad_visit", "Окончание визита раньше начала");
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || !(k in PATCH_COLUMNS)) continue;
        params.push(v);
        sets.push(`${PATCH_COLUMNS[k]} = $${params.length}`);
      }
      if (!sets.length) return;
      params.push(id);
      await q.query(`UPDATE requests SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
      await logEvent(q, id, { userId: user.id, role: "owner" }, "updated", patch);
    });
    return this.get(user, id);
  }

  // ---------- статусы ----------

  async setStatus(user: User, id: string, to: RequestStatus, reason: string) {
    await this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, id);
      if (as === "lead" || !canTransition(r.status, to, as)) throw new ApiError(409, "bad_transition", "Это действие сейчас недоступно");
      const by: By = { userId: user.id, role: as };
      if (to === "cancelled") {
        if (!reason.trim()) throw new ApiError(400, "reason_required", "Укажите причину отмены");
        const [{ n }] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM invoices WHERE request_id = $1 AND status = 'paid'`, [id]);
        await q.query(`UPDATE requests SET cancel_reason = $1, refund_required = $2 WHERE id = $3`, [reason.trim(), n > 0, id]);
        await moveStatus(q, id, r.status, to, by, { reason: reason.trim() });
        return;
      }
      await this.checkEnter(q, r, to);
      await moveStatus(q, id, r.status, to, by);
      if (to === "closed") await this.onClose(q, id, by);
      await syncStatus(q, id, by);
    });
    return this.get(user, id);
  }

  /** Условия входа в статус (docs/TZ.md, раздел 5). */
  private async checkEnter(q: Queryable, r: RequestRow, to: RequestStatus) {
    const invoices = (await loadInvoices(q, r.id)).filter((i) => i.status === "sent" || i.status === "paid");
    const materials = invoices.filter((i) => i.kind === "materials");
    if (to === "agreed" && !(await approvedEstimate(q, r.id))) throw new ApiError(400, "estimate_required", "Сначала согласуйте смету");
    if (to === "invoiced" && !materials.length) throw new ApiError(400, "invoice_required", "Сначала выставьте счёт на материалы");
    if (to === "prepaid" && !(materials.length && materials.every((i) => i.status === "paid")))
      throw new ApiError(400, "payment_required", "Счёт на материалы ещё не оплачен");
    if (to === "done") {
      const kinds = await q.query<{ kind: string }>(`SELECT DISTINCT kind FROM files WHERE request_id = $1 AND deleted_at IS NULL`, [r.id]);
      const has = (k: string) => kinds.some((x) => x.kind === k);
      if (!has("before") || !has("after")) throw new ApiError(400, "photos_required", "Добавьте фото до и после работ");
      const est = await approvedEstimate(q, r.id);
      if (est?.items.some((i) => i.kind !== "work" && i.usedQty === null))
        throw new ApiError(400, "materials_required", "Укажите, сколько материалов израсходовано");
    }
    if (to === "act_signed") {
      const [act] = await q.query(`SELECT 1 FROM acts WHERE request_id = $1 AND accepted`, [r.id]);
      if (!act) throw new ApiError(400, "act_required", "Нужна приёмка клиента или фото подписанного акта");
    }
    if (to === "paid" && !(invoices.some((i) => i.kind === "works" || i.kind === "full") && invoices.every((i) => i.status === "paid")))
      throw new ApiError(400, "payment_required", "Не все счета оплачены или нет счёта на работы");
  }

  /** Закрытие: гарантия с сегодняшнего дня и начисление выплаты мастеру. */
  private async onClose(q: Queryable, id: string, by: By) {
    const { warrantyMonths } = await this.settings.get(q);
    await q.query(`UPDATE requests SET warranty_until = $1::date WHERE id = $2`, [addMonths(moscowDate(), warrantyMonths), id]);
    await accruePayout(q, await loadRequest(q, id), by);
  }

  // ---------- мастер ----------

  /** Владелец назначает из «Согласована» или «Предоплата получена» и может передать другому до выезда; бригадир — только внутри своей команды. */
  async assign(user: User, id: string, masterId: string) {
    await this.db.tx(async (q) => {
      const { r, as, mi } = await loadFor(q, user, id);
      const [m] = await q.query<{ active: boolean; skills: string[] }>(`SELECT active, skills FROM masters WHERE user_id = $1`, [masterId]);
      if (!m || !m.active) throw new ApiError(400, "bad_master", "Мастер не найден или отключён");
      if (r.category !== "general" && !m.skills.includes(r.category)) throw new ApiError(400, "no_skill", "Мастер не работает по этому направлению");
      if (masterId === r.master_id) throw new ApiError(409, "same_master", "Задание уже у этого мастера");
      const by: By = { userId: user.id, role: as };
      const leadOfJob = mi?.isLead && r.master_id !== null && mi.team.includes(r.master_id);
      if (as === "owner" && canAssign(r.status)) {
        await q.query(`UPDATE requests SET master_id = $1 WHERE id = $2`, [masterId, id]);
        await moveStatus(q, id, r.status, "assigned", by);
        await logEvent(q, id, by, "assigned", { masterId });
      } else if ((as === "owner" || leadOfJob) && canReassign(r.status)) {
        if (as !== "owner" && !mi!.team.includes(masterId)) throw new ApiError(403, "not_team", "Передать можно только мастеру своей команды");
        await q.query(`UPDATE requests SET master_id = $1 WHERE id = $2`, [masterId, id]);
        if (r.status !== "assigned") await moveStatus(q, id, r.status, "assigned", by);
        await logEvent(q, id, by, "reassigned", { from: r.master_id, to: masterId });
      } else if (as === "owner" || leadOfJob) throw new ApiError(409, "bad_transition", "Назначить мастера сейчас нельзя");
      else throw new ApiError(403, "forbidden", "Это действие вам недоступно");
    });
    return this.get(user, id);
  }

  /**
   * Отказ мастера от задания или снятие мастера. Если мастер из команды, задание возвращается бригадиру;
   * иначе — владельцу: в «Предоплата получена», если предоплата была, или в «Согласована».
   */
  async unassign(user: User, id: string, reason: string) {
    return this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, id);
      const allowed = as === "master" ? canUnassign(r.status, "master") : as === "owner" || as === "lead" ? canUnassign(r.status, "owner") : false;
      if (!allowed) throw new ApiError(409, "bad_transition", "Это действие сейчас недоступно");
      const by: By = { userId: user.id, role: as };
      const [lead] =
        as === "master"
          ? await q.query<{ lead_id: string }>(
              `SELECT m.lead_id FROM masters m JOIN masters l ON l.user_id = m.lead_id WHERE m.user_id = $1 AND l.active`,
              [r.master_id],
            )
          : [];
      if (lead?.lead_id) {
        await q.query(`UPDATE requests SET master_id = $1 WHERE id = $2`, [lead.lead_id, id]);
        if (r.status !== "assigned") await moveStatus(q, id, r.status, "assigned", by);
        await logEvent(q, id, by, "declined", { masterId: r.master_id, reason, returnedTo: lead.lead_id });
      } else {
        await q.query(`UPDATE requests SET master_id = NULL WHERE id = $1`, [id]);
        await moveStatus(q, id, r.status, unassignTarget(r.prepaid_at !== null), by, { reason });
        await logEvent(q, id, by, as === "master" ? "declined" : "unassigned", { masterId: r.master_id, reason });
      }
      // Мастер после отказа заявку больше не видит — отдаём ему только итог
      return as === "master" ? { ok: true } : this.detail(q, user, id);
    });
  }

  /** Мастер сообщает о доп. работах: текст и фото. Владелец делает по ним новую версию сметы. */
  async reportExtraWork(user: User, id: string, text: string, fileIds: string[]) {
    await this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, id);
      mustBe(as, "master");
      if (!WORKING.includes(r.status)) throw new ApiError(409, "bad_transition", "Сообщить о доп. работах можно только во время работы");
      if (fileIds.length) {
        const own = await q.query<{ id: string }>(
          `SELECT id FROM files WHERE id = ANY($1::text[]) AND request_id = $2 AND uploaded_by = $3 AND kind = 'extra_work' AND deleted_at IS NULL`,
          [fileIds, id, user.id],
        );
        if (own.length !== fileIds.length) throw new ApiError(400, "bad_file", "Фото не найдены");
      }
      await logEvent(q, id, { userId: user.id, role: "master" }, "extra_work", { text: text.trim(), fileIds });
    });
    return this.get(user, id);
  }

  /** Фактический расход материалов по позициям утверждённой сметы. */
  async reportMaterials(user: User, id: string, items: { itemId: string; usedQty: number }[]) {
    await this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, id);
      mustBe(as, "master");
      if (!WORKING.includes(r.status)) throw new ApiError(409, "bad_transition", "Расход указывается во время работы");
      const est = await approvedEstimate(q, id);
      const allowed = new Set((est?.items ?? []).filter((i) => i.kind !== "work").map((i) => i.id));
      for (const it of items) {
        if (!allowed.has(it.itemId)) throw new ApiError(400, "bad_item", "Материал не найден в смете");
        await q.query(`UPDATE estimate_items SET used_qty = $1 WHERE id = $2`, [it.usedQty, it.itemId]);
      }
      await logEvent(q, id, { userId: user.id, role: "master" }, "materials_reported", { items });
    });
    return this.get(user, id);
  }

  // ---------- приёмка ----------

  /** Клиент принимает работу или пишет замечания. Принятие = подписание акта (условия работ на сайте). */
  async act(user: User, id: string, accepted: boolean, remarks: string) {
    await this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, id);
      mustBe(as, "client");
      if (r.status !== "done") throw new ApiError(409, "bad_transition", "Принять можно после того, как мастер закончит работу");
      if (!accepted && !remarks.trim()) throw new ApiError(400, "remarks_required", "Опишите замечания");
      await q.query(`INSERT INTO acts (id, request_id, accepted, remarks, method, signed_by) VALUES ($1, $2, $3, $4, 'app', $5)`, [
        newId("act"),
        id,
        accepted,
        remarks.trim(),
        user.id,
      ]);
      const by: By = { userId: user.id, role: "client" };
      if (!accepted) return logEvent(q, id, by, "act_remarks", { remarks: remarks.trim() });
      await moveStatus(q, id, r.status, "act_signed", by);
      await logEvent(q, id, by, "act_signed", { method: "app" });
      await syncStatus(q, id, by);
    });
    return this.get(user, id);
  }

  /** Владелец принимает работу по фото подписанного бумажного акта. */
  async actPaper(user: User, id: string, fileId: string) {
    await this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, id);
      mustBe(as, "owner");
      if (r.status !== "done") throw new ApiError(409, "bad_transition", "Акт принимается после выполнения работ");
      const [f] = await q.query(`SELECT 1 FROM files WHERE id = $1 AND request_id = $2 AND kind = 'act_paper' AND deleted_at IS NULL`, [fileId, id]);
      if (!f) throw new ApiError(400, "bad_file", "Загрузите фото подписанного акта");
      await q.query(`INSERT INTO acts (id, request_id, accepted, method, file_id, signed_by) VALUES ($1, $2, true, 'paper', $3, $4)`, [
        newId("act"),
        id,
        fileId,
        user.id,
      ]);
      const by: By = { userId: user.id, role: "owner" };
      await moveStatus(q, id, r.status, "act_signed", by);
      await logEvent(q, id, by, "act_signed", { method: "paper" });
      await syncStatus(q, id, by);
    });
    return this.get(user, id);
  }

  async review(user: User, id: string, rating: number, text: string) {
    await this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, id);
      mustBe(as, "client");
      if (r.status !== "closed") throw new ApiError(409, "not_closed", "Оценить можно после закрытия заявки");
      await q.query(`UPDATE requests SET rating = $1, review = $2 WHERE id = $3`, [rating, text.trim(), id]);
      await logEvent(q, id, { userId: user.id, role: "client" }, "review", { rating });
    });
    return this.get(user, id);
  }

  // ---------- фото ----------

  /** Кто какие фото загружает (docs/TZ.md, 8.3). */
  async upload(user: User, id: string, kind: string, image: { mime: string; data: Buffer }) {
    return this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, id);
      const allowed: Record<Actor, string[]> = {
        client: ["client_photo"],
        master: ["before", "after", "extra_work", "act_paper"],
        owner: ["client_photo", "before", "after", "extra_work", "act_paper"],
        lead: [],
      };
      if (!allowed[as].includes(kind)) throw new ApiError(403, "forbidden", "Этот вид фото вам недоступен");
      if (isFinal(r)) throw new ApiError(409, "final", "Заявка уже закрыта");
      if (as === "master" && !WORKING.includes(r.status)) throw new ApiError(409, "bad_transition", "Фото добавляются во время работы");
      const [{ n }] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM files WHERE request_id = $1 AND deleted_at IS NULL`, [id]);
      if (n >= MAX_FILES_PER_REQUEST) throw new ApiError(409, "too_many_files", `Не больше ${MAX_FILES_PER_REQUEST} фото на заявку`);
      const fileId = await this.files.save(q, { requestId: id, payoutId: null, uploadedBy: user.id, kind, mime: image.mime, data: image.data });
      await logEvent(q, id, { userId: user.id, role: as }, "file_added", { fileId, kind });
      return { id: fileId, kind, url: this.files.url(fileId) };
    });
  }

  async deleteFile(user: User, fileId: string) {
    await this.db.tx(async (q) => {
      const [f] = await q.query<{ request_id: string | null; uploaded_by: string }>(
        `SELECT request_id, uploaded_by FROM files WHERE id = $1 AND deleted_at IS NULL`,
        [fileId],
      );
      if (!f || !f.request_id) throw new ApiError(404, "not_found", "Фото не найдено");
      const { r, as } = await loadFor(q, user, f.request_id);
      if (as !== "owner" && f.uploaded_by !== user.id) throw new ApiError(403, "forbidden", "Удалить можно только своё фото");
      if (isFinal(r)) throw new ApiError(409, "final", "Заявка уже закрыта");
      await q.query(`UPDATE files SET deleted_at = now() WHERE id = $1`, [fileId]);
    });
    return { ok: true };
  }
}

/** Клиент по номеру: находит или заводит, имя дописывает, если его не было. */
async function upsertClient(q: Queryable, phone: string, name: string): Promise<string> {
  const [existing] = await q.query<{ id: string; name: string }>(`SELECT id, name FROM users WHERE phone = $1 AND deleted_at IS NULL`, [phone]);
  if (existing) {
    if (!existing.name && name) await q.query(`UPDATE users SET name = $1 WHERE id = $2`, [name, existing.id]);
    return existing.id;
  }
  const id = newId("usr");
  await q.query(`INSERT INTO users (id, phone, name) VALUES ($1, $2, $3)`, [id, phone, name]);
  return id;
}
