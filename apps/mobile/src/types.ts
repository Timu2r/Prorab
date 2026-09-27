import type {
  Answers,
  CalcId,
  CalcNote,
  Category,
  ContractMethod,
  EstimateStatus,
  InvoiceKind,
  InvoiceStatus,
  ItemKind,
  PayoutKind,
  PayoutStatus,
  PurchaseKind,
  PurchaseStatus,
  RequestStatus,
  Slot,
  TaxStatus,
  Unit,
} from "@ks/core";

/** Ответы API, которые показывают экраны (docs/TZ.md, раздел 8). */

type Base = {
  id: string;
  number: string;
  status: RequestStatus;
  category: Category;
  district: string;
  visitAt: string | null;
  visitUntil: string | null;
  /** Выезд прораба на объект до договора (docs/TZ.md, 16.9). */
  surveyAt: string | null;
  surveyUntil: string | null;
  createdAt: string;
};

export type FileView = { id: string; kind: string; url: string; uploadedBy?: string; createdAt?: string };

/** Покупка по ходу работ: «нужно купить» или «купил сам» с чеком (docs/TZ.md, 16.9). */
export type Purchase = {
  id: string;
  kind: PurchaseKind;
  text: string;
  amount: number | null;
  receiptUrl: string | null;
  status: PurchaseStatus;
  master: { id: string; name: string };
  payoutId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type Invoice = {
  id: string;
  number: string;
  kind: InvoiceKind;
  amount: number;
  paymentUrl: string;
  status: InvoiceStatus;
  createdAt: string;
  sentAt: string | null;
  paidAt: string | null;
};

export type Act = { accepted: boolean; remarks: string; method: "app" | "paper"; fileUrl: string | null; signedAt: string };
export type ExtraWork = { at: string; text: string; files: { id: string; url: string }[] };

/** Заявка с сайта: консультация («перезвоните») или подробная (расчёт, пожелания, фото). */
export type LeadType = "consult" | "full";

export type OwnerRequestItem = Base & {
  address: string;
  source: string;
  leadType: LeadType | null;
  client: { id: string; name: string; phone: string };
  master: { id: string; name: string; phone: string } | null;
  /** Прораб заказа — кто ведёт заказ; клиент видит его имя и телефон в «Мои заказы» на сайте. */
  foreman: { id: string; name: string } | null;
  priceWork: number | null;
  priceGoods: number | null;
  refundRequired: boolean;
};

export type MasterRequestItem = Base & {
  address: string | null;
  client: { name: string; phone: string } | null;
  pay: number | null;
  mine: boolean;
  /** Помощник в бригаде заказа: видит задание, действует старший, платит тоже старший. */
  helper: boolean;
  assignedTo: { id: string; name: string } | null;
};

export type ClientRequestItem = Base & {
  address: string;
  priceWork: number | null;
  priceGoods: number | null;
  master: { name: string } | null;
  warrantyUntil: string | null;
};

export type Dashboard = {
  attention: { kind: string; text: string; requestId: string | null; number: string | null; payoutId: string | null; since: string }[];
  /** visit — визит мастера, survey — выезд прораба на объект (master — имя прораба). */
  today: { kind: "visit" | "survey"; id: string; number: string; status: RequestStatus; category: Category; district: string; visitAt: string; visitUntil: string | null; master: string | null }[];
  month: {
    month: string;
    newRequests: number;
    closed: number;
    cashIn: number;
    payoutsPaid: number;
    result: { count: number; revenue: number; goodsCost: number; payouts: number; tax: number; profit: number };
  };
};

export type MasterView = {
  id: string;
  phone: string;
  name: string;
  skills: Category[];
  taxStatus: TaxStatus;
  isLead: boolean;
  lead: { id: string; name: string } | null;
  teamSize: number;
  activeJobs: number;
  todayVisits: number;
  nextVisitAt: string | null;
  toPay: number;
  active: boolean;
  available: boolean;
  availableAt: string | null;
};

export type Payout = {
  id: string;
  master: { id: string; name: string; taxStatus: TaxStatus };
  requestId: string | null;
  requestNumber: string | null;
  kind: PayoutKind;
  amount: number;
  needsAmount: boolean;
  reason: string;
  status: PayoutStatus;
  accruedAt: string;
  paidAt: string | null;
  receiptMissing: boolean;
};

export type Payouts = { payouts: Payout[]; totals: { accrued: number; paid: number; toPay: number } };

export type TeamMember = { id: string; name: string; phone: string; skills: Category[]; isLead: boolean; active: boolean; activeJobs: number; weekVisits: number };

export type Service = { id: string; category: Category; name: string; unit: Unit; price: number | null };

export type EstimateItem = {
  id: string;
  kind: ItemKind;
  serviceId: string | null;
  name: string;
  unit: Unit;
  qty: number;
  price: number;
  cost?: number | null;
  usedQty?: number | null;
};

export type Estimate = {
  id: string;
  version: number;
  status: EstimateStatus;
  reservePercent: number;
  note: string;
  createdAt: string;
  sentAt: string | null;
  approvedAt: string | null;
  rejectReason: string;
  items: EstimateItem[];
  totals: { work: number; materials: number; equipment: number; goods: number; total: number; reserve: number; cost?: number };
};

export type Contract = {
  number: string;
  method: ContractMethod;
  termsVersion: string;
  acceptedAt: string;
  acceptedBy: string;
  client: { name: string; phone: string; companyName: string; inn: string };
  address: string;
  priceWork: number;
  priceGoods: number;
};

/** Расчёт клиента на сайте — как он был на момент заявки. */
export type CalcSnapshot = { id: CalcId; answers: Answers; totals: { total: number; work: number; goods: number; reserve: number }; notes: CalcNote[] };

export type RequestEvent = { at: string; actorRole: string; actorName: string | null; kind: string; payload: Record<string, unknown> };

type Address = { address: string; apartment: string; entrance: string; floor: string; intercom: string };

export type OwnerRequestDetail = OwnerRequestItem &
  Address & {
    description: string;
    calc: CalcSnapshot | null;
    contract: Contract | null;
    wantedDate: string | null;
    wantedSlot: Slot;
    files: FileView[];
    ownerNote: string;
    estimates: Estimate[];
    invoices: Invoice[];
    purchases: Purchase[];
    extraWork: ExtraWork[];
    acts: Act[];
    crew: CrewMember[];
    payouts: Payout[];
    money: { revenue: number; goodsCost: number; payouts: number; tax: number; profit: number };
    doneAt: string | null;
    closedAt: string | null;
    events: RequestEvent[];
    payForecast: number | null;
    cancelReason: string;
  };

export type MasterTaskDetail = MasterRequestItem & {
  description: string;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  intercom: string | null;
  works: { name: string; unit: Unit; qty: number }[];
  materials: { id: string; name: string; unit: Unit; qty: number; usedQty: number | null }[];
  files: FileView[];
  extraWork: ExtraWork[];
  purchases: Purchase[];
  acts: Act[];
  crew: CrewMember[];
  /** Для помощника — старший мастер и его телефон. */
  lead: { name: string; phone: string } | null;
  role: "master" | "lead" | "helper";
};

/** Помощник в бригаде заказа (docs/TZ.md, 16.6): роль и, если нужно, свои дни. */
export type CrewMember = { masterId: string; name: string; phone: string; role: string; dayFrom: string | null; dayTo: string | null };

/** Календарь занятости: по мастеру — занятые окна каждого дня; по направлению — сколько свободно. */
export type CalendarWeek = {
  from: string;
  days: string[];
  windows: { from: number; to: number }[];
  masters: { id: string; name: string; skills: Category[]; available: boolean; isLead: boolean; days: boolean[][] }[];
  directions: { category: Category; total: number; free: number[] }[];
};

export type DayPlan = {
  date: string;
  items: {
    kind: "visit" | "survey";
    id: string;
    number: string;
    status: RequestStatus;
    category: Category;
    district: string;
    address: string;
    at: string;
    until: string | null;
    client: { name: string; phone: string };
    price: number | null;
    foreman: string | null;
    crew: { name: string; role: string }[];
  }[];
  unscheduled: { id: string; number: string; status: RequestStatus; category: Category; client: string; price: number | null }[];
};

export type ClientRequestDetail = ClientRequestItem &
  Address & {
    description: string;
    calc: CalcSnapshot | null;
    contract: Contract | null;
    estimates: Estimate[];
    cancelReason: string;
  };

export type CatalogItem = { id: string; category: Category; name: string; unit: Unit; kind: ItemKind; price: number | null; cost: number | null; active: boolean };
