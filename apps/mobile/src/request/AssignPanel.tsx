import { CATEGORY_LABELS, canAssign, canReassign, type Category, type RequestStatus } from "@ks/core";
import { HardHat, Phone, UserRoundCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { api, errorText } from "../api";
import { formatDayMonth, formatTime, isToday } from "../format";
import { useTheme } from "../theme";
import type { MasterView } from "../types";
import { Button, Card, confirm, Empty, Pill, Section, type Tone } from "../ui";

type Load = { tone: Tone; text: string; rank: number };

/** Свободен / занят / не принимает заказы — подсказка при выборе, а не запрет. */
function load(m: MasterView): Load {
  if (!m.available) return { tone: "danger", text: "Не принимает заказы", rank: 2 };
  if (m.activeJobs === 0) return { tone: "success", text: "Свободен", rank: 0 };
  return { tone: "neutral", text: `В работе: ${m.activeJobs}`, rank: 1 };
}

/**
 * Мастер заявки и назначение (docs/KALKULYATOR.md, раздел 7): мастера нужного направления, сначала свободные,
 * у каждого — сколько заказов в работе, визиты сегодня и ближайший визит.
 */
export function AssignPanel({
  requestId,
  category,
  status,
  master,
  onChanged,
}: {
  requestId: string;
  category: Category;
  status: RequestStatus;
  master: { id: string; name: string; phone: string } | null;
  onChanged: () => Promise<void> | void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [masters, setMasters] = useState<MasterView[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const can = canAssign(status) || canReassign(status);

  useEffect(() => {
    if (!open || masters) return;
    api<{ masters: MasterView[] }>("GET", "/admin/masters")
      .then((r) => setMasters(r.masters))
      .catch((e) => setError(errorText(e)));
  }, [open, masters]);

  const suitable = (masters ?? [])
    .filter((m) => m.active && m.id !== master?.id && (category === "general" || m.skills.includes(category)))
    .sort((a, b) => load(a).rank - load(b).rank || a.activeJobs - b.activeJobs || a.name.localeCompare(b.name));

  const assign = async (m: MasterView) => {
    const l = load(m);
    const warn = l.rank === 2 ? `\n\n${m.name} отметил, что сейчас не принимает заказы.` : l.rank === 1 ? `\n\nУ мастера уже ${m.activeJobs} в работе.` : "";
    if (!(await confirm(`Назначить: ${m.name}?`, `Мастер получит задание и примет его в приложении. Адрес и телефон клиента откроются ему после «Принять».${warn}`, "Назначить")))
      return;
    setBusy(m.id);
    setError("");
    try {
      await api("POST", `/requests/${requestId}/assign`, { masterId: m.id });
      setOpen(false);
      setMasters(null);
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Мастер">
      {master ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <UserRoundCheck size={22} color={t.success} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>{master.name}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>{status === "assigned" ? "Ждёт ответа мастера" : "Задание принято"}</Text>
          </View>
          <Button small variant="outline" icon={Phone} title="Позвонить" onPress={() => void Linking.openURL(`tel:${master.phone}`)} />
        </Card>
      ) : !can ? (
        <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>Назначить мастера можно после того, как клиент согласует смету.</Text>
      ) : null}

      {can && !open ? <Button title={master ? "Передать другому мастеру" : "Назначить мастера"} icon={HardHat} variant={master ? "outline" : "primary"} onPress={() => setOpen(true)} /> : null}

      {open ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            {category === "general" ? "Все мастера" : `Мастера направления «${CATEGORY_LABELS[category]}»`}: сначала свободные.
          </Text>
          {masters === null && !error ? <Text style={{ color: t.muted }}>Загрузка…</Text> : null}
          {masters && suitable.length === 0 ? <Empty icon={HardHat} title="Нет подходящих мастеров" text="Добавьте мастера с этим направлением в разделе «Мастера»" /> : null}
          {suitable.map((m) => {
            const l = load(m);
            return (
              <Card key={m.id} onPress={busy ? undefined : () => void assign(m)} style={{ gap: 6, opacity: busy && busy !== m.id ? 0.5 : 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: "700", flex: 1 }}>
                    {m.name}
                    {m.isLead ? <Text style={{ color: t.muted, fontWeight: "600" }}> · бригадир</Text> : null}
                  </Text>
                  <Pill text={l.text} tone={l.tone} />
                </View>
                <Text style={{ color: t.muted, fontSize: 13 }}>
                  {m.todayVisits ? `Визитов сегодня: ${m.todayVisits}` : "Сегодня визитов нет"}
                  {m.nextVisitAt ? ` · ближайший ${isToday(m.nextVisitAt) ? "сегодня" : formatDayMonth(m.nextVisitAt)} в ${formatTime(m.nextVisitAt)}` : ""}
                </Text>
                <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
                  {m.skills.map((s) => CATEGORY_LABELS[s]).join(", ")}
                </Text>
                {busy === m.id ? <Text style={{ color: t.accent, fontSize: 13, fontWeight: "700" }}>Назначаем…</Text> : null}
              </Card>
            );
          })}
          <Button title="Отмена" variant="ghost" onPress={() => setOpen(false)} />
        </View>
      ) : null}
      {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
    </Section>
  );
}
