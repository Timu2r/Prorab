import { CATEGORY_LABELS, formatPhone, formatRub, STATUS_LABELS, UNIT_LABELS, type RequestStatus } from "@ks/core";
import { CalendarClock, Camera, Check, MapPin, Navigation, Phone, X } from "lucide-react-native";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { api, errorText } from "../api";
import { formatVisit } from "../format";
import { useTheme } from "../theme";
import type { MasterTaskDetail } from "../types";
import { Button, Card, confirm, ErrorBox, Field, Loading, Pill, Screen, Section, statusTone } from "../ui";
import { useApi } from "../useApi";

/** Следующий шаг мастера по заданию. «Готово» с фото и расходом материалов — в следующем обновлении (этап D). */
const NEXT: Partial<Record<RequestStatus, { to: RequestStatus; title: string }>> = {
  accepted: { to: "en_route", title: "Выехал" },
  en_route: { to: "on_site", title: "На месте" },
};

/** Задание мастера: без цен клиента; адрес и телефон — после «Принять». */
export function MasterTask({ id }: { id: string }) {
  const t = useTheme();
  const { data, error, loading, refreshing, reload } = useApi<{ request: MasterTaskDetail }>(`/requests/${id}`);
  const r = data?.request;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setMessage("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const visit = r ? formatVisit(r.visitAt, r.visitUntil) : null;
  const next = r ? NEXT[r.status] : undefined;
  const place = r?.address ? [r.address, r.apartment && `кв. ${r.apartment}`, r.entrance && `подъезд ${r.entrance}`, r.floor && `этаж ${r.floor}`, r.intercom && `домофон ${r.intercom}`].filter(Boolean).join(", ") : null;

  return (
    <Screen
      back
      title={r ? r.number : "Задание"}
      subtitle={r ? CATEGORY_LABELS[r.category] : undefined}
      right={r ? <Pill text={STATUS_LABELS[r.status]} tone={statusTone(r.status)} /> : undefined}
      onRefresh={reload}
      refreshing={refreshing}
    >
      {loading && !r ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {r ? (
        <>
          <Card style={{ gap: 10 }}>
            <Row icon={<CalendarClock size={20} color={visit ? t.accent : t.muted} />} text={visit ? `Визит ${visit}` : "Время визита пока не назначено"} />
            <Row icon={<MapPin size={20} color={place ? t.accent : t.muted} />} text={place ?? (r.district ? `${r.district} — адрес откроется после «Принять»` : "Адрес откроется после «Принять»")} />
            {r.client ? (
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Button small icon={Phone} title={`${r.client.name || "Клиент"} · ${formatPhone(r.client.phone)}`} onPress={() => void Linking.openURL(`tel:${r.client!.phone}`)} />
                {place ? (
                  <Button small variant="outline" icon={Navigation} title="Маршрут" onPress={() => void Linking.openURL(`https://yandex.ru/maps/?text=${encodeURIComponent(place)}`)} />
                ) : null}
              </View>
            ) : null}
            {r.pay !== null ? <Text style={{ color: t.text, fontSize: 16, fontWeight: "800" }}>Ваш заработок: {formatRub(r.pay)}</Text> : null}
          </Card>

          {r.status === "assigned" && r.mine ? (
            <View style={{ gap: 10 }}>
              <Button title="Принять задание" icon={Check} loading={busy === "accept"} onPress={() => act("accept", () => api("POST", `/requests/${id}/status`, { to: "accepted" }))} />
              {!declining ? (
                <Button title="Отказаться" icon={X} variant="ghost" onPress={() => setDeclining(true)} />
              ) : (
                <Card style={{ gap: 10 }}>
                  <Field label="Почему отказываетесь" value={reason} onChangeText={setReason} placeholder="Например: занят в это время" maxLength={500} />
                  <Button
                    title="Отказаться от задания"
                    variant="danger"
                    loading={busy === "decline"}
                    onPress={async () => {
                      if (!(await confirm("Отказаться от задания?", "Задание вернётся владельцу или бригадиру.", "Отказаться"))) return;
                      await act("decline", () => api("POST", `/requests/${id}/unassign`, { reason }));
                    }}
                  />
                </Card>
              )}
            </View>
          ) : null}

          {next && r.mine ? <Button title={next.title} loading={busy === "next"} onPress={() => act("next", () => api("POST", `/requests/${id}/status`, { to: next.to }))} /> : null}
          {r.status === "on_site" ? (
            <Card style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Camera size={20} color={t.muted} />
              <Text style={{ flex: 1, color: t.muted, fontSize: 14, lineHeight: 20 }}>Фото до и после и «Готово» — в следующем обновлении приложения.</Text>
            </Card>
          ) : null}
          {message ? <Text style={{ color: t.danger, fontSize: 14 }}>{message}</Text> : null}

          {r.description ? (
            <Section title="Задача">
              <Card>
                <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>{r.description}</Text>
              </Card>
            </Section>
          ) : null}
          {r.works.length ? (
            <Section title="Работы">
              <Card style={{ gap: 6 }}>
                {r.works.map((w, i) => (
                  <Text key={i} style={{ color: t.text, fontSize: 15 }}>
                    {w.name} — {String(w.qty).replace(".", ",")} {UNIT_LABELS[w.unit]}
                  </Text>
                ))}
              </Card>
            </Section>
          ) : null}
          {r.materials.length ? (
            <Section title="Материалы">
              <Card style={{ gap: 6 }}>
                {r.materials.map((m) => (
                  <Text key={m.id} style={{ color: t.text, fontSize: 15 }}>
                    {m.name} — {String(m.qty).replace(".", ",")} {UNIT_LABELS[m.unit]}
                  </Text>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <View style={{ marginTop: 1 }}>{icon}</View>
      <Text style={{ flex: 1, color: t.text, fontSize: 15, lineHeight: 21 }}>{text}</Text>
    </View>
  );
}
