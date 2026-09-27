import {
  CALCULATORS,
  CATEGORY_LABELS,
  CONTRACT_METHOD_LABELS,
  describeAnswers,
  formatPhone,
  formatRub,
  SLOT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  type RequestSource,
  type RequestStatus,
} from "@ks/core";
import { router } from "expo-router";
import { Calculator, CalendarHeart, FileSignature, MapPin, MessageCircle, Phone, PhoneCall } from "lucide-react-native";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { fileUrl } from "../api";
import { ago, formatDate, formatTime } from "../format";
import { useTheme } from "../theme";
import type { CalcSnapshot, Contract, OwnerRequestDetail, RequestEvent } from "../types";
import { Button, Card, ErrorBox, Loading, Pill, Screen, Section, statusTone } from "../ui";
import { useApi } from "../useApi";
import { AssignPanel } from "./AssignPanel";
import { EstimateBlock } from "./EstimateBlock";
import { VisitPicker } from "./VisitPicker";

/** Карточка заявки владельца (docs/KALKULYATOR.md, раздел 5): звонок → смета → договор → визит → мастер. */
export function OwnerRequest({ id }: { id: string }) {
  const t = useTheme();
  const { data, error, loading, refreshing, reload } = useApi<{ request: OwnerRequestDetail }>(`/requests/${id}`);
  const r = data?.request;

  return (
    <Screen
      back
      title={r ? r.number : "Заявка"}
      subtitle={r ? `${CATEGORY_LABELS[r.category]} · ${SOURCE_LABELS[r.source as RequestSource] ?? r.source} · ${ago(r.createdAt)}` : undefined}
      right={r ? <Pill text={STATUS_LABELS[r.status]} tone={statusTone(r.status)} /> : undefined}
      onRefresh={reload}
      refreshing={refreshing}
    >
      {loading && !r ? <Loading /> : null}
      {error ? <ErrorBox text={error} onRetry={reload} /> : null}
      {r ? (
        <>
          <ClientCard r={r} />
          {r.leadType === "consult" ? <ConsultCard r={r} /> : null}
          {r.calc ? <CalcCard calc={r.calc} comment={r.description.split("Расчёт на сайте:")[0]!.trim()} /> : null}
          <WishesCard r={r} />
          {!r.calc && r.leadType !== "consult" && r.description ? (
            <Section title="Задача">
              <Card>
                <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>{r.description}</Text>
              </Card>
            </Section>
          ) : null}
          <EstimateBlock requestId={r.id} number={r.number} status={r.status} client={r.client} estimates={r.estimates} onChanged={reload} />
          <ContractCard requestId={r.id} contract={r.contract} />
          <VisitPicker requestId={r.id} visitAt={r.visitAt} visitUntil={r.visitUntil} onChanged={reload} />
          <AssignPanel requestId={r.id} category={r.category} status={r.status} master={r.master} onChanged={reload} />
          <History events={r.events} />
        </>
      ) : null}
    </Screen>
  );
}

function ClientCard({ r }: { r: OwnerRequestDetail }) {
  const t = useTheme();
  const digits = r.client.phone.replace(/\D/g, "");
  const place = [r.address, r.apartment && `кв. ${r.apartment}`, r.entrance && `подъезд ${r.entrance}`, r.floor && `этаж ${r.floor}`, r.intercom && `домофон ${r.intercom}`]
    .filter(Boolean)
    .join(", ");
  return (
    <Section title="Клиент">
      <Card style={{ gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: "800" }}>{r.client.name || "Без имени"}</Text>
          <Text style={{ color: t.muted, fontSize: 15 }}>{formatPhone(r.client.phone)}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Button small icon={Phone} title="Позвонить" onPress={() => void Linking.openURL(`tel:${r.client.phone}`)} />
          <Button small variant="outline" icon={MessageCircle} title="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/${digits}`)} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
          <MapPin size={18} color={place ? t.accent : t.muted} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, color: place ? t.text : t.muted, fontSize: 15, lineHeight: 21 }}>{place || "Адрес не указан — уточните при звонке"}</Text>
        </View>
      </Card>
    </Section>
  );
}

/** Консультация: клиент ничего не считал, просит перезвонить. */
function ConsultCard({ r }: { r: OwnerRequestDetail }) {
  const t = useTheme();
  return (
    <Section title="Консультация с сайта">
      <Card style={{ gap: 8, borderColor: t.accent }}>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <PhoneCall size={20} color={t.accent} />
          <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "700" }}>Клиент просит перезвонить и подсказать</Text>
        </View>
        {r.category !== "general" ? <Text style={{ color: t.muted, fontSize: 14 }}>Направление: {CATEGORY_LABELS[r.category]}</Text> : null}
        {r.description ? <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>{r.description}</Text> : null}
        <Text style={{ color: t.muted, fontSize: 13, lineHeight: 19 }}>После звонка создайте смету — дальше как обычно: отправить клиенту или «Клиент согласен».</Text>
      </Card>
    </Section>
  );
}

/** Пожелания подробной заявки: когда удобно и фото объекта. */
function WishesCard({ r }: { r: OwnerRequestDetail }) {
  const t = useTheme();
  const photos = r.files.filter((f) => f.kind === "client_photo");
  const when = r.wantedDate || r.wantedSlot ? [r.wantedDate ? formatDate(r.wantedDate) : "как можно скорее", r.wantedSlot ? SLOT_LABELS[r.wantedSlot].toLowerCase() : ""].filter(Boolean).join(", ") : null;
  if (!when && !photos.length) return null;
  return (
    <Section title="Пожелания клиента">
      <Card style={{ gap: 10 }}>
        {when ? (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <CalendarHeart size={20} color={t.accent} />
            <Text style={{ flex: 1, color: t.text, fontSize: 15 }}>Когда удобно: {when}</Text>
          </View>
        ) : null}
        {photos.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {photos.map((f, i) => (
              <Pressable key={f.id} onPress={() => void Linking.openURL(fileUrl(f.url))} accessibilityRole="imagebutton" accessibilityLabel={`Фото клиента ${i + 1}`}>
                <Image source={{ uri: fileUrl(f.url) }} style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: t.surface2 }} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>
    </Section>
  );
}

function CalcCard({ calc, comment }: { calc: CalcSnapshot; comment: string }) {
  const t = useTheme();
  const c = CALCULATORS[calc.id];
  return (
    <Section title="Расчёт клиента на сайте">
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Calculator size={20} color={t.accent} />
          <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "700" }}>{c?.title ?? calc.id}</Text>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: "800" }}>≈ {formatRub(calc.totals.total)}</Text>
        </View>
        {c
          ? describeAnswers(c, calc.answers).map((line) => (
              <Text key={line} style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
                · {line}
              </Text>
            ))
          : null}
        {calc.notes
          .filter((n) => n.tone === "warn")
          .map((n) => (
            <Text key={n.text} style={{ color: t.accent, fontSize: 13, lineHeight: 19 }}>
              {n.text}
            </Text>
          ))}
        {comment ? <Text style={{ color: t.text, fontSize: 14, lineHeight: 20 }}>Комментарий: {comment}</Text> : null}
        <Text style={{ color: t.muted, fontSize: 13, lineHeight: 19 }}>
          Клиент согласился с примерной ценой. Уточните детали по телефону и поправьте смету ниже — она собрана из этого расчёта.
        </Text>
      </Card>
    </Section>
  );
}

function ContractCard({ requestId, contract }: { requestId: string; contract: Contract | null }) {
  const t = useTheme();
  return (
    <Section title="Договор">
      {contract ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <FileSignature size={20} color={t.success} />
            <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "700" }}>Договор № {contract.number} заключён</Text>
          </View>
          <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
            {formatDate(contract.acceptedAt)} в {formatTime(contract.acceptedAt)} — {CONTRACT_METHOD_LABELS[contract.method]}.
          </Text>
          <Button small variant="outline" title="Открыть договор" onPress={() => router.push(`/contract/${requestId}`)} />
        </Card>
      ) : (
        <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
          Договор заключится сам, когда клиент согласует смету в личном кабинете или вы отметите «Клиент согласен по телефону».
        </Text>
      )}
    </Section>
  );
}

const EVENT_LABELS: Record<string, string> = {
  created: "Заявка создана",
  updated: "Изменены данные заявки",
  unassigned: "Мастер снят с задания",
  extra_work: "Мастер сообщил о доп. работах",
  materials_reported: "Мастер отметил расход материалов",
  file_added: "Добавлено фото",
  invoice_created: "Создан счёт",
  invoice_sent: "Счёт отправлен клиенту",
  invoice_paid: "Счёт оплачен",
  invoice_cancelled: "Счёт отменён",
  invoice_refunded: "Возврат по счёту",
  review: "Клиент оставил отзыв",
  payout_amount: "Указана сумма выплаты",
  payout_cancelled: "Выплата отменена",
  payout_manual: "Удержание или доплата мастеру",
  estimate_sent: "Смета отправлена клиенту",
  estimate_approved: "Смета согласована",
  estimate_rejected: "Клиент отклонил смету",
  contract: "Договор заключён",
  assigned: "Назначен мастер",
  reassigned: "Задание передано другому мастеру",
  declined: "Мастер отказался",
  act_signed: "Акт подписан",
  act_remarks: "Замечания к работе",
  payout_accrued: "Начислена выплата мастеру",
};

function History({ events }: { events: RequestEvent[] }) {
  const t = useTheme();
  if (!events.length) return null;
  const label = (e: RequestEvent) =>
    e.kind === "status" ? `Статус: ${STATUS_LABELS[e.payload.to as RequestStatus] ?? String(e.payload.to)}` : (EVENT_LABELS[e.kind] ?? e.kind);
  return (
    <Section title="История">
      <Card style={{ gap: 8 }}>
        {[...events].reverse().map((e, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 10 }}>
            <Text style={{ color: t.muted, fontSize: 13, width: 92 }}>
              {formatDate(e.at).slice(0, 5)} {formatTime(e.at)}
            </Text>
            <Text style={{ flex: 1, color: t.text, fontSize: 14 }}>
              {label(e)}
              {e.actorName ? <Text style={{ color: t.muted }}> · {e.actorName}</Text> : null}
            </Text>
          </View>
        ))}
      </Card>
    </Section>
  );
}
