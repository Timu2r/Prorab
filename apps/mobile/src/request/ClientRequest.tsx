import { BRAND, CATEGORY_LABELS, formatRub, STATUS_LABELS, UNIT_LABELS } from "@ks/core";
import { router } from "expo-router";
import { Check, FileSignature } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { api, errorText, siteUrl } from "../api";
import { formatVisit } from "../format";
import { useTheme } from "../theme";
import type { ClientRequestDetail } from "../types";
import { Button, Card, ErrorBox, Field, Loading, Pill, Screen, Section, statusTone } from "../ui";
import { useApi } from "../useApi";

/** Заявка клиента: статус, смета на согласование с договором, копия договора. */
export function ClientRequest({ id }: { id: string }) {
  const t = useTheme();
  const { data, error, loading, refreshing, reload } = useApi<{ request: ClientRequestDetail }>(`/requests/${id}`);
  const r = data?.request;
  const est = r?.estimates.find((e) => e.status === "sent") ?? r?.estimates.find((e) => e.status === "approved") ?? null;
  const [accept, setAccept] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const visit = r ? formatVisit(r.visitAt, r.visitUntil) : null;
  const needContract = !r?.contract;

  return (
    <Screen
      back
      title={r ? r.number : "Заявка"}
      subtitle={r ? CATEGORY_LABELS[r.category] : undefined}
      right={r ? <Pill text={STATUS_LABELS[r.status]} tone={statusTone(r.status)} /> : undefined}
      onRefresh={reload}
      refreshing={refreshing}
    >
      {loading && !r ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {r ? (
        <>
          <Card style={{ gap: 6 }}>
            <Text style={{ color: t.text, fontSize: 15 }}>{visit ? `Визит: ${visit}` : "Время визита согласуем по телефону"}</Text>
            {r.master ? <Text style={{ color: t.text, fontSize: 15 }}>Мастер: {r.master.name}</Text> : null}
            {r.calc && !est ? <Text style={{ color: t.muted, fontSize: 14 }}>Примерная стоимость по расчёту: {formatRub(r.calc.totals.total)}. Точную смету пришлём после звонка.</Text> : null}
          </Card>

          {est ? (
            <Section title={est.status === "sent" ? "Смета на согласование" : "Согласованная смета"}>
              <Card style={{ gap: 6 }}>
                {est.items.map((i) => (
                  <View key={i.id} style={{ flexDirection: "row", gap: 10 }}>
                    <Text style={{ flex: 1, color: t.text, fontSize: 14, lineHeight: 20 }}>
                      {i.name}, {String(i.qty).replace(".", ",")} {UNIT_LABELS[i.unit]}
                    </Text>
                    <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>{formatRub(Math.round(i.qty * i.price))}</Text>
                  </View>
                ))}
                <View style={{ height: 1, backgroundColor: t.line, marginVertical: 4 }} />
                <Text style={{ color: t.muted, fontSize: 14 }}>
                  Работы {formatRub(est.totals.work)} · материалы и оборудование {formatRub(est.totals.goods)}
                </Text>
                <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>Итого {formatRub(est.totals.total)}</Text>
              </Card>

              {est.status === "sent" ? (
                <View style={{ gap: 10 }}>
                  {needContract ? (
                    <Pressable onPress={() => setAccept(!accept)} accessibilityRole="checkbox" accessibilityState={{ checked: accept }} style={{ flexDirection: "row", gap: 12 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          borderWidth: 1.5,
                          borderColor: accept ? t.accent : t.line,
                          backgroundColor: accept ? t.accent : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {accept ? <Check size={16} color="#fff" strokeWidth={3} /> : null}
                      </View>
                      <Text style={{ flex: 1, color: t.muted, fontSize: 14, lineHeight: 20 }}>
                        Принимаю условия{" "}
                        <Text style={{ color: t.accent, fontWeight: "700" }} onPress={() => void Linking.openURL(siteUrl("/dogovor"))}>
                          договора подряда
                        </Text>{" "}
                        с {BRAND.legalName}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Button
                    title={needContract ? "Согласен, заключить договор" : "Согласовать смету"}
                    icon={Check}
                    loading={busy}
                    disabled={needContract && !accept}
                    onPress={() => run(() => api("POST", `/estimates/${est.id}/approve`, { acceptContract: accept }))}
                  />
                  {!rejecting ? (
                    <Button title="Не согласен" variant="ghost" onPress={() => setRejecting(true)} />
                  ) : (
                    <Card style={{ gap: 10 }}>
                      <Field label="Что не устроило" value={reason} onChangeText={setReason} maxLength={1000} />
                      <Button title="Отправить" variant="outline" loading={busy} onPress={() => run(() => api("POST", `/estimates/${est.id}/reject`, { reason }))} />
                    </Card>
                  )}
                </View>
              ) : null}
            </Section>
          ) : null}

          {r.contract ? (
            <Card onPress={() => router.push(`/contract/${r.id}`)} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <FileSignature size={20} color={t.success} />
              <Text style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: "700" }}>Договор № {r.contract.number} — открыть</Text>
            </Card>
          ) : null}
          {message ? <Text style={{ color: t.danger, fontSize: 14 }}>{message}</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}
