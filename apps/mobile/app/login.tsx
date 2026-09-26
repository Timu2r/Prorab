import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError, type User } from "../src/api";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";

type CodeResponse = { phone: string; resendAfter: number; devCode?: string };

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
      setError(e instanceof ApiError ? e.message : "Что-то пошло не так");
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
        const r = await api<{ token: string; user: User }>("POST", "/auth/verify", { phone: sent!.phone, code: digits, device: Platform.OS });
        await signIn(r.token, r.user);
        router.replace("/home");
      });
  };

  const s = styles(t);
  const canSend = phone.replace(/\D/g, "").length >= 10 && !busy;

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.body}>
        {!sent ? (
          <>
            <Text style={s.title}>Вход</Text>
            <Text style={s.muted}>
              Вам позвонят с незнакомого номера. Последние 4 цифры этого номера — код входа, отвечать на звонок не нужно.
            </Text>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+7 999 123-45-67"
              placeholderTextColor={t.muted}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              autoFocus
            />
            {!!error && <Text style={s.error}>{error}</Text>}
            <Pressable style={[s.button, !canSend && { opacity: 0.5 }]} disabled={!canSend} onPress={requestCode}>
              <Text style={s.buttonText}>Получить код</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.title}>Код из звонка</Text>
            <Text style={s.muted}>Звоним на {sent.phone}. Введите последние 4 цифры номера, с которого поступил звонок.</Text>
            {!!sent.devCode && (
              <View style={s.hint}>
                <Text style={{ color: t.text }}>Режим разработки: код {sent.devCode}</Text>
              </View>
            )}
            <TextInput
              style={[s.input, s.code]}
              value={code}
              onChangeText={onCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={4}
              editable={!busy}
              autoFocus
            />
            {!!error && <Text style={s.error}>{error}</Text>}
            <View style={s.row}>
              <Pressable onPress={() => setSent(null)} hitSlop={8}>
                <Text style={s.link}>Изменить номер</Text>
              </Pressable>
              {wait > 0 ? (
                <Text style={s.muted}>Повторить через {wait} с</Text>
              ) : (
                <Pressable onPress={requestCode} disabled={busy} hitSlop={8}>
                  <Text style={s.link}>Позвонить ещё раз</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    body: { flex: 1, padding: 20, justifyContent: "center", gap: 16 },
    title: { fontSize: 28, fontWeight: "700", color: t.text },
    muted: { fontSize: 15, color: t.muted, lineHeight: 21 },
    input: {
      minHeight: 54,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.surface,
      color: t.text,
      paddingHorizontal: 16,
      fontSize: 19,
    },
    code: { textAlign: "center", fontSize: 28, letterSpacing: 12 },
    button: { minHeight: 52, borderRadius: 12, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    buttonText: { color: t.accentText, fontSize: 17, fontWeight: "600" },
    error: { color: t.danger, fontSize: 14 },
    hint: { padding: 12, borderRadius: 10, backgroundColor: t.accentSoft },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    link: { color: t.accent, fontSize: 15, fontWeight: "500" },
  });
