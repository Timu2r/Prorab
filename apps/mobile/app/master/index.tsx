import { formatRub, type RequestStatus } from "@ks/core";
import { ClipboardCheck } from "lucide-react-native";
import { useState } from "react";
import { isToday } from "../../src/format";
import { RequestRow } from "../../src/RequestRow";
import type { MasterRequestItem } from "../../src/types";
import { Empty, ErrorBox, Loading, Screen, Segmented } from "../../src/ui";
import { useApi } from "../../src/useApi";

const ON_JOB: RequestStatus[] = ["accepted", "en_route", "on_site"];
const FINISHED: RequestStatus[] = ["done", "act_signed", "paid", "closed"];

type Tab = "new" | "today" | "soon" | "done";

function tabOf(r: MasterRequestItem): Tab | null {
  if (r.status === "assigned") return "new";
  if (ON_JOB.includes(r.status)) return isToday(r.visitAt) ? "today" : "soon";
  if (FINISHED.includes(r.status)) return "done";
  return null;
}

/** Задания мастера: новые (ждут ответа), сегодня, скоро, выполненные. Экран задания с шагами и фото — этап D. */
export default function MasterJobs() {
  const [tab, setTab] = useState<Tab>("new");
  const { data, error, loading, refreshing, reload } = useApi<{ requests: MasterRequestItem[] }>("/requests");
  const mine = (data?.requests ?? []).filter((r) => r.mine);
  const count = (k: Tab) => mine.filter((r) => tabOf(r) === k).length;
  const list = mine.filter((r) => tabOf(r) === tab);
  const options: { value: Tab; label: string; count?: number }[] = [
    { value: "new", label: "Новые", count: count("new") },
    { value: "today", label: "Сегодня", count: count("today") },
    { value: "soon", label: "Скоро", count: count("soon") },
    { value: "done", label: "Выполненные" },
  ];

  return (
    <Screen title="Задания" onRefresh={reload} refreshing={refreshing}>
      <Segmented value={tab} options={options} onChange={setTab} />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {data && list.length === 0 ? (
        <Empty icon={ClipboardCheck} title="Заданий нет" text={tab === "new" ? "Когда вам назначат работу, она появится здесь." : undefined} />
      ) : null}
      {list.map((r) => (
        <RequestRow
          key={r.id}
          number={r.number}
          category={r.category}
          status={r.status}
          line={r.address ?? r.district ?? undefined}
          visitAt={r.visitAt}
          visitUntil={r.visitUntil}
          amount={r.pay === null ? "Сумма уточняется" : `Вам ${formatRub(r.pay)}`}
        />
      ))}
    </Screen>
  );
}
