import { formatRub, type RequestStatus } from "@ks/core";
import { router } from "expo-router";
import { ClipboardCheck } from "lucide-react-native";
import { useState } from "react";
import { api, errorText } from "../../src/api";
import { useAuth } from "../../src/auth";
import { isToday } from "../../src/format";
import { RequestRow } from "../../src/RequestRow";
import type { MasterRequestItem } from "../../src/types";
import { Empty, ErrorBox, Loading, Screen, Segmented, ToggleRow } from "../../src/ui";
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

/** Задания мастера: новые (ждут ответа), сегодня, скоро, выполненные. Сверху — «Принимаю заказы». */
export default function MasterJobs() {
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>("new");
  const [availabilityError, setAvailabilityError] = useState("");
  const setAvailable = async (v: boolean) => {
    setAvailabilityError("");
    try {
      await api("PUT", "/me/availability", { available: v });
      await refresh();
    } catch (e) {
      setAvailabilityError(errorText(e));
    }
  };
  const { data, error, loading, refreshing, reload } = useApi<{ requests: MasterRequestItem[] }>("/requests");
  // Свои задания и заказы, где мастер — помощник в бригаде (задания команды бригадира — во вкладке «Команда»)
  const mine = (data?.requests ?? []).filter((r) => r.mine || r.helper);
  const count = (k: Tab) => mine.filter((r) => tabOf(r) === k).length;
  const list = mine.filter((r) => tabOf(r) === tab);
  const options: { value: Tab; label: string; count?: number }[] = [
    { value: "new", label: "Новые", count: count("new") },
    { value: "today", label: "Сегодня", count: count("today") },
    { value: "soon", label: "Скоро", count: count("soon") },
    { value: "done", label: "Выполненные" },
  ];

  return (
    <Screen brand title="Задания" onRefresh={reload} refreshing={refreshing}>
      {user?.available !== null && user?.available !== undefined ? (
        <ToggleRow
          label="Принимаю заказы"
          hint={user.available ? "Владелец видит, что вы свободны для новых заданий" : "Новые задания вам сейчас не предлагают"}
          value={user.available}
          onChange={(v) => void setAvailable(v)}
        />
      ) : null}
      {availabilityError ? <ErrorBox text={availabilityError} /> : null}
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
          amount={r.helper ? `Помощник · старший ${r.assignedTo?.name ?? ""}` : r.pay === null ? "Сумма уточняется" : `Вам ${formatRub(r.pay)}`}
          onPress={() => router.push(`/request/${r.id}`)}
        />
      ))}
    </Screen>
  );
}
