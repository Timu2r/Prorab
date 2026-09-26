import { CATEGORY_LABELS } from "@ks/core";
import { Users } from "lucide-react-native";
import { Text, View } from "react-native";
import { RequestRow } from "../../src/RequestRow";
import { useTheme } from "../../src/theme";
import type { MasterRequestItem, TeamMember } from "../../src/types";
import { Card, Empty, ErrorBox, KV, Loading, Pill, Screen, Section } from "../../src/ui";
import { useApi } from "../../src/useApi";

/** Команда бригадира: мастера и их загрузка, задания команды. Передача задания мастеру — этап D. */
export default function MasterTeam() {
  const t = useTheme();
  const team = useApi<{ team: TeamMember[] }>("/team");
  const jobs = useApi<{ requests: MasterRequestItem[] }>("/requests");
  const teamJobs = (jobs.data?.requests ?? []).filter((r) => !r.mine);
  const reload = () => {
    void team.reload();
    void jobs.reload();
  };

  return (
    <Screen title="Команда" onRefresh={reload} refreshing={team.refreshing || jobs.refreshing}>
      {team.loading && !team.data ? <Loading /> : null}
      {team.error ? <ErrorBox text={team.error} onRetry={reload} /> : null}
      {team.data ? (
        <Section title="Мастера">
          {team.data.team.map((m) => (
            <Card key={m.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: "800" }}>{m.name}</Text>
                {m.isLead ? <Pill text="Бригадир" tone="info" /> : null}
              </View>
              <Text style={{ color: t.muted, fontSize: 14 }}>{m.skills.map((s) => CATEGORY_LABELS[s]).join(", ")}</Text>
              <KV label="Заданий в работе" value={String(m.activeJobs)} />
              <KV label="Визитов на неделе" value={String(m.weekVisits)} />
            </Card>
          ))}
        </Section>
      ) : null}
      <Section title="Задания команды">
        {jobs.data && teamJobs.length === 0 ? <Empty icon={Users} title="У мастеров команды нет заданий" /> : null}
        {teamJobs.map((r) => (
          <RequestRow
            key={r.id}
            number={r.number}
            category={r.category}
            status={r.status}
            line={`Мастер: ${r.assignedTo?.name ?? "—"}${r.district ? ` · ${r.district}` : ""}`}
            visitAt={r.visitAt}
            visitUntil={r.visitUntil}
          />
        ))}
      </Section>
    </Screen>
  );
}
