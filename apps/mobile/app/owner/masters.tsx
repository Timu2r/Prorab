import { CATEGORY_LABELS, formatPhone, formatRub, TAX_STATUS_LABELS } from "@ks/core";
import { HardHat } from "lucide-react-native";
import { Text, View } from "react-native";
import { useTheme } from "../../src/theme";
import type { MasterView } from "../../src/types";
import { Card, Empty, ErrorBox, KV, Loading, Pill, Screen } from "../../src/ui";
import { useApi } from "../../src/useApi";

/** Мастера и бригады. Добавление мастера и ставки — этап C. */
export default function OwnerMasters() {
  const t = useTheme();
  const { data, error, loading, refreshing, reload } = useApi<{ masters: MasterView[] }>("/admin/masters");
  const list = data?.masters ?? [];

  return (
    <Screen title="Мастера" subtitle={data ? `${list.filter((m) => m.active).length} в работе` : undefined} onRefresh={reload} refreshing={refreshing}>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {data && list.length === 0 ? <Empty icon={HardHat} title="Мастеров пока нет" text="Добавление мастера появится в следующем обновлении." /> : null}
      {list.map((m) => (
        <Card key={m.id} style={{ gap: 10, opacity: m.active ? 1 : 0.55 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: "800" }}>{m.name}</Text>
            {m.isLead ? <Pill text={`Бригадир · ${m.teamSize}`} tone="info" /> : null}
            {!m.active ? <Pill text="Отключён" /> : null}
          </View>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            {m.skills.map((s) => CATEGORY_LABELS[s]).join(", ")}
            {m.lead ? ` · бригада: ${m.lead.name}` : ""}
          </Text>
          <KV label="Телефон" value={formatPhone(m.phone)} />
          <KV label="Статус" value={TAX_STATUS_LABELS[m.taxStatus]} />
          <KV label="Заданий в работе" value={String(m.activeJobs)} />
          <KV label="К выплате" value={formatRub(m.toPay)} strong />
        </Card>
      ))}
    </Screen>
  );
}
