import { CATEGORY_LABELS, contractDocument, formatRub, UNIT_LABELS } from "@ks/core";
import { Text, View } from "react-native";
import { useTheme } from "../theme";
import type { ClientRequestDetail, OwnerRequestDetail } from "../types";
import { Card, ErrorBox, Loading, Screen, Section } from "../ui";
import { useApi } from "../useApi";

/** Договор заявки с приложением-сметой. Текст — из packages/core/src/contract.ts, данные — снимок при заключении. */
export function ContractView({ id }: { id: string }) {
  const t = useTheme();
  const { data, error, loading, reload } = useApi<{ request: OwnerRequestDetail | ClientRequestDetail }>(`/requests/${id}`);
  const r = data?.request;
  const c = r?.contract;
  const approved = r?.estimates.find((e) => e.status === "approved") ?? null;
  const doc = c
    ? contractDocument({
        number: c.number,
        date: c.acceptedAt,
        client: c.client,
        address: c.address,
        category: CATEGORY_LABELS[r!.category],
        priceWork: approved?.totals.work ?? c.priceWork,
        priceGoods: approved?.totals.goods ?? c.priceGoods,
        method: c.method,
      })
    : null;

  return (
    <Screen back title="Договор" subtitle={c ? `№ ${c.number}` : undefined}>
      {loading && !r ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {r && !c ? <Text style={{ color: t.muted, fontSize: 15 }}>Договор ещё не заключён: он появится после согласования сметы.</Text> : null}
      {doc ? (
        <>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{doc.title}</Text>
            <Text style={{ color: t.muted, fontSize: 14 }}>{doc.place}</Text>
            <Text style={{ color: t.text, fontSize: 15, lineHeight: 22 }}>{doc.preamble}</Text>
            {doc.sections.map((s) => (
              <View key={s.title} style={{ gap: 6, marginTop: 6 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: "800" }}>{s.title}</Text>
                {s.items.map((p, i) => (
                  <Text key={i} style={{ color: t.text, fontSize: 15, lineHeight: 22 }}>
                    {s.title.split(".")[0]}.{i + 1}. {p}
                  </Text>
                ))}
              </View>
            ))}
            <View style={{ gap: 4, marginTop: 8 }}>
              <Text style={{ color: t.text, fontWeight: "800" }}>Подрядчик</Text>
              <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>{doc.contractor.join(", ")}</Text>
              <Text style={{ color: t.text, fontWeight: "800", marginTop: 6 }}>Заказчик</Text>
              <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>{doc.customer.join(", ")}</Text>
            </View>
            {doc.accepted ? <Text style={{ color: t.success, fontSize: 14, lineHeight: 20, marginTop: 6 }}>{doc.accepted}</Text> : null}
          </Card>
          {approved ? (
            <Section title="Приложение 1. Смета">
              <Card style={{ gap: 6 }}>
                {approved.items.map((i) => (
                  <View key={i.id} style={{ flexDirection: "row", gap: 10 }}>
                    <Text style={{ flex: 1, color: t.text, fontSize: 14, lineHeight: 20 }}>
                      {i.name}, {String(i.qty).replace(".", ",")} {UNIT_LABELS[i.unit]}
                    </Text>
                    <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>{formatRub(Math.round(i.qty * i.price))}</Text>
                  </View>
                ))}
                <Text style={{ color: t.text, fontSize: 16, fontWeight: "800", marginTop: 6 }}>Итого: {formatRub(approved.totals.total)}</Text>
              </Card>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
