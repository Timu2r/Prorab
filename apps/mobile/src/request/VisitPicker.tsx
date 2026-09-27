import type { Category } from "@ks/core";
import { CalendarClock } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api, errorText } from "../api";
import { formatVisit } from "../format";
import { useTheme } from "../theme";
import type { CalendarWeek } from "../types";
import { Button, Card, Chip, Section, Segmented } from "../ui";

const MSK = 3 * 3_600_000;
const DAY = 86_400_000;
const WINDOWS = [
  { from: 9, to: 12 },
  { from: 12, to: 15 },
  { from: 15, to: 18 },
  { from: 18, to: 21 },
];
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
/** Сколько дней займут работы: ремонт, полы, фасад — не одно окно (docs/TZ.md, 16.6). */
const LENGTHS = [2, 3, 4, 5, 7, 10, 14];
/** Работы на несколько дней — с 9 до 18 каждый день. */
const WORKDAY = { from: 9, to: 18 };
const DAYS_AHEAD = 7;

/** Полночь по Москве через n дней от сегодня — в UTC. */
function mskDay(n: number): number {
  return Math.floor((Date.now() + MSK) / DAY) * DAY + n * DAY - MSK;
}
const isoDay = (n: number) => new Date(mskDay(n) + MSK).toISOString().slice(0, 10);

function dayLabel(n: number): string {
  if (n === 0) return "Сегодня";
  if (n === 1) return "Завтра";
  const d = new Date(mskDay(n) + MSK);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Время визита мастера или выезда прораба на объект (kind survey). Визит — одно окно по 3 часа или работы на несколько
 * дней. У дней и окон — сколько мастеров направления свободно (календарь, docs/TZ.md, 16.6), чтобы не обещать клиенту
 * день, когда все заняты. Выезд — до договора: осмотр, замер, договор и аванс (docs/TZ.md, 16.9).
 */
export function VisitPicker({
  requestId,
  visitAt,
  visitUntil,
  onChanged,
  kind = "visit",
  category,
}: {
  requestId: string;
  visitAt: string | null;
  visitUntil: string | null;
  onChanged: () => Promise<void> | void;
  kind?: "visit" | "survey";
  category?: Category;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"window" | "days">("window");
  const [day, setDay] = useState(1);
  const [win, setWin] = useState(0);
  const [length, setLength] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cal, setCal] = useState<CalendarWeek | null>(null);
  const current = formatVisit(visitAt, visitUntil);
  const direction = kind === "visit" && category && category !== "general" ? category : null;

  useEffect(() => {
    if (!open || !direction || cal) return;
    api<{ calendar: CalendarWeek }>("GET", `/admin/calendar?from=${isoDay(0)}&days=${DAYS_AHEAD + 14}`)
      .then((r) => setCal(r.calendar))
      .catch(() => {});
  }, [open, direction, cal]);

  // Мастера направления, которые принимают заказы
  const own = cal && direction ? cal.masters.filter((m) => m.available && m.skills.includes(direction)) : [];
  const freeInWindow = (n: number, w: number) => own.filter((m) => !m.days[n]?.[w]).length;
  const freeSomeTime = (n: number) => own.filter((m) => m.days[n]?.some((x) => !x)).length;
  const freeAllDay = (n: number) => own.filter((m) => m.days[n]?.every((x) => !x)).length;
  const freeForDays = (n: number) => own.filter((m) => Array.from({ length }, (_, i) => m.days[n + i]).every((d) => d?.every((x) => !x))).length;
  const hint = (count: number) => (count === 0 ? " · все заняты" : ` · своб. ${count}`);
  const withCounts = !!cal && !!direction;

  const save = async () => {
    const base = mskDay(day);
    const from = mode === "days" ? base + WORKDAY.from * 3_600_000 : base + WINDOWS[win]!.from * 3_600_000;
    const to = mode === "days" ? base + (length - 1) * DAY + WORKDAY.to * 3_600_000 : base + WINDOWS[win]!.to * 3_600_000;
    setBusy(true);
    setError("");
    try {
      const a = new Date(from).toISOString();
      const b = new Date(to).toISOString();
      await api("PATCH", `/requests/${requestId}`, kind === "survey" ? { surveyAt: a, surveyUntil: b } : { visitAt: a, visitUntil: b });
      setOpen(false);
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={kind === "survey" ? "Выезд на объект" : "Визит мастера"}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <CalendarClock size={22} color={current ? t.accent : t.muted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: current ? t.text : t.muted, fontSize: 16, fontWeight: current ? "700" : "400" }}>{current ?? "Время не назначено"}</Text>
          {kind === "survey" ? <Text style={{ color: t.muted, fontSize: 13 }}>Осмотр, замер, договор и аванс. Клиент видит время в «Мои заказы».</Text> : null}
        </View>
        {!open ? <Button small variant="outline" title={current ? "Изменить" : "Назначить"} onPress={() => setOpen(true)} /> : null}
      </Card>
      {open ? (
        <View style={{ gap: 10 }}>
          {kind === "visit" ? (
            <Segmented
              value={mode}
              options={[
                { value: "window", label: "Одно окно" },
                { value: "days", label: "Несколько дней" },
              ]}
              onChange={setMode}
            />
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Array.from({ length: DAYS_AHEAD }, (_, n) => n).map((n) => (
              <Chip key={n} label={`${dayLabel(n)}${withCounts ? hint(mode === "days" ? freeForDays(n) : freeSomeTime(n)) : ""}`} on={day === n} onPress={() => setDay(n)} />
            ))}
          </View>
          {mode === "window" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {WINDOWS.map((w, i) => (
                <Chip key={w.from} label={`${w.from}:00–${w.to}:00${withCounts ? hint(freeInWindow(day, i)) : ""}`} on={win === i} onPress={() => setWin(i)} />
              ))}
            </View>
          ) : (
            <>
              <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>Сколько дней, с 9 до 18</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {LENGTHS.map((n) => (
                  <Chip key={n} label={`${n} дн.`} on={length === n} onPress={() => setLength(n)} />
                ))}
              </View>
            </>
          )}
          {withCounts ? (
            <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }}>
              {mode === "days"
                ? `«своб.» — сколько мастеров направления свободны все ${length} дн. подряд с этого дня.`
                : `«своб.» — сколько мастеров направления принимают заказы и свободны в это время. Свободны весь день: ${freeAllDay(day)}.`}
            </Text>
          ) : null}
          {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button title={kind === "survey" ? "Сохранить выезд" : "Сохранить время"} onPress={save} loading={busy} />
            </View>
            <Button title="Отмена" variant="ghost" onPress={() => setOpen(false)} />
          </View>
        </View>
      ) : null}
    </Section>
  );
}
