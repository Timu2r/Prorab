import { CalendarClock } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { api, errorText } from "../api";
import { formatVisit } from "../format";
import { useTheme } from "../theme";
import { Button, Card, Chip, Section } from "../ui";

const MSK = 3 * 3_600_000;
const DAY = 86_400_000;
const WINDOWS = [
  { from: 9, to: 12 },
  { from: 12, to: 15 },
  { from: 15, to: 18 },
  { from: 18, to: 21 },
];
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Полночь по Москве через n дней от сегодня — в UTC. */
function mskDay(n: number): number {
  return Math.floor((Date.now() + MSK) / DAY) * DAY + n * DAY - MSK;
}

function dayLabel(n: number): string {
  if (n === 0) return "Сегодня";
  if (n === 1) return "Завтра";
  const d = new Date(mskDay(n) + MSK);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Время визита мастера или выезда прораба на объект (kind survey): день и окно по 3 часа — то, что видят мастер
 * и клиент. Выезд — до договора: осмотр, замер, договор и аванс (порядок владельца, docs/TZ.md, 16.9).
 */
export function VisitPicker({
  requestId,
  visitAt,
  visitUntil,
  onChanged,
  kind = "visit",
}: {
  requestId: string;
  visitAt: string | null;
  visitUntil: string | null;
  onChanged: () => Promise<void> | void;
  kind?: "visit" | "survey";
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(1);
  const [win, setWin] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = formatVisit(visitAt, visitUntil);

  const save = async () => {
    const w = WINDOWS[win]!;
    const base = mskDay(day);
    setBusy(true);
    setError("");
    try {
      const from = new Date(base + w.from * 3_600_000).toISOString();
      const to = new Date(base + w.to * 3_600_000).toISOString();
      await api("PATCH", `/requests/${requestId}`, kind === "survey" ? { surveyAt: from, surveyUntil: to } : { visitAt: from, visitUntil: to });
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} label={dayLabel(n)} on={day === n} onPress={() => setDay(n)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {WINDOWS.map((w, i) => (
              <Chip key={w.from} label={`${w.from}:00–${w.to}:00`} on={win === i} onPress={() => setWin(i)} />
            ))}
          </View>
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
