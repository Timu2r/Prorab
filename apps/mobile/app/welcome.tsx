import { Redirect, router } from "expo-router";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, errorText, siteUrl } from "../src/api";
import { useAuth } from "../src/auth";
import { Logo } from "../src/Logo";
import { useTheme } from "../src/theme";
import { Button, Field, Splash } from "../src/ui";

/** Первый вход: как к вам обращаться и согласие на обработку персональных данных (docs/TZ.md, 9.1). */
export default function Welcome() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  return <WelcomeForm key={user.id} />;
}

function WelcomeForm() {
  const t = useTheme();
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [consent, setConsent] = useState(!!user?.consentAt);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (name.trim().length < 2) return setError("Как к вам обращаться?");
    if (!consent) return setError("Нужно согласие на обработку персональных данных");
    setBusy(true);
    setError("");
    try {
      await api("PATCH", "/me", { name: name.trim(), consent: true });
      await refresh();
      router.replace("/");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: 18 }}>
          <Logo />
          <Text style={{ color: t.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 }}>Давайте знакомиться</Text>
          <Field label="Как к вам обращаться" value={name} onChangeText={setName} autoComplete="name" autoFocus maxLength={80} />
          <Pressable
            onPress={() => setConsent(!consent)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: consent ? t.accent : t.line,
                backgroundColor: consent ? t.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {consent ? <Check size={16} color="#fff" strokeWidth={3} /> : null}
            </View>
            <Text style={{ flex: 1, color: t.muted, fontSize: 14, lineHeight: 20 }}>
              Согласен на обработку персональных данных в соответствии с{" "}
              <Text style={{ color: t.accent, fontWeight: "700" }} onPress={() => void Linking.openURL(siteUrl("/privacy"))}>
                политикой
              </Text>
            </Text>
          </Pressable>
          {error ? <Text style={{ color: t.danger, fontSize: 14 }}>{error}</Text> : null}
          <Button title="Продолжить" onPress={save} loading={busy} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
