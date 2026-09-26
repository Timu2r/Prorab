import { describe, expect, it } from "vitest";
import { CALC_IDS, CALCULATORS, describeAnswers, normalizeAnswers, quote, type Answers, type PriceItem } from "./calculator";
import { DEFAULT_SERVICES, defaultPriceRub } from "./services";

/** Прайс по умолчанию, как в свежей базе. */
const PRICES = new Map<string, PriceItem>(
  DEFAULT_SERVICES.map((s) => {
    const rub = defaultPriceRub(s.key);
    return [s.key, { key: s.key, kind: s.kind ?? "work", name: s.name, unit: s.unit, price: rub === null ? null : rub * 100 }];
  }),
);

const qty = (lines: { key: string; qty: number }[], key: string) => lines.find((l) => l.key === key)?.qty ?? 0;

describe("калькулятор: кондиционеры", () => {
  const calc = CALCULATORS.climate;
  const run = (a: Answers) => calc.compute(normalizeAnswers(calc, a));

  it("длину не знает — трасса по максимуму: 25 м, медь 2 × 25 м", () => {
    const r = run({ job: "install", small: 1, route: "unknown" });
    expect(qty(r.lines, "climate-mount-small")).toBe(1);
    expect(qty(r.lines, "climate-extra-pipe")).toBe(22);
    expect(qty(r.lines, "mat-copper-14")).toBe(25);
    expect(qty(r.lines, "mat-copper-38")).toBe(25);
    expect(qty(r.lines, "mat-insulation")).toBe(50);
    expect(qty(r.lines, "mat-ac-cable")).toBe(26);
    expect(r.notes.some((n) => n.text.includes("50 м медной трубы"))).toBe(true);
  });

  it("замер клиента 15 м — плюс 5 м запаса, и предупреждение, что недостача из-за замера — за его счёт", () => {
    const r = run({ job: "install", small: 1, route: "known", length: 15 });
    expect(qty(r.lines, "mat-copper-14")).toBe(20);
    expect(qty(r.lines, "climate-extra-pipe")).toBe(17);
    const warn = r.notes.find((n) => n.tone === "warn");
    expect(warn?.text).toContain("15 м + 5 м запаса = 20 м");
    expect(warn?.text).toContain("оплачиваются отдельно");
  });

  it("мощный кондиционер — газовая труба 1/2″, кондиционер под ключ — строка оборудования", () => {
    const r = run({ job: "install", small: 0, large: 1, unit: "need", route: "known", length: 3 });
    expect(qty(r.lines, "mat-copper-12")).toBe(8);
    expect(qty(r.lines, "mat-copper-38")).toBe(0);
    expect(qty(r.lines, "eq-split-large")).toBe(1);
  });

  it("штроба вместо короба: если трасса в стене, короб не нужен", () => {
    const r = run({ job: "install", small: 2, route: "known", length: 5, duct: true, chase: true });
    expect(qty(r.lines, "climate-chase")).toBe(20);
    expect(qty(r.lines, "mat-ac-duct")).toBe(0);
  });

  it("чистка: скрытые вопросы установки отбрасываются", () => {
    const a = normalizeAnswers(calc, { job: "service", small: 5, count: 2, freon: true });
    expect(a).toEqual({ job: "service", count: 2, freon: true });
    const r = calc.compute(a);
    expect(qty(r.lines, "climate-service")).toBe(2);
    expect(qty(r.lines, "climate-freon")).toBe(2);
  });
});

describe("калькулятор: ответы и расчёт", () => {
  it("числа ограничиваются, неверные варианты заменяются значением по умолчанию", () => {
    const a = normalizeAnswers(CALCULATORS.climate, { job: "взлом", small: 500, route: "known", length: "7,5", extra: 1 });
    expect(a.job).toBe("install");
    expect(a.small).toBe(10);
    expect(a.length).toBe(7.5);
    expect(a).not.toHaveProperty("extra");
  });

  it("отделка: стены по площади пола, одинаковые материалы стен и потолка — одной строкой", () => {
    const r = CALCULATORS.finishing.compute(normalizeAnswers(CALCULATORS.finishing, { floorArea: 20 }));
    expect(qty(r.lines, "finishing-plaster")).toBe(54);
    expect(qty(r.lines, "finishing-putty")).toBe(74);
    expect(qty(r.lines, "mat-putty")).toBe(74);
    expect(r.lines.filter((l) => l.key === "finishing-putty")).toHaveLength(1);
  });

  it("полы: плинтус по периметру, стяжка, если основание неизвестно", () => {
    const r = CALCULATORS.floors.compute(normalizeAnswers(CALCULATORS.floors, { job: "laminate", area: 50 }));
    expect(qty(r.lines, "floors-plinth")).toBe(45);
    expect(qty(r.lines, "floors-screed")).toBe(50);
  });

  it("итог по прайсу: работы, материалы, оборудование и резерв отдельно", () => {
    const q = quote("turnkey", { job: "cosmetic", area: 10 }, PRICES);
    expect(q.totals.work).toBe(10 * defaultPriceRub("turnkey-cosmetic")! * 100);
    expect(q.totals.materials).toBe(10 * defaultPriceRub("mat-rough-cosmetic")! * 100);
    expect(q.totals.reserve).toBe(Math.round(q.totals.total / 10));
    expect(q.unpriced).toBe(0);
  });

  it("позиция без цены не входит в итог и считается отдельно; выключенная пропускается", () => {
    const prices = new Map(PRICES);
    prices.set("climate-extra-pipe", { ...prices.get("climate-extra-pipe")!, price: null });
    prices.delete("mat-ac-kit");
    const q = quote("climate", { small: 1 }, prices);
    expect(q.unpriced).toBe(1);
    expect(q.lines.find((l) => l.key === "climate-extra-pipe")?.total).toBeNull();
    expect(q.lines.some((l) => l.key === "mat-ac-kit")).toBe(false);
  });

  it("ответы словами — для заявки и карточки владельца", () => {
    const calc = CALCULATORS.climate;
    const text = describeAnswers(calc, normalizeAnswers(calc, { small: 2, route: "known", length: 12, duct: true }));
    expect(text).toContain("Кондиционеры для комнат до 35 м²: 2");
    expect(text).toContain("Длина трассы на один кондиционер: 12 м");
    expect(text).toContain("Закрыть трассу декоративным коробом");
  });

  it("каждое направление и каждый вариант считается, а все позиции есть в прайсе с ценой", () => {
    for (const id of CALC_IDS) {
      const calc = CALCULATORS[id];
      const first = calc.fields[0]!;
      const variants = first.type === "choice" ? first.options.map((o) => o.value) : [undefined];
      for (const v of variants) {
        // Все галочки включены — так проверяются и дополнительные позиции
        const raw: Record<string, unknown> = { [first.id]: v };
        for (const f of calc.fields) if (f.type === "toggle") raw[f.id] = true;
        const q = quote(id, raw, PRICES);
        expect(q.lines.length, `${id}/${v}`).toBeGreaterThan(0);
        const keys = calc.compute(q.answers).lines.map((l) => l.key);
        for (const key of keys) {
          expect(PRICES.has(key), `${id}/${v}: нет позиции ${key}`).toBe(true);
          expect(PRICES.get(key)!.price, `${id}/${v}: нет цены ${key}`).not.toBeNull();
        }
        expect(q.totals.total, `${id}/${v}`).toBeGreaterThan(0);
      }
    }
  });
});
