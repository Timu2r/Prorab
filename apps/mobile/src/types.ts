import type { Category, PayoutKind, PayoutStatus, RequestStatus, TaxStatus, Unit } from "@ks/core";

/** Ответы API, которые показывают экраны (docs/TZ.md, раздел 8). */

type Base = {
  id: string;
  number: string;
  status: RequestStatus;
  category: Category;
  district: string;
  visitAt: string | null;
  visitUntil: string | null;
  createdAt: string;
};

export type OwnerRequestItem = Base & {
  address: string;
  source: string;
  client: { id: string; name: string; phone: string };
  master: { id: string; name: string; phone: string } | null;
  priceWork: number | null;
  priceGoods: number | null;
  refundRequired: boolean;
};

export type MasterRequestItem = Base & {
  address: string | null;
  client: { name: string; phone: string } | null;
  pay: number | null;
  mine: boolean;
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
  today: { id: string; number: string; status: RequestStatus; category: Category; district: string; visitAt: string; visitUntil: string | null; master: string | null }[];
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
  toPay: number;
  active: boolean;
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
