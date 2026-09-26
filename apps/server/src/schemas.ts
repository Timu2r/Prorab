import {
  CATEGORIES,
  INVOICE_KINDS,
  ITEM_KINDS,
  OWNER_SOURCES,
  PAYOUT_METHODS,
  PAYOUT_STATUSES,
  REQUEST_SOURCES,
  REQUEST_STATUSES,
  SLOTS,
  TAX_STATUSES,
  UNITS,
} from "@ks/core";
import { z } from "zod";

/** Проверка входных данных всех методов API. Тексты ошибок — для человека, по-русски. */

const kopecks = z.number().int().min(0).max(100_000_000_00);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");
const datetime = z.string().datetime({ offset: true, message: "Время в формате ISO" });
const id = z.string().min(3).max(60);
const inn = z.string().regex(/^(\d{10}|\d{12})?$/, "ИНН — 10 или 12 цифр");
const url = z.string().url("Нужна ссылка").max(1000).refine((u) => /^https?:\/\//.test(u), "Ссылка должна начинаться с http");
const skills = z.array(z.enum(CATEGORIES)).max(CATEGORIES.length);
const addressParts = {
  apartment: z.string().max(20).default(""),
  entrance: z.string().max(20).default(""),
  floor: z.string().max(20).default(""),
  intercom: z.string().max(40).default(""),
};

export const schemas = {
  // Вход и профиль
  code: z.object({ phone: z.string().max(30) }),
  verify: z.object({ phone: z.string().max(30), code: z.string().max(10), device: z.string().max(100).default("") }),
  me: z
    .object({
      name: z.string().trim().min(1).max(80),
      type: z.enum(["person", "company"]),
      companyName: z.string().trim().max(200),
      inn,
      kpp: z.string().regex(/^(\d{9})?$/, "КПП — 9 цифр"),
      consent: z.literal(true),
    })
    .partial(),
  deleteMe: z.object({ confirm: z.literal(true, { error: "Подтвердите удаление аккаунта" }) }),

  // Прайс
  newService: z.object({
    category: z.enum(CATEGORIES),
    name: z.string().trim().min(2).max(200),
    unit: z.enum(UNITS),
    price: kopecks.nullable().default(null),
  }),
  patchService: z.object({ name: z.string().trim().min(2).max(200), price: kopecks.nullable(), active: z.boolean(), sort: z.number().int() }).partial(),
  reprice: z.object({ percent: z.number().min(-50).max(100), category: z.enum(CATEGORIES).optional() }),

  // Мастера
  master: z.object({
    phone: z.string().max(30),
    name: z.string().trim().min(2).max(80),
    skills: skills.min(1, "Укажите хотя бы одно направление"),
    taxStatus: z.enum(TAX_STATUSES),
    inn: inn.default(""),
    contractNo: z.string().max(40).default(""),
    contractAt: date.nullable().default(null),
    npdCheckedAt: date.nullable().default(null),
    note: z.string().max(500).default(""),
    isLead: z.boolean().default(false),
    leadId: id.nullable().default(null),
  }),
  patchMaster: z
    .object({
      name: z.string().trim().min(2).max(80),
      skills,
      taxStatus: z.enum(TAX_STATUSES),
      inn,
      contractNo: z.string().max(40),
      contractAt: date.nullable(),
      npdCheckedAt: date.nullable(),
      note: z.string().max(500),
      active: z.boolean(),
      isLead: z.boolean(),
      leadId: id.nullable(),
    })
    .partial(),
  rate: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("percent"), percent: z.number().min(1).max(100), validFrom: date }),
    z.object({ mode: z.literal("fixed"), prices: z.record(z.string(), kopecks), validFrom: date }),
  ]),

  // Заявки
  lead: z.object({
    name: z.string().trim().min(2, "Как к вам обращаться?").max(80),
    phone: z.string().max(30),
    category: z.enum(CATEGORIES).default("general"),
    comment: z.string().trim().max(1000).default(""),
    consent: z.literal(true, { error: "Нужно согласие на обработку персональных данных" }),
    website: z.string().max(200).default(""), // поле-ловушка: человек его не видит, бот заполняет
    utm: z.record(z.string().regex(/^utm_[a-z]{3,8}$/), z.string().max(200)).optional(),
  }),
  newRequest: z.object({
    category: z.enum(CATEGORIES),
    serviceIds: z.array(z.string().max(60)).max(20).default([]),
    description: z.string().max(2000).default(""),
    address: z.string().trim().min(5, "Укажите адрес").max(300),
    ...addressParts,
    district: z.string().max(100).default(""),
    wantedDate: date.nullable().default(null),
    wantedSlot: z.enum(SLOTS).default(""),
    source: z.enum(OWNER_SOURCES).optional(),
    clientPhone: z.string().max(30).optional(),
    clientName: z.string().max(80).optional(),
  }),
  patchRequest: z
    .object({
      category: z.enum(CATEGORIES),
      description: z.string().max(2000),
      address: z.string().trim().min(5).max(300),
      apartment: z.string().max(20),
      entrance: z.string().max(20),
      floor: z.string().max(20),
      intercom: z.string().max(40),
      district: z.string().max(100),
      wantedDate: date.nullable(),
      wantedSlot: z.enum(SLOTS),
      visitAt: datetime.nullable(),
      visitUntil: datetime.nullable(),
      serviceIds: z.array(z.string().max(60)).max(20),
      ownerNote: z.string().max(2000),
    })
    .partial(),
  listRequests: z.object({
    status: z
      .string()
      .optional()
      .transform((s) => s?.split(",").filter((x) => (REQUEST_STATUSES as readonly string[]).includes(x))),
    category: z.enum(CATEGORIES).optional(),
    masterId: id.optional(),
    source: z.enum(REQUEST_SOURCES).optional(),
    from: date.optional(),
    to: date.optional(),
    q: z.string().max(100).optional(),
  }),
  status: z.object({ to: z.enum(REQUEST_STATUSES), reason: z.string().max(500).default("") }),
  assign: z.object({ masterId: id }),
  unassign: z.object({ reason: z.string().max(500).default("") }),
  extraWork: z.object({ text: z.string().trim().min(3, "Опишите доп. работы").max(2000), fileIds: z.array(id).max(10).default([]) }),
  materials: z.object({ items: z.array(z.object({ itemId: id, usedQty: z.number().min(0).max(1_000_000) })).min(1).max(200) }),
  act: z.object({ accepted: z.boolean(), remarks: z.string().max(2000).default("") }),
  actPaper: z.object({ fileId: id }),
  review: z.object({ rating: z.number().int().min(1).max(5), text: z.string().max(2000).default("") }),
  fileKind: z.object({ kind: z.enum(["client_photo", "before", "after", "extra_work", "act_paper"]) }),
  fileGet: z.object({ exp: z.string().optional(), sig: z.string().optional() }),

  // Смета
  estimateDraft: z.object({
    reservePercent: z.number().min(0).max(50).optional(),
    note: z.string().max(2000).optional(),
    items: z
      .array(
        z.object({
          kind: z.enum(ITEM_KINDS),
          serviceId: z.string().max(60).nullable().default(null),
          name: z.string().trim().min(1).max(200),
          unit: z.enum(UNITS),
          qty: z.number().positive().max(1_000_000).refine((n) => Math.round(n * 1000) === n * 1000, "Не больше трёх знаков после запятой"),
          price: kopecks,
          cost: kopecks.nullable().default(null),
        }),
      )
      .max(200),
  }),
  reject: z.object({ reason: z.string().max(1000).default("") }),

  // Счета
  newInvoice: z.object({ kind: z.enum(INVOICE_KINDS), amount: kopecks.positive().nullable().default(null), paymentUrl: url.optional() }),
  patchInvoice: z.object({ amount: kopecks.positive(), paymentUrl: url }).partial(),
  paid: z.object({ bankRef: z.string().max(100).default("") }),

  // Выплаты
  listPayouts: z.object({ status: z.enum(PAYOUT_STATUSES).optional(), masterId: id.optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  newPayout: z.object({
    masterId: id,
    kind: z.enum(["deduction", "bonus"]),
    amount: kopecks.positive(),
    reason: z.string().trim().min(3, "Укажите причину").max(500),
    requestId: id.optional(),
  }),
  payoutAmount: z.object({ amount: kopecks }),
  payoutPaid: z.object({ method: z.enum(PAYOUT_METHODS) }),
  receipt: z.object({ url }),

  // Клиенты, отчёты, настройки
  listClients: z.object({ q: z.string().max(100).optional() }),
  patchClient: z
    .object({
      type: z.enum(["person", "company"]),
      companyName: z.string().trim().max(200),
      inn,
      kpp: z.string().regex(/^(\d{9})?$/, "КПП — 9 цифр"),
      note: z.string().max(2000),
    })
    .partial(),
  month: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  period: z.object({ from: date.optional(), to: date.optional() }),
  settings: z
    .object({
      taxPercent: z.number().min(0).max(20),
      warrantyMonths: z.number().int().min(0).max(60),
      workHours: z.object({ from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) }).partial(),
      notifyOwnerPhones: z.array(z.string().regex(/^\+7\d{10}$/, "Телефон в виде +79991234567")).max(5),
      clientSms: z
        .object({ estimateSent: z.boolean(), visitAgreed: z.boolean(), enRoute: z.boolean(), invoiceSent: z.boolean(), workDone: z.boolean() })
        .partial(),
      attention: z
        .object({
          newMinutes: z.number().int().min(1).max(1440),
          noAnswerMinutes: z.number().int().min(1).max(1440),
          estimateHours: z.number().int().min(1).max(720),
          invoiceDays: z.number().int().min(1).max(60),
          actDays: z.number().int().min(1).max(60),
          payoutDays: z.number().int().min(1).max(60),
          receiptDays: z.number().int().min(1).max(60),
        })
        .partial(),
    })
    .partial(),
};
