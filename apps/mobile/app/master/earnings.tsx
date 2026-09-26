import { formatRub, PAYOUT_KIND_LABELS, PAYOUT_STATUS_LABELS } from "@ks/core";
import { Wallet } from "lucide-react-native";
import { Text, View } from "react-native";
import { formatDate } from "../../src/format";
import { useTheme } from "../../src/theme";
import type { Payouts } from "../../src/types";
import { Card, Empty, ErrorBox, Loading, Pill, Screen, Section, Stat } from "../../src/ui";
import { useApi } from "../../src/useApi";

/** Заработок мастера: начислено, выплачено, к выплате. Добавление чека самозанятого — этап D. */
export default function MasterEarnings() {
  const t = useTheme();
  const { data, error, loading, refreshing, reload } = useApi<Payouts>("/payouts");

  return (
    <Screen title="Заработок" onRefresh={reload} refreshing={refreshing}>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Stat label="К выплате" value={formatRub(data.totals.toPay)} accent />
            <Stat label="Выплачено" value={formatRub(data.totals.paid)} />
          </View>
          <Section title="Выплаты">
            {data.payouts.length === 0 ? (
              <Empty icon={Wallet} title="Выплат пока нет" text="Сумма начисляется, когда заявка закрыта." />
            ) : (
              data.payouts.map((p) => (
                <Card key={p.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>
                      {PAYOUT_KIND_LABELS[p.kind]}
                      {p.requestNumber ? ` · ${p.requestNumber}` : ""}
                    </Text>
                    <Text style={{ color: p.amount < 0 ? t.danger : t.text, fontSize: 16, fontWeight: "800" }}>
                      {p.needsAmount ? "уточняется" : formatRub(p.amount)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Pill text={PAYOUT_STATUS_LABELS[p.status]} tone={p.status === "paid" ? "success" : "neutral"} />
                    {p.receiptMissing ? <Pill text="Нужен чек" tone="accent" /> : null}
                    <Text style={{ color: t.muted, fontSize: 13 }}>{formatDate(p.paidAt ?? p.accruedAt)}</Text>
                  </View>
                  {p.reason ? <Text style={{ color: t.muted, fontSize: 14 }}>{p.reason}</Text> : null}
                </Card>
              ))
            )}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
