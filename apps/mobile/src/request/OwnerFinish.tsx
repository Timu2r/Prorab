import { formatRub, INVOICE_STATUS_LABELS, PAYOUT_KIND_LABELS, PAYOUT_METHOD_LABELS, UNIT_LABELS, type InvoiceKind, type PayoutMethod } from "@ks/core";
import { Camera, CircleCheck, Lock, ReceiptText, Wallet } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { api, ApiError, errorText } from "../api";
import { formatDate } from "../format";
import { shootAndUpload } from "../photo";
import { useTheme } from "../theme";
import type { Invoice, OwnerRequestDetail, Payout } from "../types";
import { Button, Card, Chip, confirm, Field, KV, Pill, Section, type Tone } from "../ui";
import { OwnerPurchases, parseRub, Thumbs } from "./WorkBlock";

/**
 * Конец заказа у владельца (docs/TZ.md, 16.9): счета при встрече, работа мастера, приёмка, закрытие и выплата.
 * Порядок владельца: выезд → договор и аванс лично → мастер → покупки → «Готово» → приёмка → расчёт → выплата.
 */

type Changed = () => Promise<void> | void;

function useRun() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

const KIND_TITLES: [InvoiceKind, string][] = [
  ["materials", "Аванс на материалы"],
  ["works", "Работы"],
  ["full", "Всё одним счётом"],
];
const INVOICE_TONE: Record<Invoice["status"], Tone> = { draft: "neutral", sent: "accent", paid: "success", cancelled: "neutral", refunded: "danger" };

/** Счета выставляются при встрече (решение владельца 2026-09-27): клиент платит на счёт ИП по QR или ссылке банка. */
export function InvoicesBlock({ r, onChanged }: { r: OwnerRequestDetail; onChanged: Changed }) {
  const t = useTheme();
  const { busy, error, run } = useRun();
  const [kind, setKind] = useState<InvoiceKind | null>(null);
  const [amount, setAmount] = useState("");
  const approved = r.estimates.find((e) => e.status === "approved");
  if (!approved) return null;
  const final = r.status === "closed" || r.status === "cancelled";
  const byKind = (k: InvoiceKind) => (k === "materials" ? approved.totals.goods : k === "works" ? approved.totals.work : approved.totals.total);
  const live = r.invoices.filter((i) => i.status !== "cancelled");

  const pick = (k: InvoiceKind) => {
    setKind(k);
    setAmount(String(byKind(k) / 100).replace(".", ","));
  };
  const issue = () =>
    run("issue", async () => {
      const sum = parseRub(amount);
      if (sum === null) throw new ApiError(0, "input", "Укажите сумму");
      const inv = await api<{ invoice: Invoice }>("POST", `/requests/${r.id}/invoices`, { kind, amount: sum });
      await api("POST", `/invoices/${inv.invoice.id}/send`);
      setKind(null);
      await onChanged();
    });

  return (
    <Section title="Счета">
      <Card style={{ gap: 10 }}>
        {live.length ? (
          live.map((i) => (
            <View key={i.id} style={{ gap: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: t.line }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ReceiptText size={20} color={t.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>
                    {KIND_TITLES.find(([k]) => k === i.kind)?.[1] ?? "Прочее"} — {formatRub(i.amount)}
                  </Text>
                  <Text style={{ color: t.muted, fontSize: 13 }}>
                    № {i.number}
                    {i.paidAt ? ` · оплачен ${formatDate(i.paidAt)}` : ""}
                  </Text>
                </View>
                <Pill text={i.status === "sent" ? "Оплата при встрече" : INVOICE_STATUS_LABELS[i.status]} tone={INVOICE_TONE[i.status]} />
              </View>
              {i.status === "sent" && !final ? (
                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <Button
                    small
                    icon={CircleCheck}
                    title="Оплачен"
                    loading={busy === `paid-${i.id}`}
                    onPress={async () => {
                      if (!(await confirm("Клиент оплатил?", `${formatRub(i.amount)} поступили на счёт ИП. Банк пришлёт клиенту чек.`, "Оплачен"))) return;
                      await run(`paid-${i.id}`, async () => {
                        await api("POST", `/invoices/${i.id}/paid`, {});
                        await onChanged();
                      });
                    }}
                  />
                  <Button
                    small
                    variant="ghost"
                    title="Отменить"
                    loading={busy === `cancel-${i.id}`}
                    onPress={async () => {
                      if (!(await confirm("Отменить счёт?", "Клиент перестанет видеть его в «Мои заказы».", "Отменить счёт"))) return;
                      await run(`cancel-${i.id}`, async () => {
                        await api("POST", `/invoices/${i.id}/cancel`);
                        await onChanged();
                      });
                    }}
                  />
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
            Счёт выставляете при встрече: клиент платит на счёт ИП по QR или ссылке банка, чек пришлёт банк. В «Мои заказы» он видит сумму и «оплата при встрече».
          </Text>
        )}
        {!final && !kind ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {KIND_TITLES.map(([k, title]) => (
              <Chip key={k} label={title} on={false} onPress={() => pick(k)} />
            ))}
          </View>
        ) : null}
        {kind ? (
          <View style={{ gap: 10 }}>
            <Field label={`${KIND_TITLES.find(([k]) => k === kind)![1]}, ₽`} value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d,.]/g, ""))} keyboardType="decimal-pad" hint="Сумма из сметы — можно поправить, например аванс 50%" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title="Выставить счёт" loading={busy === "issue"} onPress={issue} />
              </View>
              <Button title="Отмена" variant="ghost" onPress={() => setKind(null)} />
            </View>
          </View>
        ) : null}
        {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
      </Card>
    </Section>
  );
}

/** Что мастер сделал на объекте: фото, расход материалов, доп. работы, покупки. */
export function WorkReport({ r, onChanged }: { r: OwnerRequestDetail; onChanged: Changed }) {
  const t = useTheme();
  const before = r.files.filter((f) => f.kind === "before");
  const after = r.files.filter((f) => f.kind === "after");
  const approved = r.estimates.find((e) => e.status === "approved");
  const materials = (approved?.items ?? []).filter((i) => i.kind !== "work");
  const started = ["on_site", "done", "act_signed", "paid", "closed"].includes(r.status);
  if (!started && !r.purchases.length) return null;
  return (
    <>
      {started ? (
        <Section title="Работа мастера">
          <Card style={{ gap: 12 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>Фото до</Text>
              {before.length ? <Thumbs files={before} size={72} /> : <Text style={{ color: t.muted, fontSize: 14 }}>Пока нет</Text>}
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>Фото после</Text>
              {after.length ? <Thumbs files={after} size={72} /> : <Text style={{ color: t.muted, fontSize: 14 }}>Пока нет</Text>}
            </View>
            {materials.length ? (
              <View style={{ gap: 4 }}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>Материалы: план и факт</Text>
                {materials.map((m) => (
                  <KV
                    key={m.id}
                    label={m.name}
                    value={`${String(m.qty).replace(".", ",")} → ${m.usedQty === null ? "—" : String(m.usedQty).replace(".", ",")} ${UNIT_LABELS[m.unit]}`}
                  />
                ))}
              </View>
            ) : null}
            {r.extraWork.map((e, i) => (
              <View key={i} style={{ gap: 6, padding: 10, borderRadius: 10, backgroundColor: t.accentSoft }}>
                <Text style={{ color: t.accent, fontSize: 13, fontWeight: "800" }}>Доп. работы от мастера</Text>
                <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>{e.text}</Text>
                <Thumbs files={e.files} size={64} />
                <Text style={{ color: t.muted, fontSize: 13 }}>Сделайте новую версию сметы — клиент согласует её в «Мои заказы».</Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
      <OwnerPurchases purchases={r.purchases} onChanged={onChanged} />
    </>
  );
}

/** Приёмка: клиент принимает в «Мои заказы» по коду; на встрече — фото подписанного бумажного акта. */
export function AcceptanceBlock({ r, onChanged }: { r: OwnerRequestDetail; onChanged: Changed }) {
  const t = useTheme();
  const { busy, error, run } = useRun();
  if (r.status !== "done" && !r.acts.length) return null;
  return (
    <Section title="Приёмка">
      <Card style={{ gap: 10 }}>
        {r.acts.map((a, i) => (
          <View key={i} style={{ gap: 4 }}>
            <Text style={{ color: a.accepted ? t.success : t.danger, fontSize: 15, fontWeight: "700" }}>
              {a.accepted ? "Работа принята" : "Замечания клиента"} · {formatDate(a.signedAt)} · {a.method === "app" ? "в «Мои заказы»" : "бумажный акт"}
            </Text>
            {a.remarks ? <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>{a.remarks}</Text> : null}
            {a.fileUrl ? <Thumbs files={[{ id: `act-${i}`, url: a.fileUrl }]} size={64} /> : null}
          </View>
        ))}
        {r.status === "done" ? (
          <>
            <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
              Клиент видит фото до и после и может принять работу в «Мои заказы». Принимаете на встрече — снимите подписанный акт.
            </Text>
            <Button
              icon={Camera}
              variant="outline"
              title="Снять подписанный акт"
              loading={busy === "act"}
              onPress={() =>
                run("act", async () => {
                  const f = await shootAndUpload(`/requests/${r.id}/files?kind=act_paper`);
                  if (!f) return;
                  await api("POST", `/requests/${r.id}/act-paper`, { fileId: f.id });
                  await onChanged();
                })
              }
            />
          </>
        ) : null}
        {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
      </Card>
    </Section>
  );
}

/** Закрытие: когда всё оплачено. Начисляется выплата мастеру и начинается гарантия. */
export function CloseBlock({ r, onChanged }: { r: OwnerRequestDetail; onChanged: Changed }) {
  const t = useTheme();
  const { busy, error, run } = useRun();
  const hasWorks = r.invoices.some((i) => (i.kind === "works" || i.kind === "full") && i.status !== "cancelled");
  if (r.status === "act_signed" && !hasWorks)
    return (
      <Card style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <ReceiptText size={20} color={t.accent} />
        <Text style={{ flex: 1, color: t.text, fontSize: 15, lineHeight: 21 }}>Работа принята. Выставьте счёт на работы при встрече — после оплаты заявку можно закрыть.</Text>
      </Card>
    );
  if (r.status !== "paid") return null;
  return (
    <View style={{ gap: 8 }}>
      <Button
        icon={Lock}
        title="Закрыть заявку"
        loading={busy === "close"}
        onPress={async () => {
          if (!(await confirm("Закрыть заявку?", "Начислится выплата мастеру, начнётся гарантия 12 месяцев.", "Закрыть"))) return;
          await run("close", async () => {
            await api("POST", `/requests/${r.id}/status`, { to: "closed" });
            await onChanged();
          });
        }}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
    </View>
  );
}

/** Выплаты мастеру по заявке и деньги заказа: выручка, расходы, налог, заработок. */
export function PayoutsBlock({ r, onChanged }: { r: OwnerRequestDetail; onChanged: Changed }) {
  const t = useTheme();
  const { busy, error, run } = useRun();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  if (!r.payouts.length && r.money.revenue === 0) return null;
  const pay = async (p: Payout, method: PayoutMethod) => {
    if (!(await confirm("Выплатили мастеру?", `${formatRub(p.amount)} — ${PAYOUT_METHOD_LABELS[method].toLowerCase()}.`, "Выплачено"))) return;
    await run(`pay-${p.id}`, async () => {
      await api("POST", `/payouts/${p.id}/paid`, { method });
      await onChanged();
    });
  };
  return (
    <Section title="Деньги по заказу">
      <Card style={{ gap: 10 }}>
        <KV label="Получено от клиента" value={formatRub(r.money.revenue)} />
        <KV label="Материалы по закупке" value={formatRub(r.money.goodsCost)} />
        <KV label="Мастеру" value={formatRub(r.money.payouts)} />
        <KV label="Налог" value={formatRub(r.money.tax)} />
        <KV label="Заработок" value={formatRub(r.money.profit)} strong />
        {r.payouts.map((p) => (
          <View key={p.id} style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.line }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Wallet size={20} color={t.muted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>
                  {p.master.name} · {PAYOUT_KIND_LABELS[p.kind]}
                </Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{p.needsAmount ? "Сумму нужно указать" : formatRub(p.amount)}</Text>
              </View>
              <Pill text={p.status === "paid" ? "Выплачено" : p.status === "cancelled" ? "Отменено" : "К выплате"} tone={p.status === "paid" ? "success" : p.status === "cancelled" ? "neutral" : "accent"} />
            </View>
            {p.status === "accrued" && p.needsAmount ? (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Field label="Сумма мастеру, ₽" value={amounts[p.id] ?? ""} onChangeText={(v) => setAmounts({ ...amounts, [p.id]: v.replace(/[^\d,.]/g, "") })} keyboardType="decimal-pad" />
                </View>
                <Button
                  small
                  title="Сохранить"
                  loading={busy === `amount-${p.id}`}
                  onPress={() =>
                    run(`amount-${p.id}`, async () => {
                      const sum = parseRub(amounts[p.id] ?? "");
                      if (sum === null) throw new ApiError(0, "input", "Укажите сумму");
                      await api("PATCH", `/payouts/${p.id}`, { amount: sum });
                      await onChanged();
                    })
                  }
                />
              </View>
            ) : null}
            {p.status === "accrued" && !p.needsAmount ? (
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Button small title="Выплатил со счёта ИП" loading={busy === `pay-${p.id}`} onPress={() => pay(p, "bank")} />
                <Button small variant="outline" title="С личной карты" onPress={() => pay(p, "personal")} />
              </View>
            ) : null}
          </View>
        ))}
        {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
      </Card>
    </Section>
  );
}
