import { CATEGORY_LABELS, formatRub, STATUS_LABELS } from "@ks/core";
import { CalendarClock, CircleAlert, CircleCheck } from "lucide-react-native";
import { Text, View } from "react-native";
import { useAuth } from "../../src/auth";
import { ago, formatVisit, monthName } from "../../src/format";
import { useTheme } from "../../src/theme";
import type { Dashboard } from "../../src/types";
import { Card, Empty, ErrorBox, Loading, Pill, Screen, Section, Stat, statusTone } from "../../src/ui";
import { useApi } from "../../src/useApi";

/** Сводка владельца: что требует внимания, визиты сегодня, деньги месяца. */
export default function OwnerDashboard() {
  const t = useTheme();
  const { user } = useAuth();
  const { data, error, loading, refreshing, reload } = useApi<{ dashboard: Dashboard }>("/admin/dashboard");
  const d = data?.dashboard;

  return (
    <Screen title="Сводка" subtitle={user?.name ? `Здравствуйте, ${user.name}` : undefined} onRefresh={reload} refreshing={refreshing}>
      {loading && !d ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {d ? (
        <>
          <Section title="Требует внимания" right={d.attention.length ? <Pill text={String(d.attention.length)} tone="accent" /> : undefined}>
            {d.attention.length === 0 ? (
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <CircleCheck size={22} color={t.success} />
                <Text style={{ color: t.text, fontSize: 15, flex: 1 }}>Всё под контролем: нет зависших заявок, счетов и выплат.</Text>
              </Card>
            ) : (
              d.attention.map((a, i) => (
                <Card key={`${a.kind}-${a.requestId ?? a.payoutId}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <CircleAlert size={22} color={t.accent} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>{a.text}</Text>
                    <Text style={{ color: t.muted, fontSize: 13 }}>
                      {a.number ? `${a.number} · ` : ""}
                      {ago(a.since)}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </Section>

          <Section title="Сегодня">
            {d.today.length === 0 ? (
              <Empty icon={CalendarClock} title="Визитов на сегодня нет" />
            ) : (
              d.today.map((v) => (
                <Card key={v.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: t.text, fontSize: 16, fontWeight: "800" }}>{formatVisit(v.visitAt, v.visitUntil)}</Text>
                    <Pill text={STATUS_LABELS[v.status]} tone={statusTone(v.status)} />
                  </View>
                  <Text style={{ color: t.muted, fontSize: 14 }}>
                    {v.number} · {CATEGORY_LABELS[v.category]}
                    {v.district ? ` · ${v.district}` : ""} · {v.master ?? "мастер не назначен"}
                  </Text>
                </Card>
              ))
            )}
          </Section>

          <Section title={monthName(d.month.month)}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Stat label="Новых заявок" value={String(d.month.newRequests)} />
              <Stat label="Закрыто" value={String(d.month.closed)} />
              <Stat label="Поступило" value={formatRub(d.month.cashIn)} hint="оплаты по счетам" />
              <Stat label="Заработок" value={formatRub(d.month.result.profit)} hint="по закрытым заявкам" accent />
              <Stat label="Выплаты мастерам" value={formatRub(d.month.result.payouts)} />
              <Stat label="Налог" value={formatRub(d.month.result.tax)} />
            </View>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
