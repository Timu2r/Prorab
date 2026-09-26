import {
  ESTIMATE_STATUS_LABELS,
  estimateTotals,
  formatRub,
  ITEM_KIND_LABELS,
  UNIT_LABELS,
  type EstimateStatus,
  type ItemKind,
  type RequestStatus,
  type Unit,
} from "@ks/core";
import { Check, Copy, MessageCircle, PencilLine, Plus, Search, Send, Trash2, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, errorText, siteUrl } from "../api";
import { useTheme } from "../theme";
import type { CatalogItem, Estimate } from "../types";
import { Button, Card, confirm, Empty, Pill, Section, Segmented, type Tone } from "../ui";

/** Строка черновика: количество и цена — как их вводит человек (строкой), в рублях. */
type Row = { key: string; kind: ItemKind; serviceId: string | null; name: string; unit: Unit; qty: string; price: string; cost: number | null };

const toRow = (i: Estimate["items"][number], n: number): Row => ({
  key: `${i.id}-${n}`,
  kind: i.kind,
  serviceId: i.serviceId,
  name: i.name,
  unit: i.unit,
  qty: String(i.qty).replace(".", ","),
  price: String(i.price / 100).replace(".", ","),
  cost: i.cost ?? null,
});
const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
const rowOk = (r: Row) => r.name.trim().length > 0 && num(r.qty) > 0 && num(r.price) >= 0 && Number.isFinite(num(r.price));

const TONE: Record<EstimateStatus, Tone> = { draft: "neutral", sent: "info", approved: "success", rejected: "danger", superseded: "neutral" };
const KINDS: ItemKind[] = ["work", "material", "equipment"];

/**
 * Смета в карточке владельца (docs/KALKULYATOR.md, раздел 5): черновик правится прямо здесь, дальше —
 * «Отправить клиенту» (ссылка в WhatsApp или копией) или «Клиент согласен» по телефону.
 */
export function EstimateBlock({
  requestId,
  number,
  status,
  client,
  estimates,
  onChanged,
}: {
  requestId: string;
  number: string;
  status: RequestStatus;
  client: { name: string; phone: string };
  estimates: Estimate[];
  onChanged: () => Promise<void> | void;
}) {
  const t = useTheme();
  const est = estimates.at(-1) ?? null;
  const final = status === "closed" || status === "cancelled";
  const [rows, setRows] = useState<Row[]>(() => (est ? est.items.map(toRow) : []));
  const [rowsFor, setRowsFor] = useState(est?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [shared, setShared] = useState(false);

  // Пришла другая версия сметы — черновик на экране заменяется ею
  if (est && est.id !== rowsFor) {
    setRowsFor(est.id);
    setRows(est.items.map(toRow));
    setDirty(false);
  }

  const draft = est?.status === "draft";
  const live = useMemo(
    () =>
      draft
        ? estimateTotals(
            rows.filter(rowOk).map((r) => ({ kind: r.kind, qty: num(r.qty), price: Math.round(num(r.price) * 100), cost: r.cost })),
            est!.reservePercent,
          )
        : est?.totals,
    [draft, rows, est],
  );

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const bad = rows.find((r) => !rowOk(r));
    if (bad) throw new Error(`Проверьте строку «${bad.name || "без названия"}»: нужно название, количество больше нуля и цена`);
    await api("PUT", `/estimates/${est!.id}/items`, {
      items: rows.map((r) => ({
        kind: r.kind,
        serviceId: r.serviceId,
        name: r.name.trim(),
        unit: r.unit,
        qty: Math.round(num(r.qty) * 1000) / 1000,
        price: Math.round(num(r.price) * 100),
        cost: r.kind === "work" ? null : r.cost,
      })),
    });
    setDirty(false);
  };

  const link = siteUrl(`/cabinet/z/${requestId}`);
  const text = `Здравствуйте${client.name ? `, ${client.name}` : ""}! Смета по заявке ${number} готова: ${formatRub(live?.total ?? 0)}. Посмотреть и согласовать: ${link}`;
  const whatsapp = () => Linking.openURL(`https://wa.me/${client.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`);
  const copy = async () => {
    if (Platform.OS === "web") {
      await (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator?.clipboard?.writeText(text);
      setMessage({ ok: true, text: "Текст со ссылкой скопирован — вставьте его в мессенджер или SMS" });
    } else await Share.share({ message: text });
  };

  const update = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  if (!est)
    return (
      <Section title="Смета">
        <Empty icon={PencilLine} title="Сметы пока нет" text="Создайте смету: строки из прайса или свои" />
        {!final ? (
          <Button title="Создать смету" icon={Plus} loading={busy === "create"} onPress={() =>
              run("create", async () => {
                await api("POST", `/requests/${requestId}/estimates`);
                await onChanged();
              })
            }
          />
        ) : null}
        {message ? <Text style={{ color: message.ok ? t.success : t.danger, fontSize: 14 }}>{message.text}</Text> : null}
      </Section>
    );

  return (
    <Section title={`Смета · версия ${est.version}`} right={<Pill text={ESTIMATE_STATUS_LABELS[est.status]} tone={TONE[est.status]} />}>
      {est.note ? <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>{est.note}</Text> : null}
      {est.status === "rejected" && est.rejectReason ? (
        <Card style={{ borderColor: t.danger }}>
          <Text style={{ color: t.danger, fontSize: 14 }}>Клиент отклонил: {est.rejectReason}</Text>
        </Card>
      ) : null}

      {KINDS.map((k) => {
        const list = draft ? rows.filter((r) => r.kind === k) : est.items.filter((i) => i.kind === k);
        if (!list.length) return null;
        return (
          <Card key={k} style={{ gap: 0, padding: 0 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line }}>
              <Text style={{ color: t.text, fontWeight: "800", fontSize: 15 }}>{k === "work" ? "Работы" : k === "material" ? "Материалы" : "Оборудование"}</Text>
              <Text style={{ color: t.text, fontWeight: "800", fontSize: 15 }}>{formatRub(k === "work" ? live!.work : k === "material" ? live!.materials : live!.equipment)}</Text>
            </View>
            {draft
              ? (list as Row[]).map((r) => (
                  <EditRow
                    key={r.key}
                    r={r}
                    onChange={(p) => update(r.key, p)}
                    onRemove={() => {
                      setRows((rs) => rs.filter((x) => x.key !== r.key));
                      setDirty(true);
                    }}
                  />
                ))
              : (list as Estimate["items"]).map((i) => (
                  <View key={i.id} style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line, gap: 2 }}>
                    <Text style={{ color: t.text, fontSize: 15 }}>{i.name}</Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: t.muted, fontSize: 13 }}>
                        {String(i.qty).replace(".", ",")} {UNIT_LABELS[i.unit]} × {formatRub(i.price)}
                      </Text>
                      <Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>{formatRub(Math.round(i.qty * i.price))}</Text>
                    </View>
                  </View>
                ))}
          </Card>
        );
      })}

      {draft ? (
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Button small variant="outline" icon={Search} title="Из прайса" onPress={() => setPicker(true)} />
          <Button
            small
            variant="outline"
            icon={Plus}
            title="Своя строка"
            onPress={() => {
              setRows((rs) => [...rs, { key: `new-${Date.now()}`, kind: "work", serviceId: null, name: "", unit: "pcs", qty: "1", price: "0", cost: null }]);
              setDirty(true);
            }}
          />
        </View>
      ) : null}

      <Card dark style={{ gap: 6 }}>
        <Line label="Работы" value={formatRub(live!.work)} />
        <Line label="Материалы и оборудование" value={formatRub(live!.goods)} />
        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 4 }} />
        <Line label="Итого для клиента" value={formatRub(live!.total)} strong />
        {live!.reserve ? <Line label={`Резерв ${est.reservePercent}% (отдельно)`} value={formatRub(live!.reserve)} /> : null}
        {live!.cost ? <Line label="Закупка материалов" value={formatRub(live!.cost)} /> : null}
      </Card>

      {message ? <Text style={{ color: message.ok ? t.success : t.danger, fontSize: 14 }}>{message.text}</Text> : null}

      {!final && draft ? (
        <View style={{ gap: 10 }}>
          {dirty ? <Button title="Сохранить смету" icon={Check} variant="outline" loading={busy === "save"} onPress={() =>
                run("save", async () => {
                  await save();
                  await onChanged();
                })
              }
            /> : null}
          <Button
            title="Отправить клиенту"
            icon={Send}
            loading={busy === "send"}
            onPress={() =>
              run("send", async () => {
                if (dirty) await save();
                await api("POST", `/estimates/${est.id}/send`);
                setShared(true);
                await onChanged();
              })
            }
          />
          <Button title="Клиент согласен по телефону" icon={Check} variant="outline" loading={busy === "approve"} onPress={() => run("approve", approve)} />
        </View>
      ) : null}

      {!final && est.status === "sent" ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
            Смета у клиента в личном кабинете. Договор заключится, когда он нажмёт «Согласен». Если клиент согласился по телефону — отметьте это.
          </Text>
          <ShareRow onWhatsApp={whatsapp} onCopy={() => run("copy", copy)} highlight={shared} />
          <Button title="Клиент согласен по телефону" icon={Check} loading={busy === "approve"} onPress={() => run("approve", approve)} />
          <Button title="Изменить смету" icon={PencilLine} variant="ghost" loading={busy === "version"} onPress={() => run("version", newVersion)} />
        </View>
      ) : null}

      {!final && (est.status === "approved" || est.status === "rejected" || est.status === "superseded") ? (
        <Button title="Изменить смету (новая версия)" icon={PencilLine} variant="outline" loading={busy === "version"} onPress={() => run("version", newVersion)} />
      ) : null}

      <CatalogPicker
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(i) => {
          setRows((rs) => [
            ...rs,
            { key: `svc-${i.id}-${Date.now()}`, kind: i.kind, serviceId: i.id, name: i.name, unit: i.unit, qty: "1", price: String((i.price ?? 0) / 100).replace(".", ","), cost: i.cost },
          ]);
          setDirty(true);
          setPicker(false);
        }}
      />
    </Section>
  );

  async function approve() {
    const ok = await confirm(
      "Клиент согласен?",
      `Смета на ${formatRub(live?.total ?? 0)} будет согласована, а договор с клиентом — заключён «по телефону». Клиент увидит копию договора в личном кабинете.`,
      "Согласовать",
    );
    if (!ok) return;
    if (dirty) await save();
    await api("POST", `/estimates/${est!.id}/approve`, {});
    await onChanged();
  }

  async function newVersion() {
    await api("POST", `/requests/${requestId}/estimates`);
    await onChanged();
  }
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: strong ? t.graphiteText : t.graphiteMuted, fontSize: strong ? 17 : 14, fontWeight: strong ? "800" : "600" }}>{label}</Text>
      <Text style={{ color: t.graphiteText, fontSize: strong ? 19 : 15, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function ShareRow({ onWhatsApp, onCopy, highlight }: { onWhatsApp: () => void; onCopy: () => void; highlight: boolean }) {
  const t = useTheme();
  return (
    <Card style={{ gap: 10, borderColor: highlight ? t.accent : t.line }}>
      <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>{highlight ? "Смета отправлена — пришлите клиенту ссылку" : "Ссылка на смету для клиента"}</Text>
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Button small title="WhatsApp" icon={MessageCircle} onPress={onWhatsApp} />
        <Button small variant="outline" title={Platform.OS === "web" ? "Скопировать" : "Поделиться"} icon={Copy} onPress={onCopy} />
      </View>
    </Card>
  );
}

function EditRow({ r, onChange, onRemove }: { r: Row; onChange: (p: Partial<Row>) => void; onRemove: () => void }) {
  const t = useTheme();
  const input = { borderWidth: 1, borderColor: t.line, borderRadius: 8, paddingHorizontal: 10, minHeight: 40, color: t.text, backgroundColor: t.bg, fontSize: 15 } as const;
  const total = rowOk(r) ? formatRub(Math.round(num(r.qty) * num(r.price) * 100)) : "—";
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        {r.serviceId ? (
          <Text style={{ flex: 1, color: t.text, fontSize: 15 }}>{r.name}</Text>
        ) : (
          <TextInput value={r.name} onChangeText={(v) => onChange({ name: v })} placeholder="Название строки" placeholderTextColor={t.muted} style={[input, { flex: 1 }]} maxLength={200} />
        )}
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Удалить строку ${r.name}`} hitSlop={8} style={{ padding: 6 }}>
          <Trash2 size={18} color={t.danger} />
        </Pressable>
      </View>
      {!r.serviceId ? (
        <Segmented value={r.kind} options={KINDS.map((k) => ({ value: k, label: ITEM_KIND_LABELS[k] }))} onChange={(k) => onChange({ kind: k })} />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <TextInput value={r.qty} onChangeText={(v) => onChange({ qty: v.replace(/[^\d.,]/g, "") })} keyboardType="decimal-pad" style={[input, { width: 76, textAlign: "right" }]} accessibilityLabel="Количество" />
        <Text style={{ color: t.muted, fontSize: 14 }}>{UNIT_LABELS[r.unit]} ×</Text>
        <TextInput value={r.price} onChangeText={(v) => onChange({ price: v.replace(/[^\d.,]/g, "") })} keyboardType="decimal-pad" style={[input, { width: 104, textAlign: "right" }]} accessibilityLabel="Цена за единицу, рублей" />
        <Text style={{ color: t.muted, fontSize: 14 }}>₽</Text>
        <Text style={{ flex: 1, textAlign: "right", color: t.text, fontWeight: "700", fontSize: 15 }}>{total}</Text>
      </View>
    </View>
  );
}

/** Выбор позиции из прайса: поиск по названию, сначала работы, потом материалы и оборудование. */
function CatalogPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (i: CatalogItem) => void }) {
  const t = useTheme();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!visible || items !== null) return;
    api<{ services: CatalogItem[] }>("GET", "/admin/services")
      .then((r) => setItems(r.services.filter((s) => s.active)))
      .catch((e) => setError(errorText(e)));
  }, [visible, items]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = (items ?? []).filter((i) => words.every((w) => i.name.toLowerCase().includes(w))).slice(0, 80);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Поиск: медь, монтаж, розетка"
            placeholderTextColor={t.muted}
            autoFocus
            style={{ flex: 1, minHeight: 46, borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, color: t.text, backgroundColor: t.surface, fontSize: 16 }}
          />
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8} style={{ padding: 6 }}>
            <X size={22} color={t.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8, width: "100%", maxWidth: 760, alignSelf: "center" }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
          {items === null && !error ? <Text style={{ color: t.muted }}>Загрузка прайса…</Text> : null}
          {found.map((i) => (
            <Card key={i.id} onPress={() => onPick(i)} style={{ gap: 2 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>{i.name}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>
                {ITEM_KIND_LABELS[i.kind]} · {i.price === null ? "цена не задана" : `${formatRub(i.price)} за ${UNIT_LABELS[i.unit]}`}
              </Text>
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
