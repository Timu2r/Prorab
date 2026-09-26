import { formatRub } from "@ks/core";
import { ListChecks } from "lucide-react-native";
import { RequestRow } from "../../src/RequestRow";
import type { ClientRequestItem } from "../../src/types";
import { Empty, ErrorBox, Loading, Screen } from "../../src/ui";
import { useApi } from "../../src/useApi";

/** Заявки клиента. Экран заявки со сметой, оплатой и приёмкой — этап E. */
export default function ClientRequests() {
  const { data, error, loading, refreshing, reload } = useApi<{ requests: ClientRequestItem[] }>("/requests");
  const list = data?.requests ?? [];

  return (
    <Screen title="Мои заявки" onRefresh={reload} refreshing={refreshing}>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {data && list.length === 0 ? <Empty icon={ListChecks} title="Заявок пока нет" text="Позвоните нам или оставьте заявку на сайте — она появится здесь." /> : null}
      {list.map((r) => {
        const total = (r.priceWork ?? 0) + (r.priceGoods ?? 0);
        return (
          <RequestRow
            key={r.id}
            number={r.number}
            category={r.category}
            status={r.status}
            line={r.master ? `Мастер: ${r.master.name}` : r.address || undefined}
            visitAt={r.visitAt}
            visitUntil={r.visitUntil}
            amount={total ? formatRub(total) : null}
          />
        );
      })}
    </Screen>
  );
}
