import {
  CALCULATORS,
  CATEGORY_LABELS,
  canAssign,
  canReassign,
  canTransition,
  canUnassign,
  describeAnswers,
  formatRequestNumber,
  isCalcId,
  masterSeesContacts,
  normalizePhone,
  quote,
  requestResult,
  unassignTarget,
  type Category,
  type RequestStatus,
} from "@ks/core";
import { isFinal, loadFor, loadRequest, masterInfo, mustBe, num, REQUEST_SELECT, type Actor, type RequestRow, type Viewer } from "./access";
import { linkLead, type SessionUser, type User } from "./auth";
import type { Db, Queryable } from "./db";
import { loadContract } from "./contracts";
import { approvedEstimate, clientEstimate, createDraftEstimate, loadEstimates } from "./estimates";
import { MAX_FILES_PER_REQUEST, type FileService } from "./files";
import { logEvent, moveStatus, syncStatus, type By } from "./flow";
import { clientInvoices, loadInvoices } from "./invoices";
import { accruePayout, payForecast, type PayoutService } from "./payouts";
import { loadPriceItems } from "./pricing";
import { loadPurchases } from "./purchases";
import type { SettingsService } from "./settings";
import { addMonths, moscowDate } from "./time";
import { ApiError, newId } from "./util";

/** Фото к заявке с сайта: сколько можно приложить и ключ подписи для загрузки без входа. */
const MAX_LEAD_PHOTOS = 5;
const leadUploadKey = (requestId: string) => `lead-upload:${requestId}`;

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
    surveyAt: r.survey_at,
    surveyUntil: r.survey_until,
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
    leadType: r.lead_type,
    client: { id: r.client_id, name: r.client_name, phone: r.client_phone },
    master: r.master_id ? { id: r.master_id, name: r.master_name ?? "", phone: r.master_phone ?? "" } : null,
    foreman: r.foreman_id ? { id: r.foreman_id, name: r.foreman_name ?? "" } : null,
    priceWork: num(r.price_work),
    priceGoods: num(r.price_goods),
    prepaid: r.prepaid_at !== null,
    refundRequired: r.refund_required,
    cancelReason: r.cancel_reason,
    warrantyUntil: r.warranty_until,
    updatedAt: r.updated_at,
  };
}

/** «Азиз Рахимов» → «Азиз Р.»: клиенту — имя и первая буква фамилии. */
export function shortName(name: string): string {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}

/** Что делает мастер — клиент видит с момента, когда мастер подтвердил заказ: до этого мастер может смениться. */
const MASTER_STATE: Partial<Record<RequestStatus, "accepted" | "en_route" | "on_site" | "done">> = {
  accepted: "accepted",
  en_route: "en_route",
  on_site: "on_site",
  done: "done",
  act_signed: "done",
  paid: "done",
  closed: "done",
};

/**
 * Кто работает по заявке — для клиента (docs/TZ.md, 16.4): прораб заказа с телефоном и мастера без телефонов —
 * связь с клиентом идёт через прораба. Бригада из нескольких мастеров с ролями — этап L.
 */
function clientTeam(r: RequestRow) {
  const state = MASTER_STATE[r.status];
  return {
    foreman: r.foreman_id ? { name: r.foreman_name ?? "", phone: r.foreman_phone ?? "" } : null,
    team:
      r.master_id && state
        ? [{ name: shortName(r.master_name ?? ""), role: r.master_is_lead ? "Бригадир" : "Мастер", area: CATEGORY_LABELS[r.category as Category] ?? "", state }]
        : [],
  };
}

/** Строка списка для клиента: его суммы и имя мастера. */
function clientItem(r: RequestRow) {
  const state = MASTER_STATE[r.status];
  return {
    ...base(r),
    ...address(r),
    priceWork: num(r.price_work),
    priceGoods: num(r.price_goods),
    master: r.master_id && state ? { name: shortName(r.master_name ?? "") } : null,
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
  surveyAt: string | null;
  surveyUntil: string | null;
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
  surveyAt: "survey_at",
  surveyUntil: "survey_until",
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
  /**
   * Заявка с сайта. Если клиент считал в калькуляторе, сервер пересчитывает его ответы по своему прайсу
   * (цены с сайта не принимаются) и кладёт расчёт в черновик сметы — владелец правит его после звонка.
   */
  async createLead(input: {
    name: string;
    phone: string;
    category: string;
    comment: string;
    type?: "consult" | "full";
    address?: string;
    apartment?: string;
    entrance?: string;
    floor?: string;
    intercom?: string;
    wantedDate?: string | null;
    wantedSlot?: string;
    utm?: Record<string, string>;
    calc?: { id: string; answers: Record<string, string | number | boolean> };
  }, session: SessionUser | null = null) {
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
      // Согласие дано в форме на сайте
      await q.query(`UPDATE users SET consent_at = COALESCE(consent_at, now()) WHERE id = $1`, [clientId]);

      const items = input.calc && isCalcId(input.calc.id) ? await loadPriceItems(q) : [];
      const qt = input.calc && isCalcId(input.calc.id) ? quote(input.calc.id, input.calc.answers, new Map(items.map((i) => [i.key, i]))) : null;
      const category = qt ? qt.calc : input.category;
      const answersText = qt ? describeAnswers(CALCULATORS[qt.calc], qt.answers) : [];
      // Описание видят и мастера, поэтому цены в нём нет (правило 1): сумма расчёта — только в calc
      const description = [input.comment, qt && `Расчёт на сайте: ${answersText.join("; ")}.`]
        .filter(Boolean)
        .join("\n\n");
      const calc = qt && {
        id: qt.calc,
        answers: qt.answers,
        lines: qt.lines.map((l) => ({ key: l.key, qty: l.qty, price: l.price })),
        totals: qt.totals,
        notes: qt.notes,
        unpriced: qt.unpriced,
      };

      const id = newId("req");
      const utm = input.utm && Object.keys(input.utm).length ? JSON.stringify(input.utm) : null;
      const leadType = input.type ?? (qt ? "full" : "consult");
      const [{ number }] = await q.query<{ number: number }>(
        `INSERT INTO requests (id, client_id, category, description, address, apartment, entrance, floor, intercom, wanted_date, wanted_slot,
                               source, consent_at, utm, calc, lead_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'site', now(), $12, $13, $14) RETURNING number`,
        [
          id,
          clientId,
          category,
          description,
          input.address ?? "",
          input.apartment ?? "",
          input.entrance ?? "",
          input.floor ?? "",
          input.intercom ?? "",
          input.wantedDate ?? null,
          input.wantedSlot ?? "",
          utm,
          calc ? JSON.stringify(calc) : null,
          leadType,
        ],
      );
      const by = { userId: clientId, role: "client" };
      await logEvent(q, id, by, "created", { source: "site", leadType, ...(qt ? { calc: qt.calc, total: qt.totals.total } : {}) });

      if (qt?.lines.length) {
        const byKey = new Map(items.map((i) => [i.key, i]));
        await createDraftEstimate(q, id, {
          items: qt.lines.map((l) => ({
            kind: l.kind,
            serviceId: byKey.get(l.key)!.serviceId,
            name: l.name,
            unit: l.unit,
            qty: l.qty,
            price: l.price ?? 0,
            cost: byKey.get(l.key)!.cost,
          })),
          reservePercent: qt.reservePercent,
          note: "Предварительный расчёт с сайта. Уточните у клиента и поправьте перед отправкой.",
          createdBy: null,
        });
      }
      // «Мои заказы» появляются сразу: браузер получает ключ к этой заявке без кода (docs/TZ.md, 16.4)
      const access = await linkLead(q, id, clientId, session);
      // К подробной заявке клиент прикладывает фото сразу после отправки — без входа, по подписи на 1 час
      return {
        number: formatRequestNumber(number),
        total: qt ? qt.totals.total : null,
        id,
        upload: leadType === "full" ? this.files.token(leadUploadKey(id)) : null,
        access,
      };
    });
  }

  /** Фото к заявке с сайта: только по подписи из ответа на заявку, только пока заявка новая, не больше 5. */
  async addLeadPhoto(id: string, token: { exp?: string; sig?: string }, image: { mime: string; data: Buffer }) {
    if (!this.files.verify(leadUploadKey(id), token.exp, token.sig)) throw new ApiError(403, "link_expired", "Ссылка для загрузки фото устарела");
    return this.db.tx(async (q) => {
      const [r] = await q.query<{ client_id: string; status: string }>(`SELECT client_id, status FROM requests WHERE id = $1 AND deleted_at IS NULL`, [id]);
      if (!r) throw new ApiError(404, "not_found", "Заявка не найдена");
      if (r.status !== "new") throw new ApiError(409, "not_new", "Фото к заявке можно добавить, пока она новая");
      const [{ n }] = await q.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM files WHERE request_id = $1 AND kind = 'client_photo' AND deleted_at IS NULL`,
        [id],
      );
      if (n >= MAX_LEAD_PHOTOS) throw new ApiError(409, "too_many_files", `К заявке можно приложить не больше ${MAX_LEAD_PHOTOS} фото`);
      const fileId = await this.files.save(q, { requestId: id, payoutId: null, uploadedBy: r.client_id, kind: "client_photo", mime: image.mime, data: image.data });
      await logEvent(q, id, { userId: r.client_id, role: "client" }, "file_added", { fileId, kind: "client_photo" });
      return { id: fileId };
    });
  }

  // ---------- списки ----------

  /**
   * Владелец — все с фильтрами; бригадир — задания команды; мастер — свои задания; клиент — свои заявки и заявки,
   * отправленные с этого браузера. Ключ без кода — только заявки с этого браузера.
   */
  async list(user: Viewer, f: ListFilter = {}) {
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
      const fromBrowser = `r.id IN (SELECT request_id FROM session_requests WHERE session_id = $1)`;
      if (user.scope === "device") add(fromBrowser, user.sessionId);
      else if (user.sessionId) add(`(r.client_id = $1 OR ${fromBrowser.replace("$1", "$2")})`, user.id, user.sessionId);
      else add(`r.client_id = $1`, user.id);
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

  async get(user: Viewer, id: string) {
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

  private async detail(q: Queryable, user: Viewer, id: string) {
    const { r, as } = await loadFor(q, user, id, { view: true });
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
        calc: r.calc,
        contract: await loadContract(q, id),
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
        purchases: await loadPurchases(q, this.files, id),
        payouts,
        payForecast: forecast,
        money: requestResult({ revenue, goodsCost: approved?.totals.cost ?? 0, payouts: paid }, settings.taxPercent),
        events,
      };
    }
    if (as === "client" || as === "viewer") {
      const showResult = RESULT_VISIBLE.includes(r.status);
      const contract = await loadContract(q, id);
      return {
        ...clientItem(r),
        ...clientTeam(r),
        /** Номер из заявки — чтобы подтвердить его кодом, не вводя заново. */
        phone: r.client_phone,
        /** Согласовать смету, принять работу — только владелец номера после кода. viewer только смотрит. */
        canAct: as === "client",
        review: r.review,
        calc: r.calc,
        // Без кода — только факт договора: в документе имя и телефон владельца номера
        contract: contract && as === "viewer" ? { number: contract.number, method: contract.method, acceptedAt: contract.acceptedAt } : contract,
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
      purchases: (await loadPurchases(q, this.files, id)).filter((p) => p.master.id === user.id),
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
      const surveyAt = patch.surveyAt !== undefined ? patch.surveyAt : r.survey_at;
      const surveyUntil = patch.surveyUntil !== undefined ? patch.surveyUntil : r.survey_until;
      if (surveyAt && surveyUntil && new Date(surveyUntil) <= new Date(surveyAt)) throw new ApiError(400, "bad_visit", "Окончание выезда раньше начала");
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
      if (as === "lead" || as === "viewer" || !canTransition(r.status, to, as)) throw new ApiError(409, "bad_transition", "Это действие сейчас недоступно");
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
        master: ["before", "after", "extra_work", "act_paper", "receipt"],
        owner: ["client_photo", "before", "after", "extra_work", "act_paper", "receipt"],
        lead: [],
        viewer: [],
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
