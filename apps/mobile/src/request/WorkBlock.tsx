import { formatRub, PURCHASE_STATUS_LABELS, UNIT_LABELS } from "@ks/core";
import { Camera, MessageSquarePlus, Receipt, ShoppingCart } from "lucide-react-native";
import { useState } from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { api, errorText, fileUrl } from "../api";
import { shootAndUpload } from "../photo";
import { useTheme } from "../theme";
import type { FileView, Purchase } from "../types";
import { Button, Card, Field, Pill, Section, type Tone } from "../ui";

/**
 * Работа на объекте (docs/TZ.md, 16.9): фото до и после только с камеры, расход материалов сметы, покупки по ходу
 * работ и доп. работы. Мастер заполняет, владелец видит то же самое в карточке заявки.
 */

type Changed = () => Promise<void> | void;

/** «640» или «640,50» → копейки; пусто или не число — null. */
export function parseRub(v: string): number | null {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function Thumbs({ files, size = 88 }: { files: { id: string; url: string }[]; size?: number }) {
  const t = useTheme();
  if (!files.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {files.map((f, i) => (
        <Pressable key={f.id} onPress={() => void Linking.openURL(fileUrl(f.url))} accessibilityRole="imagebutton" accessibilityLabel={`Фото ${i + 1}`}>
          <Image source={{ uri: fileUrl(f.url) }} style={{ width: size, height: size, borderRadius: 10, backgroundColor: t.surface2 }} />
        </Pressable>
      ))}
    </View>
  );
}

/** Фото одного вида: миниатюры и «Снять» — сразу с камеры, без галереи. */
export function PhotoStrip({
  requestId,
  kind,
  title,
  hint,
  files,
  canAdd,
  onChanged,
}: {
  requestId: string;
  kind: "before" | "after";
  title: string;
  hint: string;
  files: FileView[];
  canAdd: boolean;
  onChanged: Changed;
}) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = files.filter((f) => f.kind === kind);
  const shoot = async () => {
    setBusy(true);
    setError("");
    try {
      if (await shootAndUpload(`/requests/${requestId}/files?kind=${kind}`)) await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={title} right={mine.length ? <Pill text={`${mine.length} фото`} tone="success" /> : undefined}>
      <Card style={{ gap: 10 }}>
        {mine.length ? <Thumbs files={mine} /> : <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>{hint}</Text>}
        {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
        {canAdd ? <Button title={mine.length ? "Снять ещё" : "Снять фото"} icon={Camera} variant={mine.length ? "outline" : "primary"} loading={busy} onPress={shoot} /> : null}
      </Card>
    </Section>
  );
}

/** Расход материалов сметы: без него «Готово» не нажать (правило 4). */
export function MaterialsUsage({
  requestId,
  materials,
  onChanged,
}: {
  requestId: string;
  materials: { id: string; name: string; unit: keyof typeof UNIT_LABELS; qty: number; usedQty: number | null }[];
  onChanged: Changed;
}) {
  const t = useTheme();
  const [used, setUsed] = useState<Record<string, string>>(() => Object.fromEntries(materials.map((m) => [m.id, m.usedQty === null ? "" : String(m.usedQty).replace(".", ",")])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!materials.length) return null;
  const done = materials.every((m) => m.usedQty !== null);
  const save = async () => {
    const items = materials
      .map((m) => ({ itemId: m.id, usedQty: Number((used[m.id] ?? "").replace(",", ".")) }))
      .filter((i, k) => (used[materials[k]!.id] ?? "").trim() !== "" && Number.isFinite(i.usedQty) && i.usedQty >= 0);
    if (!items.length) return setMessage("Впишите, сколько израсходовано");
    setBusy(true);
    setMessage("");
    try {
      await api("PATCH", `/requests/${requestId}/materials`, { items });
      await onChanged();
      setMessage("Сохранено");
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Материалы: сколько ушло" right={done ? <Pill text="Указано" tone="success" /> : <Pill text="Нужно указать" tone="accent" />}>
      <Card style={{ gap: 12 }}>
        {materials.map((m) => (
          <View key={m.id} style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>{m.name}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>
                По смете {String(m.qty).replace(".", ",")} {UNIT_LABELS[m.unit]}
              </Text>
            </View>
            <View style={{ width: 110 }}>
              <Field
                label={`Ушло, ${UNIT_LABELS[m.unit]}`}
                value={used[m.id] ?? ""}
                onChangeText={(v) => setUsed({ ...used, [m.id]: v.replace(/[^\d,.]/g, "") })}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>
          </View>
        ))}
        {message ? <Text style={{ color: message === "Сохранено" ? t.success : t.danger, fontSize: 14 }}>{message}</Text> : null}
        <Button title="Сохранить расход" variant="outline" loading={busy} onPress={save} />
      </Card>
    </Section>
  );
}

export const PURCHASE_TONE: Record<Purchase["status"], Tone> = { open: "accent", done: "success", approved: "success", rejected: "neutral" };

function PurchaseRow({ p, children }: { p: Purchase; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.line }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {p.kind === "need" ? <ShoppingCart size={18} color={t.muted} /> : <Receipt size={18} color={t.muted} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>{p.text}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>
            {p.kind === "need" ? "Нужно купить" : `Купил сам${p.amount !== null ? ` · ${formatRub(p.amount)}` : ""}`}
            {p.receiptUrl ? " · есть чек" : ""}
          </Text>
        </View>
        <Pill text={PURCHASE_STATUS_LABELS[p.status]} tone={PURCHASE_TONE[p.status]} />
      </View>
      {p.receiptUrl ? <Thumbs files={[{ id: p.id, url: p.receiptUrl }]} size={64} /> : null}
      {children}
    </View>
  );
}

/** Покупки мастера: «нужно купить» — прораб решит, «купил сам» — сумма и фото чека, прораб возместит. */
export function MasterPurchases({ requestId, purchases, canAdd, onChanged }: { requestId: string; purchases: Purchase[]; canAdd: boolean; onChanged: Changed }) {
  const t = useTheme();
  const [mode, setMode] = useState<"need" | "bought" | null>(null);
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reset = () => {
    setMode(null);
    setText("");
    setAmount("");
    setReceipt(null);
    setError("");
  };
  const run = async (name: string, fn: () => Promise<void>) => {
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
  const send = () => {
    const sum = parseRub(amount);
    if (mode === "bought" && sum === null) return setError("Укажите сумму по чеку");
    void run("send", async () => {
      await api("POST", `/requests/${requestId}/purchases`, { kind: mode, text, amount: mode === "bought" ? sum : null, fileId: receipt?.id ?? null });
      reset();
      await onChanged();
    });
  };

  return (
    <Section title="Покупки">
      <Card style={{ gap: 10 }}>
        {purchases.length ? (
          purchases.map((p) => <PurchaseRow key={p.id} p={p} />)
        ) : (
          <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>
            Не хватает материала — напишите прорабу «Нужно купить». Купили сами — укажите сумму и снимите чек: прораб возместит в выплате.
          </Text>
        )}
        {canAdd && !mode ? (
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Button small icon={ShoppingCart} title="Нужно купить" onPress={() => setMode("need")} />
            <Button small variant="outline" icon={Receipt} title="Купил сам" onPress={() => setMode("bought")} />
          </View>
        ) : null}
        {mode ? (
          <View style={{ gap: 10 }}>
            <Field
              label={mode === "need" ? "Что купить и сколько" : "Что купили"}
              value={text}
              onChangeText={setText}
              placeholder={mode === "need" ? "Например: кабель ВВГ 3×2,5 — 5 м" : "Например: дюбели и хомуты"}
              maxLength={500}
            />
            {mode === "bought" ? (
              <>
                <Field label="Сумма по чеку, ₽" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d,.]/g, ""))} keyboardType="decimal-pad" placeholder="640" />
                {receipt ? <Thumbs files={[receipt]} size={64} /> : null}
                <Button
                  small
                  variant="outline"
                  icon={Camera}
                  title={receipt ? "Переснять чек" : "Снять чек"}
                  loading={busy === "receipt"}
                  onPress={() =>
                    run("receipt", async () => {
                      const f = await shootAndUpload(`/requests/${requestId}/files?kind=receipt`);
                      if (f) setReceipt(f);
                    })
                  }
                />
              </>
            ) : null}
            {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title={mode === "need" ? "Отправить прорабу" : "Отправить на возмещение"} loading={busy === "send"} disabled={text.trim().length < 2} onPress={send} />
              </View>
              <Button title="Отмена" variant="ghost" onPress={reset} />
            </View>
          </View>
        ) : null}
      </Card>
    </Section>
  );
}

/** Покупки у владельца: «куплено», «возместить» с правкой суммы или «нет». */
export function OwnerPurchases({ purchases, onChanged }: { purchases: Purchase[]; onChanged: Changed }) {
  const t = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  if (!purchases.length) return null;
  const resolve = async (p: Purchase, status: "done" | "approved" | "rejected") => {
    setBusy(p.id + status);
    setError("");
    try {
      const fixed = amounts[p.id] !== undefined ? parseRub(amounts[p.id]!) : null;
      await api("POST", `/purchases/${p.id}/resolve`, { status, ...(status === "approved" && fixed !== null ? { amount: fixed } : {}) });
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section title="Покупки мастера">
      <Card style={{ gap: 6 }}>
        {purchases.map((p) => (
          <PurchaseRow key={p.id} p={p}>
            {p.status === "open" && p.kind === "need" ? (
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Button small title="Куплено" loading={busy === p.id + "done"} onPress={() => resolve(p, "done")} />
                <Button small variant="ghost" title="Не нужно" loading={busy === p.id + "rejected"} onPress={() => resolve(p, "rejected")} />
              </View>
            ) : null}
            {p.status === "open" && p.kind === "bought" ? (
              <View style={{ gap: 8 }}>
                <Field
                  label="Возместить, ₽"
                  value={amounts[p.id] ?? String((p.amount ?? 0) / 100).replace(".", ",")}
                  onChangeText={(v) => setAmounts({ ...amounts, [p.id]: v.replace(/[^\d,.]/g, "") })}
                  keyboardType="decimal-pad"
                  hint="Сумма уйдёт мастеру в выплату отдельной строкой"
                />
                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <Button small title="Возместить" loading={busy === p.id + "approved"} onPress={() => resolve(p, "approved")} />
                  <Button small variant="ghost" title="Не возмещать" loading={busy === p.id + "rejected"} onPress={() => resolve(p, "rejected")} />
                </View>
              </View>
            ) : null}
          </PurchaseRow>
        ))}
        {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
      </Card>
    </Section>
  );
}

/** Доп. работы: мастер пишет, что нашлось, и прикладывает фото; прораб делает новую версию сметы. */
export function ExtraWorkForm({ requestId, onChanged }: { requestId: string; onChanged: Changed }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const run = async (name: string, fn: () => Promise<void>) => {
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
  if (!open) return <Button title="Сообщить о доп. работах" icon={MessageSquarePlus} variant="outline" onPress={() => setOpen(true)} />;
  return (
    <Card style={{ gap: 10 }}>
      <Field label="Что нашлось и что нужно сделать" value={text} onChangeText={setText} multiline maxLength={2000} placeholder="Например: стена под трассу бетонная, нужно штробить 2 м" />
      <Thumbs files={photos} size={64} />
      <Button
        small
        variant="outline"
        icon={Camera}
        title="Снять фото"
        loading={busy === "photo"}
        onPress={() =>
          run("photo", async () => {
            const f = await shootAndUpload(`/requests/${requestId}/files?kind=extra_work`);
            if (f) setPhotos([...photos, f]);
          })
        }
      />
      <Text style={{ color: t.muted, fontSize: 13, lineHeight: 19 }}>Цену назовёт прораб: он пришлёт клиенту новую смету. Договариваться с клиентом о деньгах на месте нельзя.</Text>
      {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Отправить прорабу"
            disabled={text.trim().length < 3}
            loading={busy === "send"}
            onPress={() =>
              run("send", async () => {
                await api("POST", `/requests/${requestId}/extra-work`, { text, fileIds: photos.map((p) => p.id) });
                setOpen(false);
                setText("");
                setPhotos([]);
                await onChanged();
              })
            }
          />
        </View>
        <Button title="Отмена" variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}
