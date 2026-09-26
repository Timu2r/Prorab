import { formatRub, PAYOUT_KIND_LABELS } from "@ks/core";
import { Wallet } from "lucide-react-native";
import { Text, View } from "react-native";
import { useTheme } from "../../src/theme";
import type { Payouts } from "../../src/types";
import { Card, Empty, ErrorBox, Loading, Pill, Screen, Section, Stat } from "../../src/ui";
import { useApi } from "../../src/useApi";

/** Деньги: начисленные, но не выплаченные суммы мастерам. Отметка выплаты и итоги месяца — этап C. */
export default function OwnerMoney() {
  const t = useTheme();
  const { data, error, loading, refreshing, reload } = useApi<Payouts>("/payouts?status=accrued");

  return (
    <Screen title="Деньги" onRefresh={reload} refreshing={refreshing}>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label="К выплате мастерам" value={formatRub(data.totals.toPay)} accent />
          </View>
          <Section title="Начислено, не выплачено">
            {data.payouts.length === 0 ? (
              <Empty icon={Wallet} title="Все выплаты сделаны" />
            ) : (
              data.payouts.map((p) => (
                <Card key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>{p.master.name}</Text>
                    <Text style={{ color: t.muted, fontSize: 14 }}>
                      {PAYOUT_KIND_LABELS[p.kind]}
                      {p.requestNumber ? ` · ${p.requestNumber}` : ""}
                    </Text>
                  </View>
                  {p.needsAmount ? <Pill text="Уточнить сумму" tone="accent" /> : <Text style={{ color: t.text, fontSize: 16, fontWeight: "800" }}>{formatRub(p.amount)}</Text>}
                </Card>
              ))
            )}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
