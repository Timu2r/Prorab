import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVICES,
  MARKET_PRICES_RUB,
  roundPriceRub,
  startPriceRub,
  canAssign,
  canCancel,
  canTransition,
  canUnassign,
  formatRequestNumber,
  formatRub,
  masterPay,
  masterSeesContacts,
  nextStatuses,
  normalizePhone,
  primaryRole,
  requestProfit,
  unassignTarget,
} from "./index";

describe("телефон", () => {
  it("приводит разные записи к одному виду", () => {
    expect(normalizePhone("8 (999) 123-45-67")).toBe("+79991234567");
    expect(normalizePhone("+7 999 123 45 67")).toBe("+79991234567");
    expect(normalizePhone("9991234567")).toBe("+79991234567");
  });
  it("не принимает городские и чужие номера", () => {
    expect(normalizePhone("+7 495 123-45-67")).toBeNull();
    expect(normalizePhone("+998 90 123 45 67")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("роли", () => {
  it("владелец главнее мастера, мастер главнее клиента", () => {
    expect(primaryRole(["client", "owner"])).toBe("owner");
    expect(primaryRole(["client", "master"])).toBe("master");
    expect(primaryRole([])).toBe("client");
  });
});

describe("статусы заявки", () => {
  it("мастер не может закрыть заявку и отметить оплату", () => {
    expect(canTransition("paid", "closed", "master")).toBe(false);
    expect(canTransition("act_signed", "paid", "master")).toBe(false);
  });
  it("мастер ведёт работу по шагам и не перепрыгивает", () => {
    expect(canTransition("assigned", "accepted", "master")).toBe(true);
    expect(canTransition("accepted", "en_route", "master")).toBe(true);
    expect(canTransition("accepted", "done", "master")).toBe(false);
  });
  it("клиент отменяет только до выезда мастера", () => {
    expect(canCancel("accepted", "client")).toBe(true);
    expect(canCancel("en_route", "client")).toBe(false);
    expect(canCancel("en_route", "owner")).toBe(true);
    expect(canCancel("done", "owner")).toBe(false);
  });
  it("мастер ничего не отменяет", () => {
    expect(canCancel("assigned", "master")).toBe(false);
  });
  it("акт подписывает клиент или владелец, но не мастер", () => {
    expect(canTransition("done", "act_signed", "client")).toBe(true);
    expect(canTransition("done", "act_signed", "owner")).toBe(true);
    expect(canTransition("done", "act_signed", "master")).toBe(false);
  });
  it("назначение мастера после согласования или предоплаты", () => {
    expect(canAssign("agreed")).toBe(true);
    expect(canAssign("prepaid")).toBe(true);
    expect(canAssign("new")).toBe(false);
    expect(canAssign("invoiced")).toBe(false);
  });
  it("отказ мастера возвращает туда, где заявка была до назначения", () => {
    expect(unassignTarget(true)).toBe("prepaid");
    expect(unassignTarget(false)).toBe("agreed");
    expect(canUnassign("assigned", "master")).toBe(true);
    expect(canUnassign("accepted", "master")).toBe(false);
    expect(canUnassign("accepted", "owner")).toBe(true);
  });
  it("кнопки для роли", () => {
    expect(nextStatuses("new", "owner")).toEqual(["agreed", "cancelled"]);
    expect(nextStatuses("on_site", "master")).toEqual(["done"]);
  });
  it("контакты клиента мастеру только после принятия", () => {
    expect(masterSeesContacts("assigned")).toBe(false);
    expect(masterSeesContacts("accepted")).toBe(true);
    expect(masterSeesContacts("closed")).toBe(true);
    expect(masterSeesContacts("cancelled")).toBe(false);
  });
  it("номер заявки", () => {
    expect(formatRequestNumber(12)).toBe("Z-0012");
  });
});

describe("деньги", () => {
  const lines = [
    { serviceId: "mount", qty: 1, clientPrice: 1_500_000 },
    { serviceId: "pipe", qty: 2, clientPrice: 150_000 },
  ];
  it("процент считается только от работ", () => {
    expect(masterPay({ mode: "percent", percent: 50 }, lines)).toBe(900_000);
  });
  it("фиксированный прайс мастера", () => {
    expect(masterPay({ mode: "fixed", prices: { mount: 1_200_000, pipe: 50_000 } }, lines)).toBe(1_300_000);
  });
  it("позиции нет в прайсе мастера — сумму согласуют вручную", () => {
    expect(masterPay({ mode: "fixed", prices: { mount: 1_200_000 } }, lines)).toBeNull();
  });
  it("заработок по заявке: налог со всей выручки", () => {
    // Пример из переписки: кондиционер 45 000 + монтаж 25 000, закупка 40 000, мастеру 12 000.
    const r = requestProfit({ work: 2_500_000, goods: 4_500_000, goodsCost: 4_000_000, masterPay: 1_200_000 });
    expect(r).toEqual({ revenue: 7_000_000, tax: 420_000, profit: 1_380_000 });
  });
  it("формат суммы", () => {
    expect(formatRub(1_234_567)).toBe("12 345,67 ₽");
    expect(formatRub(500_000)).toBe("5 000 ₽");
  });
});

describe("стартовые цены", () => {
  it("рынок + 10% с красивым округлением", () => {
    expect(startPriceRub("finishing-putty")).toBe(610); // 550 -> 605
    expect(startPriceRub("turnkey-cosmetic")).toBe(6_100); // 5 500 -> 6 050
    expect(startPriceRub("climate-mount-small")).toBe(11_000); // 9 900 -> 10 890
    expect(startPriceRub("turnkey-bathroom")).toBe(165_000);
    expect(startPriceRub("нет-такой")).toBeNull();
  });
  it("у каждой позиции прайса есть рыночная цена", () => {
    for (const s of DEFAULT_SERVICES) expect(MARKET_PRICES_RUB[s.key], s.key).toBeTypeOf("number");
  });
  it("округление", () => {
    expect(roundPriceRub(333)).toBe(330);
    expect(roundPriceRub(1_650)).toBe(1_700);
    expect(roundPriceRub(16_390)).toBe(16_500);
  });
});
