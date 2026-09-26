import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, errorText } from "../src/api";
import { useAuth } from "../src/auth";
import { formatPhoneInput } from "../src/format";
import { BrandCard } from "../src/Logo";
import { useTheme } from "../src/theme";
import { Button, Field } from "../src/ui";

type CodeResponse = { phone: string; resendAfter: number; devCode?: string };

/** Вход по номеру: звонок, последние 4 цифры входящего номера — код. */
export default function Login() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<CodeResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const requestCode = () =>
    run(async () => {
      const r = await api<CodeResponse>("POST", "/auth/code", { phone });
      setSent(r);
      setCode("");
      setWait(r.resendAfter);
    });

  const onCode = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setCode(digits);
    if (digits.length === 4)
      void run(async () => {
        const r = await api<{ token: string }>("POST", "/auth/verify", { phone: sent!.phone, code: digits, device: Platform.OS });
        await signIn(r.token);
        router.replace("/");
      });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: 18 }}>
            <BrandCard note="Заявки, сметы, оплаты и задания мастеров — в одном месте." />
            {!sent ? (
              <>
                <Text style={{ color: t.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 }}>Вход</Text>
                <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
                  Вам позвонят с незнакомого номера. Последние 4 цифры этого номера — код входа, отвечать на звонок не нужно.
                </Text>
                <Field
                  label="Мобильный телефон"
                  value={phone}
                  onChangeText={(v) => setPhone(formatPhoneInput(v))}
                  placeholder="+7 (999) 123-45-67"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  autoFocus
                  error={error || null}
                />
                <Button title="Получить код" onPress={requestCode} loading={busy} disabled={phone.replace(/\D/g, "").length < 11} />
              </>
            ) : (
              <>
                <Text style={{ color: t.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 }}>Код из звонка</Text>
                <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
                  Звоним на {formatPhoneInput(sent.phone)}. Введите последние 4 цифры номера, с которого поступил звонок.
                </Text>
                {sent.devCode ? (
                  <View style={{ padding: 12, borderRadius: 10, backgroundColor: t.surface2 }}>
                    <Text style={{ color: t.text }}>Режим разработки: код {sent.devCode}</Text>
                  </View>
                ) : null}
                <Field
                  label="Код"
                  value={code}
                  onChangeText={onCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={4}
                  editable={!busy}
                  autoFocus
                  style={{ textAlign: "center", fontSize: 28, letterSpacing: 12, fontWeight: "700" }}
                  error={error || null}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Pressable onPress={() => setSent(null)} hitSlop={10}>
                    <Text style={{ color: t.accent, fontSize: 15, fontWeight: "700" }}>Изменить номер</Text>
                  </Pressable>
                  {wait > 0 ? (
                    <Text style={{ color: t.muted, fontSize: 15 }}>Повторить через {wait} с</Text>
                  ) : (
                    <Pressable onPress={requestCode} disabled={busy} hitSlop={10}>
                      <Text style={{ color: t.accent, fontSize: 15, fontWeight: "700" }}>Позвонить ещё раз</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
