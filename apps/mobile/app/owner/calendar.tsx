import { CATEGORY_LABELS, formatRub, STATUS_LABELS, type Category } from "@ks/core";
import { router } from "expo-router";
import { CalendarClock, ChevronLeft, ChevronRight, HardHat, MapPinned } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatVisit } from "../../src/format";
import { useTheme } from "../../src/theme";
import type { CalendarWeek, DayPlan } from "../../src/types";
import { Card, Empty, ErrorBox, Loading, Pill, Screen, Section, statusTone } from "../../src/ui";
import { useApi } from "../../src/useApi";

const DAY = 86_400_000;
const MSK = 3 * 3_600_000;
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Короткие названия направлений — строка календаря на телефоне узкая. */
const SHORT: Partial<Record<Category, string>> = {
  turnkey: "Под ключ",
  finishing: "Отделка",
  floors: "Полы",
  facade: "Фасады",
  electric: "Электрика",
  plumbing: "Сантехника",
  climate: "Кондиционеры",
  vent: "Вентиляция",
};

const today = () => new Date(Date.now() + MSK).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
const dm = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

/**
 * Календарь (docs/TZ.md, 16.6): сколько мастеров каждого направления свободно по дням и план выбранного дня —
 * кто, у какого клиента, за какую цену. «Кондиционеры 0 из 5» видно раньше, чем клиенту что-то пообещали.
 */
export default function OwnerCalendar() {
  const t = useTheme();
  const [from, setFrom] = useState(today);
  const [day, setDay] = useState(today);
  const week = useApi<{ calendar: CalendarWeek }>(`/admin/calendar?from=${from}&days=7`);
  const plan = useApi<{ day: DayPlan }>(`/admin/day?date=${day}`);
  const c = week.data?.calendar;
  const p = plan.data?.day;

  const shift = (n: number) => {
    const next = addDays(from, n);
    setFrom(next);
    setDay(next);
  };

  return (
    <Screen
      brand
      title="Календарь"
      subtitle="Свободные мастера по направлениям и план дня"
      onRefresh={() => {
        void week.reload();
        void plan.reload();
      }}
      refreshing={week.refreshing || plan.refreshing}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <NavButton icon="prev" disabled={from <= today()} onPress={() => shift(-7)} />
        <Text style={{ flex: 1, textAlign: "center", color: t.text, fontSize: 15, fontWeight: "700" }}>
          {dm(from)} — {dm(addDays(from, 6))}
        </Text>
        <NavButton icon="next" onPress={() => shift(7)} />
      </View>

      {week.loading && !c ? <Loading /> : null}
      {week.error ? <ErrorBox text={week.error} onRetry={week.reload} /> : null}
      {c ? (
        c.directions.length === 0 ? (
          <Empty icon={HardHat} title="Мастеров пока нет" text="Добавьте мастеров с направлениями — здесь появится их занятость." />
        ) : (
          <Card style={{ gap: 6, paddingHorizontal: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              <View style={{ width: 92 }} />
              {c.days.map((d) => (
                <Pressable key={d} onPress={() => setDay(d)} style={{ flex: 1, alignItems: "center", paddingVertical: 4, borderRadius: 8, backgroundColor: d === day ? t.accentSoft : "transparent" }}>
                  <Text style={{ color: d === day ? t.accent : t.muted, fontSize: 11, fontWeight: "700" }}>{weekday(d)}</Text>
                  <Text style={{ color: d === day ? t.accent : t.text, fontSize: 13, fontWeight: "800" }}>{d.slice(8, 10)}</Text>
                </Pressable>
              ))}
            </View>
            {c.directions.map((dir) => (
              <View key={dir.category} style={{ flexDirection: "row", alignItems: "center", minHeight: 36 }}>
                <Text numberOfLines={1} style={{ width: 92, color: t.text, fontSize: 13, fontWeight: "600" }}>
                  {SHORT[dir.category] ?? CATEGORY_LABELS[dir.category]}
                </Text>
                {dir.free.map((n, i) => {
                  const none = n === 0;
                  const all = n === dir.total;
                  return (
                    <Pressable
                      key={c.days[i]}
                      onPress={() => setDay(c.days[i]!)}
                      accessibilityLabel={`${CATEGORY_LABELS[dir.category]}, ${dm(c.days[i]!)}: свободно ${n} из ${dir.total}`}
                      style={{
                        flex: 1,
                        marginHorizontal: 1,
                        paddingVertical: 6,
                        borderRadius: 6,
                        alignItems: "center",
                        backgroundColor: none ? t.dangerSoft : all ? t.successSoft : t.surface2,
                        borderWidth: c.days[i] === day ? 1 : 0,
                        borderColor: t.accent,
                      }}
                    >
                      <Text style={{ color: none ? t.danger : all ? t.success : t.text, fontSize: 12, fontWeight: "800" }}>
                        {n}/{dir.total}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <Text style={{ color: t.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
              Свободно из всех мастеров направления: принимает заказы и есть хотя бы одно свободное окно. Красным — все заняты.
            </Text>
          </Card>
        )
      ) : null}

      <Section title={`${weekday(day)}, ${dm(day)}${day === today() ? " — сегодня" : ""}`}>
        {plan.loading && !p ? <Loading /> : null}
        {plan.error ? <ErrorBox text={plan.error} onRetry={plan.reload} /> : null}
        {p && p.items.length === 0 ? <Empty icon={CalendarClock} title="В этот день визитов и выездов нет" /> : null}
        {p?.items.map((i) => (
          <Card
            key={`${i.kind}-${i.id}`}
            onPress={() => router.push(`/request/${i.id}`)}
            style={[{ gap: 6 }, i.kind === "survey" ? { borderLeftWidth: 3, borderLeftColor: t.accent } : null]}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: "800" }}>{formatVisit(i.at, i.until)}</Text>
              {i.kind === "survey" ? <Pill text="Выезд прораба" tone="accent" /> : <Pill text={STATUS_LABELS[i.status]} tone={statusTone(i.status)} />}
            </View>
            <Text style={{ color: t.text, fontSize: 15 }}>
              {i.number} · {CATEGORY_LABELS[i.category]} · {i.client.name || "клиент"}
            </Text>
            {i.address || i.district ? (
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <MapPinned size={15} color={t.muted} />
                <Text style={{ flex: 1, color: t.muted, fontSize: 14 }} numberOfLines={1}>
                  {i.address || i.district}
                </Text>
              </View>
            ) : null}
            {i.kind === "visit" ? (
              <Text style={{ color: i.crew.length ? t.text : t.danger, fontSize: 14 }}>
                {i.crew.length ? i.crew.map((m) => `${m.name} — ${m.role.toLowerCase()}`).join(", ") : "Мастер не назначен"}
              </Text>
            ) : (
              <Text style={{ color: t.muted, fontSize: 14 }}>Осмотр, замер, договор и аванс{i.foreman ? ` · прораб ${i.foreman}` : ""}</Text>
            )}
            {i.price !== null ? <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>Заказ на {formatRub(i.price)}</Text> : null}
          </Card>
        ))}
      </Section>

      {p && p.unscheduled.length ? (
        <Section title="Без времени визита" right={<Pill text={String(p.unscheduled.length)} tone="accent" />}>
          {p.unscheduled.map((u) => (
            <Card key={u.id} onPress={() => router.push(`/request/${u.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>
                  {u.number} · {CATEGORY_LABELS[u.category]}
                </Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>
                  {u.client || "клиент"}
                  {u.price !== null ? ` · ${formatRub(u.price)}` : ""}
                </Text>
              </View>
              <Pill text={STATUS_LABELS[u.status]} tone={statusTone(u.status)} />
            </Card>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function NavButton({ icon, onPress, disabled }: { icon: "prev" | "next"; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  const Icon = icon === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={icon === "prev" ? "Предыдущая неделя" : "Следующая неделя"}
      style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: t.line, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}
    >
      <Icon size={20} color={t.text} />
    </Pressable>
  );
}
