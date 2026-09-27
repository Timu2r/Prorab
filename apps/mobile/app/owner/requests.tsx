import { formatRub, type RequestStatus } from "@ks/core";
import { router } from "expo-router";
import { ClipboardList } from "lucide-react-native";
import { useState } from "react";
import { RequestRow } from "../../src/RequestRow";
import type { OwnerRequestItem } from "../../src/types";
import { Empty, ErrorBox, Loading, Screen, Segmented } from "../../src/ui";
import { useApi } from "../../src/useApi";

const GROUPS: Record<string, { label: string; statuses: RequestStatus[] | null }> = {
  new: { label: "Новые", statuses: ["new"] },
  work: { label: "В работе", statuses: ["agreed", "prepaid", "assigned", "accepted", "en_route", "on_site", "done", "paid"] },
  pay: { label: "Ждут оплаты", statuses: ["invoiced", "act_signed"] },
  closed: { label: "Закрытые", statuses: ["closed", "cancelled"] },
  all: { label: "Все", statuses: null },
};

type Group = keyof typeof GROUPS;

/** Заявки владельца по группам. Нажатие — карточка заявки. */
export default function OwnerRequests() {
  const [group, setGroup] = useState<Group>("new");
  const statuses = GROUPS[group]!.statuses;
  const { data, error, loading, refreshing, reload } = useApi<{ requests: OwnerRequestItem[] }>(
    `/requests${statuses ? `?status=${statuses.join(",")}` : ""}`,
  );
  const list = data?.requests ?? [];

  return (
    <Screen title="Заявки" onRefresh={reload} refreshing={refreshing}>
      <Segmented value={group} options={(Object.keys(GROUPS) as Group[]).map((g) => ({ value: g, label: GROUPS[g]!.label }))} onChange={setGroup} />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {data && list.length === 0 ? <Empty icon={ClipboardList} title="Здесь пока пусто" /> : null}
      {list.map((r) => {
        const total = (r.priceWork ?? 0) + (r.priceGoods ?? 0);
        return (
          <RequestRow
            key={r.id}
            number={r.number}
            category={r.category}
            status={r.status}
            line={[r.leadType === "consult" ? "Консультация" : r.leadType === "full" ? "Подробная" : null, r.client.name || r.client.phone, r.district || r.address]
              .filter(Boolean)
              .join(" · ")}
            visitAt={r.visitAt}
            visitUntil={r.visitUntil}
            amount={total ? formatRub(total) : null}
            onPress={() => router.push(`/request/${r.id}`)}
          />
        );
      })}
    </Screen>
  );
}
