/** Настройки, которые владелец меняет в приложении (docs/TZ.md, 7.8). */
export type Settings = {
  taxPercent: number;
  warrantyMonths: number;
  workHours: { from: string; to: string };
  /** Кому SMS о новой заявке. Пусто — номера владельцев из OWNER_PHONES. */
  notifyOwnerPhones: string[];
  clientSms: { estimateSent: boolean; visitAgreed: boolean; enRoute: boolean; invoiceSent: boolean; workDone: boolean };
  /** Пороги «требует внимания» на сводке. */
  attention: {
    newMinutes: number;
    noAnswerMinutes: number;
    estimateHours: number;
    invoiceDays: number;
    actDays: number;
    payoutDays: number; // календарных дней: 7 ≈ 5 рабочих
    receiptDays: number;
  };
};

export const DEFAULT_SETTINGS: Settings = {
  taxPercent: 6,
  warrantyMonths: 12,
  workHours: { from: "09:00", to: "21:00" },
  notifyOwnerPhones: [],
  clientSms: { estimateSent: true, visitAgreed: true, enRoute: true, invoiceSent: true, workDone: true },
  attention: { newMinutes: 15, noAnswerMinutes: 30, estimateHours: 24, invoiceDays: 2, actDays: 2, payoutDays: 7, receiptDays: 3 },
};
