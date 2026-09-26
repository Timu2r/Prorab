import { formatPhone, ROLE_LABELS, type Role } from "@ks/core";
import { Redirect, router } from "expo-router";
import { LogOut, Trash2 } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { api, errorText } from "./api";
import { useAuth } from "./auth";
import { useTheme } from "./theme";
import { Button, Card, confirm, Field, Screen, Section, Segmented, Splash } from "./ui";

/** Профиль (docs/TZ.md, 9.1): имя, телефон, данные компании для счетов, переключение роли, выход, удаление аккаунта. */
export function ProfileScreen({ top }: { top?: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  // Форма создаётся, когда данные уже загружены: так поля заполнены и после перезагрузки страницы
  return <ProfileForm key={user.id} top={top} />;
}

function ProfileForm({ top }: { top?: ReactNode }) {
  const t = useTheme();
  const { user, role, refresh, setRole, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [type, setType] = useState<"person" | "company">(user?.profile.type ?? "person");
  const [company, setCompany] = useState(user?.profile.companyName ?? "");
  const [inn, setInn] = useState(user?.profile.inn ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!user) return null;
  const isClient = role === "client";

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api("PATCH", "/me", { name: name.trim(), ...(isClient ? { type, companyName: company.trim(), inn: inn.trim() } : {}) });
      await refresh();
      setMessage({ ok: true, text: "Сохранено" });
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const switchRole = async (r: Role) => {
    await setRole(r);
    router.replace(`/${r}`);
  };

  const remove = async () => {
    if (!(await confirm("Удалить аккаунт?", "Имя и телефон будут стёрты, войти в этот аккаунт больше не получится. Заказы останутся в учёте.", "Удалить"))) return;
    try {
      await api("DELETE", "/me", { confirm: true });
      await signOut();
      router.replace("/login");
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    }
  };

  const roleLabel = (r: Role) => (r === "master" && user.isLead ? "Бригадир" : ROLE_LABELS[r]);

  return (
    <Screen title="Профиль" subtitle={formatPhone(user.phone)} top={top}>
      {user.roles.length > 1 ? (
        <Section title="Раздел">
          <Segmented value={role ?? user.roles[0]!} options={user.roles.map((r) => ({ value: r, label: roleLabel(r) }))} onChange={switchRole} />
        </Section>
      ) : null}

      <Section title="Данные">
        <Card style={{ gap: 14 }}>
          <Field label="Имя" value={name} onChangeText={setName} maxLength={80} />
          {isClient ? (
            <>
              <Segmented
                value={type}
                options={[
                  { value: "person", label: "Физлицо" },
                  { value: "company", label: "Компания" },
                ]}
                onChange={setType}
              />
              {type === "company" ? (
                <>
                  <Field label="Название компании" value={company} onChangeText={setCompany} maxLength={200} />
                  <Field label="ИНН" value={inn} onChangeText={(v) => setInn(v.replace(/\D/g, "").slice(0, 12))} keyboardType="number-pad" />
                </>
              ) : null}
            </>
          ) : null}
          {message ? <Text style={{ color: message.ok ? t.success : t.danger, fontSize: 14 }}>{message.text}</Text> : null}
          <Button title="Сохранить" onPress={save} loading={busy} />
        </Card>
      </Section>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button
          title="Выйти"
          variant="outline"
          icon={LogOut}
          onPress={async () => {
            await signOut();
            router.replace("/login");
          }}
        />
        {!user.roles.includes("owner") ? <Button title="Удалить аккаунт" variant="danger" icon={Trash2} onPress={remove} /> : null}
      </View>
    </Screen>
  );
}
