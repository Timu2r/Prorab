import { UsersRound, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, errorText } from "../api";
import { formatDate } from "../format";
import { useTheme } from "../theme";
import type { CalendarWeek, CrewMember, MasterView } from "../types";
import { Button, Card, Chip, Field, Pill, Section } from "../ui";

const MSK = 3 * 3_600_000;
const DAY = 86_400_000;
const ROLES = ["Монтаж", "Электрика", "Сантехника", "Отделка", "Подсобник"];

/** Дата по Москве ГГГГ-ММ-ДД. */
const mskDate = (v: string | number) => new Date(new Date(v).getTime() + MSK).toISOString().slice(0, 10);
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** Дни работ по визиту: для ремонта на несколько дней — каждый день; для одного визита — один. */
function visitDays(at: string | null, until: string | null): string[] {
  if (!at) return [];
  const first = mskDate(at);
  const last = until ? mskDate(until) : first;
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 31; d = new Date(Date.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10)) out.push(d);
  return out;
}

const daysText = (m: Pick<CrewMember, "dayFrom" | "dayTo">) =>
  !m.dayFrom && !m.dayTo ? "весь срок" : m.dayFrom === m.dayTo || !m.dayTo ? dm(m.dayFrom!) : `${dm(m.dayFrom!)}–${dm(m.dayTo)}`;

/**
 * Бригада заказа (docs/TZ.md, 16.6): старший — назначенный мастер, помощники — со своей ролью и днями. Клиент видит,
 * кто за что отвечает. Помощникам платит старший (решение владельца 2026-09-27): выплата по заказу одна.
 */
export function CrewPanel({
  requestId,
  lead,
  crew,
  visitAt,
  visitUntil,
  locked,
  onChanged,
}: {
  requestId: string;
  lead: { id: string; name: string } | null;
  crew: CrewMember[];
  visitAt: string | null;
  visitUntil: string | null;
  locked: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const t = useTheme();
  const [adding, setAdding] = useState(false);
  const [masters, setMasters] = useState<MasterView[] | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const period = visitDays(visitAt, visitUntil);
  const periodKey = period.join(",");

  useEffect(() => {
    if (!adding || masters) return;
    api<{ masters: MasterView[] }>("GET", "/admin/masters")
      .then((r) => setMasters(r.masters))
      .catch((e) => setError(errorText(e)));
    // Кто занят в дни этих работ — подсказка при выборе, а не запрет
    if (period.length)
      api<{ calendar: CalendarWeek }>("GET", `/admin/calendar?from=${period[0]}&days=${period.length}`)
        .then(({ calendar }) => setBusyIds(new Set(calendar.masters.filter((m) => m.days.some((d) => d.some(Boolean))).map((m) => m.id))))
        .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- период задаёт periodKey
  }, [adding, masters, periodKey]);

  const save = async (members: CrewMember[]) => {
    setBusy(true);
    setError("");
    try {
      await api("PUT", `/requests/${requestId}/crew`, { members: members.map(({ masterId, role: r, dayFrom, dayTo }) => ({ masterId, role: r, dayFrom, dayTo })) });
      setAdding(false);
      setPick(null);
      setRole("");
      setDays([]);
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const m = masters?.find((x) => x.id === pick);
    if (!m) return setError("Выберите помощника");
    const sorted = [...days].sort();
    void save([...crew, { masterId: m.id, name: m.name, phone: m.phone, role: role.trim(), dayFrom: sorted[0] ?? null, dayTo: sorted.at(-1) ?? null }]);
  };

  const candidates = (masters ?? []).filter((m) => m.active && m.id !== lead?.id && !crew.some((c) => c.masterId === m.id));

  return (
    <Section title="Бригада">
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <UsersRound size={20} color={lead ? t.accent : t.muted} />
          <Text style={{ flex: 1, color: t.text, fontSize: 15 }}>
            {lead ? (
              <>
                Старший: <Text style={{ fontWeight: "800" }}>{lead.name}</Text>
              </>
            ) : (
              "Сначала назначьте старшего мастера — потом добавьте помощников"
            )}
          </Text>
        </View>
        {crew.map((c) => (
          <View key={c.masterId} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.line }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>{c.name}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>
                {c.role} · {daysText(c)}
              </Text>
            </View>
            {!locked ? (
              <Pressable
                onPress={() => void save(crew.filter((x) => x.masterId !== c.masterId))}
                accessibilityRole="button"
                accessibilityLabel={`Убрать ${c.name}`}
                style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
              >
                <X size={18} color={t.muted} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {lead && !locked && !adding ? <Button small variant="outline" icon={UsersRound} title="Добавить помощника" onPress={() => setAdding(true)} /> : null}
        {adding ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>Кто</Text>
            {!masters ? <Text style={{ color: t.muted }}>Загрузка…</Text> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {candidates.map((m) => (
                <Chip key={m.id} label={`${m.name}${busyIds.has(m.id) ? " · занят" : !m.available ? " · не принимает" : ""}`} on={pick === m.id} onPress={() => setPick(m.id)} />
              ))}
            </View>
            {masters && !candidates.length ? <Text style={{ color: t.muted, fontSize: 14 }}>Свободных мастеров для бригады нет — добавьте их во вкладке «Мастера».</Text> : null}
            <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>За что отвечает</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ROLES.map((r) => (
                <Chip key={r} label={r} on={role === r} onPress={() => setRole(r)} />
              ))}
            </View>
            <Field label="Или своими словами" value={role} onChangeText={setRole} placeholder="Например: монтаж наружного блока" maxLength={60} />
            {period.length > 1 ? (
              <>
                <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>Дни (не выбрано — весь срок)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {period.map((d) => (
                    <Chip key={d} label={formatDate(`${d}T12:00:00Z`).slice(0, 5)} on={days.includes(d)} onPress={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])} />
                  ))}
                </View>
              </>
            ) : null}
            <Text style={{ color: t.muted, fontSize: 13, lineHeight: 19 }}>Помощникам платит старший — выплата по заказу одна. Клиент увидит в «Мои заказы», кто за что отвечает.</Text>
            {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title="Добавить в бригаду" loading={busy} disabled={!pick || role.trim().length < 2} onPress={add} />
              </View>
              <Button title="Отмена" variant="ghost" onPress={() => setAdding(false)} />
            </View>
          </View>
        ) : null}
        {!adding && error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
        {crew.length ? <Pill text={`В бригаде ${crew.length + 1}`} tone="neutral" /> : null}
      </Card>
    </Section>
  );
}
